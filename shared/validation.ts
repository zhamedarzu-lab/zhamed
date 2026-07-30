import { z } from "zod";

/**
 * One place for every shape the API accepts. Routes run these through
 * `parse()` in server/util.ts, which turns a failure into a 422 carrying
 * per-field messages the client surfaces directly.
 */

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-07-29.");

export const isoMonth = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Use a month like 2026-07.");

/** Money in, from a form: finite, non-negative, at most two decimals of meaning. */
const amount = z
  .number({ invalid_type_error: "Enter an amount." })
  .finite("Enter a real amount.")
  .nonnegative("Amounts can't be negative.")
  .max(99_999_999, "That amount is too large.");

/** A paycheck itself must be more than zero — an allocation may be zero. */
const positiveAmount = z
  .number({ invalid_type_error: "Enter the paycheck amount." })
  .finite("Enter a real amount.")
  .positive("Enter the paycheck amount.")
  .max(99_999_999, "That amount is too large.");

const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => v || null);

export const CATEGORIES = ["bills", "debt", "credit_dump", "surplus"] as const;
export const DEBT_KINDS = ["card", "bnpl", "loan", "other"] as const;

/* ---- paychecks --------------------------------------------------- */

export const allocationInput = z.object({
  category: z.enum(CATEGORIES),
  debtAccountId: z.number().int().positive().nullish().transform((v) => v ?? null),
  billId: z.number().int().positive().nullish().transform((v) => v ?? null),
  amount: amount,
  notes: optionalText(500),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
});

export const paycheckInput = z.object({
  payDate: isoDate,
  amount: positiveAmount,
  label: z.enum(["first", "second"]).default("first"),
  allocations: z.array(allocationInput).max(200).default([]),
});

/* ---- bills ------------------------------------------------------- */

export const billCreate = z.object({
  name: z.string().trim().min(1, "Give the bill a name.").max(120),
  expectedAmount: amount.default(0),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const billPatch = billCreate.partial();

export const billPaymentUpsert = z.object({
  billId: z.number().int().positive(),
  month: isoMonth,
  amountPaid: amount,
});

/* ---- debt -------------------------------------------------------- */

export const debtAccountCreate = z.object({
  name: z.string().trim().min(1, "Give the account a name.").max(120),
  kind: z.enum(DEBT_KINDS).default("other"),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const debtAccountPatch = debtAccountCreate.partial();

export const debtSnapshotCreate = z.object({
  debtAccountId: z.number().int().positive(),
  paycheckId: z.number().int().positive().nullish().transform((v) => v ?? null),
  snapshotDate: isoDate,
  balance: amount,
  amountPaid: amount.default(0),
});

/* ---- fitness ----------------------------------------------------- */

export const fitnessLogCreate = z.object({
  date: isoDate,
  workoutType: optionalText(80),
  notes: optionalText(4000),
});

export const fitnessLogPatch = fitnessLogCreate.partial();

/* ---- journal ----------------------------------------------------- */

export const journalEntryUpsert = z.object({
  body: z.string().max(50_000, "That entry is too long to store.").default(""),
});

/* ---- query strings ----------------------------------------------- */

export const dateRangeQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  tag: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

export const monthQuery = z.object({ month: isoMonth.optional() });

export const accountQuery = z.object({
  accountId: z.coerce.number().int().positive().optional(),
});
