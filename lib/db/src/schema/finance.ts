import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  boolean,
  date,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { desc } from "drizzle-orm";

export const debtAccountsTable = pgTable("debt_accounts", {
  id:          serial("id").primaryKey(),
  name:        text("name").notNull(),
  kind:        text("kind").notNull().default("other"),
  active:      boolean("active").notNull().default(true),
  sortOrder:   integer("sort_order").notNull().default(0),
  creditLimit: numeric("credit_limit", { precision: 10, scale: 2 }),
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
  (t) => [
    uniqueIndex("paychecks_month_seq_idx").on(t.month, t.seq),
    index("paychecks_month_idx").on(t.month),
  ],
);

export const debtSnapshotsTable = pgTable(
  "debt_snapshots",
  {
    id: serial("id").primaryKey(),
    debtAccountId: integer("debt_account_id")
      .notNull()
      .references(() => debtAccountsTable.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date", { mode: "string" }).notNull(),
    balance: numeric("balance", { precision: 10, scale: 2 }).notNull(),
    amountPaid: numeric("amount_paid", { precision: 10, scale: 2 }).notNull().default("0"),
    // Optional tag to "this balance is as of payday X" instead of just a
    // calendar date. Purely a label — nulled out if the paycheck is deleted,
    // the balance history still stands.
    paycheckId: integer("paycheck_id").references(() => paychecksTable.id, {
      onDelete: "set null",
    }),
    loggedAt: timestamp("logged_at", { withTimezone: true }),
  },
  (t) => [
    index("debt_snapshots_date_idx").on(t.snapshotDate),
    index("debt_snapshots_account_id_idx").on(t.debtAccountId),
    // Serves the DISTINCT ON that reads each account's current balance.
    index("debt_snapshots_account_latest_idx").on(
      t.debtAccountId,
      desc(t.snapshotDate),
      desc(t.id),
    ),
  ],
);

/**
 * A cash account is a spendable balance you top up (borrow, deposit, transfer
 * in) and then draw down day to day — the opposite shape of a debt account,
 * which you draw up and pay down. Deliberately its own table rather than a
 * `debt_accounts` row: "total owed" must never include spendable cash, and
 * there is no credit limit, utilization, or paycheck-payment framing here.
 */
export const cashAccountsTable = pgTable("cash_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const cashSnapshotsTable = pgTable(
  "cash_snapshots",
  {
    id: serial("id").primaryKey(),
    cashAccountId: integer("cash_account_id")
      .notNull()
      .references(() => cashAccountsTable.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date", { mode: "string" }).notNull(),
    balance: numeric("balance", { precision: 10, scale: 2 }).notNull(),
    loggedAt: timestamp("logged_at", { withTimezone: true }),
    paycheckId: integer("paycheck_id")
      .references(() => paychecksTable.id, { onDelete: "set null" }),
  },
  (t) => [
    index("cash_snapshots_date_idx").on(t.snapshotDate),
    index("cash_snapshots_account_id_idx").on(t.cashAccountId),
  ],
);

/**
 * An allocation is an amount and a note. The note doubles as the tag the money
 * is filed under — grouping a month's spending means grouping by note. There
 * are deliberately no categories or account links: what a dollar was for is
 * whatever you typed.
 */
export const allocationsTable = pgTable(
  "allocations",
  {
    id: serial("id").primaryKey(),
    paycheckId: integer("paycheck_id")
      .notNull()
      .references(() => paychecksTable.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    note: text("note").notNull().default(""),
    // Optional link to a credit card this allocation was sent toward. Nulled
    // out if the card is later deleted — the paycheck history still stands.
    debtAccountId: integer("debt_account_id").references(() => debtAccountsTable.id, {
      onDelete: "set null",
    }),
    // Set once the linked payment has been folded into a balance update on the
    // Debt page, so "money sent since last update" only counts unapplied rows.
    appliedSnapshotId: integer("applied_snapshot_id").references(() => debtSnapshotsTable.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("allocations_paycheck_id_idx").on(t.paycheckId),
  ],
);

/**
 * Extra income is money added on top of a paycheck's own amount — a bill
 * surplus from underspending, a refund, a gift someone handed you. It grows
 * the pool allocations are made from without touching the paycheck's own
 * recorded amount, so the deposit still reflects what actually landed from
 * work.
 */
export const extraIncomeTable = pgTable("extra_income", {
  id: serial("id").primaryKey(),
  paycheckId: integer("paycheck_id")
    .notNull()
    .references(() => paychecksTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull().default("0"),
  note: text("note").notNull().default(""),
});

export const monthlySubscriptionItemsTable = pgTable(
  "monthly_subscription_items",
  {
    id:        serial("id").primaryKey(),
    month:     text("month").notNull(),            // YYYY-MM
    name:      text("name").notNull(),
    amount:    numeric("amount", { precision: 10, scale: 2 }).notNull().default("0"),
    sortOrder: integer("sort_order").notNull().default(0),
    active:       boolean("active").notNull().default(true),
    dueDay:       integer("due_day"),
    billingCycle: text("billing_cycle").notNull().default("monthly"),
  },
  (t) => [
    // Same access pattern as bills, which has had this index since 0029.
    index("monthly_subscription_items_month_idx").on(t.month),
  ],
);

export const monthlyBillItemsTable = pgTable(
  "monthly_bill_items",
  {
    id:        serial("id").primaryKey(),
    month:     text("month").notNull(),            // YYYY-MM
    name:      text("name").notNull(),
    amount:    numeric("amount", { precision: 10, scale: 2 }).notNull().default("0"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("monthly_bill_items_month_idx").on(t.month),
  ],
);

export const cashSpendingLogTable = pgTable(
  "cash_spending_log",
  {
    id:           serial("id").primaryKey(),
    cashAccountId: integer("cash_account_id")
      .notNull()
      .references(() => cashAccountsTable.id, { onDelete: "cascade" }),
    amount:       numeric("amount", { precision: 10, scale: 2 }).notNull(),
    description:  text("description").notNull().default(""),
    category:     text("category").notNull().default("Other"),
    notes:        text("notes"),
    loggedAt:     timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("cash_spending_log_account_id_idx").on(t.cashAccountId),
    index("cash_spending_log_logged_at_idx").on(t.loggedAt),
    // Both the entry list and the spending summary filter by account and then
    // bound or sort by time; neither single-column index covers that on its own.
    index("cash_spending_log_account_logged_at_idx").on(t.cashAccountId, t.loggedAt),
  ],
);

export type CashSpendingEntry = typeof cashSpendingLogTable.$inferSelect;

export type MonthlyBillItem = typeof monthlyBillItemsTable.$inferSelect;

export type DebtAccount = typeof debtAccountsTable.$inferSelect;
export type DebtSnapshot = typeof debtSnapshotsTable.$inferSelect;
export type CashAccount = typeof cashAccountsTable.$inferSelect;
export type CashSnapshot = typeof cashSnapshotsTable.$inferSelect;
export type Paycheck = typeof paychecksTable.$inferSelect;
export type Allocation = typeof allocationsTable.$inferSelect;
export type ExtraIncome = typeof extraIncomeTable.$inferSelect;

export type InsertDebtAccount = typeof debtAccountsTable.$inferInsert;
export type InsertCashAccount = typeof cashAccountsTable.$inferInsert;
export type InsertPaycheck = typeof paychecksTable.$inferInsert;

