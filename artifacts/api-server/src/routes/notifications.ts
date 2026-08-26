import { Router } from "express";
import { db, notificationsTable, accountsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authMiddleware } from "../lib/auth";
import { logActivity } from "../lib/activityLogger";
import { CreateNotificationBody } from "@workspace/api-zod"; // ← was: NotificationInput

const router = Router();

function serializeNotification(n: typeof notificationsTable.$inferSelect, accountName: string | null) {
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    targetType: n.targetType,
    accountId: n.accountId,
    accountName,
    isActive: n.isActive,
    createdAt: n.createdAt.toISOString(),
  };
}

router.get("/notifications", authMiddleware, async (req, res): Promise<void> => {
  const rows = await db
    .select({ notification: notificationsTable, accountName: accountsTable.name })
    .from(notificationsTable)
    .leftJoin(accountsTable, eq(accountsTable.id, notificationsTable.accountId))
    .orderBy(desc(notificationsTable.createdAt));

  res.json(rows.map((r) => serializeNotification(r.notification, r.accountName)));
});

router.post("/notifications", authMiddleware, async (req, res): Promise<void> => {
  const parsed = CreateNotificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { title, message, targetType, accountId } = parsed.data;

  const result = await db.insert(notificationsTable).values({
    title,
    message,
    targetType,
    accountId: targetType === "ACCOUNT" ? accountId ?? null : null,
  });

  const [notification] = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.id, result[0].insertId));

  await logActivity("Notification created", { id: notification.id, title, targetType, accountId });

  res.status(201).json(serializeNotification(notification, null));
});

router.patch("/notifications/:id/deactivate", authMiddleware, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  await db.update(notificationsTable).set({ isActive: false }).where(eq(notificationsTable.id, id));
  await logActivity("Notification deactivated", { id });

  res.sendStatus(204);
});

export default router;