import { Router } from "express";
import { authMiddleware } from "../lib/auth";
import { db, accountsTable, tradeLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { callCoinswitch } from "../lib/coinswitchApi";
import { decrypt } from "../lib/crypto";

const router = Router();

router.get("/dashboard", authMiddleware, async (req, res): Promise<void> => {
  const [accounts, recentLogs] = await Promise.all([
    db.select().from(accountsTable),
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
      .orderBy(desc(tradeLogsTable.createdAt))
      .limit(10),
  ]);

  const totalAccounts = accounts.length;
  const activeAccounts = accounts.filter((a) => a.isActive).length;

  // Fetch positions for active accounts to get PnL
  let totalPositions = 0;
  let totalUnrealisedPnl = 0;
  const accountSummaries = [];

  const activeAccountsList = accounts.filter((a) => a.isActive);

  const positionResults = await Promise.allSettled(
    activeAccountsList.map(async (acc) => {
      try {
        const apiKey = decrypt(acc.apiKey);
        const secretKey = decrypt(acc.secretKey);
        const data = (await callCoinswitch(
          "GET",
          "/trade/api/v2/futures/positions",
          apiKey,
          secretKey,
          { exchange: "EXCHANGE_2" },
        )) as { data: Array<{ unrealised_pnl: string }> };
        return { accountId: acc.id, positions: data?.data ?? [] };
      } catch {
        return { accountId: acc.id, positions: [] };
      }
    }),
  );

  const balanceResults = await Promise.allSettled(
    activeAccountsList.map(async (acc) => {
      try {
        const apiKey = decrypt(acc.apiKey);
        const secretKey = decrypt(acc.secretKey);
        const data = (await callCoinswitch(
          "GET",
          "/trade/api/v2/futures/wallet_balance",
          apiKey,
          secretKey,
          { exchange: "EXCHANGE_2" },
        )) as { data: { base_asset_balances: Array<{ balances: { total_available_balance: string } }> } };
        return data?.data?.base_asset_balances?.[0]?.balances?.total_available_balance ?? null;
      } catch {
        return null;
      }
    }),
  );

  for (let i = 0; i < activeAccountsList.length; i++) {
    const acc = activeAccountsList[i];
    const posResult = positionResults[i];
    const balResult = balanceResults[i];

    const positions =
      posResult.status === "fulfilled" ? posResult.value.positions : [];
    const pnl = positions.reduce(
      (sum: number, p: { unrealised_pnl: string }) => sum + parseFloat(p.unrealised_pnl || "0"),
      0,
    );
    totalPositions += positions.length;
    totalUnrealisedPnl += pnl;

    const lastTrade = recentLogs.find((l) => l.accountId === acc.id);
    accountSummaries.push({
      accountId: acc.id,
      accountName: acc.name,
      isActive: acc.isActive,
      availableBalance:
        balResult.status === "fulfilled" ? balResult.value : null,
      openPositions: positions.length,
      unrealisedPnl: pnl,
      lastTrade: lastTrade?.createdAt?.toISOString() ?? null,
    });
  }

  // Add inactive accounts to summaries
  for (const acc of accounts.filter((a) => !a.isActive)) {
    accountSummaries.push({
      accountId: acc.id,
      accountName: acc.name,
      isActive: false,
      availableBalance: null,
      openPositions: 0,
      unrealisedPnl: null,
      lastTrade: null,
    });
  }

  res.json({
    totalAccounts,
    activeAccounts,
    totalPositions,
    totalUnrealisedPnl,
    recentExecutions: recentLogs.map((l) => ({
      ...l,
      accountName: l.accountName ?? "Unknown",
      createdAt: l.createdAt.toISOString(),
    })),
    accountSummaries,
  });
});

export default router;
