/**
 * Integration tests for the two account-list endpoints, which report a figure
 * rolled up from another table: the debt page's "current balance" (newest
 * snapshot per account) and the cash page's running balance and sparkline.
 *
 * Neither had coverage, and both were rewritten to do the rollup in SQL rather
 * than by pulling the whole history into JS — so the shape of what they return
 * is what these tests pin down.
 *
 * Each test manages its own data: inserts before the case, deletes after.
 * Tests run serially (singleFork) so there is no cross-test DB contention.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  cashAccountsTable,
  cashSpendingLogTable,
  debtAccountsTable,
  debtSnapshotsTable,
} from "@workspace/db";
import app from "../../../app.js";

// ─── GET /api/finance/debt-accounts ───────────────────────────────────────────

describe("GET /api/finance/debt-accounts — current balance", () => {
  let accountId: number;

  beforeEach(async () => {
    const [row] = await db
      .insert(debtAccountsTable)
      .values({ name: "Rollup Card", kind: "card" })
      .returning();
    accountId = row!.id;
  });

  afterEach(async () => {
    await db.delete(debtSnapshotsTable).where(eq(debtSnapshotsTable.debtAccountId, accountId));
    await db.delete(debtAccountsTable).where(eq(debtAccountsTable.id, accountId));
  });

  async function snapshot(snapshotDate: string, balance: string) {
    const [row] = await db
      .insert(debtSnapshotsTable)
      .values({ debtAccountId: accountId, snapshotDate, balance })
      .returning();
    return row!;
  }

  const find = (body: unknown[]) =>
    (body as Array<{ id: number }>).find((a) => a.id === accountId) as
      | { currentBalance: number | null; lastUpdated: string | null; pendingPayment: number }
      | undefined;

  it("reports null balance for an account with no snapshots", async () => {
    const res = await request(app).get("/api/finance/debt-accounts");
    expect(res.status).toBe(200);
    const account = find(res.body);
    expect(account?.currentBalance).toBeNull();
    expect(account?.lastUpdated).toBeNull();
  });

  it("reports the newest snapshot's balance, not the first or the largest", async () => {
    await snapshot("2099-01-10", "900.00");
    await snapshot("2099-03-01", "250.00");
    await snapshot("2099-02-15", "500.00");

    const account = find((await request(app).get("/api/finance/debt-accounts")).body);
    expect(account?.currentBalance).toBe(250);
    expect(account?.lastUpdated).toBe("2099-03-01");
  });

  it("breaks a same-day tie with the most recently inserted row", async () => {
    await snapshot("2099-04-04", "700.00");
    await snapshot("2099-04-04", "123.45");

    const account = find((await request(app).get("/api/finance/debt-accounts")).body);
    expect(account?.currentBalance).toBe(123.45);
  });

  it("keeps each account's balance to itself", async () => {
    const [other] = await db
      .insert(debtAccountsTable)
      .values({ name: "Other Rollup Card", kind: "card" })
      .returning();
    await db
      .insert(debtSnapshotsTable)
      .values({ debtAccountId: other!.id, snapshotDate: "2099-09-09", balance: "42.00" });
    await snapshot("2099-05-05", "800.00");

    const body = (await request(app).get("/api/finance/debt-accounts")).body as Array<{
      id: number;
      currentBalance: number | null;
    }>;
    expect(body.find((a) => a.id === accountId)?.currentBalance).toBe(800);
    expect(body.find((a) => a.id === other!.id)?.currentBalance).toBe(42);

    await db.delete(debtSnapshotsTable).where(eq(debtSnapshotsTable.debtAccountId, other!.id));
    await db.delete(debtAccountsTable).where(eq(debtAccountsTable.id, other!.id));
  });
});

// ─── GET /api/finance/cash-accounts ───────────────────────────────────────────

describe("GET /api/finance/cash-accounts — balance history", () => {
  let accountId: number;

  beforeEach(async () => {
    const [row] = await db
      .insert(cashAccountsTable)
      .values({ name: "Rollup Cash" })
      .returning();
    accountId = row!.id;
  });

  afterEach(async () => {
    await db.delete(cashSpendingLogTable).where(eq(cashSpendingLogTable.cashAccountId, accountId));
    await db.delete(cashAccountsTable).where(eq(cashAccountsTable.id, accountId));
  });

  async function entry(amount: string, loggedAt: string) {
    await db.insert(cashSpendingLogTable).values({
      cashAccountId: accountId,
      amount,
      description: "test",
      category: "Other",
      loggedAt: new Date(loggedAt),
    });
  }

  const find = (body: unknown[]) =>
    (body as Array<{ id: number }>).find((a) => a.id === accountId) as
      | {
          currentBalance: number;
          lastUpdated: string | null;
          balanceHistory: Array<{ date: string; value: number }>;
        }
      | undefined;

  it("reports an empty history and a zero balance with no entries", async () => {
    const account = find((await request(app).get("/api/finance/cash-accounts")).body);
    expect(account?.currentBalance).toBe(0);
    expect(account?.lastUpdated).toBeNull();
    expect(account?.balanceHistory).toEqual([]);
  });

  it("accumulates one point per calendar day, in date order", async () => {
    await entry("100.00", "2099-01-01T10:00:00Z");
    await entry("-30.00", "2099-01-01T18:00:00Z");
    await entry("-20.00", "2099-01-03T09:00:00Z");

    const account = find((await request(app).get("/api/finance/cash-accounts")).body);
    expect(account?.balanceHistory).toEqual([
      { date: "2099-01-01", value: 70 },
      { date: "2099-01-03", value: 50 },
    ]);
    expect(account?.currentBalance).toBe(50);
    expect(account?.lastUpdated).toBe("2099-01-03");
  });

  it("buckets days by UTC, so a late-evening UTC entry stays on its own day", async () => {
    await entry("10.00", "2099-02-01T23:30:00Z");
    await entry("5.00", "2099-02-02T00:30:00Z");

    const account = find((await request(app).get("/api/finance/cash-accounts")).body);
    expect(account?.balanceHistory.map((p) => p.date)).toEqual(["2099-02-01", "2099-02-02"]);
  });
});
