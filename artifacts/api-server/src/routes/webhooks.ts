import { Router } from "express";
import { authMiddleware } from "../lib/auth";
import { db, webhooksTable, webhookLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { executeOnAllAccounts } from "../lib/coinswitchApi";
import { db as dbImport, tradeLogsTable } from "@workspace/db";
import {
  CreateWebhookBody,
  UpdateWebhookBody,
  UpdateWebhookParams,
  DeleteWebhookParams,
  TestWebhookParams,
} from "@workspace/api-zod";
import crypto from "crypto";

const router = Router();

function mapWebhook(w: typeof webhooksTable.$inferSelect) {
  return {
    id: w.id,
    name: w.name,
    token: w.token,
    targetAccounts: (w.targetAccounts as number[]) ?? [],
    defaultSymbol: w.defaultSymbol ?? null,
    defaultLeverage: w.defaultLeverage ?? null,
    isActive: w.isActive,
    lastTriggered: w.lastTriggered?.toISOString() ?? null,
    createdAt: w.createdAt.toISOString(),
  };
}

router.get("/webhooks", authMiddleware, async (req, res): Promise<void> => {
  const webhooks = await db.select().from(webhooksTable).orderBy(webhooksTable.createdAt);
  res.json(webhooks.map(mapWebhook));
});

router.post("/webhooks", authMiddleware, async (req, res): Promise<void> => {
  const parsed = CreateWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const token = crypto.randomUUID();
  const result = await db
    .insert(webhooksTable)
    .values({
      name: parsed.data.name,
      token,
      targetAccounts: parsed.data.targetAccounts,
      defaultSymbol: parsed.data.defaultSymbol ?? null,
      defaultLeverage: parsed.data.defaultLeverage ?? null,
      isActive: parsed.data.isActive ?? true,
    });
  const [webhook] = await db
    .select()
    .from(webhooksTable)
    .where(eq(webhooksTable.id, result[0].insertId));
  res.status(201).json(mapWebhook(webhook));
});

router.put("/webhooks/:id", authMiddleware, async (req, res): Promise<void> => {
  const params = UpdateWebhookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (parsed.data.name != null) updates.name = parsed.data.name;
  if (parsed.data.targetAccounts != null) updates.targetAccounts = parsed.data.targetAccounts;
  if (parsed.data.defaultSymbol !== undefined) updates.defaultSymbol = parsed.data.defaultSymbol;
  if (parsed.data.defaultLeverage !== undefined) updates.defaultLeverage = parsed.data.defaultLeverage;
  if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;

  await db
    .update(webhooksTable)
    .set(updates)
    .where(eq(webhooksTable.id, params.data.id));
  const [webhook] = await db
    .select()
    .from(webhooksTable)
    .where(eq(webhooksTable.id, params.data.id));
  if (!webhook) {
    res.status(404).json({ error: "Webhook not found" });
    return;
  }
  res.json(mapWebhook(webhook));
});

router.delete("/webhooks/:id", authMiddleware, async (req, res): Promise<void> => {
  const params = DeleteWebhookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(webhooksTable).where(eq(webhooksTable.id, params.data.id));
  res.sendStatus(204);
});

router.post("/webhooks/:token/test", authMiddleware, async (req, res): Promise<void> => {
  const params = TestWebhookParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }
  const [webhook] = await db
    .select()
    .from(webhooksTable)
    .where(eq(webhooksTable.token, params.data.token));
  if (!webhook) {
    res.status(404).json({ error: "Webhook not found" });
    return;
  }
  res.json({
    success: true,
    message: "Webhook test successful (dry run - no trades executed)",
    webhook: mapWebhook(webhook),
  });
});

// PUBLIC route — secured by token in URL
router.post("/webhooks/:token", async (req, res): Promise<void> => {
  const token = req.params.token;
  const [webhook] = await db
    .select()
    .from(webhooksTable)
    .where(eq(webhooksTable.token, token));
  if (!webhook || !webhook.isActive) {
    res.status(404).json({ error: "Webhook not found or inactive" });
    return;
  }

  const payload = req.body;
  const symbol = payload.symbol || webhook.defaultSymbol;
  if (!symbol) {
    res.status(400).json({ error: "No symbol provided" });
    return;
  }
  const accountIds = (webhook.targetAccounts as number[]) ?? [];
  if (accountIds.length === 0) {
    res.status(400).json({ error: "No target accounts" });
    return;
  }

  const results = await executeOnAllAccounts(accountIds, {
    symbol,
    side: payload.side,
    order_type: payload.order_type || "MARKET",
    quantity: payload.quantity,
    price: payload.price,
    trigger_price: payload.trigger_price,
    reduce_only: payload.reduce_only ?? false,
  }, "WEBHOOK");

  // Log trade entries
  for (const r of results) {
    await dbImport.insert(tradeLogsTable).values({
      accountId: r.accountId,
      orderId: r.orderId ?? null,
      symbol: symbol.toUpperCase(),
      side: payload.side as "BUY" | "SELL",
      orderType: payload.order_type || "MARKET",
      quantity: payload.quantity?.toString() ?? null,
      status: r.success ? (r.status ?? "RAISED") : "FAILED",
      errorMessage: r.error ?? null,
      firedVia: "WEBHOOK",
    });
  }

  await db.insert(webhookLogsTable).values({
    webhookId: webhook.id,
    payload: payload,
    accountsFired: accountIds.length,
    successCount: results.filter((r) => r.success).length,
    failCount: results.filter((r) => !r.success).length,
  });

  await db
    .update(webhooksTable)
    .set({ lastTriggered: new Date() })
    .where(eq(webhooksTable.id, webhook.id));

  res.json({ success: true, results });
});

export default router;