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

router.get("/settings", authMiddleware, async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json({
    defaultLeverage: settings.defaultLeverage,
    defaultOrderType: settings.defaultOrderType,
    webhooksEnabled: settings.webhooksEnabled,
    selectedAccounts: parseSelectedAccounts(settings.selectedAccounts),
  });
});

router.put("/settings", authMiddleware, async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const settings = await getOrCreateSettings();
  const updates: Partial<typeof settingsTable.$inferInsert> = {};
  if (parsed.data.defaultLeverage != null) updates.defaultLeverage = parsed.data.defaultLeverage;
  if (parsed.data.defaultOrderType != null) updates.defaultOrderType = parsed.data.defaultOrderType;
  if (parsed.data.webhooksEnabled != null) updates.webhooksEnabled = parsed.data.webhooksEnabled;
  if (parsed.data.selectedAccounts != null) updates.selectedAccounts = parsed.data.selectedAccounts;

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
  });
});

export default router;