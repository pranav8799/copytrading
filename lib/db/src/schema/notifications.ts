import {
  mysqlTable,
  bigint,
  varchar,
  text,
  mysqlEnum,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/mysql-core";
import { accountsTable } from "./accounts";
import { adminsTable } from "./admins";

export const notificationsTable = mysqlTable("notifications", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message").notNull(),
  targetType: mysqlEnum("target_type", ["ALL", "ACCOUNT"]).notNull().default("ALL"),
  accountId: bigint("account_id", { mode: "number" }).references(() => accountsTable.id, {
    onDelete: "cascade",
  }),
  createdBy: bigint("created_by", { mode: "number" }).references(() => adminsTable.id, {
    onDelete: "set null",
  }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notificationReadsTable = mysqlTable(
  "notification_reads",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    notificationId: bigint("notification_id", { mode: "number" })
      .notNull()
      .references(() => notificationsTable.id, { onDelete: "cascade" }),
    accountId: bigint("account_id", { mode: "number" })
      .notNull()
      .references(() => accountsTable.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueRead: unique("notification_reads_notification_account_unique").on(
      table.notificationId,
      table.accountId,
    ),
  }),
);

export type Notification = typeof notificationsTable.$inferSelect;
export type NotificationRead = typeof notificationReadsTable.$inferSelect;