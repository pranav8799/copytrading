import { Router } from "express";
import { authMiddleware } from "../lib/auth";
import { callCoinswitch } from "../lib/coinswitchApi";
import { decrypt } from "../lib/crypto";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import axios from "axios";
import { logger } from "../lib/logger";


const router = Router();

// Get the ONE designated market-data proxy account (configured in settings),
// not just "any active account". Prevents random 401s when unrelated accounts expire.
async function getProxyKeys(): Promise<{ apiKey: string; secretKey: string } | null> {
  const [settings] = await db.select().from(settingsTable).limit(1);
  const encApiKey = (settings as any)?.marketProxyApiKey;
  const encSecretKey = (settings as any)?.marketProxySecretKey;

  if (!encApiKey || !encSecretKey) {
    logger.error("Market proxy credentials not configured in Settings");
    return null;
  }

  return { apiKey: decrypt(encApiKey), secretKey: decrypt(encSecretKey) };
}

router.get("/market/ticker", authMiddleware, async (req, res): Promise<void> => {
  const symbol = req.query.symbol as string;
  if (!symbol) {
    res.status(400).json({ error: "symbol required" });
    return;
  }
  const keys = await getProxyKeys();
  if (!keys) {
    res.status(503).json({ error: "Market proxy not configured or inactive" });
    return;
  }
  try {
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
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      logger.error("Market proxy API key expired (401) — update it from the Accounts page");
      res.status(503).json({ error: "Market data temporarily unavailable — proxy key expired" });
      return;
    }
    throw err;
  }
});

router.get("/market/orderbook", authMiddleware, async (req, res): Promise<void> => {
  const symbol = req.query.symbol as string;
  if (!symbol) {
    res.status(400).json({ error: "symbol required" });
    return;
  }
  const keys = await getProxyKeys();
  console.log("Using account:", keys); // Log the keys for debugging
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
