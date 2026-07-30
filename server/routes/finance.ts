import express from "express";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db.ts";
import {
  allocations,
  bills,
  debtAccounts,
  debtSnapshots,
  monthlyBillPayments,
  paychecks,
} from "../../shared/schema.ts";
import {
  accountQuery,
  billCreate,
  billPatch,
  billPaymentUpsert,
  dateRangeQuery,
  debtAccountCreate,
  debtAccountPatch,
  debtSnapshotCreate,
  isoMonth,
  monthQuery,
  paycheckInput,
} from "../../shared/validation.ts";
import {
  cents,
  intParam,
  money,
  monthBounds,
  notFound,
  num,
  parse,
  route,
} from "../util.ts";

const router = express.Router();

/* ================================================================== */
/* paychecks                                                          */
/* ================================================================== */

type AllocationOut = {
  id: number;
  category: string;
  amount: number;
  notes: string | null;
  tags: string[];
  debtAccountId: number | null;
  billId: number | null;
};

function totalsFor(amount: number, rows: AllocationOut[]) {
  const by = (category: string) =>
    cents(rows.filter((r) => r.category === category).reduce((s, r) => s + r.amount, 0));
  const allocated = cents(rows.reduce((s, r) => s + r.amount, 0));
  return {
    bills: by("bills"),
    debt: by("debt"),
    creditDump: by("credit_dump"),
    surplus: by("surplus"),
    allocated,
    unallocated: cents(amount - allocated),
  };
}

/** Loads paychecks plus their allocations, newest first. */
async function loadPaychecks(where?: ReturnType<typeof and>) {
  const rows = await db
    .select()
    .from(paychecks)
    .where(where)
    .orderBy(desc(paychecks.payDate), desc(paychecks.id));

  if (rows.length === 0) return [];

  const allocRows = await db
    .select()
    .from(allocations)
    .where(
      inArray(
        allocations.paycheckId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(allocations.id));

  const grouped = new Map<number, AllocationOut[]>();
  for (const a of allocRows) {
    const list = grouped.get(a.paycheckId) ?? [];
    list.push({
      id: a.id,
      category: a.category,
      amount: num(a.amount),
      notes: a.notes,
      tags: a.tags ?? [],
      debtAccountId: a.debtAccountId,
      billId: a.billId,
    });
    grouped.set(a.paycheckId, list);
  }

  return rows.map((p) => {
    const rowAllocations = grouped.get(p.id) ?? [];
    const amount = num(p.amount);
    return {
      id: p.id,
      payDate: p.payDate,
      amount,
      label: p.label,
      allocations: rowAllocations,
      totals: totalsFor(amount, rowAllocations),
    };
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Writes the allocation rows for a paycheck, replacing whatever was there. */
async function replaceAllocations(
  tx: Tx,
  paycheckId: number,
  rows: ReturnType<typeof paycheckInput.parse>["allocations"],
) {
  await tx.delete(allocations).where(eq(allocations.paycheckId, paycheckId));
  if (rows.length === 0) return;
  await tx.insert(allocations).values(
    rows.map((a) => ({
      paycheckId,
      category: a.category,
      debtAccountId: a.category === "debt" || a.category === "credit_dump" ? a.debtAccountId : null,
      billId: a.category === "bills" ? a.billId : null,
      amount: money(a.amount),
      notes: a.notes,
      tags: a.tags,
    })),
  );
}

router.get(
  "/paychecks",
  route(async (req, res) => {
    const { from, to } = parse(dateRangeQuery, req.query);

    const filters = [
      from ? gte(paychecks.payDate, from) : undefined,
      to ? lte(paychecks.payDate, to) : undefined,
    ].filter(Boolean);

    res.json(await loadPaychecks(filters.length ? and(...filters) : undefined));
  }),
);

/* Registered before /paychecks/:id so "last" isn't read as an id. */
router.get(
  "/paychecks/last",
  route(async (_req, res) => {
    const [latest] = await loadPaychecks();
    res.json(latest ?? null);
  }),
);

router.get(
  "/paychecks/:id",
  route(async (req, res) => {
    const id = intParam(req.params.id);
    const [row] = await loadPaychecks(and(eq(paychecks.id, id)));
    if (!row) throw notFound("That paycheck");
    res.json(row);
  }),
);

router.post(
  "/paychecks",
  route(async (req, res) => {
    const input = parse(paycheckInput, req.body);

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(paychecks)
        .values({
          payDate: input.payDate,
          amount: money(input.amount),
          label: input.label,
        })
        .returning();
      await replaceAllocations(tx,row.id, input.allocations);
      return row;
    });

    const [row] = await loadPaychecks(and(eq(paychecks.id, created.id)));
    res.status(201).json(row);
  }),
);

router.patch(
  "/paychecks/:id",
  route(async (req, res) => {
    const id = intParam(req.params.id);
    const input = parse(paycheckInput, req.body);

    await db.transaction(async (tx) => {
      const [row] = await tx
        .update(paychecks)
        .set({ payDate: input.payDate, amount: money(input.amount), label: input.label })
        .where(eq(paychecks.id, id))
        .returning();
      if (!row) throw notFound("That paycheck");
      await replaceAllocations(tx,id, input.allocations);
    });

    const [row] = await loadPaychecks(and(eq(paychecks.id, id)));
    res.json(row);
  }),
);

router.delete(
  "/paychecks/:id",
  route(async (req, res) => {
    const id = intParam(req.params.id);
    const [row] = await db.delete(paychecks).where(eq(paychecks.id, id)).returning();
    if (!row) throw notFound("That paycheck");
    res.status(204).end();
  }),
);

/** Distinct months that have at least one paycheck, newest first. */
router.get(
  "/months",
  route(async (_req, res) => {
    const rows = await db
      .select({ payDate: paychecks.payDate })
      .from(paychecks)
      .orderBy(desc(paychecks.payDate));
    res.json([...new Set(rows.map((r) => r.payDate.slice(0, 7)))]);
  }),
);

/* ================================================================== */
/* bills                                                              */
/* ================================================================== */

const billOut = (b: typeof bills.$inferSelect) => ({
  id: b.id,
  name: b.name,
  expectedAmount: num(b.expectedAmount),
  active: b.active,
  sortOrder: b.sortOrder,
});

router.get(
  "/bills",
  route(async (_req, res) => {
    const rows = await db
      .select()
      .from(bills)
      .orderBy(asc(bills.sortOrder), asc(bills.id));
    res.json(rows.map(billOut));
  }),
);

router.post(
  "/bills",
  route(async (req, res) => {
    const input = parse(billCreate, req.body);
    const [row] = await db
      .insert(bills)
      .values({ ...input, expectedAmount: money(input.expectedAmount) })
      .returning();
    res.status(201).json(billOut(row));
  }),
);

router.patch(
  "/bills/:id",
  route(async (req, res) => {
    const id = intParam(req.params.id);
    const { expectedAmount, ...rest } = parse(billPatch, req.body);
    const [row] = await db
      .update(bills)
      .set({
        ...rest,
        ...(expectedAmount === undefined ? {} : { expectedAmount: money(expectedAmount) }),
      })
      .where(eq(bills.id, id))
      .returning();
    if (!row) throw notFound("That bill");
    res.json(billOut(row));
  }),
);

router.delete(
  "/bills/:id",
  route(async (req, res) => {
    const id = intParam(req.params.id);
    const [row] = await db.delete(bills).where(eq(bills.id, id)).returning();
    if (!row) throw notFound("That bill");
    res.status(204).end();
  }),
);

/* ---- monthly bill log -------------------------------------------- */

router.get(
  "/bill-payments",
  route(async (req, res) => {
    const { month } = parse(monthQuery, req.query);
    const rows = await db
      .select()
      .from(monthlyBillPayments)
      .where(month ? eq(monthlyBillPayments.month, month) : undefined)
      .orderBy(asc(monthlyBillPayments.billId));

    res.json(
      rows.map((p) => ({
        id: p.id,
        billId: p.billId,
        month: p.month,
        amountPaid: num(p.amountPaid),
      })),
    );
  }),
);

/** Upsert: one row per bill per month, so re-typing a figure overwrites it. */
router.put(
  "/bill-payments",
  route(async (req, res) => {
    const input = parse(billPaymentUpsert, req.body);
    const [row] = await db
      .insert(monthlyBillPayments)
      .values({
        billId: input.billId,
        month: input.month,
        amountPaid: money(input.amountPaid),
      })
      .onConflictDoUpdate({
        target: [monthlyBillPayments.billId, monthlyBillPayments.month],
        set: { amountPaid: money(input.amountPaid) },
      })
      .returning();

    res.json({
      id: row.id,
      billId: row.billId,
      month: row.month,
      amountPaid: num(row.amountPaid),
    });
  }),
);

/* ================================================================== */
/* debt                                                               */
/* ================================================================== */

/** Latest snapshot per account, for the "as of" figures on the cards. */
async function latestBalances() {
  const rows = await db
    .select()
    .from(debtSnapshots)
    .orderBy(asc(debtSnapshots.snapshotDate), asc(debtSnapshots.id));

  const latest = new Map<number, { balance: number; date: string }>();
  for (const s of rows) {
    latest.set(s.debtAccountId, { balance: num(s.balance), date: s.snapshotDate });
  }
  return latest;
}

router.get(
  "/debt-accounts",
  route(async (_req, res) => {
    const [rows, latest] = await Promise.all([
      db.select().from(debtAccounts).orderBy(asc(debtAccounts.sortOrder), asc(debtAccounts.id)),
      latestBalances(),
    ]);

    res.json(
      rows.map((a) => {
        const snapshot = latest.get(a.id);
        return {
          id: a.id,
          name: a.name,
          kind: a.kind,
          active: a.active,
          sortOrder: a.sortOrder,
          currentBalance: snapshot ? snapshot.balance : null,
          lastUpdated: snapshot ? snapshot.date : null,
        };
      }),
    );
  }),
);

router.post(
  "/debt-accounts",
  route(async (req, res) => {
    const input = parse(debtAccountCreate, req.body);
    const [row] = await db.insert(debtAccounts).values(input).returning();
    res.status(201).json({ ...row, currentBalance: null, lastUpdated: null });
  }),
);

router.patch(
  "/debt-accounts/:id",
  route(async (req, res) => {
    const id = intParam(req.params.id);
    const input = parse(debtAccountPatch, req.body);
    const [row] = await db
      .update(debtAccounts)
      .set(input)
      .where(eq(debtAccounts.id, id))
      .returning();
    if (!row) throw notFound("That account");
    res.json(row);
  }),
);

router.delete(
  "/debt-accounts/:id",
  route(async (req, res) => {
    const id = intParam(req.params.id);
    const [row] = await db.delete(debtAccounts).where(eq(debtAccounts.id, id)).returning();
    if (!row) throw notFound("That account");
    res.status(204).end();
  }),
);

/* ---- snapshots and trends ---------------------------------------- */

router.get(
  "/debt-snapshots",
  route(async (req, res) => {
    const { accountId } = parse(accountQuery, req.query);
    const rows = await db
      .select()
      .from(debtSnapshots)
      .where(accountId ? eq(debtSnapshots.debtAccountId, accountId) : undefined)
      .orderBy(asc(debtSnapshots.snapshotDate), asc(debtSnapshots.id));

    res.json(
      rows.map((s) => ({
        id: s.id,
        debtAccountId: s.debtAccountId,
        paycheckId: s.paycheckId,
        snapshotDate: s.snapshotDate,
        balance: num(s.balance),
        amountPaid: num(s.amountPaid),
      })),
    );
  }),
);

router.post(
  "/debt-snapshots",
  route(async (req, res) => {
    const input = parse(debtSnapshotCreate, req.body);
    const [row] = await db
      .insert(debtSnapshots)
      .values({
        debtAccountId: input.debtAccountId,
        paycheckId: input.paycheckId,
        snapshotDate: input.snapshotDate,
        balance: money(input.balance),
        amountPaid: money(input.amountPaid),
      })
      .returning();

    res.status(201).json({
      ...row,
      balance: num(row.balance),
      amountPaid: num(row.amountPaid),
    });
  }),
);

/**
 * Total owed over time. Each snapshot date carries the sum of every account's
 * most recently known balance, so the line reflects what was owed in total on
 * that day — not just the accounts that happened to be logged.
 */
router.get(
  "/debt/trend",
  route(async (_req, res) => {
    const rows = await db
      .select()
      .from(debtSnapshots)
      .orderBy(asc(debtSnapshots.snapshotDate), asc(debtSnapshots.id));

    const running = new Map<number, number>();
    const points: Array<{ date: string; total: number }> = [];

    for (const s of rows) {
      running.set(s.debtAccountId, num(s.balance));
      const total = cents([...running.values()].reduce((a, b) => a + b, 0));
      const last = points[points.length - 1];
      if (last && last.date === s.snapshotDate) last.total = total;
      else points.push({ date: s.snapshotDate, total });
    }

    res.json(points);
  }),
);

/* ================================================================== */
/* monthly roll-up                                                    */
/* ================================================================== */

router.get(
  "/summary/:month",
  route(async (req, res) => {
    const month = parse(isoMonth, req.params.month);
    const { start, end } = monthBounds(month);

    const [monthPaychecks, payments, template] = await Promise.all([
      loadPaychecks(and(gte(paychecks.payDate, start), lte(paychecks.payDate, end))),
      db
        .select({ amountPaid: monthlyBillPayments.amountPaid })
        .from(monthlyBillPayments)
        .where(eq(monthlyBillPayments.month, month)),
      db.select({ expectedAmount: bills.expectedAmount }).from(bills).where(eq(bills.active, true)),
    ]);

    const sum = (pick: (p: (typeof monthPaychecks)[number]) => number) =>
      cents(monthPaychecks.reduce((s, p) => s + pick(p), 0));

    const income = sum((p) => p.amount);
    const setAsideForBills = sum((p) => p.totals.bills);
    const towardDebt = sum((p) => p.totals.debt);
    const creditDump = sum((p) => p.totals.creditDump);
    const surplus = sum((p) => p.totals.surplus);
    const actuallyPaid = cents(payments.reduce((s, p) => s + num(p.amountPaid), 0));
    const templateTotal = cents(template.reduce((s, b) => s + num(b.expectedAmount), 0));

    res.json({
      month,
      income,
      setAsideForBills,
      actuallyPaid,
      /* Positive means you set aside more than you paid out. */
      billsDelta: cents(setAsideForBills - actuallyPaid),
      templateTotal,
      towardDebt,
      creditDump,
      surplus,
      totalToDebt: cents(towardDebt + creditDump),
      paychecks: monthPaychecks.map((p) => ({
        id: p.id,
        payDate: p.payDate,
        amount: p.amount,
        label: p.label,
        totals: p.totals,
      })),
    });
  }),
);

export default router;
