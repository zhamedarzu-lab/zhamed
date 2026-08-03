import { Router, type IRouter } from "express";
import { and, desc, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  allocationsTable,
  debtAccountsTable,
  debtSnapshotsTable,
  paychecksTable,
} from "@workspace/db";
import { DATE_RE, money, optionalDateQuery, optionalIdQuery, parseBody, parseId, round } from "./shared.js";

const router: IRouter = Router();

const KIND = z.enum(["card", "bnpl", "loan", "other"]);

router.get("/debt-accounts", async (_req, res): Promise<void> => {
  const [accounts, snapshots, pendingAllocs] = await Promise.all([
    db.select().from(debtAccountsTable).orderBy(debtAccountsTable.sortOrder),
    db.select().from(debtSnapshotsTable).orderBy(desc(debtSnapshotsTable.snapshotDate)),
    // Paycheck money tagged for a card that hasn't been folded into a balance
    // update yet — powers the "sent since last update" prompt on the Debt page.
    db
      .select({ debtAccountId: allocationsTable.debtAccountId, amount: allocationsTable.amount })
      .from(allocationsTable)
      .where(
        and(isNotNull(allocationsTable.debtAccountId), isNull(allocationsTable.appliedSnapshotId)),
      ),
  ]);

  // Snapshots arrive newest-first, so the first one seen per account is latest.
  const latestByAccount = new Map<number, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    if (!latestByAccount.has(s.debtAccountId)) latestByAccount.set(s.debtAccountId, s);
  }

  const pendingByAccount = new Map<number, number>();
  for (const p of pendingAllocs) {
    if (p.debtAccountId == null) continue;
    pendingByAccount.set(
      p.debtAccountId,
      (pendingByAccount.get(p.debtAccountId) ?? 0) + Number(p.amount),
    );
  }

  res.json(
    accounts.map((a) => {
      const latest = latestByAccount.get(a.id);
      return {
        ...a,
        creditLimit: a.creditLimit != null ? Number(a.creditLimit) : null,
        currentBalance: latest ? Number(latest.balance) : null,
        lastUpdated: latest ? latest.snapshotDate : null,
        pendingPayment: round(pendingByAccount.get(a.id) ?? 0),
      };
    }),
  );
});

router.post("/debt-accounts", async (req, res): Promise<void> => {
  const data = parseBody(
    z.object({ name: z.string().min(1), kind: KIND.optional() }),
    req.body,
    res,
  );
  if (!data) return;

  const [account] = await db
    .insert(debtAccountsTable)
    .values({ name: data.name, kind: data.kind ?? "other" })
    .returning();
  res.status(201).json(account);
});

router.patch("/debt-accounts/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const data = parseBody(
    z.object({
      name: z.string().min(1).optional(),
      kind: KIND.optional(),
      active: z.boolean().optional(),
      creditLimit: z.number().min(0).nullable().optional(),
    }),
    req.body,
    res,
  );
  if (!data) return;

  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.kind !== undefined) update.kind = data.kind;
  if (data.active !== undefined) update.active = data.active;
  if (data.creditLimit !== undefined) {
    update.creditLimit = data.creditLimit == null ? null : money(data.creditLimit);
  }

  const [account] = await db
    .update(debtAccountsTable)
    .set(update)
    .where(eq(debtAccountsTable.id, id))
    .returning();
  if (!account) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({
    ...account,
    creditLimit: account.creditLimit != null ? Number(account.creditLimit) : null,
  });
});

router.delete("/debt-accounts/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  await db.delete(debtAccountsTable).where(eq(debtAccountsTable.id, id));
  res.sendStatus(204);
});

// ── Debt payments (paycheck allocations linked to a card) ─────────────────────

router.get("/debt-payments", async (req, res): Promise<void> => {
  const accountId = optionalIdQuery(req.query.accountId);

  const rows = await db
    .select({
      id: allocationsTable.id,
      amount: allocationsTable.amount,
      note: allocationsTable.note,
      debtAccountId: allocationsTable.debtAccountId,
      appliedSnapshotId: allocationsTable.appliedSnapshotId,
      paycheckId: paychecksTable.id,
      month: paychecksTable.month,
      seq: paychecksTable.seq,
    })
    .from(allocationsTable)
    .innerJoin(paychecksTable, eq(allocationsTable.paycheckId, paychecksTable.id))
    .where(
      accountId !== undefined
        ? eq(allocationsTable.debtAccountId, accountId)
        : isNotNull(allocationsTable.debtAccountId),
    )
    .orderBy(desc(paychecksTable.month), desc(paychecksTable.seq));

  res.json(
    rows.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      note: r.note,
      debtAccountId: r.debtAccountId,
      applied: r.appliedSnapshotId != null,
      paycheckId: r.paycheckId,
      month: r.month,
      seq: r.seq,
    })),
  );
});

// ── Debt snapshots ────────────────────────────────────────────────────────────

router.get("/debt-snapshots", async (req, res): Promise<void> => {
  const accountId = optionalIdQuery(req.query.accountId);
  const from = optionalDateQuery(req.query.from);
  const to = optionalDateQuery(req.query.to);

  const conditions = [
    accountId !== undefined ? eq(debtSnapshotsTable.debtAccountId, accountId) : undefined,
    from !== undefined ? gte(debtSnapshotsTable.snapshotDate, from) : undefined,
    to !== undefined ? lte(debtSnapshotsTable.snapshotDate, to) : undefined,
  ].filter((c) => c !== undefined) as Parameters<typeof and>;

  const rows = await db
    .select({
      id: debtSnapshotsTable.id,
      debtAccountId: debtSnapshotsTable.debtAccountId,
      snapshotDate: debtSnapshotsTable.snapshotDate,
      balance: debtSnapshotsTable.balance,
      amountPaid: debtSnapshotsTable.amountPaid,
      paycheckId: debtSnapshotsTable.paycheckId,
      paycheckMonth: paychecksTable.month,
      paycheckSeq: paychecksTable.seq,
      loggedAt: debtSnapshotsTable.loggedAt,
    })
    .from(debtSnapshotsTable)
    .leftJoin(paychecksTable, eq(debtSnapshotsTable.paycheckId, paychecksTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(debtSnapshotsTable.snapshotDate);

  res.json(
    rows.map((s) => ({
      ...s,
      balance: Number(s.balance),
      amountPaid: Number(s.amountPaid),
      loggedAt: s.loggedAt ? s.loggedAt.toISOString() : null,
    })),
  );
});

router.post("/debt-snapshots", async (req, res): Promise<void> => {
  const data = parseBody(
    z.object({
      debtAccountId: z.number().int(),
      snapshotDate: z.string().regex(DATE_RE),
      balance: z.number().min(0),
      amountPaid: z.number().min(0).optional(),
      // Optional "this is as of payday X" tag instead of just the date.
      paycheckId: z.number().int().nullable().optional(),
    }),
    req.body,
    res,
  );
  if (!data) return;

  const [account] = await db
    .select({ id: debtAccountsTable.id })
    .from(debtAccountsTable)
    .where(eq(debtAccountsTable.id, data.debtAccountId));
  if (!account) {
    res.status(404).json({ error: "Debt account not found" });
    return;
  }

  if (data.paycheckId != null) {
    const [paycheck] = await db
      .select({ id: paychecksTable.id })
      .from(paychecksTable)
      .where(eq(paychecksTable.id, data.paycheckId));
    if (!paycheck) {
      res.status(404).json({ error: "Paycheck not found" });
      return;
    }
  }

  // Recording the balance and clearing the pending payments that it accounts
  // for must happen together, or the Debt page double-counts them.
  const snap = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(debtSnapshotsTable)
      .values({
        debtAccountId: data.debtAccountId,
        snapshotDate: data.snapshotDate,
        balance: money(data.balance),
        amountPaid: money(data.amountPaid ?? 0),
        paycheckId: data.paycheckId ?? null,
        loggedAt: new Date(),
      })
      .returning();

    await tx
      .update(allocationsTable)
      .set({ appliedSnapshotId: inserted.id })
      .where(
        and(
          eq(allocationsTable.debtAccountId, data.debtAccountId),
          isNull(allocationsTable.appliedSnapshotId),
        ),
      );

    return inserted;
  });

  res.status(201).json({
    ...snap,
    balance: Number(snap.balance),
    amountPaid: Number(snap.amountPaid),
  });
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
      .map(([date, total]) => ({ date, total: round(total) })),
  );
});

export default router;
