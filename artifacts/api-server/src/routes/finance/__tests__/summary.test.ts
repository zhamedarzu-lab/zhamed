/**
 * Integration tests for GET /api/finance/summary/:month
 *
 * Each test manages its own data: inserts before the case, deletes after.
 * Tests run serially (singleFork) so there is no cross-test DB contention.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  allocationsTable,
  extraIncomeTable,
  monthlyBillItemsTable,
  paychecksTable,
} from "@workspace/db";
import app from "../../../app.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

const TEST_MONTH = "2099-06";

async function makePaycheck(amount = 1000, seq = 1) {
  const [row] = await db
    .insert(paychecksTable)
    .values({ month: TEST_MONTH, seq, amount: String(amount.toFixed(2)) })
    .returning();
  return row!;
}

async function makeAllocation(paycheckId: number, amount: number, note = "test") {
  const [row] = await db
    .insert(allocationsTable)
    .values({ paycheckId, amount: String(amount.toFixed(2)), note })
    .returning();
  return row!;
}

async function makeExtraIncome(paycheckId: number, amount: number, note = "bonus") {
  const [row] = await db
    .insert(extraIncomeTable)
    .values({ paycheckId, amount: String(amount.toFixed(2)), note })
    .returning();
  return row!;
}

async function makeBillItem(name: string, amount: number) {
  const [row] = await db
    .insert(monthlyBillItemsTable)
    .values({ month: TEST_MONTH, name, amount: String(amount.toFixed(2)) })
    .returning();
  return row!;
}

// ─── per-test state ───────────────────────────────────────────────────────────

let paycheckIds: number[] = [];
let billItemIds: number[] = [];

beforeEach(() => {
  paycheckIds = [];
  billItemIds = [];
});

afterEach(async () => {
  // Clean up in dependency order (children first)
  if (paycheckIds.length > 0) {
    await db
      .delete(allocationsTable)
      .where(inArray(allocationsTable.paycheckId, paycheckIds));
    await db
      .delete(extraIncomeTable)
      .where(inArray(extraIncomeTable.paycheckId, paycheckIds));
    for (const id of paycheckIds) {
      await db.delete(paychecksTable).where(eq(paychecksTable.id, id));
    }
  }
  for (const id of billItemIds) {
    await db.delete(monthlyBillItemsTable).where(eq(monthlyBillItemsTable.id, id));
  }
});

// ─── GET /api/finance/summary/:month ─────────────────────────────────────────

describe("GET /api/finance/summary/:month — empty month", () => {
  it("returns zero values when there is no data for the month", async () => {
    const res = await request(app).get(`/api/finance/summary/${TEST_MONTH}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      income: 0,
      extraIncome: 0,
      allocated: 0,
      unallocated: 0,
      actuallyPaid: 0,
      byNote: [],
    });
  });
});

describe("GET /api/finance/summary/:month — remaining balance after allocations", () => {
  it("unallocated equals income minus total allocations", async () => {
    const pc = await makePaycheck(2000);
    paycheckIds.push(pc.id);
    await makeAllocation(pc.id, 400, "rent");
    await makeAllocation(pc.id, 150, "groceries");

    const res = await request(app).get(`/api/finance/summary/${TEST_MONTH}`);

    expect(res.status).toBe(200);
    expect(res.body.income).toBe(2000);
    expect(res.body.allocated).toBe(550);
    expect(res.body.unallocated).toBe(1450);
  });

  it("unallocated is zero when allocations exactly match income", async () => {
    const pc = await makePaycheck(500);
    paycheckIds.push(pc.id);
    await makeAllocation(pc.id, 300, "bills");
    await makeAllocation(pc.id, 200, "food");

    const res = await request(app).get(`/api/finance/summary/${TEST_MONTH}`);

    expect(res.status).toBe(200);
    expect(res.body.unallocated).toBe(0);
  });
});

describe("GET /api/finance/summary/:month — extra income adds to pool", () => {
  it("income includes extra income, and unallocated reflects the full pool", async () => {
    const pc = await makePaycheck(1000);
    paycheckIds.push(pc.id);
    await makeExtraIncome(pc.id, 250);
    await makeAllocation(pc.id, 300, "rent");

    const res = await request(app).get(`/api/finance/summary/${TEST_MONTH}`);

    expect(res.status).toBe(200);
    expect(res.body.income).toBe(1250);       // 1000 base + 250 extra
    expect(res.body.extraIncome).toBe(250);
    expect(res.body.allocated).toBe(300);
    expect(res.body.unallocated).toBe(950);   // 1250 - 300
  });

  it("multiple extra income items are summed", async () => {
    const pc = await makePaycheck(1000);
    paycheckIds.push(pc.id);
    await makeExtraIncome(pc.id, 100, "refund");
    await makeExtraIncome(pc.id, 75, "gift");

    const res = await request(app).get(`/api/finance/summary/${TEST_MONTH}`);

    expect(res.status).toBe(200);
    expect(res.body.extraIncome).toBe(175);
    expect(res.body.income).toBe(1175);
  });
});

describe("GET /api/finance/summary/:month — monthly bill total", () => {
  it("actuallyPaid reflects the sum of monthly bill items", async () => {
    const b1 = await makeBillItem("Electric", 120);
    const b2 = await makeBillItem("Internet", 55);
    billItemIds.push(b1.id, b2.id);

    const res = await request(app).get(`/api/finance/summary/${TEST_MONTH}`);

    expect(res.status).toBe(200);
    expect(res.body.actuallyPaid).toBe(175);
  });

  it("actuallyPaid is zero when no bill items exist for the month", async () => {
    const pc = await makePaycheck(800);
    paycheckIds.push(pc.id);

    const res = await request(app).get(`/api/finance/summary/${TEST_MONTH}`);

    expect(res.status).toBe(200);
    expect(res.body.actuallyPaid).toBe(0);
  });
});

describe("GET /api/finance/summary/:month — byNote breakdown", () => {
  it("groups allocations by note and totals each group", async () => {
    const pc = await makePaycheck(2000);
    paycheckIds.push(pc.id);
    await makeAllocation(pc.id, 400, "rent");
    await makeAllocation(pc.id, 100, "groceries");
    await makeAllocation(pc.id, 50, "groceries"); // same note → merged

    const res = await request(app).get(`/api/finance/summary/${TEST_MONTH}`);

    expect(res.status).toBe(200);
    const byNote: Array<{ note: string; amount: number }> = res.body.byNote;
    const rent = byNote.find((n) => n.note === "rent");
    const groceries = byNote.find((n) => n.note === "groceries");
    expect(rent?.amount).toBe(400);
    expect(groceries?.amount).toBe(150);
  });

  it("allocations with empty note appear under Untitled", async () => {
    const pc = await makePaycheck(500);
    paycheckIds.push(pc.id);
    await makeAllocation(pc.id, 200, "");

    const res = await request(app).get(`/api/finance/summary/${TEST_MONTH}`);

    expect(res.status).toBe(200);
    const untitled = (res.body.byNote as Array<{ note: string; amount: number }>).find(
      (n) => n.note === "Untitled",
    );
    expect(untitled?.amount).toBe(200);
  });
});

describe("GET /api/finance/summary/:month — multi-paycheck month", () => {
  it("sums income and allocations across both paychecks", async () => {
    const pc1 = await makePaycheck(1500, 1);
    const pc2 = await makePaycheck(1500, 2);
    paycheckIds.push(pc1.id, pc2.id);
    await makeAllocation(pc1.id, 600, "rent");
    await makeAllocation(pc2.id, 400, "car");

    const res = await request(app).get(`/api/finance/summary/${TEST_MONTH}`);

    expect(res.status).toBe(200);
    expect(res.body.income).toBe(3000);
    expect(res.body.allocated).toBe(1000);
    expect(res.body.unallocated).toBe(2000);
  });
});

describe("GET /api/finance/summary/:month — validation", () => {
  it("returns 400 for an invalid month format", async () => {
    const res = await request(app).get("/api/finance/summary/not-a-month");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid month/i);
  });
});
