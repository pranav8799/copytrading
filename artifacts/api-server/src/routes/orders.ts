import { Router } from "express";
import { authMiddleware } from "../lib/auth";
import { callCoinswitch, getAccountsByIds } from "../lib/coinswitchApi";
import { decrypt } from "../lib/crypto";
import { db, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetOpenOrdersBody, GetClosedOrdersBody } from "@workspace/api-zod";

const router = Router();

router.post("/orders/open", authMiddleware, async (req, res): Promise<void> => {
  const parsed = GetOpenOrdersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { symbol, accountIds } = parsed.data;
  const accounts =
    accountIds && accountIds.length > 0
      ? await getAccountsByIds(accountIds)
      : await db.select().from(accountsTable).where(eq(accountsTable.isActive, true));

  const results = await Promise.allSettled(
    accounts.map(async (acc) => {
      const apiKey = decrypt(acc.apiKey);
      const secretKey = decrypt(acc.secretKey);
      const body: Record<string, unknown> = { exchange: "EXCHANGE_2", limit: 50 };
      if (symbol) body.symbol = symbol;
      const data = (await callCoinswitch(
        "POST",
        "/trade/api/v2/futures/orders/open",
        apiKey,
        secretKey,
        body,
      )) as { data: { orders: unknown[] } };
      const orders = data?.data?.orders ?? [];
      return orders.map((o: Record<string, unknown>) => ({
        accountId: acc.id,
        accountName: acc.name,
        orderId: o.order_id,
        symbol: o.symbol,
        side: o.side,
        orderType: o.order_type,
        quantity: o.quantity,
        execQuantity: o.exec_quantity,
        price: o.price,
        triggerPrice: o.trigger_price ?? null,
        avgExecutionPrice: o.avg_execution_price ?? null,
        executionFee: o.execution_fee ?? null,
        realisedPnl: o.realised_pnl ?? null,
        reduceOnly: o.reduce_only,
        status: o.status,
        createdAt: o.created_at ?? null,
      }));
    }),
  );

  res.json(results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])));
});

router.post("/orders/closed", authMiddleware, async (req, res): Promise<void> => {
  const parsed = GetClosedOrdersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { symbol, status, accountIds, fromTime, toTime } = parsed.data;
  const accounts =
    accountIds && accountIds.length > 0
      ? await getAccountsByIds(accountIds)
      : await db.select().from(accountsTable).where(eq(accountsTable.isActive, true));

  const results = await Promise.allSettled(
    accounts.map(async (acc) => {
      const apiKey = decrypt(acc.apiKey);
      const secretKey = decrypt(acc.secretKey);
      const body: Record<string, unknown> = { exchange: "EXCHANGE_2", limit: 50 };
      if (symbol) body.symbol = symbol;
      if (status) body.status = status;
      if (fromTime) body.from_time = fromTime;
      if (toTime) body.to_time = toTime;
      const data = (await callCoinswitch(
        "POST",
        "/trade/api/v2/futures/orders/closed",
        apiKey,
        secretKey,
        body,
      )) as { data: { orders: unknown[] } };
      // const orders = data?.data?.orders ?? [];
      const orders = data?.data?.orders ?? [];
if (orders.length > 0) {
  console.log("RAW COINSWITCH ORDER:", JSON.stringify(orders[0], null, 2));
}
      return orders.map((o: Record<string, unknown>) => ({
        accountId: acc.id,
        accountName: acc.name,
        orderId: o.order_id,
        symbol: o.symbol,
        side: o.side,
        orderType: o.order_type,
        quantity: o.quantity,
        execQuantity: o.exec_quantity,
        price: o.price,
        avgExecutionPrice: o.avg_execution_price ?? null,
        executionFee: o.execution_fee ?? null,
        realisedPnl: o.realised_pnl ?? null,
        reduceOnly: o.reduce_only,
        status: o.status,
        createdAt: o.created_at ?? null,
      }));
    }),
  );

  res.json(results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])));
});

export default router;
