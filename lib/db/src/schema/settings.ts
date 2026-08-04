import { mysqlTable, bigint, int, varchar, boolean, json, text } from "drizzle-orm/mysql-core";

export type SelectedAccount = {
  accountId: number;
  multiplier: number;
};

export type AutoPunchConfig = {
  orderCount: number;
  stepSize: number;
  tpPoints: number;
};

export const settingsTable = mysqlTable("settings", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  defaultLeverage: int("default_leverage").default(10).notNull(),
  defaultOrderType: varchar("default_order_type", { length: 30 }).default("MARKET").notNull(),
  webhooksEnabled: boolean("webhooks_enabled").default(true).notNull(),
  selectedAccounts: json("selected_accounts").$type<SelectedAccount[]>().default([]).notNull(),
  autoPunchConfig: json("auto_punch_config").$type<AutoPunchConfig>().default({ orderCount: 6, stepSize: 50, tpPoints: 100 }).notNull(),
  watchedSlots: json("watched_slots").default([]).notNull(),
  marketProxyAccountId: bigint("market_proxy_account_id", { mode: "number" }),
  marketProxyApiKey: text("market_proxy_api_key"),
  marketProxySecretKey: text("market_proxy_secret_key"),
});

export type Settings = typeof settingsTable.$inferSelect;