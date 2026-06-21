import { Router } from "express";
import { authMiddleware } from "../lib/auth";
import { executeOnAllAccounts, callCoinswitch, getAccountsByIds } from "../lib/coinswitchApi";
import { decrypt } from "../lib/crypto";
import { db, tradeLogsTable } from "@workspace/db";
import {
  ExecuteTradeBody,
  CancelOrderBody,
  CancelAllOrdersBody,
} from "@workspace/api-zod";

const router = Router();

router.post("/trade/execute", authMiddleware, async (req, res): Promise<void> => {
  const parsed = ExecuteTradeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { accountIds, order } = parsed.data;
  const results = await executeOnAllAccounts(accountIds, {
    symbol: order.symbol,
    side: order.side as "BUY" | "SELL",
    order_type: order.orderType as "MARKET" | "LIMIT" | "STOP_MARKET" | "TAKE_PROFIT_MARKET",
    quantity: order.quantity,
    price: order.price ?? undefined,
    trigger_price: order.triggerPrice ?? undefined,
    reduce_only: order.reduceOnly ?? undefined,
    time_in_force: order.timeInForce as "GTC" | "IOC" | "FOK" | undefined ?? undefined,
  }, "MANUAL");

  // Log all trades
  for (const r of results) {
    await db.insert(tradeLogsTable).values({
      accountId: r.accountId,
      orderId: r.orderId ?? null,
      symbol: order.symbol.toUpperCase(),
      side: order.side as "BUY" | "SELL",
      orderType: order.orderType,
      quantity: order.quantity?.toString() ?? null,
      price: order.price?.toString() ?? null,
      triggerPrice: order.triggerPrice?.toString() ?? null,
      reduceOnly: order.reduceOnly ?? false,
      status: r.success ? (r.status ?? "RAISED") : "FAILED",
      errorMessage: r.error ?? null,
      firedVia: "MANUAL",
    });
  }

  res.json(results);
});

router.delete("/trade/order", authMiddleware, async (req, res): Promise<void> => {
  const parsed = CancelOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { accountIds, orderId } = parsed.data;
  const accounts = await getAccountsByIds(accountIds);

  const results = await Promise.allSettled(
    accounts.map(async (acc) => {
      const apiKey = decrypt(acc.apiKey);
      const secretKey = decrypt(acc.secretKey);
      await callCoinswitch("DELETE", "/trade/api/v2/futures/order", apiKey, secretKey, {
        exchange: "EXCHANGE_2",
        order_id: orderId,
      });
      return { accountId: acc.id, accountName: acc.name, success: true };
    }),
  );

  res.json(
    results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { accountId: accounts[i].id, accountName: accounts[i].name, success: false, error: (r.reason as Error).message },
    ),
  );
});

router.post("/trade/cancel-all", authMiddleware, async (req, res): Promise<void> => {
  const parsed = CancelAllOrdersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { accountIds, symbol } = parsed.data;
  const accounts = await getAccountsByIds(accountIds);

  const results = await Promise.allSettled(
    accounts.map(async (acc) => {
      const apiKey = decrypt(acc.apiKey);
      const secretKey = decrypt(acc.secretKey);
      const body: Record<string, string> = { exchange: "EXCHANGE_2" };
      if (symbol) body.symbol = symbol;
      await callCoinswitch("POST", "/trade/api/v2/futures/cancel_all", apiKey, secretKey, body);
      return { accountId: acc.id, accountName: acc.name, success: true };
    }),
  );

  res.json(
    results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { accountId: accounts[i].id, accountName: accounts[i].name, success: false, error: (r.reason as Error).message },
    ),
  );
});

export default router;
