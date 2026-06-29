import { mysqlTable, bigint, varchar, text, boolean, timestamp } from "drizzle-orm/mysql-core";

export const adminsTable = mysqlTable("admins", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  name: varchar("name", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 15 }).notNull().unique(),
  password: text("password").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Admin = typeof adminsTable.$inferSelect;