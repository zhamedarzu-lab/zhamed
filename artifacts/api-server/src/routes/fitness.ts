import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db, fitnessLogsTable } from "@workspace/db";

const router: IRouter = Router();

function parseId(raw: string): number {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) throw Object.assign(new Error("Invalid id"), { status: 400 });
  return n;
}

// GET /fitness/logs
router.get("/logs", async (req, res): Promise<void> => {
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  const tag = typeof req.query.tag === "string" ? req.query.tag : undefined;
  const limit =
    typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;

  const logs = await db
    .select()
    .from(fitnessLogsTable)
    .where(
      and(
        from ? gte(fitnessLogsTable.date, from) : undefined,
        to ? lte(fitnessLogsTable.date, to) : undefined,
        tag ? eq(fitnessLogsTable.workoutType, tag) : undefined,
      ),
    )
    .orderBy(desc(fitnessLogsTable.date))
    .limit(limit ?? 500);

  res.json(logs);
});

// GET /fitness/types
router.get("/types", async (_req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ workoutType: fitnessLogsTable.workoutType })
    .from(fitnessLogsTable)
    .orderBy(fitnessLogsTable.workoutType);

  res.json(rows.map((r) => r.workoutType).filter(Boolean));
});

// POST /fitness/logs
router.post("/logs", async (req, res): Promise<void> => {
  const parsed = z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      workoutType: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: String(parsed.error) });
    return;
  }

  const [log] = await db
    .insert(fitnessLogsTable)
    .values({
      date: parsed.data.date,
      workoutType: parsed.data.workoutType ?? null,
      notes: parsed.data.notes ?? null,
    })
    .returning();

  res.status(201).json(log);
});

// PATCH /fitness/logs/:id
router.patch("/logs/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);

  const parsed = z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      workoutType: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: String(parsed.error) });
    return;
  }

  const [log] = await db
    .update(fitnessLogsTable)
    .set(parsed.data)
    .where(eq(fitnessLogsTable.id, id))
    .returning();

  if (!log) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(log);
});

// DELETE /fitness/logs/:id
router.delete("/logs/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  await db.delete(fitnessLogsTable).where(eq(fitnessLogsTable.id, id));
  res.sendStatus(204);
});

export default router;
