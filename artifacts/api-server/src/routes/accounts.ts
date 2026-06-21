import { Router } from "express";
import { db, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/crypto";
import { callCoinswitch } from "../lib/coinswitchApi";
import { authMiddleware } from "../lib/auth";
import {
  CreateAccountBody,
  UpdateAccountBody,
  UpdateAccountParams,
  DeleteAccountParams,
  VerifyAccountParams,
} from "@workspace/api-zod";

const router = Router();

function serializeAccount(a: typeof accountsTable.$inferSelect, apiKeyMasked: string) {
  return {
    id: a.id,
    name: a.name,
    mobileNumber: a.mobileNumber,
    apiKeyMasked,
    isActive: a.isActive,
    lastBalance: a.lastBalance,
    currentBalance: a.currentBalance,
    balanceUpdatedAt: a.balanceUpdatedAt ? a.balanceUpdatedAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
  };
}

router.get("/accounts", authMiddleware, async (req, res): Promise<void> => {
  const accounts = await db
    .select()
    .from(accountsTable)
    .orderBy(accountsTable.createdAt);

  res.json(
    accounts.map((a) => serializeAccount(a, "****" + a.apiKey.slice(-8))),
  );
});

router.post("/accounts", authMiddleware, async (req, res): Promise<void> => {
  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, mobileNumber, apiKey, secretKey } = parsed.data;
  const result = await db
    .insert(accountsTable)
    .values({
      name,
      mobileNumber,
      apiKey: encrypt(apiKey),
      secretKey: encrypt(secretKey),
    });
  const [account] = await db
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.id, result[0].insertId));
  res.status(201).json(serializeAccount(account, "****" + apiKey.slice(-8)));
});

router.put(
  "/accounts/:id",
  authMiddleware,
  async (req, res): Promise<void> => {
    const params = UpdateAccountParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateAccountBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const updates: Partial<typeof accountsTable.$inferInsert> = { updatedAt: new Date() };
    if (parsed.data.name != null) updates.name = parsed.data.name;
    if (parsed.data.mobileNumber != null) updates.mobileNumber = parsed.data.mobileNumber;
    if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;
    if (parsed.data.apiKey != null) updates.apiKey = encrypt(parsed.data.apiKey);
    if (parsed.data.secretKey != null)
      updates.secretKey = encrypt(parsed.data.secretKey);

    await db
      .update(accountsTable)
      .set(updates)
      .where(eq(accountsTable.id, params.data.id));
    const [account] = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.id, params.data.id));
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    res.json(serializeAccount(account, "****" + account.apiKey.slice(-8)));
  },
);

router.delete(
  "/accounts/:id",
  authMiddleware,
  async (req, res): Promise<void> => {
    const params = DeleteAccountParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await db
      .delete(accountsTable)
      .where(eq(accountsTable.id, params.data.id));
    res.sendStatus(204);
  },
);

router.post(
  "/accounts/:id/verify",
  authMiddleware,
  async (req, res): Promise<void> => {
    const params = VerifyAccountParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [account] = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.id, params.data.id));
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    try {
      const apiKey = decrypt(account.apiKey);
      const secretKey = decrypt(account.secretKey);
      const data = (await callCoinswitch(
        "GET",
        "/trade/api/v2/futures/wallet_balance",
        apiKey,
        secretKey,
        { exchange: "EXCHANGE_2" },
      )) as { data: { base_asset_balances: Array<{ balances: { total_available_balance: string } }> } };
      const balance =
        data?.data?.base_asset_balances?.[0]?.balances?.total_available_balance;

      if (balance != null) {
        await db
          .update(accountsTable)
          .set({
            lastBalance: account.currentBalance,
            currentBalance: balance,
            balanceUpdatedAt: new Date(),
          })
          .where(eq(accountsTable.id, params.data.id));
      }

      res.json({ success: true, balance: balance || null });
    } catch (err) {
      const error = err as Error;
      res.json({ success: false, error: error.message });
    }
  },
);

export default router;