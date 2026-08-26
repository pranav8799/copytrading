import { Router } from "express";
import { authMiddleware } from "../lib/auth";
import { db, userSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

interface WatchedSlot {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  limitPrice: number;
  tpPrice: number;
  quantity: number;
  repunchCount: number;
  status: string;
  stopped?: boolean;
  [key: string]: unknown;
}

function parseWatchedSlots(value: unknown): WatchedSlot[] {
  if (Array.isArray(value)) return value as WatchedSlot[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// GET /api/settings/repunch-slots            → every client's slots
// GET /api/settings/repunch-slots?accountId=5 → one client's slots
router.get("/settings/repunch-slots", authMiddleware, async (req, res): Promise<void> => {
  const accountId = req.query.accountId ? Number(req.query.accountId) : undefined;

  const rows = accountId
    ? await db.select().from(userSettingsTable).where(eq(userSettingsTable.accountId, accountId))
    : await db.select().from(userSettingsTable);

  const result = rows.flatMap((row) =>
    parseWatchedSlots(row.watchedSlots).map((slot) => ({
      ...slot,
      accountId: row.accountId,
    }))
  );

  res.json(result);
});

// Body: { updates: { accountId: number; slotId: string; stopped: boolean }[] }
// Toggles `stopped` on one or more slots, batched per accountId.
router.patch("/settings/repunch-slots", authMiddleware, async (req, res): Promise<void> => {
  const { updates } = req.body as {
    updates?: { accountId: number; slotId: string; stopped: boolean }[];
  };
  if (!Array.isArray(updates) || updates.length === 0) {
    res.status(400).json({ error: "updates array required" });
    return;
  }

  const byAccount = new Map<number, Map<string, boolean>>();
  for (const u of updates) {
    if (!byAccount.has(u.accountId)) byAccount.set(u.accountId, new Map());
    byAccount.get(u.accountId)!.set(u.slotId, u.stopped);
  }

  for (const [accountId, opBySlotId] of byAccount) {
    const rows = await db.select().from(userSettingsTable).where(eq(userSettingsTable.accountId, accountId));
    const row = rows[0];
    if (!row) continue;

    const slots = parseWatchedSlots(row.watchedSlots);
    const next = slots.map((s) => (opBySlotId.has(s.id) ? { ...s, stopped: opBySlotId.get(s.id) } : s));

    await db
      .update(userSettingsTable)
      .set({ watchedSlots: JSON.stringify(next) })
      .where(eq(userSettingsTable.accountId, accountId));
  }

  res.json({ ok: true });
});

// Body: { removals: { accountId: number; slotId: string }[] }
// Removes one or more slots from the monitor (doesn't touch the exchange).
// Using POST instead of DELETE+body since some proxies strip DELETE bodies.
router.post("/settings/repunch-slots/remove", authMiddleware, async (req, res): Promise<void> => {
  const { removals } = req.body as { removals?: { accountId: number; slotId: string }[] };
  if (!Array.isArray(removals) || removals.length === 0) {
    res.status(400).json({ error: "removals array required" });
    return;
  }

  const byAccount = new Map<number, Set<string>>();
  for (const r of removals) {
    if (!byAccount.has(r.accountId)) byAccount.set(r.accountId, new Set());
    byAccount.get(r.accountId)!.add(r.slotId);
  }

  for (const [accountId, slotIds] of byAccount) {
    const rows = await db.select().from(userSettingsTable).where(eq(userSettingsTable.accountId, accountId));
    const row = rows[0];
    if (!row) continue;

    const slots = parseWatchedSlots(row.watchedSlots);
    const next = slots.filter((s) => !slotIds.has(s.id));

    await db
      .update(userSettingsTable)
      .set({ watchedSlots: JSON.stringify(next) })
      .where(eq(userSettingsTable.accountId, accountId));
  }

  res.json({ ok: true });
});

export default router;