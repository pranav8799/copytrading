import { db, settingsTable, accountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { callCoinswitch, executeOnAllAccounts } from "../lib/coinswitchApi";
import { decrypt } from "../lib/crypto";

export interface WatchedSlot {
  id: string;
  accountId: number;
  symbol: string;
  side: "BUY" | "SELL";
  limitPrice: number;
  tpPrice: number;
  quantity: number;
  repunchCount: number;
  status: "pending_fill" | "placing_tp" | "watching" | "repunching";
  orderId?: string;
  seenOpen?: boolean;
  tpOrderId?: string;
  tpSeenOpen?: boolean;
}

const POLL_INTERVAL_MS = 8_000;
let running = false;

function parseSlots(value: unknown): WatchedSlot[] {
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

async function loadSlots(): Promise<{ settingsId: number; slots: WatchedSlot[] } | null> {
  const [row] = await db.select().from(settingsTable).limit(1);
  if (!row) return null;
  return { settingsId: row.id, slots: parseSlots((row as any).watchedSlots) };
}

async function saveSlots(settingsId: number, slots: WatchedSlot[]) {
  await db.update(settingsTable).set({ watchedSlots: slots } as any).where(eq(settingsTable.id, settingsId));
}

async function fetchOpenOrderIds(accountId: number): Promise<Set<string> | null> {
  const [acc] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId)).limit(1);
  if (!acc) return null;
  try {
    const apiKey = decrypt(acc.apiKey);
    const secretKey = decrypt(acc.secretKey);
    const data = (await callCoinswitch("POST", "/trade/api/v2/futures/orders/open", apiKey, secretKey, {
      exchange: "EXCHANGE_2",
      limit: 50,
    })) as { data: { orders: Array<{ order_id: string }> } };
    const orders = data?.data?.orders ?? [];
    return new Set(orders.map((o) => o.order_id));
  } catch (err) {
    console.error(`[repunch] fetchOpenOrderIds failed for account ${accountId}`, err);
    return null;
  }
}

async function hasOpenPosition(accountId: number, symbol: string, expectedSide: "LONG" | "SHORT"): Promise<boolean | null> {
  const [acc] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId)).limit(1);
  if (!acc) return null;
  try {
    const apiKey = decrypt(acc.apiKey);
    const secretKey = decrypt(acc.secretKey);
    const data = (await callCoinswitch("GET", "/trade/api/v2/futures/positions", apiKey, secretKey, {
      exchange: "EXCHANGE_2",
      symbol,
    })) as { data: unknown[] };
    const positions = Array.isArray(data?.data) ? data.data : [];
    return positions.some((p: any) => p.position_side === expectedSide);
  } catch (err) {
    console.error(`[repunch] hasOpenPosition failed for account ${accountId}`, err);
    return null;
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const loaded = await loadSlots();
    if (!loaded || loaded.slots.length === 0) return;
    const { settingsId } = loaded;
    const next = [...loaded.slots];
    let changed = false;

    const accountIdsNeeded = Array.from(new Set(
      next.filter((s) => s.status === "pending_fill" || s.status === "watching").map((s) => s.accountId)
    ));
    const openOrdersByAccount = new Map<number, Set<string>>();
    for (const accId of accountIdsNeeded) {
      const ids = await fetchOpenOrderIds(accId);
      if (ids) openOrdersByAccount.set(accId, ids);
    }

    // Phase 1: entry limit filled → place TP exit limit
    for (let i = 0; i < next.length; i++) {
      const slot = next[i];
      if (slot.status !== "pending_fill" || !slot.orderId) continue;
      const openIds = openOrdersByAccount.get(slot.accountId);
      if (!openIds) continue; // fetch failed this tick, retry next tick

      if (openIds.has(slot.orderId)) {
        if (!slot.seenOpen) { next[i] = { ...slot, seenOpen: true }; changed = true; }
        continue;
      }

      // Order isn't resting on the book anymore. Check the position FIRST,
      // regardless of seenOpen — an order can fill instantly (e.g. a MARKET
      // entry, or a LIMIT entry placed right at the market price) before we
      // ever get a chance to observe it resting open. Only fall back to the
      // seenOpen gate to decide "cancelled" vs "still being placed", never
      // to decide "filled".
      const expectedSide = slot.side === "BUY" ? "LONG" : "SHORT";
      const filled = await hasOpenPosition(slot.accountId, slot.symbol, expectedSide);
      if (filled === null) continue; // fetch failed, retry next tick

      if (!filled) {
        if (!slot.seenOpen) continue; // never seen open + no position yet — might just not be placed/registered yet, wait
        // was seen open before, now gone, and no position — cancelled/rejected
        next.splice(i, 1); i--; changed = true;
        continue;
      }

      try {
        const results = await executeOnAllAccounts([slot.accountId], {
          symbol: slot.symbol,
          side: slot.side === "BUY" ? "SELL" : "BUY",
          order_type: "LIMIT",
          quantity: slot.quantity,
          price: slot.tpPrice,
          reduce_only: true,
        }, "AUTO_REPUNCH" as any);
        const tpOrderId = results[0]?.orderId ?? undefined;
        next[i] = { ...slot, status: "watching", tpOrderId, tpSeenOpen: false, orderId: undefined, seenOpen: false };
        changed = true;
      } catch (err) {
        console.error(`[repunch] failed to place TP for slot ${slot.id}`, err);
      }
    }

    // Phase 2: TP exit filled → repunch a fresh entry limit
    for (let i = 0; i < next.length; i++) {
      const slot = next[i];
      if (slot.status !== "watching" || !slot.tpOrderId) continue;
      const openIds = openOrdersByAccount.get(slot.accountId);
      if (!openIds) continue;

      if (openIds.has(slot.tpOrderId)) {
        if (!slot.tpSeenOpen) { next[i] = { ...slot, tpSeenOpen: true }; changed = true; }
        continue;
      }
      if (!slot.tpSeenOpen) continue;

      try {
        const results = await executeOnAllAccounts([slot.accountId], {
          symbol: slot.symbol,
          side: slot.side,
          order_type: "LIMIT",
          quantity: slot.quantity,
          price: slot.limitPrice,
        }, "AUTO_REPUNCH" as any);
        const orderId = results[0]?.orderId ?? undefined;
        next[i] = {
          ...slot,
          status: "pending_fill",
          orderId,
          seenOpen: false,
          tpOrderId: undefined,
          tpSeenOpen: false,
          repunchCount: slot.repunchCount + 1,
        };
        changed = true;
      } catch (err) {
        console.error(`[repunch] repunch failed for slot ${slot.id}`, err);
      }
    }

    if (changed) await saveSlots(settingsId, next);
  } catch (err) {
    console.error("[repunch] tick failed", err);
  } finally {
    running = false;
  }
}

export function startRepunchEngine() {
  console.log(`[repunch] engine started — polling every ${POLL_INTERVAL_MS}ms`);
  setInterval(() => { void tick(); }, POLL_INTERVAL_MS);
}