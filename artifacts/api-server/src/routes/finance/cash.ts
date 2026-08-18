import { Router, type IRouter } from "express";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { cashAccountsTable, cashSnapshotsTable, cashSpendingLogTable, paychecksTable } from "@workspace/db";
import { DATE_RE, money, optionalDateQuery, optionalIdQuery, parseBody, parseId, round, timeZoneQuery } from "./shared.js";

const router: IRouter = Router();

// A cash account is a spendable balance (Cash App, Venmo, checking…) that you
// top up and draw down day to day — the mirror image of a debt account. No
// credit limit, no utilization, no paycheck-payment attribution: just a name
// and a running balance.

router.get("/cash-accounts", async (req, res): Promise<void> => {
  // The sparkline only ever plots one point per calendar day, so the day
  // totals are grouped in the database. This used to select every row of the
  // spending log — full description, category and notes included — and reduce
  // it in JS, which meant the Cash page got slower with every purchase logged.
  //
  // Which day a purchase falls on depends on where you are standing, so the
  // client sends its zone and Postgres does the conversion per row — an offset
  // would be wrong either side of a DST change, and the session's own timezone
  // is not the reader's. No `?tz=` means UTC, which is what this returned
  // before it took a zone at all.
  const tz = timeZoneQuery(req.query.tz);

  // The zone is bound once, in a subquery. Repeating the expression in GROUP BY
  // would bind a *second* placeholder, and Postgres compares the two as
  // different expressions and rejects the query.
  const dayBuckets = db
    .select({
      cashAccountId: cashSpendingLogTable.cashAccountId,
      amount: cashSpendingLogTable.amount,
      day: sql<string>`to_char(${cashSpendingLogTable.loggedAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`.as("day"),
    })
    .from(cashSpendingLogTable)
    .as("day_buckets");

  const [accounts, dayTotals] = await Promise.all([
    db.select().from(cashAccountsTable).orderBy(cashAccountsTable.sortOrder),
    db
      .select({
        cashAccountId: dayBuckets.cashAccountId,
        day: dayBuckets.day,
        delta: sql<string>`SUM(${dayBuckets.amount})`,
      })
      .from(dayBuckets)
      .groupBy(dayBuckets.cashAccountId, dayBuckets.day)
      .orderBy(dayBuckets.cashAccountId, dayBuckets.day),
  ]);

  const byAccount = new Map<number, Array<{ day: string; delta: number }>>();
  for (const row of dayTotals) {
    let list = byAccount.get(row.cashAccountId);
    if (!list) { list = []; byAccount.set(row.cashAccountId, list); }
    list.push({ day: row.day, delta: Number(row.delta) });
  }

  res.json(
    accounts.map((a) => {
      // Already ordered by day ascending, so one forward pass gives both the
      // running balance and the cumulative history.
      const days = byAccount.get(a.id) ?? [];

      let running = 0;
      const balanceHistory = days.map(({ day, delta }) => ({
        date: day,
        value: round((running += delta)),
      }));

      return {
        ...a,
        currentBalance: round(running),
        lastUpdated: days.at(-1)?.day ?? null,
        balanceHistory,
      };
    }),
  );
});

router.put("/cash-accounts/reorder", async (req, res): Promise<void> => {
  const data = parseBody(z.object({ ids: z.array(z.number().int()) }), req.body, res);
  if (!data) return;
  await Promise.all(
    data.ids.map((id, idx) =>
      db.update(cashAccountsTable).set({ sortOrder: idx }).where(eq(cashAccountsTable.id, id)),
    ),
  );
  res.sendStatus(204);
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
  const from = optionalDateQuery(req.query.from);
  const to = optionalDateQuery(req.query.to);

  const conditions = [
    accountId !== undefined ? eq(cashSnapshotsTable.cashAccountId, accountId) : undefined,
    from !== undefined ? gte(cashSnapshotsTable.snapshotDate, from) : undefined,
    to !== undefined ? lte(cashSnapshotsTable.snapshotDate, to) : undefined,
  ].filter((c) => c !== undefined) as Parameters<typeof and>;

  const rows = await db
    .select({
      id: cashSnapshotsTable.id,
      cashAccountId: cashSnapshotsTable.cashAccountId,
      snapshotDate: cashSnapshotsTable.snapshotDate,
      balance: cashSnapshotsTable.balance,
      loggedAt: cashSnapshotsTable.loggedAt,
      paycheckId: cashSnapshotsTable.paycheckId,
      paycheckMonth: paychecksTable.month,
      paycheckSeq: paychecksTable.seq,
    })
    .from(cashSnapshotsTable)
    .leftJoin(paychecksTable, eq(cashSnapshotsTable.paycheckId, paychecksTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(cashSnapshotsTable.snapshotDate);

  res.json(rows.map((s) => ({
    ...s,
    balance: Number(s.balance),
    loggedAt: s.loggedAt ? s.loggedAt.toISOString() : null,
  })));
});

router.post("/cash-snapshots", async (req, res): Promise<void> => {
  const data = parseBody(
    z.object({
      cashAccountId: z.number().int(),
      snapshotDate: z.string().regex(DATE_RE),
      balance: z.number().min(0),
      paycheckId: z.number().int().nullable().optional(),
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

  // Validate paycheckId if provided
  if (data.paycheckId) {
    const [pc] = await db.select({ id: paychecksTable.id }).from(paychecksTable).where(eq(paychecksTable.id, data.paycheckId));
    if (!pc) { res.status(404).json({ error: "Paycheck not found" }); return; }
  }

  const [snap] = await db
    .insert(cashSnapshotsTable)
    .values({
      cashAccountId: data.cashAccountId,
      snapshotDate: data.snapshotDate,
      balance: money(data.balance),
      loggedAt: new Date(),
      paycheckId: data.paycheckId ?? null,
    })
    .returning();

  res.status(201).json({ ...snap, balance: Number(snap.balance), loggedAt: snap.loggedAt ? snap.loggedAt.toISOString() : null });
});

export default router;
