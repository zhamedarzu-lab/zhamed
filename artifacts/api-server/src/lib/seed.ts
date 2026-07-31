import { db } from "@workspace/db";
import { debtAccountsTable, cashAccountsTable } from "@workspace/db";

const DEFAULT_DEBTS: Array<[string, "card" | "bnpl" | "loan" | "other"]> = [
  ["Credit Card A", "card"],
  ["Credit Card B", "card"],
  ["Afterpay", "bnpl"],
];

const DEFAULT_CASH = ["Cash App"];

/**
 * Debt and cash accounts are the only things seeded: bills and subscriptions
 * are per-month rows that carry themselves forward from the previous month,
 * so they need no starting set.
 */
export async function seedIfEmpty(): Promise<void> {
  const [existingDebts, existingCash] = await Promise.all([
    db.select({ id: debtAccountsTable.id }).from(debtAccountsTable).limit(1),
    db.select({ id: cashAccountsTable.id }).from(cashAccountsTable).limit(1),
  ]);

  if (existingDebts.length === 0) {
    await db.insert(debtAccountsTable).values(
      DEFAULT_DEBTS.map(([name, kind], i) => ({ name, kind, sortOrder: i })),
    );
  }

  if (existingCash.length === 0) {
    await db.insert(cashAccountsTable).values(
      DEFAULT_CASH.map((name, i) => ({ name, sortOrder: i })),
    );
  }
}
