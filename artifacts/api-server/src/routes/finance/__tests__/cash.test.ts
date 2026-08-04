/**
 * Integration tests for cash-account and cash-snapshot endpoints.
 *
 * Cash was the one snapshot resource with no coverage: debt snapshots and the
 * monthly summary both had suites, cash had none, so the date-range filtering
 * added to keep its history bounded had nothing guarding it.
 *
 * Each test manages its own data: inserts before the case, deletes after.
 * Tests run serially (singleFork) so there is no cross-test DB contention.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { cashAccountsTable, cashSnapshotsTable, cashSpendingLogTable, paychecksTable } from "@workspace/db";
import app from "../../../app.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

async function makeCashAccount(name = "Test Cash") {
  const [row] = await db.insert(cashAccountsTable).values({ name }).returning();
  return row!;
}

async function makePaycheck(month = "2099-03", seq = 1) {
  const [row] = await db
    .insert(paychecksTable)
    .values({ month, seq, amount: "1000.00" })
    .returning();
  return row!;
}

async function makeSnapshot(
  cashAccountId: number,
  opts: { balance?: number; snapshotDate?: string; paycheckId?: number | null } = {},
) {
  const [row] = await db
    .insert(cashSnapshotsTable)
    .values({
      cashAccountId,
      snapshotDate: opts.snapshotDate ?? "2099-03-15",
      balance: String((opts.balance ?? 250).toFixed(2)),
      paycheckId: opts.paycheckId ?? null,
    })
    .returning();
  return row!;
}

// ─── state shared inside each test ────────────────────────────────────────────

let accountId: number;
let paycheckId: number;

beforeEach(async () => {
  const account = await makeCashAccount();
  accountId = account.id;
  const paycheck = await makePaycheck();
  paycheckId = paycheck.id;
});

afterEach(async () => {
  // Children first — spending log + snapshots reference the account.
  await db.delete(cashSpendingLogTable).where(eq(cashSpendingLogTable.cashAccountId, accountId));
  await db.delete(cashSnapshotsTable).where(eq(cashSnapshotsTable.cashAccountId, accountId));
  await db.delete(cashAccountsTable).where(eq(cashAccountsTable.id, accountId));
  await db.delete(paychecksTable).where(eq(paychecksTable.id, paycheckId));
});

// ─── GET /api/finance/cash-accounts ───────────────────────────────────────────

describe("GET /api/finance/cash-accounts", () => {
  it("reports zero balance for an account with no spending log entries", async () => {
    const res = await request(app).get("/api/finance/cash-accounts");

    expect(res.status).toBe(200);
    const mine = res.body.find((a: { id: number }) => a.id === accountId);
    expect(mine).toMatchObject({ currentBalance: 0, lastUpdated: null });
  });

  it("reports the running sum of spending log entries as the current balance", async () => {
    // Deposit $500, spend $180 → net $320
    await db.insert(cashSpendingLogTable).values([
      { cashAccountId: accountId, amount: "500.00", description: "Starting balance", category: "Deposit", loggedAt: new Date("2099-03-01T10:00:00Z") },
      { cashAccountId: accountId, amount: "-180.00", description: "Groceries", category: "Card", loggedAt: new Date("2099-03-20T15:00:00Z") },
    ]);

    const res = await request(app).get("/api/finance/cash-accounts");

    const mine = res.body.find((a: { id: number }) => a.id === accountId);
    expect(mine).toMatchObject({ currentBalance: 320, lastUpdated: "2099-03-20" });
  });
});

// ─── POST /api/finance/cash-snapshots ─────────────────────────────────────────

describe("POST /api/finance/cash-snapshots", () => {
  it("creates a snapshot", async () => {
    const res = await request(app)
      .post("/api/finance/cash-snapshots")
      .send({ cashAccountId: accountId, snapshotDate: "2099-03-10", balance: 175.5 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      cashAccountId: accountId,
      snapshotDate: "2099-03-10",
      balance: 175.5,
      paycheckId: null,
    });
  });

  it("creates a snapshot tagged to a paycheck", async () => {
    const res = await request(app)
      .post("/api/finance/cash-snapshots")
      .send({ cashAccountId: accountId, snapshotDate: "2099-03-10", balance: 90, paycheckId });

    expect(res.status).toBe(201);
    expect(res.body.paycheckId).toBe(paycheckId);
  });

  it("404s for an unknown cash account", async () => {
    const res = await request(app)
      .post("/api/finance/cash-snapshots")
      .send({ cashAccountId: 99_999_999, snapshotDate: "2099-03-10", balance: 10 });

    expect(res.status).toBe(404);
  });

  it("404s for an unknown paycheckId", async () => {
    const res = await request(app)
      .post("/api/finance/cash-snapshots")
      .send({
        cashAccountId: accountId,
        snapshotDate: "2099-03-10",
        balance: 10,
        paycheckId: 99_999_999,
      });

    expect(res.status).toBe(404);
  });

  it("rejects a malformed date", async () => {
    const res = await request(app)
      .post("/api/finance/cash-snapshots")
      .send({ cashAccountId: accountId, snapshotDate: "March 10th", balance: 10 });

    expect(res.status).toBe(400);
  });

  it("rejects a negative balance", async () => {
    const res = await request(app)
      .post("/api/finance/cash-snapshots")
      .send({ cashAccountId: accountId, snapshotDate: "2099-03-10", balance: -5 });

    expect(res.status).toBe(400);
  });
});

// ─── GET /api/finance/cash-snapshots — the filtering that bounds history ──────

describe("GET /api/finance/cash-snapshots", () => {
  beforeEach(async () => {
    await makeSnapshot(accountId, { balance: 10, snapshotDate: "2099-03-01" });
    await makeSnapshot(accountId, { balance: 20, snapshotDate: "2099-03-10" });
    await makeSnapshot(accountId, { balance: 30, snapshotDate: "2099-03-20" });
  });

  const datesFor = (body: Array<{ cashAccountId: number; snapshotDate: string }>, id: number) =>
    body.filter((r) => r.cashAccountId === id).map((r) => r.snapshotDate).sort();

  it("filters to one account with accountId", async () => {
    const other = await makeCashAccount("Other Cash");
    await makeSnapshot(other.id, { snapshotDate: "2099-03-05" });

    const res = await request(app).get(`/api/finance/cash-snapshots?accountId=${accountId}`);

    expect(res.status).toBe(200);
    expect(res.body.every((r: { cashAccountId: number }) => r.cashAccountId === accountId)).toBe(true);

    await db.delete(cashSnapshotsTable).where(eq(cashSnapshotsTable.cashAccountId, other.id));
    await db.delete(cashAccountsTable).where(eq(cashAccountsTable.id, other.id));
  });

  it("honours `from` — inclusive of the boundary date", async () => {
    const res = await request(app).get(
      `/api/finance/cash-snapshots?accountId=${accountId}&from=2099-03-10`,
    );

    expect(res.status).toBe(200);
    expect(datesFor(res.body, accountId)).toEqual(["2099-03-10", "2099-03-20"]);
  });

  it("honours `to` — inclusive of the boundary date", async () => {
    const res = await request(app).get(
      `/api/finance/cash-snapshots?accountId=${accountId}&to=2099-03-10`,
    );

    expect(datesFor(res.body, accountId)).toEqual(["2099-03-01", "2099-03-10"]);
  });

  it("honours `from` and `to` together", async () => {
    const res = await request(app).get(
      `/api/finance/cash-snapshots?accountId=${accountId}&from=2099-03-05&to=2099-03-15`,
    );

    expect(datesFor(res.body, accountId)).toEqual(["2099-03-10"]);
  });

  it("returns every snapshot for the account when unfiltered", async () => {
    const res = await request(app).get(`/api/finance/cash-snapshots?accountId=${accountId}`);

    expect(datesFor(res.body, accountId)).toEqual([
      "2099-03-01",
      "2099-03-10",
      "2099-03-20",
    ]);
  });
});
