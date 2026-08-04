import { Router } from "express";
import { authMiddleware } from "../lib/auth";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { encrypt, decrypt } from "../lib/crypto";

const router = Router();

async function getOrCreateSettings() {
  const [existing] = await db.select().from(settingsTable).limit(1);
  if (existing) return existing;
  await db.insert(settingsTable).values({});
  const [created] = await db.select().from(settingsTable).limit(1);
  return created;
}

type SelectedAccount = { accountId: number; multiplier: number };
type AutoPunchConfig = { orderCount: number; stepSize: number; tpPoints: number };

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

const AUTO_PUNCH_DEFAULTS: AutoPunchConfig = { orderCount: 6, stepSize: 50, tpPoints: 100 };

function parseSelectedAccounts(value: unknown): SelectedAccount[] {
  if (Array.isArray(value)) return value as SelectedAccount[];
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

function parseAutoPunchConfig(value: unknown): AutoPunchConfig {
  const tryParse = (v: unknown): AutoPunchConfig | null => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      if (
        typeof obj.orderCount === "number" &&
        typeof obj.stepSize === "number" &&
        typeof obj.tpPoints === "number"
      ) {
        return { orderCount: obj.orderCount, stepSize: obj.stepSize, tpPoints: obj.tpPoints };
      }
    }
    return null;
  };

  const direct = tryParse(value);
  if (direct) return direct;

  if (typeof value === "string") {
    try {
      return tryParse(JSON.parse(value)) ?? AUTO_PUNCH_DEFAULTS;
    } catch {
      return AUTO_PUNCH_DEFAULTS;
    }
  }

  return AUTO_PUNCH_DEFAULTS;
}

function isValidAutoPunchConfig(value: unknown): value is AutoPunchConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.orderCount === "number" && v.orderCount >= 1 && v.orderCount <= 20 &&
    typeof v.stepSize === "number" && v.stepSize >= 1 &&
    typeof v.tpPoints === "number" && v.tpPoints >= 1
  );
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

const VALID_SLOT_STATUSES = new Set(["pending_fill", "placing_tp", "watching", "repunching"]);

function isValidWatchedSlot(v: unknown): v is WatchedSlot {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.accountId === "number" &&
    typeof s.symbol === "string" &&
    (s.side === "BUY" || s.side === "SELL") &&
    typeof s.limitPrice === "number" &&
    typeof s.tpPrice === "number" &&
    typeof s.quantity === "number" &&
    typeof s.repunchCount === "number" &&
    typeof s.status === "string" && VALID_SLOT_STATUSES.has(s.status as string)
  );
}

function isValidWatchedSlots(value: unknown): value is WatchedSlot[] {
  return Array.isArray(value) && value.every(isValidWatchedSlot);
}

router.get("/settings", authMiddleware, async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json({
    defaultLeverage: settings.defaultLeverage,
    defaultOrderType: settings.defaultOrderType,
    webhooksEnabled: settings.webhooksEnabled,
    selectedAccounts: parseSelectedAccounts(settings.selectedAccounts),
    autoPunchConfig: parseAutoPunchConfig(settings.autoPunchConfig),
    watchedSlots: parseWatchedSlots((settings as any).watchedSlots),
  });
});

router.put("/settings", authMiddleware, async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const rawAutoPunch = (req.body as Record<string, unknown>).autoPunchConfig;
  if (rawAutoPunch !== undefined && !isValidAutoPunchConfig(rawAutoPunch)) {
    res.status(400).json({ error: "Invalid autoPunchConfig: orderCount(1-20), stepSize(≥1), tpPoints(≥1) required." });
    return;
  }

  const rawWatchedSlots = (req.body as Record<string, unknown>).watchedSlots;
  if (rawWatchedSlots !== undefined && !isValidWatchedSlots(rawWatchedSlots)) {
    res.status(400).json({ error: "Invalid watchedSlots payload." });
    return;
  }

  const settings = await getOrCreateSettings();
  const updates: Partial<typeof settingsTable.$inferInsert> = {};

  if (parsed.data.defaultLeverage != null) updates.defaultLeverage = parsed.data.defaultLeverage;
  if (parsed.data.defaultOrderType != null) updates.defaultOrderType = parsed.data.defaultOrderType;
  if (parsed.data.webhooksEnabled != null) updates.webhooksEnabled = parsed.data.webhooksEnabled;
  if (parsed.data.selectedAccounts != null) updates.selectedAccounts = parsed.data.selectedAccounts;
  if (rawAutoPunch != null && isValidAutoPunchConfig(rawAutoPunch)) {
    updates.autoPunchConfig = rawAutoPunch;
  }
  if (rawWatchedSlots !== undefined && isValidWatchedSlots(rawWatchedSlots)) {
    (updates as any).watchedSlots = rawWatchedSlots;
  }

  if (Object.keys(updates).length > 0) {
    await db
      .update(settingsTable)
      .set(updates)
      .where(eq(settingsTable.id, settings.id));
  }

  const updated = await getOrCreateSettings();
  res.json({
    defaultLeverage: updated.defaultLeverage,
    defaultOrderType: updated.defaultOrderType,
    webhooksEnabled: updated.webhooksEnabled,
    selectedAccounts: parseSelectedAccounts(updated.selectedAccounts),
    autoPunchConfig: parseAutoPunchConfig(updated.autoPunchConfig),
    watchedSlots: parseWatchedSlots((updated as any).watchedSlots),
  });
});

router.get("/settings/market-proxy", authMiddleware, async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  const configured = !!(settings as any).marketProxyApiKey && !!(settings as any).marketProxySecretKey;
  res.json({
    configured,
    apiKeyMasked: configured
      ? `${decrypt((settings as any).marketProxyApiKey).slice(0, 4)}••••••••`
      : null,
  });
});

router.post("/settings/market-proxy", authMiddleware, async (req, res): Promise<void> => {
  const { apiKey, secretKey } = req.body as { apiKey?: string; secretKey?: string };
  if (!apiKey || !secretKey) {
    res.status(400).json({ error: "apiKey and secretKey are required" });
    return;
  }

  const settings = await getOrCreateSettings();
  await db
    .update(settingsTable)
    .set({
      marketProxyApiKey: encrypt(apiKey),
      marketProxySecretKey: encrypt(secretKey),
    } as any)
    .where(eq(settingsTable.id, settings.id));

  res.json({ success: true });
});

export default router;







// ***************************************************11/07/2026**********************************************




// import { Router } from "express";
// import { authMiddleware } from "../lib/auth";
// import { db, settingsTable } from "@workspace/db";
// import { eq } from "drizzle-orm";
// import { UpdateSettingsBody } from "@workspace/api-zod";

// const router = Router();

// async function getOrCreateSettings() {
//   const [existing] = await db.select().from(settingsTable).limit(1);
//   if (existing) return existing;
//   await db.insert(settingsTable).values({});
//   const [created] = await db.select().from(settingsTable).limit(1);
//   return created;
// }

// type SelectedAccount = { accountId: number; multiplier: number };
// type AutoPunchConfig = { orderCount: number; stepSize: number; tpPoints: number };

// const AUTO_PUNCH_DEFAULTS: AutoPunchConfig = { orderCount: 6, stepSize: 50, tpPoints: 100 };

// function parseSelectedAccounts(value: unknown): SelectedAccount[] {
//   if (Array.isArray(value)) return value as SelectedAccount[];
//   if (typeof value === "string") {
//     try {
//       const parsed = JSON.parse(value);
//       return Array.isArray(parsed) ? parsed : [];
//     } catch {
//       return [];
//     }
//   }
//   return [];
// }

// function parseAutoPunchConfig(value: unknown): AutoPunchConfig {
//   const tryParse = (v: unknown): AutoPunchConfig | null => {
//     if (v && typeof v === "object" && !Array.isArray(v)) {
//       const obj = v as Record<string, unknown>;
//       if (
//         typeof obj.orderCount === "number" &&
//         typeof obj.stepSize === "number" &&
//         typeof obj.tpPoints === "number"
//       ) {
//         return { orderCount: obj.orderCount, stepSize: obj.stepSize, tpPoints: obj.tpPoints };
//       }
//     }
//     return null;
//   };

//   const direct = tryParse(value);
//   if (direct) return direct;

//   if (typeof value === "string") {
//     try {
//       return tryParse(JSON.parse(value)) ?? AUTO_PUNCH_DEFAULTS;
//     } catch {
//       return AUTO_PUNCH_DEFAULTS;
//     }
//   }

//   return AUTO_PUNCH_DEFAULTS;
// }

// function isValidAutoPunchConfig(value: unknown): value is AutoPunchConfig {
//   if (!value || typeof value !== "object" || Array.isArray(value)) return false;
//   const v = value as Record<string, unknown>;
//   return (
//     typeof v.orderCount === "number" && v.orderCount >= 1 && v.orderCount <= 20 &&
//     typeof v.stepSize === "number" && v.stepSize >= 1 &&
//     typeof v.tpPoints === "number" && v.tpPoints >= 1
//   );
// }

// router.get("/settings", authMiddleware, async (req, res): Promise<void> => {
//   const settings = await getOrCreateSettings();
//   res.json({
//     defaultLeverage: settings.defaultLeverage,
//     defaultOrderType: settings.defaultOrderType,
//     webhooksEnabled: settings.webhooksEnabled,
//     selectedAccounts: parseSelectedAccounts(settings.selectedAccounts),
//     autoPunchConfig: parseAutoPunchConfig(settings.autoPunchConfig),
//   });
// });

// router.put("/settings", authMiddleware, async (req, res): Promise<void> => {
//   // Validate the known fields via generated schema
//   const parsed = UpdateSettingsBody.safeParse(req.body);
//   if (!parsed.success) {
//     res.status(400).json({ error: parsed.error.message });
//     return;
//   }

//   // Validate autoPunchConfig separately (not in generated schema)
//   const rawAutoPunch = (req.body as Record<string, unknown>).autoPunchConfig;
//   if (rawAutoPunch !== undefined && !isValidAutoPunchConfig(rawAutoPunch)) {
//     res.status(400).json({ error: "Invalid autoPunchConfig: orderCount(1-20), stepSize(≥1), tpPoints(≥1) required." });
//     return;
//   }

//   const settings = await getOrCreateSettings();
//   const updates: Partial<typeof settingsTable.$inferInsert> = {};

//   if (parsed.data.defaultLeverage != null) updates.defaultLeverage = parsed.data.defaultLeverage;
//   if (parsed.data.defaultOrderType != null) updates.defaultOrderType = parsed.data.defaultOrderType;
//   if (parsed.data.webhooksEnabled != null) updates.webhooksEnabled = parsed.data.webhooksEnabled;
//   if (parsed.data.selectedAccounts != null) updates.selectedAccounts = parsed.data.selectedAccounts;
//   if (rawAutoPunch != null && isValidAutoPunchConfig(rawAutoPunch)) {
//     updates.autoPunchConfig = rawAutoPunch;
//   }

//   if (Object.keys(updates).length > 0) {
//     await db
//       .update(settingsTable)
//       .set(updates)
//       .where(eq(settingsTable.id, settings.id));
//   }

//   const updated = await getOrCreateSettings();
//   res.json({
//     defaultLeverage: updated.defaultLeverage,
//     defaultOrderType: updated.defaultOrderType,
//     webhooksEnabled: updated.webhooksEnabled,
//     selectedAccounts: parseSelectedAccounts(updated.selectedAccounts),
//     autoPunchConfig: parseAutoPunchConfig(updated.autoPunchConfig),
//   });
// });

// export default router;