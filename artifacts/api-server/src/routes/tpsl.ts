import { Router } from "express";
import { authMiddleware } from "../lib/auth";
import { callCoinswitch, getAccountsByIds } from "../lib/coinswitchApi";
import { decrypt } from "../lib/crypto";
import { SetTpslBody, CancelTpslParams } from "@workspace/api-zod";

const router = Router();

router.post("/tpsl/set", authMiddleware, async (req, res): Promise<void> => {
  const parsed = SetTpslBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { accountIds, symbol, tpPrice, slPrice } = parsed.data;
  const accounts = await getAccountsByIds(accountIds);

  const results = await Promise.allSettled(
    accounts.map(async (acc) => {
      const apiKey = decrypt(acc.apiKey);
      const secretKey = decrypt(acc.secretKey);
      const errors: string[] = [];

      if (tpPrice != null) {
        try {
          await callCoinswitch("POST", "/trade/api/v2/futures/order", apiKey, secretKey, {
            exchange: "EXCHANGE_2",
            symbol: symbol.toUpperCase(),
            side: "SELL",
            order_type: "TAKE_PROFIT_MARKET",
            quantity: 0,
            trigger_price: tpPrice,
            reduce_only: true,
          });
        } catch (e) {
          errors.push(`TP: ${(e as Error).message}`);
        }
      }

      if (slPrice != null) {
        try {
          await callCoinswitch("POST", "/trade/api/v2/futures/order", apiKey, secretKey, {
            exchange: "EXCHANGE_2",
            symbol: symbol.toUpperCase(),
            side: "SELL",
            order_type: "STOP_MARKET",
            quantity: 0,
            trigger_price: slPrice,
            reduce_only: true,
          });
        } catch (e) {
          errors.push(`SL: ${(e as Error).message}`);
        }
      }

      return {
        accountId: acc.id,
        accountName: acc.name,
        success: errors.length === 0,
        error: errors.length > 0 ? errors.join("; ") : null,
      };
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

router.delete("/tpsl/:accountId/:orderId", authMiddleware, async (req, res): Promise<void> => {
  const params = CancelTpslParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const accounts = await getAccountsByIds([params.data.accountId]);
  if (!accounts[0]) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  const acc = accounts[0];
  const apiKey = decrypt(acc.apiKey);
  const secretKey = decrypt(acc.secretKey);

  try {
    await callCoinswitch("DELETE", "/trade/api/v2/futures/order", apiKey, secretKey, {
      exchange: "EXCHANGE_2",
      order_id: params.data.orderId,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

export default router;
