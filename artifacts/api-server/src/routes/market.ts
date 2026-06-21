import { Router } from "express";
import { authMiddleware } from "../lib/auth";
import { callCoinswitch } from "../lib/coinswitchApi";
import { decrypt } from "../lib/crypto";
import { db, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// Helper: get any active account's decrypted keys for public market data
async function getProxyKeys(): Promise<{ apiKey: string; secretKey: string } | null> {
  const [acc] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.isActive, true))
    .limit(1);
  if (!acc) return null;
  return { apiKey: decrypt(acc.apiKey), secretKey: decrypt(acc.secretKey) };
}

router.get("/market/ticker", authMiddleware, async (req, res): Promise<void> => {
  const symbol = req.query.symbol as string;
  if (!symbol) {
    res.status(400).json({ error: "symbol required" });
    return;
  }
  const keys = await getProxyKeys();
  if (!keys) {
    res.status(503).json({ error: "No active accounts configured" });
    return;
  }
  const data = (await callCoinswitch(
    "GET",
    "/trade/api/v2/futures/ticker",
    keys.apiKey,
    keys.secretKey,
    { exchange: "EXCHANGE_2", symbol },
  )) as { data: Record<string, Record<string, unknown>> };
  const ticker = data?.data?.["EXCHANGE_2"];
  if (!ticker) {
    res.status(404).json({ error: "Ticker not found" });
    return;
  }
  res.json({
    symbol: ticker.symbol,
    lastPrice: ticker.last_price,
    markPrice: ticker.mark_price,
    indexPrice: ticker.index_price,
    fundingRate: ticker.funding_rate,
    bestBidPrice: ticker.best_bid_price,
    bestAskPrice: ticker.best_ask_price,
    high24h: ticker.high_price_24h,
    low24h: ticker.low_price_24h,
    priceChangePct24h: ticker.price_24h_pcnt,
  });
});

router.get("/market/orderbook", authMiddleware, async (req, res): Promise<void> => {
  const symbol = req.query.symbol as string;
  if (!symbol) {
    res.status(400).json({ error: "symbol required" });
    return;
  }
  const keys = await getProxyKeys();
  if (!keys) {
    res.status(503).json({ error: "No active accounts configured" });
    return;
  }
  const data = (await callCoinswitch(
    "GET",
    "/trade/api/v2/futures/order_book",
    keys.apiKey,
    keys.secretKey,
    { exchange: "EXCHANGE_2", symbol },
  )) as { data: { symbol: string; bids: string[][]; asks: string[][]; timestamp: number } };
  res.json({
    symbol: data.data.symbol,
    bids: data.data.bids,
    asks: data.data.asks,
    timestamp: data.data.timestamp,
  });
});

router.get("/market/instruments", authMiddleware, async (req, res): Promise<void> => {
  const keys = await getProxyKeys();
  if (!keys) {
    res.status(503).json({ error: "No active accounts configured" });
    return;
  }
  const data = (await callCoinswitch(
    "GET",
    "/trade/api/v2/futures/instrument_info",
    keys.apiKey,
    keys.secretKey,
    { exchange: "EXCHANGE_2" },
  )) as { data: Record<string, unknown> };
  res.json({ instruments: data.data });
});

export default router;
