import { mysqlTable, bigint, text, timestamp, json, mysqlEnum } from "drizzle-orm/mysql-core";

export const systemLogsTable = mysqlTable("system_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  level: mysqlEnum("level", ["info", "warn", "error"]).notNull(),
  message: text("message").notNull(),
  context: json("context"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SystemLog = typeof systemLogsTable.$inferSelect;
