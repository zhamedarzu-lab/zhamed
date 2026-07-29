import { db } from "@workspace/db";
import { billsTable, debtAccountsTable } from "@workspace/db";

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

export async function seedIfEmpty(): Promise<void> {
  const existingBills = await db
    .select({ id: billsTable.id })
    .from(billsTable)
    .limit(1);

  if (existingBills.length === 0) {
    await db.insert(billsTable).values(
      DEFAULT_BILLS.map(([name, amount], i) => ({
        name,
        expectedAmount: amount.toFixed(2),
        sortOrder: i,
      })),
    );
  }

  const existingDebts = await db
    .select({ id: debtAccountsTable.id })
    .from(debtAccountsTable)
    .limit(1);

  if (existingDebts.length === 0) {
    await db.insert(debtAccountsTable).values(
      DEFAULT_DEBTS.map(([name, kind], i) => ({ name, kind, sortOrder: i })),
    );
  }
}
