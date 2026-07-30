import { Router, type IRouter } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  allocationsTable,
  extraIncomeTable,
  monthlyBillItemsTable,
  paychecksTable,
} from "@workspace/db";
import { MONTH_RE, round } from "./shared.js";

const router: IRouter = Router();

router.get("/summary/:month", async (req, res): Promise<void> => {
  const month = req.params.month;
  if (!MONTH_RE.test(month)) {
    res.status(400).json({ error: "Invalid month format — expected YYYY-MM" });
    return;
  }

  const paychecks = await db.select().from(paychecksTable).where(eq(paychecksTable.month, month));
  const paycheckIds = paychecks.map((p) => p.id);
  const baseIncome = paychecks.reduce((s, p) => s + Number(p.amount), 0);

  const hasPaychecks = paycheckIds.length > 0;
  const [allocs, extras, billItems] = await Promise.all([
    hasPaychecks
      ? db.select().from(allocationsTable).where(inArray(allocationsTable.paycheckId, paycheckIds))
      : Promise.resolve([] as (typeof allocationsTable.$inferSelect)[]),
    hasPaychecks
      ? db.select().from(extraIncomeTable).where(inArray(extraIncomeTable.paycheckId, paycheckIds))
      : Promise.resolve([] as (typeof extraIncomeTable.$inferSelect)[]),
    db.select().from(monthlyBillItemsTable).where(eq(monthlyBillItemsTable.month, month)),
  ]);

  const extraIncome = extras.reduce((s, e) => s + Number(e.amount), 0);
  const income = baseIncome + extraIncome;
  const allocated = allocs.reduce((s, a) => s + Number(a.amount), 0);
  const actuallyPaid = billItems.reduce((s, b) => s + Number(b.amount), 0);

  // Notes are the tags now, so the month's breakdown is its notes totalled up.
  // Untitled rows collect under one heading rather than vanishing.
  const byNote = new Map<string, number>();
  for (const a of allocs) {
    const key = a.note.trim() || "Untitled";
    byNote.set(key, (byNote.get(key) ?? 0) + Number(a.amount));
  }

  res.json({
    income: round(income),
    extraIncome: round(extraIncome),
    allocated: round(allocated),
    unallocated: round(income - allocated),
    actuallyPaid: round(actuallyPaid),
    byNote: [...byNote.entries()]
      .map(([note, amount]) => ({ note, amount: round(amount) }))
      .sort((a, b) => b.amount - a.amount),
  });
});

router.get("/months", async (_req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ month: paychecksTable.month })
    .from(paychecksTable)
    .orderBy(desc(paychecksTable.month));

  res.json(rows.map((r) => r.month));
});

export default router;
