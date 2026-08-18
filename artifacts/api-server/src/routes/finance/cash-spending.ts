import { Router, type IRouter } from "express";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { cashSpendingLogTable, cashAccountsTable } from "@workspace/db";
import { money, optionalInstantQuery, parseBody, parseId, round } from "./shared.js";

const router: IRouter = Router();

// ── List entries for one account ─────────────────────────────────────────────

router.get("/cash-spending", async (req, res): Promise<void> => {
  const accountId = parseInt(String(req.query.accountId ?? ""), 10);
  if (!accountId || isNaN(accountId)) {
    res.status(400).json({ error: "accountId query param required" });
    return;
  }

  const entries = await db
    .select()
    .from(cashSpendingLogTable)
    .where(eq(cashSpendingLogTable.cashAccountId, accountId))
    .orderBy(desc(cashSpendingLogTable.loggedAt))
    .limit(500);

  res.json(entries);
});

// ── Summary: today / this week / this month + by-category breakdown ───────────
// Must be registered before /:id routes so "summary" isn't captured as an id.

router.get("/cash-spending/summary", async (req, res): Promise<void> => {
  const accountId = parseInt(String(req.query.accountId ?? ""), 10);
  if (!accountId || isNaN(accountId)) {
    res.status(400).json({ error: "accountId query param required" });
    return;
  }

  // "Today" has to mean the viewer's today. The client sends the instants its
  // own day, week and month began at, because only the browser knows the
  // reader's zone and its DST rules; computing them here meant the window
  // rolled over at the *server's* midnight, which on a UTC host is the wrong
  // moment for everybody not on UTC.
  //
  // The server-local arithmetic stays as the fallback so a direct API call
  // with no params still behaves the way it always did.
  const now = new Date();

  const serverDayStart = new Date(now);
  serverDayStart.setHours(0, 0, 0, 0);

  // Week starts Monday (dow 0 = Sunday → diff -6, otherwise 1 - dow)
  const dow = now.getDay();
  const serverWeekStart = new Date(now);
  serverWeekStart.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));
  serverWeekStart.setHours(0, 0, 0, 0);

  const startOfDay = optionalInstantQuery(req.query.dayStart) ?? serverDayStart;
  const startOfWeek = optionalInstantQuery(req.query.weekStart) ?? serverWeekStart;
  const startOfMonth =
    optionalInstantQuery(req.query.monthStart) ??
    new Date(now.getFullYear(), now.getMonth(), 1);

  // Nothing older than the earliest window can affect any of these figures, so
  // the rest never has to leave the database. The week can start before the 1st
  // of the month, so the bound is whichever of the three comes first — `day` is
  // in there because a client is free to send boundaries this server did not
  // compute and need not have ordered them the way it would.
  const earliest = [startOfDay, startOfWeek, startOfMonth].reduce((a, b) => (a < b ? a : b));

  const entries = await db
    .select({
      amount: cashSpendingLogTable.amount,
      category: cashSpendingLogTable.category,
      loggedAt: cashSpendingLogTable.loggedAt,
    })
    .from(cashSpendingLogTable)
    .where(and(
      eq(cashSpendingLogTable.cashAccountId, accountId),
      gte(cashSpendingLogTable.loggedAt, earliest),
    ));

  // Track spending only (negative entries = expenses; deposits are excluded
  // from the "spent" stats so the numbers reflect what went out the door).
  let todaySpent = 0, weekSpent = 0, monthSpent = 0;
  const todayCatMap = new Map<string, number>();
  const weekCatMap  = new Map<string, number>();
  const monthCatMap = new Map<string, number>();

  for (const e of entries) {
    if (!e.loggedAt) continue;
    const at  = new Date(e.loggedAt);
    const amt = Number(e.amount);
    if (amt >= 0) continue; // skip deposits for spending stats
    const spent = Math.abs(amt);
    if (at >= startOfDay) {
      todaySpent += spent;
      todayCatMap.set(e.category, (todayCatMap.get(e.category) ?? 0) + spent);
    }
    if (at >= startOfWeek) {
      weekSpent += spent;
      weekCatMap.set(e.category, (weekCatMap.get(e.category) ?? 0) + spent);
    }
    if (at >= startOfMonth) {
      monthSpent += spent;
      monthCatMap.set(e.category, (monthCatMap.get(e.category) ?? 0) + spent);
    }
  }

  const mapToSorted = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([category, total]) => ({ category, total: round(total) }))
      .sort((a, b) => b.total - a.total);

  res.json({
    todaySpent: round(todaySpent),
    weekSpent:  round(weekSpent),
    monthSpent: round(monthSpent),
    // per-period category breakdowns (expenses only)
    todayByCategory: mapToSorted(todayCatMap),
    weekByCategory:  mapToSorted(weekCatMap),
    monthByCategory: mapToSorted(monthCatMap),
    // kept for backwards compat
    byCategory: mapToSorted(monthCatMap),
  });
});

// ── Create an entry ───────────────────────────────────────────────────────────

const entrySchema = z.object({
  cashAccountId: z.number().int().positive(),
  // Positive = deposit/top-up, negative = expense. Zero not allowed.
  amount:        z.number().refine((n) => n !== 0, "Amount cannot be zero"),
  description:   z.string().min(1).max(200),
  category:      z.string().min(1).max(50).default("Other"),
  notes:         z.string().max(500).optional(),
});

router.post("/cash-spending", async (req, res): Promise<void> => {
  const body = parseBody(entrySchema, req.body, res);
  if (!body) return;

  const account = await db
    .select({ id: cashAccountsTable.id })
    .from(cashAccountsTable)
    .where(eq(cashAccountsTable.id, body.cashAccountId))
    .limit(1);

  if (!account.length) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  const [entry] = await db
    .insert(cashSpendingLogTable)
    .values({
      cashAccountId: body.cashAccountId,
      amount:        money(body.amount),
      description:   body.description,
      category:      body.category,
      notes:         body.notes ?? null,
    })
    .returning();

  res.status(201).json(entry);
});

// ── Update an entry ───────────────────────────────────────────────────────────

const patchSchema = z.object({
  amount:      z.number().refine((n) => n !== 0, "Amount cannot be zero").optional(),
  description: z.string().min(1).max(200).optional(),
  category:    z.string().min(1).max(50).optional(),
  notes:       z.string().max(500).nullable().optional(),
});

router.patch("/cash-spending/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const body = parseBody(patchSchema, req.body, res);
  if (!body) return;

  const updates: Record<string, unknown> = {};
  if (body.amount      !== undefined) updates.amount      = money(body.amount);
  if (body.description !== undefined) updates.description = body.description;
  if (body.category    !== undefined) updates.category    = body.category;
  if ("notes" in body)               updates.notes       = body.notes ?? null;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db
    .update(cashSpendingLogTable)
    .set(updates)
    .where(eq(cashSpendingLogTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// ── Delete an entry ───────────────────────────────────────────────────────────

router.delete("/cash-spending/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);

  const deleted = await db
    .delete(cashSpendingLogTable)
    .where(eq(cashSpendingLogTable.id, id))
    .returning({ id: cashSpendingLogTable.id });

  if (!deleted.length) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

export default router;
