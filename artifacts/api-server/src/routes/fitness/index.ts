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
  name:          z.string().min(1).max(200).trim(),
  unit:          z.string().min(1).max(50).trim(),
  color:         z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  active:        z.boolean().optional(),
  sortOrder:     z.number().int().optional(),
  goalAmount:    z.number().positive().nullable().optional(),
  goalPeriod:    z.enum(["day", "week", "month"]).nullable().optional(),
  goalDeadline:  z.string().regex(DATE_RE).nullable().optional(),
  goalStartDate: z.string().regex(DATE_RE).nullable().optional(),
});

router.post("/exercises", async (req, res): Promise<void> => {
  const data = parseBody(ExerciseInput, req.body, res);
  if (!data) return;
  // Everything ExerciseInput accepts gets written. The insert used to take
  // only name/unit/colour, so an exercise created with a goal came back
  // without one and the caller had to PATCH it straight back in.
  const [row] = await db
    .insert(exercisesTable)
    .values({
      name:  data.name,
      unit:  data.unit,
      color: data.color ?? null,
      ...(data.active    !== undefined ? { active:    data.active    } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      goalAmount:    data.goalAmount != null ? String(data.goalAmount) : null,
      goalPeriod:    data.goalPeriod    ?? null,
      goalDeadline:  data.goalDeadline  ?? null,
      goalStartDate: data.goalStartDate ?? null,
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/exercises/:id", async (req, res): Promise<void> => {
  const id   = parseId(req.params.id);
  const data = parseBody(ExerciseInput.partial(), req.body, res);
  if (!data) return;

  const [existing] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const update: Partial<typeof exercisesTable.$inferInsert> = {};
  if (data.name       !== undefined) update.name       = data.name;
  if (data.unit       !== undefined) update.unit       = data.unit;
  if (data.color      !== undefined) update.color      = data.color;
  if (data.active     !== undefined) update.active     = data.active;
  if (data.sortOrder  !== undefined) update.sortOrder  = data.sortOrder;
  if (data.goalAmount    !== undefined) update.goalAmount    = data.goalAmount !== null ? String(data.goalAmount) : null;
  if (data.goalPeriod    !== undefined) update.goalPeriod    = data.goalPeriod ?? null;
  if (data.goalDeadline  !== undefined) update.goalDeadline  = data.goalDeadline  ?? null;
  if (data.goalStartDate !== undefined) update.goalStartDate = data.goalStartDate ?? null;

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

router.put("/exercises/reorder", async (req, res): Promise<void> => {
  const data = parseBody(z.object({ ids: z.array(z.number().int()).min(1) }), req.body, res);
  if (!data) return;
  await Promise.all(
    data.ids.map((id, i) =>
      db.update(exercisesTable).set({ sortOrder: i + 1 }).where(eq(exercisesTable.id, id))
    )
  );
  res.json({ ok: true });
});

// ─── Efforts ─────────────────────────────────────────────────────────────────

const SLOTS = [
  "early morning", "morning", "after morning",
  "noon", "afternoon", "evening", "night", "midnight",
] as const;
type Slot = typeof SLOTS[number];

function autoSlot(): Slot {
  const h = new Date().getHours();
  if (h >=  5 && h <  8) return "early morning";
  if (h >=  8 && h < 11) return "morning";
  if (h >= 11 && h < 12) return "after morning";
  if (h >= 12 && h < 13) return "noon";
  if (h >= 13 && h < 17) return "afternoon";
  if (h >= 17 && h < 20) return "evening";
  if (h >= 20 && h < 23) return "night";
  return "midnight";
}

router.get("/efforts", async (req, res): Promise<void> => {
  const from       = typeof req.query.from       === "string" ? req.query.from       : undefined;
  const to         = typeof req.query.to         === "string" ? req.query.to         : undefined;
  const exerciseId = typeof req.query.exerciseId === "string" ? parseInt(req.query.exerciseId, 10) : undefined;

  if (from && !DATE_RE.test(from)) { res.status(400).json({ error: "from must be YYYY-MM-DD" }); return; }
  if (to   && !DATE_RE.test(to))   { res.status(400).json({ error: "to must be YYYY-MM-DD" });   return; }

  const conditions = [
    from                          ? gte(effortsTable.date,       from)       : undefined,
    to                            ? lte(effortsTable.date,       to)         : undefined,
    exerciseId && !isNaN(exerciseId) ? eq(effortsTable.exerciseId, exerciseId) : undefined,
  ].filter(Boolean) as ReturnType<typeof eq>[];

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
  amount:     z.number().positive(),
  slot:       z.enum(SLOTS).optional(),
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
      slot:       data.slot ?? autoSlot(),
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

router.get("/summary", async (req, res): Promise<void> => {
  const todayParam = typeof req.query.today === "string" && DATE_RE.test(req.query.today)
    ? req.query.today
    : null;
  const today = todayParam ?? todayIso();

  // Rolling windows
  const d14ago = offsetDate(today, -13);

  // Calendar week start (Sunday)
  const weekStart = (() => {
    const d = new Date(today + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.toISOString().slice(0, 10);
  })();

  // Calendar month start
  const monthStart = today.slice(0, 8) + "01";

  // Fetch exercises first so we can extend the query window to cover deadline goalStartDates
  const exercises = await db
    .select()
    .from(exercisesTable)
    .orderBy(asc(exercisesTable.sortOrder), asc(exercisesTable.name));

  // Query window: 14-day sparkline, full week, full month, and any goal start dates
  const goalStartDates = exercises.map(ex => ex.goalStartDate).filter((d): d is string => !!d);
  const queryFrom = [...[d14ago, weekStart, monthStart], ...goalStartDates].sort()[0]!;

  // Fetch windowed efforts (for periods/sparkline/deadlines) and the all-time
  // per-(exercise, date) aggregates for best-day — both run in parallel.
  // The aggregation uses the exercise_id index (group by exercise + date) so
  // it never does a full sequential scan across all exercises.
  const [efforts, bestDayAgg] = await Promise.all([
    db.select()
      .from(effortsTable)
      .where(and(gte(effortsTable.date, queryFrom), lte(effortsTable.date, today)))
      .orderBy(asc(effortsTable.date)),
    db.select({
        exerciseId: effortsTable.exerciseId,
        date:       effortsTable.date,
        total:      sql<string>`SUM(${effortsTable.amount})`,
      })
      .from(effortsTable)
      .where(lte(effortsTable.date, today))
      .groupBy(effortsTable.exerciseId, effortsTable.date),
  ]);

  // Pre-build a map: exerciseId → (date → dailyTotal) from the aggregated results
  const allTimeByExDate = new Map<number, Map<string, number>>();
  for (const r of bestDayAgg) {
    let byDate = allTimeByExDate.get(r.exerciseId);
    if (!byDate) { byDate = new Map(); allTimeByExDate.set(r.exerciseId, byDate); }
    byDate.set(r.date, Number(r.total));
  }

  // Consistency strip: which of the last 14 days had any effort
  const activeDates = new Set(efforts.filter((e) => e.date >= d14ago).map((e) => e.date));
  const consistencyStrip: Array<{ date: string; active: boolean }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = offsetDate(today, -i);
    consistencyStrip.push({ date: d, active: activeDates.has(d) });
  }

  // Group recent efforts by exercise
  const effortsByEx = new Map<number, typeof efforts>();
  for (const e of efforts) {
    const list = effortsByEx.get(e.exerciseId) ?? [];
    list.push(e);
    effortsByEx.set(e.exerciseId, list);
  }

  const perExercise = exercises.map((ex) => {
    const rows = effortsByEx.get(ex.id) ?? [];

    // Build date→total map for the full query window
    const byDate = new Map<string, number>();
    for (const r of rows) byDate.set(r.date, (byDate.get(r.date) ?? 0) + Number(r.amount));

    // Today
    const todayTotal = byDate.get(today) ?? 0;

    // This calendar week (Sun–today)
    let weekTotal = 0;
    for (const [d, v] of byDate) { if (d >= weekStart) weekTotal += v; }

    // This calendar month (1st–today)
    let monthTotal = 0;
    for (const [d, v] of byDate) { if (d >= monthStart) monthTotal += v; }

    // Last 7 rolling days
    let last7 = 0;
    for (let i = 6; i >= 0; i--) last7 += byDate.get(offsetDate(today, -i)) ?? 0;

    // Previous 7 rolling days
    let prev7 = 0;
    for (let i = 13; i >= 7; i--) prev7 += byDate.get(offsetDate(today, -i)) ?? 0;

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

    // Sparkline: last 14 days
    const sparkline: Array<{ date: string; value: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = offsetDate(today, -i);
      sparkline.push({ date: d, value: byDate.get(d) ?? 0 });
    }

    // Deadline total: sum of efforts from goalStartDate through today
    let deadlineTotal = 0;
    if (ex.goalStartDate) {
      for (const [d, v] of byDate) {
        if (d >= ex.goalStartDate && d <= today) deadlineTotal += v;
      }
    }

    return {
      exerciseId:    ex.id,
      name:          ex.name,
      unit:          ex.unit,
      color:         ex.color ?? null,
      active:        ex.active,
      sortOrder:     ex.sortOrder,
      goalAmount:    ex.goalAmount !== null && ex.goalAmount !== undefined ? Number(ex.goalAmount) : null,
      goalPeriod:    ex.goalPeriod ?? null,
      goalDeadline:  ex.goalDeadline  ?? null,
      goalStartDate: ex.goalStartDate ?? null,
      todayTotal,
      weekTotal,
      monthTotal,
      deadlineTotal,
      last7,
      prev7,
      delta,
      bestDay,
      sparkline,
    };
  });

  res.set("Cache-Control", "no-store");
  res.json({ consistencyStrip, exercises: perExercise });
});

// ─── Vitality / Health Score ─────────────────────────────────────────────────

router.get("/health", async (req, res): Promise<void> => {
  const todayParam = typeof req.query.today === "string" && DATE_RE.test(req.query.today)
    ? req.query.today : null;
  const today = todayParam ?? todayIso();

  // Only active exercises with repeating periodic goals
  const exercises = await db.select().from(exercisesTable)
    .where(eq(exercisesTable.active, true));
  const goalExercises = exercises.filter(
    ex => ex.goalAmount && ["day", "week", "month"].includes(ex.goalPeriod ?? "")
  );

  if (goalExercises.length === 0) {
    res.json({ hasGoals: false, byPeriod: {} });
    return;
  }

  // Fetch all efforts back to the earliest goal start date (or 2 years max)
  const explicitStart = goalExercises
    .map(ex => ex.goalStartDate)
    .filter(Boolean) as string[];
  const effortsFrom = explicitStart.length
    ? explicitStart.reduce((a, b) => (a < b ? a : b))
    : offsetDate(today, -730);

  const efforts = await db.select().from(effortsTable)
    .where(and(gte(effortsTable.date, effortsFrom), lte(effortsTable.date, today)));

  // exerciseId → date → total
  const byExDate = new Map<number, Map<string, number>>();
  for (const e of efforts) {
    let m = byExDate.get(e.exerciseId);
    if (!m) { m = new Map(); byExDate.set(e.exerciseId, m); }
    m.set(e.date, (m.get(e.date) ?? 0) + Number(e.amount));
  }

  // exerciseId → earliest effort date (used as anchor when goalStartDate is null)
  const firstEffortDate = new Map<number, string>();
  for (const [exId, dateMap] of byExDate) {
    const earliest = [...dateMap.keys()].sort()[0];
    if (earliest) firstEffortDate.set(exId, earliest);
  }

  function rangeTotal(exerciseId: number, start: string, end: string): number {
    let tot = 0;
    for (const [d, v] of (byExDate.get(exerciseId) ?? new Map())) {
      if (d >= start && d <= end) tot += v;
    }
    return tot;
  }

  // All fully-closed periods from `anchor` to yesterday (today is still in progress)
  function periodsFrom(anchor: string, goalPeriod: "day" | "week" | "month") {
    const out: Array<{ start: string; end: string }> = [];

    if (goalPeriod === "day") {
      const yesterday = offsetDate(today, -1);
      let d = anchor <= yesterday ? anchor : yesterday;
      while (d <= yesterday && out.length < 730) {
        out.push({ start: d, end: d });
        d = offsetDate(d, 1);
      }

    } else if (goalPeriod === "week") {
      // Sun–Sat weeks where the Saturday is < today
      const anchorDate = new Date(anchor + "T12:00:00Z");
      const dow = anchorDate.getUTCDay(); // 0=Sun
      // Roll back to the Sunday of the week containing anchor
      const firstSun = new Date(anchorDate);
      firstSun.setUTCDate(firstSun.getUTCDate() - dow);

      let sunDate = new Date(firstSun);
      while (out.length < 260) {
        const satDate = new Date(sunDate);
        satDate.setUTCDate(satDate.getUTCDate() + 6);
        const satStr = satDate.toISOString().slice(0, 10);
        if (satStr >= today) break; // week not complete yet
        const sunStr = sunDate.toISOString().slice(0, 10);
        out.push({ start: sunStr, end: satStr });
        sunDate.setUTCDate(sunDate.getUTCDate() + 7);
      }

    } else { // month
      const todayYM = today.slice(0, 7); // YYYY-MM
      let yr = parseInt(anchor.slice(0, 4));
      let mo = parseInt(anchor.slice(5, 7)) - 1; // 0-indexed
      while (out.length < 60) {
        const ym = `${yr}-${String(mo + 1).padStart(2, "0")}`;
        if (ym >= todayYM) break; // current month not done yet
        const lastDay = new Date(Date.UTC(yr, mo + 1, 0));
        out.push({ start: `${ym}-01`, end: lastDay.toISOString().slice(0, 10) });
        if (++mo > 11) { mo = 0; yr++; }
      }
    }

    return out;
  }

  type ScoredExercise = {
    exerciseId: number; name: string; color: string | null;
    goalAmount: number; goalPeriod: "day" | "week" | "month";
    score: number; periodsHit: number; periodsTotal: number;
  };

  function scoreAgainst(
    ex: typeof exercises[number],
    goal: number,
    period: "day" | "week" | "month",
  ): ScoredExercise {
    const anchor  = ex.goalStartDate ?? firstEffortDate.get(ex.id) ?? today;
    const periods = periodsFrom(anchor, period);

    if (periods.length === 0) {
      return { exerciseId: ex.id, name: ex.name, color: ex.color, goalAmount: goal, goalPeriod: period, score: 100, periodsHit: 0, periodsTotal: 0 };
    }

    let completionSum = 0, periodsHit = 0;
    for (const p of periods) {
      const completion = Math.min(1, rangeTotal(ex.id, p.start, p.end) / goal);
      completionSum += completion;
      if (completion >= 1) periodsHit++;
    }

    const score = Math.round((completionSum / periods.length) * 100);
    return { exerciseId: ex.id, name: ex.name, color: ex.color, goalAmount: goal, goalPeriod: period, score, periodsHit, periodsTotal: periods.length };
  }

  function scoreExercise(ex: typeof exercises[number]): ScoredExercise {
    return scoreAgainst(ex, Number(ex.goalAmount!), ex.goalPeriod as "day" | "week" | "month");
  }

  const byPeriod: Record<string, { score: number; exercises: ScoredExercise[] }> = {};

  // Daily group: explicit day-goals + weekly-goal exercises scored at weeklyGoal/7 per day
  const dailyScored: ScoredExercise[] = [
    ...goalExercises.filter(ex => ex.goalPeriod === "day").map(scoreExercise),
    ...goalExercises.filter(ex => ex.goalPeriod === "week").map(ex =>
      scoreAgainst(ex, Number(ex.goalAmount!) / 7, "day")
    ),
  ];
  if (dailyScored.length > 0) {
    byPeriod["day"] = {
      score: Math.round(dailyScored.reduce((s, e) => s + e.score, 0) / dailyScored.length),
      exercises: dailyScored,
    };
  }

  // Weekly and monthly groups (scored against their own period)
  for (const periodType of ["week", "month"] as const) {
    const group = goalExercises.filter(ex => ex.goalPeriod === periodType);
    if (group.length === 0) continue;
    const scored = group.map(scoreExercise);
    const score  = Math.round(scored.reduce((s, e) => s + e.score, 0) / scored.length);
    byPeriod[periodType] = { score, exercises: scored };
  }

  res.json({ hasGoals: true, byPeriod });
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
