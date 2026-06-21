import { mysqlTable, bigint, int, varchar, boolean, json } from "drizzle-orm/mysql-core";

export type SelectedAccount = {
  accountId: number;
  multiplier: number;
};

export const settingsTable = mysqlTable("settings", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  defaultLeverage: int("default_leverage").default(10).notNull(),
  defaultOrderType: varchar("default_order_type", { length: 30 }).default("MARKET").notNull(),
  webhooksEnabled: boolean("webhooks_enabled").default(true).notNull(),
  selectedAccounts: json("selected_accounts").$type<SelectedAccount[]>().default([]).notNull(),
});

export type Settings = typeof settingsTable.$inferSelect;