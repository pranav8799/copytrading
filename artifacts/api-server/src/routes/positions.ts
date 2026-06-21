import { Router } from "express";
import { authMiddleware } from "../lib/auth";
import { callCoinswitch } from "../lib/coinswitchApi";
import { decrypt } from "../lib/crypto";
import { db, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/positions", authMiddleware, async (req, res): Promise<void> => {
  const symbol = req.query.symbol as string | undefined;
  const accountIdsParam = req.query.accountIds as string | undefined;

  let query = db.select().from(accountsTable).$dynamic();
  if (!accountIdsParam) {
    query = query.where(eq(accountsTable.isActive, true));
  }
  const accounts = await query;

  const filteredAccounts = accountIdsParam
    ? accounts.filter((a) =>
        accountIdsParam.split(",").map(Number).includes(a.id),
      )
    : accounts;

  const results = await Promise.allSettled(
    filteredAccounts.map(async (acc) => {
      const apiKey = decrypt(acc.apiKey);
      const secretKey = decrypt(acc.secretKey);
      const params: Record<string, string> = { exchange: "EXCHANGE_2" };
      if (symbol) params.symbol = symbol;
      const data = (await callCoinswitch(
        "GET",
        "/trade/api/v2/futures/positions",
        apiKey,
        secretKey,
        params,
      )) as { data: unknown[] };
      const positions = Array.isArray(data?.data) ? data.data : [];
      return positions.map((p: Record<string, unknown>) => ({
        accountId: acc.id,
        accountName: acc.name,
        positionId: p.position_id,
        symbol: p.symbol,
        positionSide: p.position_side,
        leverage: p.leverage,
        positionSize: p.position_size,
        positionValue: p.position_value,
        positionMargin: p.position_margin,
        maintMargin: p.maint_margin,
        avgEntryPrice: p.avg_entry_price,
        markPrice: p.mark_price,
        lastPrice: p.last_price,
        unrealisedPnl: p.unrealised_pnl,
        liquidationPrice: p.liquidation_price,
        marginType: p.margin_type,
        status: p.status,
      }));
    }),
  );

  const positions = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : [],
  );
  res.json(positions);
});

export default router;
