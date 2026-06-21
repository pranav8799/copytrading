import { Router } from "express";
import { authMiddleware } from "../lib/auth";
import { db, tradeLogsTable, webhookLogsTable, webhooksTable, systemLogsTable, accountsTable } from "@workspace/db";
import { desc, eq, and, like, sql } from "drizzle-orm";
import { GetTradeLogsQueryParams, GetWebhookLogsQueryParams, GetSystemLogsQueryParams } from "@workspace/api-zod";

const router = Router();
const PAGE_SIZE = 50;

router.get("/logs/trades", authMiddleware, async (req, res): Promise<void> => {
  const parsed = GetTradeLogsQueryParams.safeParse(req.query);
  const page = parsed.success && parsed.data.page ? Number(parsed.data.page) : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [];
  if (parsed.success && parsed.data.symbol) {
    conditions.push(like(tradeLogsTable.symbol, `%${parsed.data.symbol}%`));
  }
  if (parsed.success && parsed.data.accountId != null) {
    conditions.push(eq(tradeLogsTable.accountId, Number(parsed.data.accountId)));
  }
  if (parsed.success && parsed.data.status) {
    conditions.push(eq(tradeLogsTable.status, parsed.data.status));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, totalResult] = await Promise.all([
    db
      .select({
        id: tradeLogsTable.id,
        accountId: tradeLogsTable.accountId,
        accountName: accountsTable.name,
        orderId: tradeLogsTable.orderId,
        symbol: tradeLogsTable.symbol,
        side: tradeLogsTable.side,
        orderType: tradeLogsTable.orderType,
        quantity: tradeLogsTable.quantity,
        price: tradeLogsTable.price,
        status: tradeLogsTable.status,
        errorMessage: tradeLogsTable.errorMessage,
        firedVia: tradeLogsTable.firedVia,
        createdAt: tradeLogsTable.createdAt,
      })
      .from(tradeLogsTable)
      .leftJoin(accountsTable, eq(tradeLogsTable.accountId, accountsTable.id))
      .where(whereClause)
      .orderBy(desc(tradeLogsTable.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(tradeLogsTable)
      .where(whereClause),
  ]);

  res.json({
    data: data.map((d) => ({
      ...d,
      accountName: d.accountName ?? "Unknown",
      createdAt: d.createdAt.toISOString(),
    })),
    total: Number(totalResult[0]?.count ?? 0),
    page,
  });
});

router.get("/logs/webhooks", authMiddleware, async (req, res): Promise<void> => {
  const parsed = GetWebhookLogsQueryParams.safeParse(req.query);
  const page = parsed.success && parsed.data.page ? Number(parsed.data.page) : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const [data, totalResult] = await Promise.all([
    db
      .select({
        id: webhookLogsTable.id,
        webhookId: webhookLogsTable.webhookId,
        webhookName: webhooksTable.name,
        payload: webhookLogsTable.payload,
        accountsFired: webhookLogsTable.accountsFired,
        successCount: webhookLogsTable.successCount,
        failCount: webhookLogsTable.failCount,
        createdAt: webhookLogsTable.createdAt,
      })
      .from(webhookLogsTable)
      .leftJoin(webhooksTable, eq(webhookLogsTable.webhookId, webhooksTable.id))
      .orderBy(desc(webhookLogsTable.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(webhookLogsTable),
  ]);

  res.json({
    data: data.map((d) => ({
      ...d,
      webhookName: d.webhookName ?? "Unknown",
      payload: d.payload ?? {},
      createdAt: d.createdAt.toISOString(),
    })),
    total: Number(totalResult[0]?.count ?? 0),
    page,
  });
});

router.get("/logs/system", authMiddleware, async (req, res): Promise<void> => {
  const parsed = GetSystemLogsQueryParams.safeParse(req.query);
  const page = parsed.success && parsed.data.page ? Number(parsed.data.page) : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [];
  if (parsed.success && parsed.data.level) {
    conditions.push(eq(systemLogsTable.level, parsed.data.level as "info" | "warn" | "error"));
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [data, totalResult] = await Promise.all([
    db
      .select()
      .from(systemLogsTable)
      .where(whereClause)
      .orderBy(desc(systemLogsTable.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(systemLogsTable).where(whereClause),
  ]);

  res.json({
    data: data.map((d) => ({
      ...d,
      context: d.context ?? {},
      createdAt: d.createdAt.toISOString(),
    })),
    total: Number(totalResult[0]?.count ?? 0),
    page,
  });
});

export default router;