/**
 * Integration tests for debt-snapshot endpoints.
 *
 * Each test manages its own data: inserts before the case, deletes after.
 * Tests run serially (singleFork) so there is no cross-test DB contention.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  allocationsTable,
  debtAccountsTable,
  debtSnapshotsTable,
  paychecksTable,
} from "@workspace/db";
import app from "../../../app.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

async function makeDebtAccount(name = "Test Card") {
  const [row] = await db
    .insert(debtAccountsTable)
    .values({ name, kind: "card" })
    .returning();
  return row!;
}

async function makePaycheck(month = "2099-01", seq = 1) {
  const [row] = await db
    .insert(paychecksTable)
    .values({ month, seq, amount: "1000.00" })
    .returning();
  return row!;
}

async function makeSnapshot(
  debtAccountId: number,
  opts: { balance?: number; snapshotDate?: string; paycheckId?: number | null } = {},
) {
  const [row] = await db
    .insert(debtSnapshotsTable)
    .values({
      debtAccountId,
      snapshotDate: opts.snapshotDate ?? "2099-01-15",
      balance: String((opts.balance ?? 500).toFixed(2)),
      amountPaid: "0.00",
      paycheckId: opts.paycheckId ?? null,
    })
    .returning();
  return row!;
}

async function makeAllocation(paycheckId: number, debtAccountId: number, amount = 100) {
  const [row] = await db
    .insert(allocationsTable)
    .values({ paycheckId, amount: String(amount.toFixed(2)), note: "test payment", debtAccountId })
    .returning();
  return row!;
}

// ─── state shared inside each test ────────────────────────────────────────────

let cardId: number;
let paycheckId: number;

beforeEach(async () => {
  const card = await makeDebtAccount();
  cardId = card.id;
  const paycheck = await makePaycheck();
  paycheckId = paycheck.id;
});

afterEach(async () => {
  // Clean up in dependency order (children first)
  await db.delete(allocationsTable).where(eq(allocationsTable.paycheckId, paycheckId));
  await db.delete(debtSnapshotsTable).where(eq(debtSnapshotsTable.debtAccountId, cardId));
  await db.delete(debtAccountsTable).where(eq(debtAccountsTable.id, cardId));
  await db.delete(paychecksTable).where(eq(paychecksTable.id, paycheckId));
});

// ─── POST /api/finance/debt-snapshots ─────────────────────────────────────────

describe("POST /api/finance/debt-snapshots", () => {
  it("creates a snapshot without paycheckId (existing behaviour)", async () => {
    const res = await request(app)
      .post("/api/finance/debt-snapshots")
      .send({ debtAccountId: cardId, snapshotDate: "2099-01-10", balance: 450 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      debtAccountId: cardId,
      snapshotDate: "2099-01-10",
      balance: 450,
      amountPaid: 0,
      paycheckId: null,
    });
    expect(typeof res.body.id).toBe("number");
  });

  it("creates a snapshot tagged to a valid paycheckId", async () => {
    const res = await request(app)
      .post("/api/finance/debt-snapshots")
      .send({
        debtAccountId: cardId,
        snapshotDate: "2099-01-10",
        balance: 300,
        paycheckId,
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      debtAccountId: cardId,
      balance: 300,
      paycheckId,
    });
  });

  it("returns 404 when paycheckId does not exist", async () => {
    const res = await request(app)
      .post("/api/finance/debt-snapshots")
      .send({
        debtAccountId: cardId,
        snapshotDate: "2099-01-10",
        balance: 300,
        paycheckId: 9_999_999,
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/paycheck not found/i);
  });

  it("returns 404 when debtAccountId does not exist", async () => {
    const res = await request(app)
      .post("/api/finance/debt-snapshots")
      .send({
        debtAccountId: 9_999_999,
        snapshotDate: "2099-01-10",
        balance: 300,
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/debt account not found/i);
  });
});

// ─── Transaction: pending allocations are marked applied ──────────────────────

describe("POST /api/finance/debt-snapshots — transaction behaviour", () => {
  it("marks previously unapplied linked allocations as applied, resetting pendingPayment to 0", async () => {
    // Two unapplied allocations for this card
    const alloc1 = await makeAllocation(paycheckId, cardId, 100);
    const alloc2 = await makeAllocation(paycheckId, cardId, 50);

    expect(alloc1.appliedSnapshotId).toBeNull();
    expect(alloc2.appliedSnapshotId).toBeNull();

    const res = await request(app)
      .post("/api/finance/debt-snapshots")
      .send({ debtAccountId: cardId, snapshotDate: "2099-01-15", balance: 250 });

    expect(res.status).toBe(201);
    const snapId = res.body.id as number;

    // Both allocations should now point to the new snapshot
    const updated = await db
      .select()
      .from(allocationsTable)
      .where(eq(allocationsTable.paycheckId, paycheckId));

    for (const a of updated) {
      expect(a.appliedSnapshotId).toBe(snapId);
    }

    // GET /debt-accounts should report pendingPayment = 0
    const accountsRes = await request(app).get("/api/finance/debt-accounts");
    expect(accountsRes.status).toBe(200);
    const account = (accountsRes.body as Array<{ id: number; pendingPayment: number }>).find(
      (a) => a.id === cardId,
    );
    expect(account?.pendingPayment).toBe(0);
  });
});

// ─── GET /api/finance/debt-snapshots ──────────────────────────────────────────

describe("GET /api/finance/debt-snapshots", () => {
  it("returns paycheckMonth and paycheckSeq on a paycheck-tagged snapshot", async () => {
    await makeSnapshot(cardId, { paycheckId });

    const res = await request(app)
      .get("/api/finance/debt-snapshots")
      .query({ accountId: cardId });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      paycheckId,
      paycheckMonth: "2099-01",
      paycheckSeq: 1,
    });
  });

  it("returns null paycheckMonth and paycheckSeq on an untagged snapshot", async () => {
    await makeSnapshot(cardId); // no paycheckId

    const res = await request(app)
      .get("/api/finance/debt-snapshots")
      .query({ accountId: cardId });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].paycheckId).toBeNull();
    expect(res.body[0].paycheckMonth).toBeNull();
    expect(res.body[0].paycheckSeq).toBeNull();
  });

  it("orders results by snapshotDate ascending", async () => {
    await makeSnapshot(cardId, { snapshotDate: "2099-03-01", balance: 300 });
    await makeSnapshot(cardId, { snapshotDate: "2099-01-01", balance: 500 });
    await makeSnapshot(cardId, { snapshotDate: "2099-02-01", balance: 400 });

    const res = await request(app)
      .get("/api/finance/debt-snapshots")
      .query({ accountId: cardId });

    expect(res.status).toBe(200);
    const dates = (res.body as Array<{ snapshotDate: string }>).map((s) => s.snapshotDate);
    expect(dates).toEqual(["2099-01-01", "2099-02-01", "2099-03-01"]);
  });
});

// ─── GET /api/finance/debt-snapshots — date range filtering ───────────────────

describe("GET /api/finance/debt-snapshots — date range", () => {
  it("filters by ?from= to exclude older snapshots", async () => {
    await makeSnapshot(cardId, { snapshotDate: "2099-01-01", balance: 500 });
    await makeSnapshot(cardId, { snapshotDate: "2099-02-01", balance: 400 });
    await makeSnapshot(cardId, { snapshotDate: "2099-03-01", balance: 300 });

    const res = await request(app)
      .get("/api/finance/debt-snapshots")
      .query({ accountId: cardId, from: "2099-02-01" });

    expect(res.status).toBe(200);
    const dates = (res.body as Array<{ snapshotDate: string }>).map((s) => s.snapshotDate);
    expect(dates).toEqual(["2099-02-01", "2099-03-01"]);
  });

  it("filters by ?to= to exclude newer snapshots", async () => {
    await makeSnapshot(cardId, { snapshotDate: "2099-01-01", balance: 500 });
    await makeSnapshot(cardId, { snapshotDate: "2099-02-01", balance: 400 });
    await makeSnapshot(cardId, { snapshotDate: "2099-03-01", balance: 300 });

    const res = await request(app)
      .get("/api/finance/debt-snapshots")
      .query({ accountId: cardId, to: "2099-02-01" });

    expect(res.status).toBe(200);
    const dates = (res.body as Array<{ snapshotDate: string }>).map((s) => s.snapshotDate);
    expect(dates).toEqual(["2099-01-01", "2099-02-01"]);
  });

  it("filters by ?from= and ?to= together to return a bounded window", async () => {
    await makeSnapshot(cardId, { snapshotDate: "2099-01-01", balance: 500 });
    await makeSnapshot(cardId, { snapshotDate: "2099-02-01", balance: 400 });
    await makeSnapshot(cardId, { snapshotDate: "2099-03-01", balance: 300 });
    await makeSnapshot(cardId, { snapshotDate: "2099-04-01", balance: 200 });

    const res = await request(app)
      .get("/api/finance/debt-snapshots")
      .query({ accountId: cardId, from: "2099-02-01", to: "2099-03-01" });

    expect(res.status).toBe(200);
    const dates = (res.body as Array<{ snapshotDate: string }>).map((s) => s.snapshotDate);
    expect(dates).toEqual(["2099-02-01", "2099-03-01"]);
  });

  it("ignores an invalid ?from= value and returns all snapshots", async () => {
    await makeSnapshot(cardId, { snapshotDate: "2099-01-01", balance: 500 });
    await makeSnapshot(cardId, { snapshotDate: "2099-02-01", balance: 400 });

    const res = await request(app)
      .get("/api/finance/debt-snapshots")
      .query({ accountId: cardId, from: "not-a-date" });

    expect(res.status).toBe(200);
    expect((res.body as unknown[]).length).toBe(2);
  });
});

// ─── FK regression: deleting a paycheck nulls out paycheck_id ─────────────────

describe("FK ON DELETE SET NULL regression", () => {
  it("deleting a paycheck nulls snapshot.paycheckId but keeps the snapshot", async () => {
    const snap = await makeSnapshot(cardId, { paycheckId });

    // Verify the link is set
    expect(snap.paycheckId).toBe(paycheckId);

    // Delete the paycheck
    await db.delete(paychecksTable).where(eq(paychecksTable.id, paycheckId));

    // The snapshot must still exist, with paycheckId set to null
    const [reloaded] = await db
      .select()
      .from(debtSnapshotsTable)
      .where(eq(debtSnapshotsTable.id, snap.id));

    expect(reloaded).toBeDefined();
    expect(reloaded!.paycheckId).toBeNull();

    // Nullify paycheckId in local state so afterEach cleanup still works
    // (afterEach deletes by cardId, not paycheckId, so the snapshot row is covered;
    // we only need to skip trying to delete the already-deleted paycheck)
    paycheckId = -1; // sentinel — afterEach WHERE will match nothing, that's fine
  });
});
