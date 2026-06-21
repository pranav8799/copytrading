import { mysqlTable, bigint, varchar, int, boolean, timestamp, json } from "drizzle-orm/mysql-core";

export const webhooksTable = mysqlTable("webhooks", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  name: varchar("name", { length: 100 }).notNull(),
  token: varchar("token", { length: 100 }).notNull().unique(),
  targetAccounts: json("target_accounts").$type<number[]>().default([]),
  defaultSymbol: varchar("default_symbol", { length: 20 }),
  defaultLeverage: int("default_leverage"),
  isActive: boolean("is_active").default(true).notNull(),
  lastTriggered: timestamp("last_triggered"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Webhook = typeof webhooksTable.$inferSelect;
