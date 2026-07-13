import { mysqlTable, bigint, varchar, int, boolean, timestamp, json, decimal } from "drizzle-orm/mysql-core";

export const webhooksTable = mysqlTable("webhooks", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  name: varchar("name", { length: 100 }).notNull(),
  token: varchar("token", { length: 100 }).notNull().unique(),
  targetAccounts: json("target_accounts").$type<number[]>().default([]),
  defaultSymbol: varchar("default_symbol", { length: 20 }),
  defaultLeverage: int("default_leverage"),
  orderType: varchar("order_type", { length: 20 }).default("MARKET").notNull(),
  limitOffsetPercent: decimal("limit_offset_percent", { precision: 6, scale: 3 }),
  isActive: boolean("is_active").default(true).notNull(),
  lastTriggered: timestamp("last_triggered"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Webhook = typeof webhooksTable.$inferSelect;





// ************************************************11/07/2026*******************************************



// import { mysqlTable, bigint, varchar, int, boolean, timestamp, json } from "drizzle-orm/mysql-core";

// export const webhooksTable = mysqlTable("webhooks", {
//   id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
//   name: varchar("name", { length: 100 }).notNull(),
//   token: varchar("token", { length: 100 }).notNull().unique(),
//   targetAccounts: json("target_accounts").$type<number[]>().default([]),
//   defaultSymbol: varchar("default_symbol", { length: 20 }),
//   defaultLeverage: int("default_leverage"),
//   isActive: boolean("is_active").default(true).notNull(),
//   lastTriggered: timestamp("last_triggered"),
//   createdAt: timestamp("created_at").defaultNow().notNull(),
// });

// export type Webhook = typeof webhooksTable.$inferSelect;
