import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  paychecksTable,
  allocationsTable,
  monthlyBillItemsTable,
  debtAccountsTable,
  debtSnapshotsTable,
} from "@workspace/db";

const router: IRouter = Router();

const MONTH_RE = /^\d{4}-\d{2}$/;

function parseId(raw: string): number {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) throw Object.assign(new Error("Invalid id"), { status: 400 });
  return n;
}

type AllocRow = { amount: string };

function computeTotals(allocs: AllocRow[], paycheckAmount: number) {
  const allocated = allocs.reduce((s, a) => s + Number(a.amount), 0);
  return {
    allocated: Math.round(allocated * 100) / 100,
    unallocated: Math.round((paycheckAmount - allocated) * 100) / 100,
  };
}

// ── Paychecks ────────────────────────────────────────────────────────────────

router.get("/paychecks", async (req, res): Promise<void> => {
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  if (month !== undefined && !MONTH_RE.test(month)) {
    res.status(400).json({ error: "Invalid month format — expected YYYY-MM" });
    return;
  }

  const paychecks = await db
    .select()
    .from(paychecksTable)
    .where(month ? eq(paychecksTable.month, month) : undefined)
    .orderBy(desc(paychecksTable.month), desc(paychecksTable.seq));

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
        month: p.month,
        seq: p.seq,
        amount,
        allocations: pAllocs.map((a) => ({
          id: a.id,
          amount: Number(a.amount),
          note: a.note,
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
    .orderBy(desc(paychecksTable.month), desc(paychecksTable.seq))
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
    month: p.month,
    seq: p.seq,
    amount,
    allocations: allocs.map((a) => ({
      amount: Number(a.amount),
      note: a.note,
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
    month: p.month,
    seq: p.seq,
    amount,
    allocations: allocs.map((a) => ({
      id: a.id,
      amount: Number(a.amount),
      note: a.note,
    })),
    totals: computeTotals(allocs, amount),
  });
});

const AllocationInput = z.object({
  amount: z.number().min(0),
  note: z.string().max(500).optional(),
});

/**
 * Postgres unique-violation, raised when a month already has that paycheck.
 * Drizzle wraps driver errors, so the pg code sits further down `cause`.
 */
function isDuplicate(err: unknown): boolean {
  for (let cur = err, depth = 0; cur && depth < 5; depth++) {
    if (typeof cur === "object" && (cur as { code?: string }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

/** "2026-08" -> "August 2026", so the message reads like the rest of the app. */
function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

const takenMessage = (month: string, seq: number) =>
  `The ${ordinal(seq)} paycheck of ${monthName(month)} is already recorded. ` +
  `Edit that one, or pick a different number.`;

const PaycheckInput = z.object({
  month: z.string().regex(MONTH_RE),
  seq: z.number().int().min(1).max(3),
  amount: z.number().positive(),
  allocations: z.array(AllocationInput).optional(),
});

router.post("/paychecks", async (req, res): Promise<void> => {
  const parsed = PaycheckInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: String(parsed.error) });
    return;
  }
  const { month, seq, amount, allocations = [] } = parsed.data;

  let paycheck;
  try {
    [paycheck] = await db
      .insert(paychecksTable)
      .values({ month, seq, amount: amount.toFixed(2) })
      .returning();
  } catch (err) {
    if (isDuplicate(err)) {
      res.status(409).json({ error: takenMessage(month, seq) });
      return;
    }
    throw err;
  }

  if (allocations.length > 0) {
    await db.insert(allocationsTable).values(
      allocations.map((a) => ({
        paycheckId: paycheck.id,
        amount: a.amount.toFixed(2),
        note: a.note?.trim() ?? "",
      })),
    );
  }

  res.status(201).json({ id: paycheck.id });
});

router.patch("/paychecks/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const PaycheckUpdate = PaycheckInput.partial();
  const parsed = PaycheckUpdate.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: String(parsed.error) });
    return;
  }

  const { allocations, ...fields } = parsed.data;

  if (Object.keys(fields).length > 0) {
    const update: Record<string, unknown> = {};
    if (fields.month) update.month = fields.month;
    if (fields.seq) update.seq = fields.seq;
    if (fields.amount) update.amount = fields.amount.toFixed(2);
    try {
      await db.update(paychecksTable).set(update).where(eq(paychecksTable.id, id));
    } catch (err) {
      if (isDuplicate(err)) {
        const [current] = await db
          .select()
          .from(paychecksTable)
          .where(eq(paychecksTable.id, id));
        res.status(409).json({
          error: takenMessage(fields.month ?? current?.month ?? "", fields.seq ?? current?.seq ?? 0),
        });
        return;
      }
      throw err;
    }
  }

  if (allocations !== undefined) {
    await db.delete(allocationsTable).where(eq(allocationsTable.paycheckId, id));
    if (allocations.length > 0) {
      await db.insert(allocationsTable).values(
        allocations.map((a) => ({
          paycheckId: id,
          amount: a.amount.toFixed(2),
          note: a.note?.trim() ?? "",
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

// ── Monthly bill items ────────────────────────────────────────────────────────
// Each row belongs to exactly one month. Deleting April's row never touches March.
// Visiting a month with no rows auto-seeds names from the most recent prior month.

router.get("/bills", async (req, res): Promise<void> => {
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  if (!month || !MONTH_RE.test(month)) {
    res.status(400).json({ error: "month query param required (YYYY-MM)" });
    return;
  }

  let items = await db
    .select()
    .from(monthlyBillItemsTable)
    .where(eq(monthlyBillItemsTable.month, month))
    .orderBy(monthlyBillItemsTable.sortOrder);

  // Auto-seed from most recent previous month when this month has no rows yet
  if (items.length === 0) {
    const [prev] = await db
      .select({ month: monthlyBillItemsTable.month })
      .from(monthlyBillItemsTable)
      .where(lt(monthlyBillItemsTable.month, month))
      .orderBy(desc(monthlyBillItemsTable.month))
      .limit(1);

    if (prev) {
      const source = await db
        .select()
        .from(monthlyBillItemsTable)
        .where(eq(monthlyBillItemsTable.month, prev.month))
        .orderBy(monthlyBillItemsTable.sortOrder);

      if (source.length > 0) {
        items = await db
          .insert(monthlyBillItemsTable)
          .values(source.map((s) => ({ month, name: s.name, amount: "0", sortOrder: s.sortOrder })))
          .returning();
      }
    }
  }

  res.json(items.map((b) => ({ ...b, amount: Number(b.amount) })));
});

router.post("/bills", async (req, res): Promise<void> => {
  const parsed = z
    .object({
      month: z.string().regex(MONTH_RE),
      name: z.string().min(1),
      sortOrder: z.number().int().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: String(parsed.error) });
    return;
  }
  const [item] = await db
    .insert(monthlyBillItemsTable)
    .values({ month: parsed.data.month, name: parsed.data.name, amount: "0", sortOrder: parsed.data.sortOrder ?? 0 })
    .returning();
  res.status(201).json({ ...item, amount: Number(item.amount) });
});

router.patch("/bills/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const parsed = z
    .object({ name: z.string().min(1).optional(), amount: z.number().min(0).optional() })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: String(parsed.error) });
    return;
  }
  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.amount !== undefined) update.amount = parsed.data.amount.toFixed(2);

  const [item] = await db
    .update(monthlyBillItemsTable)
    .set(update)
    .where(eq(monthlyBillItemsTable.id, id))
    .returning();
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...item, amount: Number(item.amount) });
});

router.delete("/bills/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  await db.delete(monthlyBillItemsTable).where(eq(monthlyBillItemsTable.id, id));
  res.sendStatus(204);
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
  if (!MONTH_RE.test(month)) {
    res.status(400).json({ error: "Invalid month format — expected YYYY-MM" });
    return;
  }

  const paychecks = await db
    .select()
    .from(paychecksTable)
    .where(eq(paychecksTable.month, month));

  const income = paychecks.reduce((s, p) => s + Number(p.amount), 0);

  const allocs =
    paychecks.length > 0
      ? await db
          .select()
          .from(allocationsTable)
          .where(inArray(allocationsTable.paycheckId, paychecks.map((p) => p.id)))
      : [];

  const allocated = allocs.reduce((s, a) => s + Number(a.amount), 0);

  const billItems = await db
    .select()
    .from(monthlyBillItemsTable)
    .where(eq(monthlyBillItemsTable.month, month));
  const actuallyPaid = billItems.reduce((s, b) => s + Number(b.amount), 0);

  const round = (n: number) => Math.round(n * 100) / 100;

  // Notes are the tags now, so the month's breakdown is its notes totalled up.
  // Untitled rows collect under one heading rather than vanishing.
  const byNote = new Map<string, number>();
  for (const a of allocs) {
    const key = a.note.trim() || "Untitled";
    byNote.set(key, (byNote.get(key) ?? 0) + Number(a.amount));
  }

  res.json({
    income: round(income),
    allocated: round(allocated),
    unallocated: round(income - allocated),
    actuallyPaid: round(actuallyPaid),
    byNote: [...byNote.entries()]
      .map(([note, amount]) => ({ note, amount: round(amount) }))
      .sort((a, b) => b.amount - a.amount),
  });
});

// ── Months list ───────────────────────────────────────────────────────────────

router.get("/months", async (_req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ month: paychecksTable.month })
    .from(paychecksTable)
    .orderBy(desc(paychecksTable.month));

  res.json(rows.map((r) => r.month));
});

export default router;
