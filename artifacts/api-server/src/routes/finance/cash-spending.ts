import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { cashSpendingLogTable, cashAccountsTable } from "@workspace/db";
import { money, parseBody, parseId, round } from "./shared.js";

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

  const entries = await db
    .select()
    .from(cashSpendingLogTable)
    .where(eq(cashSpendingLogTable.cashAccountId, accountId));

  const now = new Date();

  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  // ISO week starts Monday (dow 0 = Sunday → diff -6, otherwise 1 - dow)
  const dow = now.getDay();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Track spending only (negative entries = expenses; deposits are excluded
  // from the "spent" stats so the numbers reflect what went out the door).
  let todaySpent = 0, weekSpent = 0, monthSpent = 0;
  const catMap = new Map<string, number>();

  for (const e of entries) {
    if (!e.loggedAt) continue;
    const at  = new Date(e.loggedAt);
    const amt = Number(e.amount);
    if (amt >= 0) continue; // skip deposits for spending stats
    const spent = Math.abs(amt);
    if (at >= startOfDay)   todaySpent += spent;
    if (at >= startOfWeek)  weekSpent  += spent;
    if (at >= startOfMonth) {
      monthSpent += spent;
      catMap.set(e.category, (catMap.get(e.category) ?? 0) + spent);
    }
  }

  const byCategory = [...catMap.entries()]
    .map(([category, total]) => ({ category, total: round(total) }))
    .sort((a, b) => b.total - a.total);

  res.json({
    todaySpent: round(todaySpent),
    weekSpent:  round(weekSpent),
    monthSpent: round(monthSpent),
    byCategory,
  });
});

// ── Create an entry ───────────────────────────────────────────────────────────

const entrySchema = z.object({
  cashAccountId: z.number().int().positive(),
  // Positive = deposit/top-up, negative = expense. Zero not allowed.
  amount:        z.number().refine((n) => n !== 0, "Amount cannot be zero"),
  description:   z.string().min(1).max(200),
  category:      z.string().min(1).max(50).default("Other"),
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
    })
    .returning();

  res.status(201).json(entry);
});

// ── Bulk import from CSV (Cash App export) ────────────────────────────────────

const importRowSchema = z.object({
  amount:      z.number().refine((n) => n !== 0, "Amount cannot be zero"),
  description: z.string().min(1).max(200),
  category:    z.string().min(1).max(50),
  loggedAt:    z.string(), // ISO datetime string
  sourceHash:  z.string().min(1).max(500),
});

const importSchema = z.object({
  cashAccountId: z.number().int().positive(),
  rows:          z.array(importRowSchema).min(1).max(20000),
});

router.post("/cash-spending/import", async (req, res): Promise<void> => {
  const body = parseBody(importSchema, req.body, res);
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

  // Insert in batches of 500, skipping rows whose source_hash already exists.
  const BATCH = 500;
  let imported = 0;

  for (let i = 0; i < body.rows.length; i += BATCH) {
    const batch = body.rows.slice(i, i + BATCH);
    const result = await db
      .insert(cashSpendingLogTable)
      .values(
        batch.map((r) => ({
          cashAccountId: body.cashAccountId,
          amount:        money(r.amount),
          description:   r.description,
          category:      r.category,
          loggedAt:      new Date(r.loggedAt),
          sourceHash:    r.sourceHash,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: cashSpendingLogTable.id });
    imported += result.length;
  }

  const duplicates = body.rows.length - imported;
  res.status(201).json({ imported, duplicates });
});

// ── Delete an entry ───────────────────────────────────────────────────────────

router.delete("/cash-spending/:id", async (req, res): Promise<void> => {
  let id: number;
  try { id = parseId(req.params.id); }
  catch { res.status(400).json({ error: "Invalid id" }); return; }

  const deleted = await db
    .delete(cashSpendingLogTable)
    .where(eq(cashSpendingLogTable.id, id))
    .returning({ id: cashSpendingLogTable.id });

  if (!deleted.length) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).end();
});

export default router;
