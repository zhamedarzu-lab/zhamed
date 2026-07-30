import { db } from "@workspace/db";
import { debtAccountsTable } from "@workspace/db";

const DEFAULT_DEBTS: Array<[string, "card" | "bnpl" | "loan" | "other"]> = [
  ["Credit Card A", "card"],
  ["Credit Card B", "card"],
  ["Cash App", "other"],
  ["Afterpay", "bnpl"],
];

/**
 * Debt accounts are the only thing seeded: bills and subscriptions are
 * per-month rows that carry themselves forward from the previous month, so
 * they need no starting set.
 */
export async function seedIfEmpty(): Promise<void> {
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
