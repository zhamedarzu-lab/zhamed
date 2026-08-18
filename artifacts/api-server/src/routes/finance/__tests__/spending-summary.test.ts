/**
 * The spending summary's today / this week / this month windows.
 *
 * These used to be computed from the server's clock, so on a UTC host
 * "today's spending" rolled over at UTC midnight rather than the reader's.
 * The client now sends the instants its own day, week and month began at;
 * the server-side arithmetic survives only as the no-params fallback.
 *
 * Each test manages its own data: inserts before the case, deletes after.
 * Tests run serially (singleFork) so there is no cross-test DB contention.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { cashAccountsTable, cashSpendingLogTable } from "@workspace/db";
import app from "../../../app.js";

let accountId: number;

beforeEach(async () => {
  const [row] = await db
    .insert(cashAccountsTable)
    .values({ name: "Summary Window" })
    .returning();
  accountId = row!.id;
});

afterEach(async () => {
  await db.delete(cashSpendingLogTable).where(eq(cashSpendingLogTable.cashAccountId, accountId));
  await db.delete(cashAccountsTable).where(eq(cashAccountsTable.id, accountId));
});

/** A spend (negative) at a given instant. */
async function spend(amount: number, loggedAt: string, category = "Food") {
  await db.insert(cashSpendingLogTable).values({
    cashAccountId: accountId,
    amount: (-Math.abs(amount)).toFixed(2),
    description: "test",
    category,
    loggedAt: new Date(loggedAt),
  });
}

type Summary = {
  todaySpent: number;
  weekSpent: number;
  monthSpent: number;
  todayByCategory: Array<{ category: string; total: number }>;
};

const fetchSummary = async (query = ""): Promise<Summary> => {
  const res = await request(app).get(
    `/api/finance/cash-spending/summary?accountId=${accountId}${query}`,
  );
  expect(res.status).toBe(200);
  return res.body as Summary;
};

describe("GET /api/finance/cash-spending/summary — client-supplied windows", () => {
  it("counts a purchase made after the client's midnight as today", async () => {
    // 03:00Z on the 10th. For a reader at UTC-5 that is 22:00 on the 9th —
    // yesterday — so it must NOT be in today's total when the client says its
    // day began at 05:00Z on the 10th.
    await spend(25, "2099-03-10T03:00:00Z");

    const inWindow = await fetchSummary(
      "&dayStart=2099-03-09T05:00:00Z&weekStart=2099-03-09T05:00:00Z&monthStart=2099-03-01T05:00:00Z",
    );
    expect(inWindow.todaySpent).toBe(25);

    const outOfWindow = await fetchSummary(
      "&dayStart=2099-03-10T05:00:00Z&weekStart=2099-03-09T05:00:00Z&monthStart=2099-03-01T05:00:00Z",
    );
    expect(outOfWindow.todaySpent).toBe(0);
    // Still inside the week and the month, which start earlier.
    expect(outOfWindow.weekSpent).toBe(25);
    expect(outOfWindow.monthSpent).toBe(25);
  });

  it("keeps the three windows independent", async () => {
    await spend(10, "2099-04-20T12:00:00Z"); // today
    await spend(20, "2099-04-18T12:00:00Z"); // this week, not today
    await spend(40, "2099-04-02T12:00:00Z"); // this month, not this week

    const s = await fetchSummary(
      "&dayStart=2099-04-20T00:00:00Z&weekStart=2099-04-17T00:00:00Z&monthStart=2099-04-01T00:00:00Z",
    );
    expect(s.todaySpent).toBe(10);
    expect(s.weekSpent).toBe(30);
    expect(s.monthSpent).toBe(70);
  });

  it("bounds the query by the earliest window even when the week precedes the month", async () => {
    // A week that starts in the previous month is the case that would be
    // dropped if the query were bounded by the month alone.
    await spend(15, "2099-06-29T12:00:00Z"); // in the week, before the 1st

    const s = await fetchSummary(
      "&dayStart=2099-07-02T00:00:00Z&weekStart=2099-06-28T00:00:00Z&monthStart=2099-07-01T00:00:00Z",
    );
    expect(s.weekSpent).toBe(15);
    expect(s.monthSpent).toBe(0);
  });

  it("breaks categories down against the client's day, not the server's", async () => {
    await spend(7, "2099-05-05T12:00:00Z", "Coffee");

    const s = await fetchSummary(
      "&dayStart=2099-05-05T00:00:00Z&weekStart=2099-05-04T00:00:00Z&monthStart=2099-05-01T00:00:00Z",
    );
    expect(s.todayByCategory).toEqual([{ category: "Coffee", total: 7 }]);
  });

  it("ignores unparseable boundaries and falls back to the server's own", async () => {
    const res = await request(app).get(
      `/api/finance/cash-spending/summary?accountId=${accountId}&dayStart=not-a-date`,
    );
    expect(res.status).toBe(200);
    expect(typeof res.body.todaySpent).toBe("number");
  });

  it("still answers with no boundary params at all", async () => {
    const s = await fetchSummary();
    expect(typeof s.todaySpent).toBe("number");
    expect(typeof s.weekSpent).toBe("number");
    expect(typeof s.monthSpent).toBe("number");
  });

  it("counts a deposit against no window — spending stats are expenses only", async () => {
    await db.insert(cashSpendingLogTable).values({
      cashAccountId: accountId,
      amount: "500.00",
      description: "top up",
      category: "Deposit",
      loggedAt: new Date("2099-08-08T12:00:00Z"),
    });

    const s = await fetchSummary(
      "&dayStart=2099-08-08T00:00:00Z&weekStart=2099-08-03T00:00:00Z&monthStart=2099-08-01T00:00:00Z",
    );
    expect(s.todaySpent).toBe(0);
    expect(s.monthSpent).toBe(0);
  });
});
