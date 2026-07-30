import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  boolean,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const billsTable = pgTable("bills", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  expectedAmount: numeric("expected_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const billPaymentsTable = pgTable("bill_payments", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id")
    .notNull()
    .references(() => billsTable.id, { onDelete: "cascade" }),
  month: text("month").notNull(), // YYYY-MM
  amountPaid: numeric("amount_paid", { precision: 10, scale: 2 }).notNull().default("0"),
});

export const debtAccountsTable = pgTable("debt_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("other"), // card | bnpl | loan | other
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const debtSnapshotsTable = pgTable("debt_snapshots", {
  id: serial("id").primaryKey(),
  debtAccountId: integer("debt_account_id")
    .notNull()
    .references(() => debtAccountsTable.id, { onDelete: "cascade" }),
  snapshotDate: date("snapshot_date", { mode: "string" }).notNull(),
  balance: numeric("balance", { precision: 10, scale: 2 }).notNull(),
  amountPaid: numeric("amount_paid", { precision: 10, scale: 2 }).notNull().default("0"),
});

/**
 * A paycheck is identified by its month and its position within that month —
 * the 1st, 2nd, or 3rd deposit. No calendar date is kept: which day it landed
 * on never affected any figure the app reports.
 */
export const paychecksTable = pgTable(
  "paychecks",
  {
    id: serial("id").primaryKey(),
    month: text("month").notNull(), // YYYY-MM
    seq: integer("seq").notNull().default(1), // 1 | 2 | 3
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  },
  (t) => [uniqueIndex("paychecks_month_seq_idx").on(t.month, t.seq)],
);

/**
 * An allocation is an amount and a note. The note doubles as the tag the money
 * is filed under — grouping a month's spending means grouping by note. There
 * are deliberately no categories or account links: what a dollar was for is
 * whatever you typed.
 */
export const allocationsTable = pgTable("allocations", {
  id: serial("id").primaryKey(),
  paycheckId: integer("paycheck_id")
    .notNull()
    .references(() => paychecksTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  note: text("note").notNull().default(""),
});

export const monthlyBillItemsTable = pgTable("monthly_bill_items", {
  id:        serial("id").primaryKey(),
  month:     text("month").notNull(),            // YYYY-MM
  name:      text("name").notNull(),
  amount:    numeric("amount", { precision: 10, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export type MonthlyBillItem = typeof monthlyBillItemsTable.$inferSelect;
export type Bill = typeof billsTable.$inferSelect;
export type BillPayment = typeof billPaymentsTable.$inferSelect;
export type DebtAccount = typeof debtAccountsTable.$inferSelect;
export type DebtSnapshot = typeof debtSnapshotsTable.$inferSelect;
export type Paycheck = typeof paychecksTable.$inferSelect;
export type Allocation = typeof allocationsTable.$inferSelect;

export type InsertBill = typeof billsTable.$inferInsert;
export type InsertDebtAccount = typeof debtAccountsTable.$inferInsert;
export type InsertPaycheck = typeof paychecksTable.$inferInsert;
