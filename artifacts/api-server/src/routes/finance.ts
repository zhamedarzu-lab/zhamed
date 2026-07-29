import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  paychecksTable,
  allocationsTable,
  billsTable,
  billPaymentsTable,
  debtAccountsTable,
  debtSnapshotsTable,
} from "@workspace/db";

const router: IRouter = Router();

function parseId(raw: string): number {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) throw Object.assign(new Error("Invalid id"), { status: 400 });
  return n;
}

type AllocRow = { category: string; amount: string };

function computeTotals(allocs: AllocRow[], paycheckAmount: number) {
  const sum = (cat: string) =>
    allocs.filter((a) => a.category === cat).reduce((s, a) => s + Number(a.amount), 0);
  const bills = sum("bills");
  const debt = sum("debt");
  const creditDump = sum("credit_dump");
  const surplus = sum("surplus");
  const allocated = bills + debt + creditDump + surplus;
  return {
    bills,
    debt,
    creditDump,
    surplus,
    allocated,
    unallocated: Math.round((paycheckAmount - allocated) * 100) / 100,
  };
}

// ── Paychecks ────────────────────────────────────────────────────────────────

router.get("/paychecks", async (req, res): Promise<void> => {
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;

  const paychecks = await db
    .select()
    .from(paychecksTable)
    .where(and(from ? gte(paychecksTable.payDate, from) : undefined, to ? lte(paychecksTable.payDate, to) : undefined))
    .orderBy(desc(paychecksTable.payDate));

  if (paychecks.length === 0) {
    res.json([]);
    return;
  }

  const allocs = await db
    .select()
    .from(allocationsTable)
    .where(inArray(allocationsTable.paycheckId, paychecks.map((p) => p.id)));

  res.json(
    paychecks.map((p) => {
      const pAllocs = allocs.filter((a) => a.paycheckId === p.id);
      const amount = Number(p.amount);
      return {
        id: p.id,
        payDate: p.payDate,
        amount,
        label: p.label,
        allocations: pAllocs.map((a) => ({
          id: a.id,
          category: a.category,
          amount: Number(a.amount),
          notes: a.notes,
          tags: a.tags,
          debtAccountId: a.debtAccountId,
          billId: a.billId,
        })),
        totals: computeTotals(pAllocs, amount),
      };
    }),
  );
});

router.get("/paychecks/last", async (_req, res): Promise<void> => {
  const [p] = await db
    .select()
    .from(paychecksTable)
    .orderBy(desc(paychecksTable.payDate))
    .limit(1);

  if (!p) {
    res.json(null);
    return;
  }

  const allocs = await db
    .select()
    .from(allocationsTable)
    .where(eq(allocationsTable.paycheckId, p.id));

  const amount = Number(p.amount);
  res.json({
    id: p.id,
    payDate: p.payDate,
    amount,
    label: p.label,
    allocations: allocs.map((a) => ({
      category: a.category,
      amount: Number(a.amount),
      notes: a.notes,
      tags: a.tags,
      debtAccountId: a.debtAccountId,
      billId: a.billId,
    })),
    totals: computeTotals(allocs, amount),
  });
});

router.get("/paychecks/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [p] = await db.select().from(paychecksTable).where(eq(paychecksTable.id, id));
  if (!p) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const allocs = await db
    .select()
    .from(allocationsTable)
    .where(eq(allocationsTable.paycheckId, id));
  const amount = Number(p.amount);
  res.json({
    id: p.id,
    payDate: p.payDate,
    amount,
    label: p.label,
    allocations: allocs.map((a) => ({
      id: a.id,
      category: a.category,
      amount: Number(a.amount),
      notes: a.notes,
      tags: a.tags,
      debtAccountId: a.debtAccountId,
      billId: a.billId,
    })),
    totals: computeTotals(allocs, amount),
  });
});

const AllocationInput = z.object({
  category: z.enum(["bills", "debt", "credit_dump", "surplus"]),
  debtAccountId: z.number().int().nullable().optional(),
  billId: z.number().int().nullable().optional(),
  amount: z.number().min(0),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

const PaycheckInput = z.object({
  payDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  label: z.enum(["first", "second"]),
  allocations: z.array(AllocationInput).optional(),
});

router.post("/paychecks", async (req, res): Promise<void> => {
  const parsed = PaycheckInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: String(parsed.error) });
    return;
  }
  const { payDate, amount, label, allocations = [] } = parsed.data;

  const [paycheck] = await db
    .insert(paychecksTable)
    .values({ payDate, amount: amount.toFixed(2), label })
    .returning();

  if (allocations.length > 0) {
    await db.insert(allocationsTable).values(
      allocations.map((a) => ({
        paycheckId: paycheck.id,
        category: a.category,
        amount: a.amount.toFixed(2),
        debtAccountId: a.debtAccountId ?? null,
        billId: a.billId ?? null,
        notes: a.notes ?? null,
        tags: a.tags ?? [],
      })),
    );
  }

  res.status(201).json({ id: paycheck.id });
});

router.patch("/paychecks/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const PaycheckUpdate = z.object({
    payDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    amount: z.number().positive().optional(),
    label: z.enum(["first", "second"]).optional(),
    allocations: z.array(AllocationInput).optional(),
  });
  const parsed = PaycheckUpdate.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: String(parsed.error) });
    return;
  }

  const { allocations, ...fields } = parsed.data;

  if (Object.keys(fields).length > 0) {
    const update: Record<string, unknown> = {};
    if (fields.payDate) update.payDate = fields.payDate;
    if (fields.amount) update.amount = fields.amount.toFixed(2);
    if (fields.label) update.label = fields.label;
    await db.update(paychecksTable).set(update).where(eq(paychecksTable.id, id));
  }

  if (allocations !== undefined) {
    await db.delete(allocationsTable).where(eq(allocationsTable.paycheckId, id));
    if (allocations.length > 0) {
      await db.insert(allocationsTable).values(
        allocations.map((a) => ({
          paycheckId: id,
          category: a.category,
          amount: a.amount.toFixed(2),
          debtAccountId: a.debtAccountId ?? null,
          billId: a.billId ?? null,
          notes: a.notes ?? null,
          tags: a.tags ?? [],
        })),
      );
    }
  }

  res.json({ ok: true });
});

router.delete("/paychecks/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  await db.delete(paychecksTable).where(eq(paychecksTable.id, id));
  res.sendStatus(204);
});

// ── Bills ─────────────────────────────────────────────────────────────────────

router.get("/bills", async (_req, res): Promise<void> => {
  const bills = await db.select().from(billsTable).orderBy(billsTable.sortOrder);
  res.json(bills.map((b) => ({ ...b, expectedAmount: Number(b.expectedAmount) })));
});

const BillInput = z.object({
  name: z.string().min(1),
  expectedAmount: z.number().min(0),
  sortOrder: z.number().int().optional(),
});

router.post("/bills", async (req, res): Promise<void> => {
  const parsed = BillInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: String(parsed.error) });
    return;
  }
  const [bill] = await db
    .insert(billsTable)
    .values({
      name: parsed.data.name,
      expectedAmount: parsed.data.expectedAmount.toFixed(2),
      sortOrder: parsed.data.sortOrder ?? 0,
    })
    .returning();
  res.status(201).json({ ...bill, expectedAmount: Number(bill.expectedAmount) });
});

router.patch("/bills/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const BillUpdate = z.object({
    name: z.string().min(1).optional(),
    expectedAmount: z.number().min(0).optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  });
  const parsed = BillUpdate.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: String(parsed.error) });
    return;
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.expectedAmount !== undefined)
    update.expectedAmount = parsed.data.expectedAmount.toFixed(2);
  if (parsed.data.active !== undefined) update.active = parsed.data.active;
  if (parsed.data.sortOrder !== undefined) update.sortOrder = parsed.data.sortOrder;

  const [bill] = await db
    .update(billsTable)
    .set(update)
    .where(eq(billsTable.id, id))
    .returning();
  if (!bill) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ...bill, expectedAmount: Number(bill.expectedAmount) });
});

router.delete("/bills/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  await db.delete(billsTable).where(eq(billsTable.id, id));
  res.sendStatus(204);
});

// ── Bill payments ─────────────────────────────────────────────────────────────

router.get("/bill-payments", async (req, res): Promise<void> => {
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  if (!month) {
    res.status(400).json({ error: "month query param required" });
    return;
  }
  const payments = await db
    .select()
    .from(billPaymentsTable)
    .where(eq(billPaymentsTable.month, month));
  res.json(payments.map((p) => ({ ...p, amountPaid: Number(p.amountPaid) })));
});

router.put("/bill-payments", async (req, res): Promise<void> => {
  const parsed = z
    .object({
      billId: z.number().int(),
      month: z.string().regex(/^\d{4}-\d{2}$/),
      amountPaid: z.number().min(0),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: String(parsed.error) });
    return;
  }

  const { billId, month, amountPaid } = parsed.data;
  const [existing] = await db
    .select()
    .from(billPaymentsTable)
    .where(and(eq(billPaymentsTable.billId, billId), eq(billPaymentsTable.month, month)));

  if (existing) {
    await db
      .update(billPaymentsTable)
      .set({ amountPaid: amountPaid.toFixed(2) })
      .where(eq(billPaymentsTable.id, existing.id));
  } else {
    await db
      .insert(billPaymentsTable)
      .values({ billId, month, amountPaid: amountPaid.toFixed(2) });
  }

  res.json({ ok: true });
});

// ── Debt accounts ─────────────────────────────────────────────────────────────

router.get("/debt-accounts", async (_req, res): Promise<void> => {
  const accounts = await db
    .select()
    .from(debtAccountsTable)
    .orderBy(debtAccountsTable.sortOrder);
  const snapshots = await db
    .select()
    .from(debtSnapshotsTable)
    .orderBy(desc(debtSnapshotsTable.snapshotDate));

  res.json(
    accounts.map((a) => {
      const latest = snapshots.find((s) => s.debtAccountId === a.id);
      return {
        ...a,
        currentBalance: latest ? Number(latest.balance) : null,
        lastUpdated: latest ? latest.snapshotDate : null,
      };
    }),
  );
});

router.post("/debt-accounts", async (req, res): Promise<void> => {
  const parsed = z
    .object({
      name: z.string().min(1),
      kind: z.enum(["card", "bnpl", "loan", "other"]).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: String(parsed.error) });
    return;
  }
  const [account] = await db
    .insert(debtAccountsTable)
    .values({ name: parsed.data.name, kind: parsed.data.kind ?? "other" })
    .returning();
  res.status(201).json(account);
});

router.patch("/debt-accounts/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const parsed = z
    .object({
      name: z.string().min(1).optional(),
      kind: z.enum(["card", "bnpl", "loan", "other"]).optional(),
      active: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: String(parsed.error) });
    return;
  }
  const [account] = await db
    .update(debtAccountsTable)
    .set(parsed.data)
    .where(eq(debtAccountsTable.id, id))
    .returning();
  if (!account) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(account);
});

router.delete("/debt-accounts/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  await db.delete(debtAccountsTable).where(eq(debtAccountsTable.id, id));
  res.sendStatus(204);
});

// ── Debt snapshots ────────────────────────────────────────────────────────────

router.get("/debt-snapshots", async (req, res): Promise<void> => {
  const accountId =
    typeof req.query.accountId === "string" ? parseInt(req.query.accountId, 10) : undefined;

  const snapshots = await db
    .select()
    .from(debtSnapshotsTable)
    .where(accountId && !isNaN(accountId) ? eq(debtSnapshotsTable.debtAccountId, accountId) : undefined)
    .orderBy(debtSnapshotsTable.snapshotDate);

  res.json(
    snapshots.map((s) => ({
      ...s,
      balance: Number(s.balance),
      amountPaid: Number(s.amountPaid),
    })),
  );
});

router.post("/debt-snapshots", async (req, res): Promise<void> => {
  const parsed = z
    .object({
      debtAccountId: z.number().int(),
      snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      balance: z.number().min(0),
      amountPaid: z.number().min(0).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: String(parsed.error) });
    return;
  }

  const [snap] = await db
    .insert(debtSnapshotsTable)
    .values({
      debtAccountId: parsed.data.debtAccountId,
      snapshotDate: parsed.data.snapshotDate,
      balance: parsed.data.balance.toFixed(2),
      amountPaid: (parsed.data.amountPaid ?? 0).toFixed(2),
    })
    .returning();

  res.status(201).json({ ...snap, balance: Number(snap.balance), amountPaid: Number(snap.amountPaid) });
});

// ── Debt trend ────────────────────────────────────────────────────────────────

router.get("/debt/trend", async (_req, res): Promise<void> => {
  const snapshots = await db
    .select()
    .from(debtSnapshotsTable)
    .orderBy(debtSnapshotsTable.snapshotDate);

  const byDate = new Map<string, number>();
  for (const s of snapshots) {
    byDate.set(s.snapshotDate, (byDate.get(s.snapshotDate) ?? 0) + Number(s.balance));
  }

  res.json(
    [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total: Math.round(total * 100) / 100 })),
  );
});

// ── Summary ───────────────────────────────────────────────────────────────────

router.get("/summary/:month", async (req, res): Promise<void> => {
  const month = req.params.month;
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "Invalid month format — expected YYYY-MM" });
    return;
  }

  const [year, mon] = month.split("-").map(Number);
  const from = `${month}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;

  const paychecks = await db
    .select()
    .from(paychecksTable)
    .where(and(gte(paychecksTable.payDate, from), lte(paychecksTable.payDate, to)));

  const income = paychecks.reduce((s, p) => s + Number(p.amount), 0);

  const allocs =
    paychecks.length > 0
      ? await db
          .select()
          .from(allocationsTable)
          .where(inArray(allocationsTable.paycheckId, paychecks.map((p) => p.id)))
      : [];

  const setAsideForBills = allocs
    .filter((a) => a.category === "bills")
    .reduce((s, a) => s + Number(a.amount), 0);
  const totalToDebt = allocs
    .filter((a) => a.category === "debt")
    .reduce((s, a) => s + Number(a.amount), 0);
  const creditDump = allocs
    .filter((a) => a.category === "credit_dump")
    .reduce((s, a) => s + Number(a.amount), 0);
  const surplus = allocs
    .filter((a) => a.category === "surplus")
    .reduce((s, a) => s + Number(a.amount), 0);

  const billPayments = await db
    .select()
    .from(billPaymentsTable)
    .where(eq(billPaymentsTable.month, month));
  const actuallyPaid = billPayments.reduce((s, p) => s + Number(p.amountPaid), 0);
  const billsDelta = setAsideForBills - actuallyPaid;

  const round = (n: number) => Math.round(n * 100) / 100;
  res.json({
    income: round(income),
    setAsideForBills: round(setAsideForBills),
    actuallyPaid: round(actuallyPaid),
    billsDelta: round(billsDelta),
    totalToDebt: round(totalToDebt),
    creditDump: round(creditDump),
    surplus: round(surplus),
    allocated: round(setAsideForBills + totalToDebt + creditDump + surplus),
  });
});

// ── Months list ───────────────────────────────────────────────────────────────

router.get("/months", async (_req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ month: sql<string>`to_char(${paychecksTable.payDate}, 'YYYY-MM')` })
    .from(paychecksTable)
    .orderBy(desc(sql`to_char(${paychecksTable.payDate}, 'YYYY-MM')`));

  res.json(rows.map((r) => r.month));
});

export default router;
