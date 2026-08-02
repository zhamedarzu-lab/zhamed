import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";
import { exercisesTable, effortsTable } from "@workspace/db";
import { DATE_RE, parseBody, parseId } from "../finance/shared.js";

const router: IRouter = Router();

// ─── Exercises ───────────────────────────────────────────────────────────────

router.get("/exercises", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(exercisesTable)
    .orderBy(asc(exercisesTable.sortOrder), asc(exercisesTable.name));
  res.json(rows);
});

const ExerciseInput = z.object({
  name:      z.string().min(1).max(200).trim(),
  unit:      z.string().min(1).max(50).trim(),
  active:    z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

router.post("/exercises", async (req, res): Promise<void> => {
  const data = parseBody(ExerciseInput, req.body, res);
  if (!data) return;
  const [row] = await db
    .insert(exercisesTable)
    .values({ name: data.name, unit: data.unit })
    .returning();
  res.status(201).json(row);
});

router.patch("/exercises/:id", async (req, res): Promise<void> => {
  const id   = parseId(req.params.id);
  const data = parseBody(ExerciseInput.partial(), req.body, res);
  if (!data) return;

  const [existing] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const update: Record<string, unknown> = {};
  if (data.name      !== undefined) update.name      = data.name;
  if (data.unit      !== undefined) update.unit      = data.unit;
  if (data.active    !== undefined) update.active    = data.active;
  if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;

  if (Object.keys(update).length > 0) {
    await db.update(exercisesTable).set(update).where(eq(exercisesTable.id, id));
  }
  res.json({ ok: true });
});

router.delete("/exercises/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  await db.delete(exercisesTable).where(eq(exercisesTable.id, id));
  res.sendStatus(204);
});

// ─── Efforts ─────────────────────────────────────────────────────────────────

const SLOTS = ["morning", "noon", "evening", "night"] as const;
type Slot = typeof SLOTS[number];

router.get("/efforts", async (req, res): Promise<void> => {
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to   = typeof req.query.to   === "string" ? req.query.to   : undefined;

  if (from && !DATE_RE.test(from)) { res.status(400).json({ error: "from must be YYYY-MM-DD" }); return; }
  if (to   && !DATE_RE.test(to))   { res.status(400).json({ error: "to must be YYYY-MM-DD" });   return; }

  const conditions = [
    from ? gte(effortsTable.date, from) : undefined,
    to   ? lte(effortsTable.date, to)   : undefined,
  ].filter(Boolean) as ReturnType<typeof gte>[];

  const rows = await db
    .select()
    .from(effortsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(effortsTable.date), asc(effortsTable.id));

  res.json(rows.map(shapeEffort));
});

const EffortInput = z.object({
  exerciseId: z.number().int().positive(),
  date:       z.string().regex(DATE_RE),
  slot:       z.enum(SLOTS).optional().default("morning"),
  amount:     z.number().positive(),
});

router.post("/efforts", async (req, res): Promise<void> => {
  const data = parseBody(EffortInput, req.body, res);
  if (!data) return;

  const [ex] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, data.exerciseId));
  if (!ex) { res.status(404).json({ error: "Exercise not found" }); return; }

  const [row] = await db
    .insert(effortsTable)
    .values({
      exerciseId: data.exerciseId,
      date:       data.date,
      slot:       data.slot as Slot,
      amount:     String(data.amount),
    })
    .returning();
  res.status(201).json(shapeEffort(row));
});

router.delete("/efforts/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  await db.delete(effortsTable).where(eq(effortsTable.id, id));
  res.sendStatus(204);
});

// ─── Summary ─────────────────────────────────────────────────────────────────

router.get("/summary", async (_req, res): Promise<void> => {
  // Rolling windows relative to today
  const today     = todayIso();
  const d14ago    = offsetDate(today, -13); // 14-day window start
  const d7ago     = offsetDate(today, -6);  // last-7 window start
  const d8ago     = offsetDate(today, -7);  // prev-7 window end
  const d14agoEx  = offsetDate(today, -13); // prev-7 window start (same as d14ago)

  const [exercises, efforts] = await Promise.all([
    db.select().from(exercisesTable).orderBy(asc(exercisesTable.sortOrder), asc(exercisesTable.name)),
    db.select().from(effortsTable)
      .where(gte(effortsTable.date, d14ago))
      .orderBy(asc(effortsTable.date)),
  ]);

  // Consistency strip: which of the last 14 days had any effort at all
  const activeDates = new Set(efforts.map((e) => e.date));
  const consistencyStrip: Array<{ date: string; active: boolean }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = offsetDate(today, -i);
    consistencyStrip.push({ date: d, active: activeDates.has(d) });
  }

  // Per-exercise stats — also need all-time best, so fetch unbounded for best day
  const allEfforts = await db
    .select({
      exerciseId: effortsTable.exerciseId,
      date:       effortsTable.date,
      amount:     effortsTable.amount,
    })
    .from(effortsTable);

  // Group all-time by exercise → date → total for best day
  const allTimeByExDate = new Map<number, Map<string, number>>();
  for (const e of allEfforts) {
    let byDate = allTimeByExDate.get(e.exerciseId);
    if (!byDate) { byDate = new Map(); allTimeByExDate.set(e.exerciseId, byDate); }
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + Number(e.amount));
  }

  // Group last-14 by exercise
  const last14ByEx = new Map<number, typeof efforts>();
  for (const e of efforts) {
    const list = last14ByEx.get(e.exerciseId) ?? [];
    list.push(e);
    last14ByEx.set(e.exerciseId, list);
  }

  const perExercise = exercises.map((ex) => {
    const rows   = last14ByEx.get(ex.id) ?? [];
    const byDate = new Map<string, number>();
    for (const r of rows) byDate.set(r.date, (byDate.get(r.date) ?? 0) + Number(r.amount));

    // Today
    const todayTotal = byDate.get(today) ?? 0;

    // Last 7 days (today − 6 through today)
    let last7 = 0;
    for (let i = 6; i >= 0; i--) {
      last7 += byDate.get(offsetDate(today, -i)) ?? 0;
    }
    // Previous 7 days (today − 13 through today − 7)
    let prev7 = 0;
    for (let i = 13; i >= 7; i--) {
      prev7 += byDate.get(offsetDate(today, -i)) ?? 0;
    }

    const delta = prev7 === 0
      ? (last7 > 0 ? 100 : 0)
      : Math.round(((last7 - prev7) / prev7) * 100);

    // Best single day (all time)
    let bestDay: { date: string; amount: number } | null = null;
    const allByDate = allTimeByExDate.get(ex.id);
    if (allByDate) {
      for (const [d, total] of allByDate) {
        if (!bestDay || total > bestDay.amount) bestDay = { date: d, amount: total };
      }
    }

    // Sparkline: daily totals for last 14 days
    const sparkline: Array<{ date: string; value: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = offsetDate(today, -i);
      sparkline.push({ date: d, value: byDate.get(d) ?? 0 });
    }

    return {
      exerciseId:  ex.id,
      name:        ex.name,
      unit:        ex.unit,
      active:      ex.active,
      sortOrder:   ex.sortOrder,
      todayTotal,
      last7,
      prev7,
      delta,
      bestDay,
      sparkline,
    };
  });

  res.json({ consistencyStrip, exercises: perExercise });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function offsetDate(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z"); // noon UTC avoids DST edge
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shapeEffort(r: {
  id: number;
  exerciseId: number;
  date: string;
  slot: Slot;
  amount: string;
}) {
  return {
    id:         r.id,
    exerciseId: r.exerciseId,
    date:       r.date,
    slot:       r.slot,
    amount:     Number(r.amount),
  };
}

export default router;
