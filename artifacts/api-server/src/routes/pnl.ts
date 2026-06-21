import { Router } from "express";
import { authMiddleware } from "../lib/auth";
import { callCoinswitch } from "../lib/coinswitchApi";
import { decrypt } from "../lib/crypto";
import { db, accountsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const router = Router();

router.get("/pnl", authMiddleware, async (req, res): Promise<void> => {
  const { from_time, to_time, accountIds } = req.query as Record<string, string>;
  const ids = accountIds ? accountIds.split(",").map(Number).filter(Boolean) : [];

  const accounts =
    ids.length > 0
      ? await db.select().from(accountsTable).where(inArray(accountsTable.id, ids))
      : await db.select().from(accountsTable).where(eq(accountsTable.isActive, true));

  const results = await Promise.allSettled(
    accounts.map(async (acc) => {
      const apiKey = decrypt(acc.apiKey);
      const secretKey = decrypt(acc.secretKey);

      const params: Record<string, string> = {
        exchange: "EXCHANGE_2",
        limit: "50",
      };
      if (from_time) params.from_time = from_time;
      if (to_time) params.to_time = to_time;

      let realisedPnl = 0;
      let fees = 0;
      let tradeCount = 0;

      try {
        const pnlData = (await callCoinswitch(
          "GET",
          "/trade/api/v2/futures/transactions",
          apiKey,
          secretKey,
          { ...params, type: "P&L" },
        )) as { data: Array<{ amount: string; type: string }> };
        const commData = (await callCoinswitch(
          "GET",
          "/trade/api/v2/futures/transactions",
          apiKey,
          secretKey,
          { ...params, type: "commission" },
        )) as { data: Array<{ amount: string }> };

        const pnlTxns = Array.isArray(pnlData?.data) ? pnlData.data : [];
        const commTxns = Array.isArray(commData?.data) ? commData.data : [];

        realisedPnl = pnlTxns.reduce((sum, t) => sum + parseFloat(t.amount || "0"), 0);
        fees = commTxns.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount || "0")), 0);
        tradeCount = pnlTxns.length;
      } catch {
        // Account might not have any PnL data
      }

      return {
        accountId: acc.id,
        accountName: acc.name,
        realisedPnl,
        fees,
        netPnl: realisedPnl - fees,
        tradeCount,
      };
    }),
  );

  res.json(
    results
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<unknown>).value),
  );
});

export default router;
