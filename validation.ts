import { db } from "./db.ts";
import { bills, debtAccounts } from "../shared/schema.ts";

/** The starting bill template from the spec. Editable in the app afterwards. */
const DEFAULT_BILLS: Array<[string, number]> = [
  ["Rent", 850],
  ["Credit Card A (minimum)", 100],
  ["Credit Card B (minimum)", 100],
  ["Power", 130],
  ["Subscriptions", 200],
  ["Web", 120],
  ["Student Loans", 150],
  ["Phone", 120],
  ["Car Insurance", 80],
  ["Storage Unit", 0],
];

const DEFAULT_DEBTS: Array<[string, "card" | "bnpl" | "loan" | "other"]> = [
  ["Credit Card A", "card"],
  ["Credit Card B", "card"],
  ["Cash App", "other"],
  ["Afterpay", "bnpl"],
];

/** Runs once on boot. Only fills empty tables, never overwrites your edits. */
export async function seedIfEmpty() {
  const existingBills = await db.select({ id: bills.id }).from(bills).limit(1);
  if (existingBills.length === 0) {
    await db.insert(bills).values(
      DEFAULT_BILLS.map(([name, amount], i) => ({
        name,
        expectedAmount: amount.toFixed(2),
        sortOrder: i,
      })),
    );
    console.log("Seeded bill template with %d bills", DEFAULT_BILLS.length);
  }

  const existingDebts = await db
    .select({ id: debtAccounts.id })
    .from(debtAccounts)
    .limit(1);
  if (existingDebts.length === 0) {
    await db.insert(debtAccounts).values(
      DEFAULT_DEBTS.map(([name, kind], i) => ({ name, kind, sortOrder: i })),
    );
    console.log("Seeded %d debt accounts", DEFAULT_DEBTS.length);
  }
}
