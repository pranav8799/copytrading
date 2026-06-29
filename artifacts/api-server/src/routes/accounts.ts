import { Router } from "express";
import { db, accountsTable, settingsTable, tradeLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/crypto";
import { callCoinswitch } from "../lib/coinswitchApi";
import { authMiddleware } from "../lib/auth";
import { logActivity } from "../lib/activityLogger";
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

// ── GET /accounts ─────────────────────────────────────────────────────
router.get("/accounts", authMiddleware, async (req, res): Promise<void> => {
  const accounts = await db
    .select()
    .from(accountsTable)
    .orderBy(accountsTable.createdAt);

  res.json(
    accounts.map((a) => serializeAccount(a, "****" + a.apiKey.slice(-8))),
  );
});

// ── POST /accounts ────────────────────────────────────────────────────
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

  await logActivity("Account created", { id: account.id, name, mobileNumber });

  res.status(201).json(serializeAccount(account, "****" + apiKey.slice(-8)));
});

// ── PUT /accounts/:id ─────────────────────────────────────────────────
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
    if (parsed.data.secretKey != null) updates.secretKey = encrypt(parsed.data.secretKey);

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

    // Log what changed
    const changedFields = Object.keys(parsed.data).filter(
      (k) => (parsed.data as any)[k] != null && k !== "apiKey" && k !== "secretKey"
    );
    if (parsed.data.isActive != null) {
      await logActivity(
        parsed.data.isActive ? "Account activated" : "Account disabled",
        { id: account.id, name: account.name }
      );
    } else {
      await logActivity("Account updated", {
        id: account.id,
        name: account.name,
        changedFields,
      });
    }

    res.json(serializeAccount(account, "****" + account.apiKey.slice(-8)));
  },
);

// ── DELETE /accounts/:id ──────────────────────────────────────────────
router.delete(
  "/accounts/:id",
  authMiddleware,
  async (req, res): Promise<void> => {
    const params = DeleteAccountParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const accountId = params.data.id;

    try {
      // Get account name before deleting for the log
      const [account] = await db
        .select()
        .from(accountsTable)
        .where(eq(accountsTable.id, accountId));

      const accountName = account?.name ?? `ID ${accountId}`;

      // Remove from selectedAccounts in settings
      const [currentSettings] = await db.select().from(settingsTable).limit(1);
      if (currentSettings) {
        const raw = currentSettings.selectedAccounts;
        let selectedAccounts: Array<{ accountId: number; multiplier: number }> = [];
        if (Array.isArray(raw)) {
          selectedAccounts = raw;
        } else if (typeof raw === "string") {
          selectedAccounts = JSON.parse(raw);
        } else if (raw && typeof raw === "object") {
          selectedAccounts = Object.values(raw) as any;
        }
        const filtered = selectedAccounts.filter((s) => s.accountId !== accountId);
        if (filtered.length !== selectedAccounts.length) {
          await db
            .update(settingsTable)
            .set({ selectedAccounts: filtered })
            .where(eq(settingsTable.id, currentSettings.id));
        }
      }

      // Delete trade_logs first (FK constraint)
      await db.delete(tradeLogsTable).where(eq(tradeLogsTable.accountId, accountId));

      // Delete the account
      await db.delete(accountsTable).where(eq(accountsTable.id, accountId));

      await logActivity("Account deleted", { id: accountId, name: accountName });

      res.sendStatus(204);
    } catch (err) {
      const error = err as Error;
      console.error("Delete account error:", error);
      await logActivity("Account delete failed", { id: accountId, error: error.message }, "error");
      res.status(500).json({ error: `Failed to delete account: ${error.message}` });
    }
  },
);

// ── POST /accounts/:id/verify ─────────────────────────────────────────
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

        await logActivity("Account balance refreshed", {
          id: account.id,
          name: account.name,
          balance,
        });
      }

      res.json({ success: true, balance: balance || null });
    } catch (err) {
      const error = err as Error;
      await logActivity("Account verify failed", {
        id: account.id,
        name: account.name,
        error: error.message,
      }, "error");
      res.json({ success: false, error: error.message });
    }
  },
);

export default router;





// import { Router } from "express";
// import { db, accountsTable, settingsTable, tradeLogsTable } from "@workspace/db";
// import { eq } from "drizzle-orm";
// import { encrypt, decrypt } from "../lib/crypto";
// import { callCoinswitch } from "../lib/coinswitchApi";
// import { authMiddleware } from "../lib/auth";
// import {
//   CreateAccountBody,
//   UpdateAccountBody,
//   UpdateAccountParams,
//   DeleteAccountParams,
//   VerifyAccountParams,
// } from "@workspace/api-zod";

// const router = Router();

// function serializeAccount(a: typeof accountsTable.$inferSelect, apiKeyMasked: string) {
//   return {
//     id: a.id,
//     name: a.name,
//     mobileNumber: a.mobileNumber,
//     apiKeyMasked,
//     isActive: a.isActive,
//     lastBalance: a.lastBalance,
//     currentBalance: a.currentBalance,
//     balanceUpdatedAt: a.balanceUpdatedAt ? a.balanceUpdatedAt.toISOString() : null,
//     createdAt: a.createdAt.toISOString(),
//   };
// }

// router.get("/accounts", authMiddleware, async (req, res): Promise<void> => {
//   const accounts = await db
//     .select()
//     .from(accountsTable)
//     .orderBy(accountsTable.createdAt);

//   res.json(
//     accounts.map((a) => serializeAccount(a, "****" + a.apiKey.slice(-8))),
//   );
// });

// router.post("/accounts", authMiddleware, async (req, res): Promise<void> => {
//   const parsed = CreateAccountBody.safeParse(req.body);
//   if (!parsed.success) {
//     res.status(400).json({ error: parsed.error.message });
//     return;
//   }
//   const { name, mobileNumber, apiKey, secretKey } = parsed.data;
//   const result = await db
//     .insert(accountsTable)
//     .values({
//       name,
//       mobileNumber,
//       apiKey: encrypt(apiKey),
//       secretKey: encrypt(secretKey),
//     });
//   const [account] = await db
//     .select()
//     .from(accountsTable)
//     .where(eq(accountsTable.id, result[0].insertId));
//   res.status(201).json(serializeAccount(account, "****" + apiKey.slice(-8)));
// });

// router.put(
//   "/accounts/:id",
//   authMiddleware,
//   async (req, res): Promise<void> => {
//     const params = UpdateAccountParams.safeParse(req.params);
//     if (!params.success) {
//       res.status(400).json({ error: "Invalid id" });
//       return;
//     }
//     const parsed = UpdateAccountBody.safeParse(req.body);
//     if (!parsed.success) {
//       res.status(400).json({ error: parsed.error.message });
//       return;
//     }
//     const updates: Partial<typeof accountsTable.$inferInsert> = { updatedAt: new Date() };
//     if (parsed.data.name != null) updates.name = parsed.data.name;
//     if (parsed.data.mobileNumber != null) updates.mobileNumber = parsed.data.mobileNumber;
//     if (parsed.data.isActive != null) updates.isActive = parsed.data.isActive;
//     if (parsed.data.apiKey != null) updates.apiKey = encrypt(parsed.data.apiKey);
//     if (parsed.data.secretKey != null)
//       updates.secretKey = encrypt(parsed.data.secretKey);

//     await db
//       .update(accountsTable)
//       .set(updates)
//       .where(eq(accountsTable.id, params.data.id));
//     const [account] = await db
//       .select()
//       .from(accountsTable)
//       .where(eq(accountsTable.id, params.data.id));
//     if (!account) {
//       res.status(404).json({ error: "Account not found" });
//       return;
//     }
//     res.json(serializeAccount(account, "****" + account.apiKey.slice(-8)));
//   },
// );

// router.delete(
//   "/accounts/:id",
//   authMiddleware,
//   async (req, res): Promise<void> => {
//     const params = DeleteAccountParams.safeParse(req.params);
//     if (!params.success) {
//       res.status(400).json({ error: "Invalid id" });
//       return;
//     }

//     const accountId = params.data.id;

//     try {
//       const [currentSettings] = await db.select().from(settingsTable).limit(1);

//       if (currentSettings) {
//         const raw = currentSettings.selectedAccounts;
//         console.log("TYPE:", typeof raw, "VALUE:", raw); // debug line

//         let selectedAccounts: Array<{ accountId: number; multiplier: number }> = [];

//         if (Array.isArray(raw)) {
//           selectedAccounts = raw;
//         } else if (typeof raw === "string") {
//           selectedAccounts = JSON.parse(raw);
//         } else if (raw && typeof raw === "object") {
//           // drizzle sometimes returns a plain object for JSON columns
//           selectedAccounts = Object.values(raw) as any;
//         }

//         const filtered = selectedAccounts.filter((s) => s.accountId !== accountId);

//         if (filtered.length !== selectedAccounts.length) {
//           await db
//             .update(settingsTable)
//             .set({ selectedAccounts: filtered })
//             .where(eq(settingsTable.id, currentSettings.id));
//         }
//       }

//       // Delete trade_logs for this account first (FK constraint)
// await db.delete(tradeLogsTable).where(eq(tradeLogsTable.accountId, accountId));

// // Now safe to delete the account
// await db.delete(accountsTable).where(eq(accountsTable.id, accountId));
//       res.sendStatus(204);
//     } catch (err) {
//       const error = err as Error;
//       console.error("Delete account error:", error);
//       res.status(500).json({ error: `Failed to delete account: ${error.message}` });
//     }
//   },
// );
// router.post(
//   "/accounts/:id/verify",
//   authMiddleware,
//   async (req, res): Promise<void> => {
//     const params = VerifyAccountParams.safeParse(req.params);
//     if (!params.success) {
//       res.status(400).json({ error: "Invalid id" });
//       return;
//     }
//     const [account] = await db
//       .select()
//       .from(accountsTable)
//       .where(eq(accountsTable.id, params.data.id));
//     if (!account) {
//       res.status(404).json({ error: "Account not found" });
//       return;
//     }
//     try {
//       const apiKey = decrypt(account.apiKey);
//       const secretKey = decrypt(account.secretKey);
//       const data = (await callCoinswitch(
//         "GET",
//         "/trade/api/v2/futures/wallet_balance",
//         apiKey,
//         secretKey,
//         { exchange: "EXCHANGE_2" },
//       )) as { data: { base_asset_balances: Array<{ balances: { total_available_balance: string } }> } };
//       const balance =
//         data?.data?.base_asset_balances?.[0]?.balances?.total_available_balance;

//       if (balance != null) {
//         await db
//           .update(accountsTable)
//           .set({
//             lastBalance: account.currentBalance,
//             currentBalance: balance,
//             balanceUpdatedAt: new Date(),
//           })
//           .where(eq(accountsTable.id, params.data.id));
//       }

//       res.json({ success: true, balance: balance || null });
//     } catch (err) {
//       const error = err as Error;
//       res.json({ success: false, error: error.message });
//     }
//   },
// );

// export default router;