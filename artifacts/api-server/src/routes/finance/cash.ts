import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { cashAccountsTable, cashSnapshotsTable } from "@workspace/db";
import { DATE_RE, money, optionalIdQuery, parseBody, parseId } from "./shared.js";

const router: IRouter = Router();

// A cash account is a spendable balance (Cash App, Venmo, checking…) that you
// top up and draw down day to day — the mirror image of a debt account. No
// credit limit, no utilization, no paycheck-payment attribution: just a name
// and a running balance.

router.get("/cash-accounts", async (_req, res): Promise<void> => {
  const [accounts, snapshots] = await Promise.all([
    db.select().from(cashAccountsTable).orderBy(cashAccountsTable.sortOrder),
    db.select().from(cashSnapshotsTable).orderBy(desc(cashSnapshotsTable.snapshotDate)),
  ]);

  // Snapshots arrive newest-first, so the first one seen per account is latest.
  const latestByAccount = new Map<number, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    if (!latestByAccount.has(s.cashAccountId)) latestByAccount.set(s.cashAccountId, s);
  }

  res.json(
    accounts.map((a) => {
      const latest = latestByAccount.get(a.id);
      return {
        ...a,
        currentBalance: latest ? Number(latest.balance) : null,
        lastUpdated: latest ? latest.snapshotDate : null,
      };
    }),
  );
});

router.post("/cash-accounts", async (req, res): Promise<void> => {
  const data = parseBody(z.object({ name: z.string().min(1) }), req.body, res);
  if (!data) return;

  const [account] = await db.insert(cashAccountsTable).values({ name: data.name }).returning();
  res.status(201).json(account);
});

router.patch("/cash-accounts/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const data = parseBody(
    z.object({ name: z.string().min(1).optional(), active: z.boolean().optional() }),
    req.body,
    res,
  );
  if (!data) return;

  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.active !== undefined) update.active = data.active;

  const [account] = await db
    .update(cashAccountsTable)
    .set(update)
    .where(eq(cashAccountsTable.id, id))
    .returning();
  if (!account) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(account);
});

router.delete("/cash-accounts/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  await db.delete(cashAccountsTable).where(eq(cashAccountsTable.id, id));
  res.sendStatus(204);
});

// ── Cash snapshots ──────────────────────────────────────────────────────────

router.get("/cash-snapshots", async (req, res): Promise<void> => {
  const accountId = optionalIdQuery(req.query.accountId);

  const rows = await db
    .select()
    .from(cashSnapshotsTable)
    .where(accountId !== undefined ? eq(cashSnapshotsTable.cashAccountId, accountId) : undefined)
    .orderBy(cashSnapshotsTable.snapshotDate);

  res.json(rows.map((s) => ({ ...s, balance: Number(s.balance) })));
});

router.post("/cash-snapshots", async (req, res): Promise<void> => {
  const data = parseBody(
    z.object({
      cashAccountId: z.number().int(),
      snapshotDate: z.string().regex(DATE_RE),
      balance: z.number().min(0),
    }),
    req.body,
    res,
  );
  if (!data) return;

  const [account] = await db
    .select({ id: cashAccountsTable.id })
    .from(cashAccountsTable)
    .where(eq(cashAccountsTable.id, data.cashAccountId));
  if (!account) {
    res.status(404).json({ error: "Cash account not found" });
    return;
  }

  const [snap] = await db
    .insert(cashSnapshotsTable)
    .values({
      cashAccountId: data.cashAccountId,
      snapshotDate: data.snapshotDate,
      balance: money(data.balance),
    })
    .returning();

  res.status(201).json({ ...snap, balance: Number(snap.balance) });
});

export default router;
