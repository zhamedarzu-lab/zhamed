import { Router, type IRouter } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { paychecksTable, allocationsTable, extraIncomeTable } from "@workspace/db";
import { MONTH_RE, isDuplicate, money, parseBody, parseId, round } from "./shared.js";

const router: IRouter = Router();

type AllocRow = { id: number; amount: string; note: string; debtAccountId: number | null };
type ExtraRow = { id: number; amount: string; note: string };

/**
 * `paycheckAmount` is what the pool starts at; `extras` (bill surplus,
 * refunds, gifts) grow it before allocations are subtracted, so "unallocated"
 * — the figure the UI shows as spending money — accounts for both.
 */
export function computeTotals(
  allocs: Array<{ amount: string }>,
  extras: Array<{ amount: string }>,
  paycheckAmount: number,
) {
  const allocated = allocs.reduce((s, a) => s + Number(a.amount), 0);
  const extra = extras.reduce((s, e) => s + Number(e.amount), 0);
  return {
    allocated: round(allocated),
    extra: round(extra),
    unallocated: round(paycheckAmount + extra - allocated),
  };
}

/** The one shape every paycheck endpoint returns. */
function shapePaycheck(
  p: { id: number; month: string; seq: number; amount: string },
  allocs: AllocRow[],
  extras: ExtraRow[],
) {
  const amount = Number(p.amount);
  return {
    id: p.id,
    month: p.month,
    seq: p.seq,
    amount,
    allocations: allocs.map((a) => ({
      id: a.id,
      amount: Number(a.amount),
      note: a.note,
      debtAccountId: a.debtAccountId,
    })),
    extraIncome: extras.map((e) => ({ id: e.id, amount: Number(e.amount), note: e.note })),
    totals: computeTotals(allocs, extras, amount),
  };
}

/** Groups child rows by their paycheck once, rather than filtering per paycheck. */
function groupByPaycheck<T extends { paycheckId: number }>(rows: T[]): Map<number, T[]> {
  const byId = new Map<number, T[]>();
  for (const row of rows) {
    const list = byId.get(row.paycheckId);
    if (list) list.push(row);
    else byId.set(row.paycheckId, [row]);
  }
  return byId;
}

async function childrenOf(ids: number[]) {
  if (ids.length === 0) return { allocs: [], extras: [] };
  const [allocs, extras] = await Promise.all([
    db.select().from(allocationsTable).where(inArray(allocationsTable.paycheckId, ids)),
    db.select().from(extraIncomeTable).where(inArray(extraIncomeTable.paycheckId, ids)),
  ]);
  return { allocs, extras };
}

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

  const { allocs, extras } = await childrenOf(paychecks.map((p) => p.id));
  const allocsBy = groupByPaycheck(allocs);
  const extrasBy = groupByPaycheck(extras);

  res.json(
    paychecks.map((p) => shapePaycheck(p, allocsBy.get(p.id) ?? [], extrasBy.get(p.id) ?? [])),
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

  const { allocs, extras } = await childrenOf([p.id]);
  res.json(shapePaycheck(p, allocs, extras));
});

router.get("/paychecks/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [p] = await db.select().from(paychecksTable).where(eq(paychecksTable.id, id));
  if (!p) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const { allocs, extras } = await childrenOf([p.id]);
  res.json(shapePaycheck(p, allocs, extras));
});

const AllocationInput = z.object({
  amount: z.number().min(0),
  note: z.string().max(500).optional(),
  debtAccountId: z.number().int().nullable().optional(),
});

const ExtraIncomeInput = z.object({
  amount: z.number().min(0),
  note: z.string().max(500).optional(),
});

const PaycheckInput = z.object({
  month: z.string().regex(MONTH_RE),
  seq: z.number().int().min(1).max(3),
  amount: z.number().positive(),
  allocations: z.array(AllocationInput).optional(),
  extraIncome: z.array(ExtraIncomeInput).optional(),
});

type AllocationInputT = z.infer<typeof AllocationInput>;
type ExtraIncomeInputT = z.infer<typeof ExtraIncomeInput>;

const allocValues = (paycheckId: number, rows: AllocationInputT[]) =>
  rows.map((a) => ({
    paycheckId,
    amount: money(a.amount),
    note: a.note?.trim() ?? "",
    debtAccountId: a.debtAccountId ?? null,
  }));

const extraValues = (paycheckId: number, rows: ExtraIncomeInputT[]) =>
  rows.map((e) => ({ paycheckId, amount: money(e.amount), note: e.note?.trim() ?? "" }));

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

router.post("/paychecks", async (req, res): Promise<void> => {
  const data = parseBody(PaycheckInput, req.body, res);
  if (!data) return;
  const { month, seq, amount, allocations = [], extraIncome = [] } = data;

  try {
    // One transaction: a paycheck never lands without the rows that explain it.
    const id = await db.transaction(async (tx) => {
      const [paycheck] = await tx
        .insert(paychecksTable)
        .values({ month, seq, amount: money(amount) })
        .returning();

      if (allocations.length > 0) {
        await tx.insert(allocationsTable).values(allocValues(paycheck.id, allocations));
      }
      if (extraIncome.length > 0) {
        await tx.insert(extraIncomeTable).values(extraValues(paycheck.id, extraIncome));
      }
      return paycheck.id;
    });

    res.status(201).json({ id });
  } catch (err) {
    if (isDuplicate(err)) {
      res.status(409).json({ error: takenMessage(month, seq) });
      return;
    }
    throw err;
  }
});

router.patch("/paychecks/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const data = parseBody(PaycheckInput.partial(), req.body, res);
  if (!data) return;

  const { allocations, extraIncome, ...fields } = data;

  const [existing] = await db.select().from(paychecksTable).where(eq(paychecksTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  try {
    // Allocation and extra-income rows are replaced wholesale; the delete and
    // the reinsert have to succeed or fail together.
    await db.transaction(async (tx) => {
      const update: Record<string, unknown> = {};
      if (fields.month) update.month = fields.month;
      if (fields.seq) update.seq = fields.seq;
      if (fields.amount) update.amount = money(fields.amount);
      if (Object.keys(update).length > 0) {
        await tx.update(paychecksTable).set(update).where(eq(paychecksTable.id, id));
      }

      if (allocations !== undefined) {
        await tx.delete(allocationsTable).where(eq(allocationsTable.paycheckId, id));
        if (allocations.length > 0) {
          await tx.insert(allocationsTable).values(allocValues(id, allocations));
        }
      }

      if (extraIncome !== undefined) {
        await tx.delete(extraIncomeTable).where(eq(extraIncomeTable.paycheckId, id));
        if (extraIncome.length > 0) {
          await tx.insert(extraIncomeTable).values(extraValues(id, extraIncome));
        }
      }
    });
  } catch (err) {
    if (isDuplicate(err)) {
      res.status(409).json({
        error: takenMessage(fields.month ?? existing.month, fields.seq ?? existing.seq),
      });
      return;
    }
    throw err;
  }

  res.json({ ok: true });
});

router.delete("/paychecks/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  await db.delete(paychecksTable).where(eq(paychecksTable.id, id));
  res.sendStatus(204);
});

/**
 * Distinct notes, for the editor's autocomplete. Exists so the editor does not
 * have to download every paycheck ever recorded — with its allocations and
 * extras — just to collect a list of strings it already has names for.
 * Allocation and extra-income notes are kept apart because the editor offers
 * them in different fields.
 */
router.get("/notes", async (_req, res): Promise<void> => {
  const [allocRows, extraRows] = await Promise.all([
    db.selectDistinct({ note: allocationsTable.note }).from(allocationsTable),
    db.selectDistinct({ note: extraIncomeTable.note }).from(extraIncomeTable),
  ]);

  const clean = (rows: Array<{ note: string }>) =>
    [...new Set(rows.map((r) => r.note.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );

  res.json({ allocations: clean(allocRows), extraIncome: clean(extraRows) });
});

export default router;
