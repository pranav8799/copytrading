import { Router } from "express";
import { authMiddleware } from "../lib/auth";
import { callCoinswitch, getAccountsByIds } from "../lib/coinswitchApi";
import { decrypt } from "../lib/crypto";
import { AddMarginBody } from "@workspace/api-zod";

const router = Router();

router.post("/margin/add", authMiddleware, async (req, res): Promise<void> => {
  const parsed = AddMarginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { accountId, symbol, margin } = parsed.data;
  const accounts = await getAccountsByIds([accountId]);
  if (!accounts[0]) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  const acc = accounts[0];
  const apiKey = decrypt(acc.apiKey);
  const secretKey = decrypt(acc.secretKey);

  const data = await callCoinswitch("POST", "/trade/api/v2/futures/add_margin", apiKey, secretKey, {
    exchange: "EXCHANGE_2",
    symbol,
    margin,
  });
  res.json(data);
});

export default router;
