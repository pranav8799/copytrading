import { Router } from "express";
import { authMiddleware } from "../lib/auth";
import { callCoinswitch } from "../lib/coinswitchApi";
import { decrypt } from "../lib/crypto";
import { db, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/balances", authMiddleware, async (req, res): Promise<void> => {
  const accounts = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.isActive, true));

  const results = await Promise.allSettled(
    accounts.map(async (acc) => {
      const apiKey = decrypt(acc.apiKey);
      const secretKey = decrypt(acc.secretKey);
      const data = (await callCoinswitch(
        "GET",
        "/trade/api/v2/futures/wallet_balance",
        apiKey,
        secretKey,
        { exchange: "EXCHANGE_2" },
      )) as { data: { base_asset_balances: Array<{ balances: { total_available_balance: string; total_balance: string } }> } };
      const balances = data?.data?.base_asset_balances?.[0]?.balances;
      return {
        accountId: acc.id,
        accountName: acc.name,
        availableBalance: balances?.total_available_balance ?? null,
        totalBalance: balances?.total_balance ?? null,
        error: null as string | null,
      };
    }),
  );

  res.json(
    results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : {
            accountId: accounts[i].id,
            accountName: accounts[i].name,
            availableBalance: null,
            totalBalance: null,
            error: (r.reason as Error).message,
          },
    ),
  );
});

export default router;
