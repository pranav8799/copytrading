import { Router } from "express";
import { authMiddleware } from "../lib/auth";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateSettingsBody } from "@workspace/api-zod";

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

router.get("/settings", authMiddleware, async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json({
    defaultLeverage: settings.defaultLeverage,
    defaultOrderType: settings.defaultOrderType,
    webhooksEnabled: settings.webhooksEnabled,
    selectedAccounts: parseSelectedAccounts(settings.selectedAccounts),
    autoPunchConfig: parseAutoPunchConfig(settings.autoPunchConfig),
  });
});

router.put("/settings", authMiddleware, async (req, res): Promise<void> => {
  // Validate the known fields via generated schema
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Validate autoPunchConfig separately (not in generated schema)
  const rawAutoPunch = (req.body as Record<string, unknown>).autoPunchConfig;
  if (rawAutoPunch !== undefined && !isValidAutoPunchConfig(rawAutoPunch)) {
    res.status(400).json({ error: "Invalid autoPunchConfig: orderCount(1-20), stepSize(≥1), tpPoints(≥1) required." });
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
  });
});

export default router;