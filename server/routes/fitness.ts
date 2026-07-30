import express from "express";
import { and, asc, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { db } from "../db.ts";
import { fitnessLogs } from "../../shared/schema.ts";
import {
  dateRangeQuery,
  fitnessLogCreate,
  fitnessLogPatch,
} from "../../shared/validation.ts";
import { intParam, notFound, parse, route } from "../util.ts";

const router = express.Router();

router.get(
  "/logs",
  route(async (req, res) => {
    const { from, to, tag, limit } = parse(dateRangeQuery, req.query);

    const filters = [
      from ? gte(fitnessLogs.date, from) : undefined,
      to ? lte(fitnessLogs.date, to) : undefined,
      tag ? eq(fitnessLogs.workoutType, tag) : undefined,
    ].filter(Boolean);

    const query = db
      .select()
      .from(fitnessLogs)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(fitnessLogs.date), desc(fitnessLogs.id));

    res.json(limit ? await query.limit(limit) : await query);
  }),
);

/** The labels already in use, for the datalist and the filter dropdown. */
router.get(
  "/types",
  route(async (_req, res) => {
    const rows = await db
      .selectDistinct({ workoutType: fitnessLogs.workoutType })
      .from(fitnessLogs)
      .where(isNotNull(fitnessLogs.workoutType))
      .orderBy(asc(fitnessLogs.workoutType));

    res.json(rows.map((r) => r.workoutType).filter((t): t is string => Boolean(t)));
  }),
);

router.post(
  "/logs",
  route(async (req, res) => {
    const input = parse(fitnessLogCreate, req.body);
    const [row] = await db.insert(fitnessLogs).values(input).returning();
    res.status(201).json(row);
  }),
);

router.patch(
  "/logs/:id",
  route(async (req, res) => {
    const id = intParam(req.params.id);
    const input = parse(fitnessLogPatch, req.body);
    const [row] = await db
      .update(fitnessLogs)
      .set(input)
      .where(eq(fitnessLogs.id, id))
      .returning();
    if (!row) throw notFound("That entry");
    res.json(row);
  }),
);

router.delete(
  "/logs/:id",
  route(async (req, res) => {
    const id = intParam(req.params.id);
    const [row] = await db.delete(fitnessLogs).where(eq(fitnessLogs.id, id)).returning();
    if (!row) throw notFound("That entry");
    res.status(204).end();
  }),
);

export default router;
