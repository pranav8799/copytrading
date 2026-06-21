import { mysqlTable, bigint, int, timestamp, json } from "drizzle-orm/mysql-core";
import { webhooksTable } from "./webhooks";

export const webhookLogsTable = mysqlTable("webhook_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  webhookId: bigint("webhook_id", { mode: "number" }).notNull().references(() => webhooksTable.id),
  payload: json("payload"),
  accountsFired: int("accounts_fired").default(0),
  successCount: int("success_count").default(0),
  failCount: int("fail_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type WebhookLog = typeof webhookLogsTable.$inferSelect;
