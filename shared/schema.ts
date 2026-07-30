import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * The nine models from the spec. Money is `numeric(12,2)` everywhere — it comes
 * back out of the driver as a string, so every route maps it through `num()`
 * before it reaches the client, which works in plain numbers.
 */

const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

/* ---- finance: paycheck allocations ------------------------------- */

export const paychecks = pgTable("paychecks", {
  id: serial("id").primaryKey(),
  payDate: date("pay_date").notNull(),
  amount: money("amount").notNull(),
  /** "first" or "second" paycheck of the month. */
  label: text("label").notNull().default("first"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const allocations = pgTable("allocations", {
  id: serial("id").primaryKey(),
  paycheckId: integer("paycheck_id")
    .notNull()
    .references(() => paychecks.id, { onDelete: "cascade" }),
  /** bills | debt | credit_dump | surplus */
  category: text("category").notNull(),
  /** Set for debt and credit_dump rows. */
  debtAccountId: integer("debt_account_id").references(() => debtAccounts.id, {
    onDelete: "set null",
  }),
  /** Optionally ties a bills row back to the template entry it covers. */
  billId: integer("bill_id").references(() => bills.id, { onDelete: "set null" }),
  amount: money("amount").notNull(),
  notes: text("notes"),
  tags: text("tags")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
});

/* ---- finance: bill template and monthly log ---------------------- */

export const bills = pgTable("bills", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  expectedAmount: money("expected_amount").notNull().default("0"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** What actually left the account, recorded separately from allocations. */
export const monthlyBillPayments = pgTable(
  "monthly_bill_payments",
  {
    id: serial("id").primaryKey(),
    billId: integer("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    month: varchar("month", { length: 7 }).notNull(),
    amountPaid: money("amount_paid").notNull().default("0"),
  },
  (t) => ({
    /* One row per bill per month — the PUT endpoint upserts on this. */
    billMonth: unique("bill_month").on(t.billId, t.month),
  }),
);

/* ---- finance: debt ---------------------------------------------- */

export const debtAccounts = pgTable("debt_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  /** card | bnpl | loan | other. Only "card" can take the credit dump. */
  kind: text("kind").notNull().default("other"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const debtSnapshots = pgTable("debt_snapshots", {
  id: serial("id").primaryKey(),
  debtAccountId: integer("debt_account_id")
    .notNull()
    .references(() => debtAccounts.id, { onDelete: "cascade" }),
  /** Optional link to the cycle this balance was read against. */
  paycheckId: integer("paycheck_id").references(() => paychecks.id, {
    onDelete: "set null",
  }),
  snapshotDate: date("snapshot_date").notNull(),
  balance: money("balance").notNull(),
  amountPaid: money("amount_paid").notNull().default("0"),
});

/* ---- fitness ---------------------------------------------------- */

export const fitnessLogs = pgTable("fitness_logs", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  workoutType: text("workout_type"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---- journal ---------------------------------------------------- */

export const journalEntries = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  /** One entry per calendar day. */
  date: date("date").notNull().unique(),
  body: text("body").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const journalImages = pgTable("journal_images", {
  id: serial("id").primaryKey(),
  journalEntryId: integer("journal_entry_id")
    .notNull()
    .references(() => journalEntries.id, { onDelete: "cascade" }),
  /** Opaque key handed back by the image store adapter. */
  storageKey: text("storage_key").notNull(),
  originalName: text("original_name"),
  contentType: text("content_type"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});
