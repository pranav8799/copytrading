import { Router } from "express";
import { authMiddleware } from "../lib/auth";
import { callCoinswitch, getAccountsByIds } from "../lib/coinswitchApi";
import { decrypt } from "../lib/crypto";
import { GetLeverageQueryParams, SetLeverageBody } from "@workspace/api-zod";

const router = Router();

router.get("/leverage", authMiddleware, async (req, res): Promise<void> => {
  const parsed = GetLeverageQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "symbol and accountId are required" });
    return;
  }
  const accounts = await getAccountsByIds([parsed.data.accountId]);
  if (!accounts[0]) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  const acc = accounts[0];
  const apiKey = decrypt(acc.apiKey);
  const secretKey = decrypt(acc.secretKey);

  const data = (await callCoinswitch(
    "GET",
    "/trade/api/v2/futures/leverage",
    apiKey,
    secretKey,
    { symbol: parsed.data.symbol, exchange: "EXCHANGE_2" },
  )) as { data: { leverage: string; symbol: string } };

  res.json({ symbol: data.data.symbol, leverage: data.data.leverage });
});

router.post("/leverage", authMiddleware, async (req, res): Promise<void> => {
  const parsed = SetLeverageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { accountIds, symbol, leverage } = parsed.data;
  const accounts = await getAccountsByIds(accountIds);

  const results = await Promise.allSettled(
    accounts.map(async (acc) => {
      const apiKey = decrypt(acc.apiKey);
      const secretKey = decrypt(acc.secretKey);

      // Check for open positions first
      const posData = (await callCoinswitch(
        "GET",
        "/trade/api/v2/futures/positions",
        apiKey,
        secretKey,
        { exchange: "EXCHANGE_2", symbol },
      )) as { data: unknown[] };
      if (posData?.data?.length > 0) {
        return {
          accountId: acc.id,
          accountName: acc.name,
          success: false,
          error: "Cannot change leverage: open position exists",
        };
      }

      await callCoinswitch("POST", "/trade/api/v2/futures/leverage", apiKey, secretKey, {
        symbol,
        exchange: "EXCHANGE_2",
        leverage,
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

export default router;
