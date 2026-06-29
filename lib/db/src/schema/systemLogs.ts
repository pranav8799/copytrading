import { mysqlTable, bigint, text, timestamp, mysqlEnum } from "drizzle-orm/mysql-core";
import { json } from "drizzle-orm/mysql-core";

export const systemLogsTable = mysqlTable("system_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  level: mysqlEnum("level", ["info", "warn", "error"]).notNull().default("info"),
  message: text("message").notNull(),
  context: json("context").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SystemLog = typeof systemLogsTable.$inferSelect;