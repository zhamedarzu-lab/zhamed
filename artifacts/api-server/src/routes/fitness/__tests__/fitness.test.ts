/**
 * Integration tests for fitness endpoints.
 *
 * Each test manages its own data; cleanup runs in afterEach.
 * Tests run serially (singleFork) to avoid cross-test DB contention.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { exercisesTable, effortsTable } from "@workspace/db";
import app from "../../../app.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

async function makeExercise(overrides: Partial<{
  name: string;
  unit: string;
  color: string | null;
}> = {}) {
  const [row] = await db
    .insert(exercisesTable)
    .values({ name: overrides.name ?? "Pull-ups", unit: overrides.unit ?? "reps", color: overrides.color ?? null })
    .returning();
  return row!;
}

async function makeEffort(exerciseId: number, opts: { date?: string; amount?: number; slot?: string } = {}) {
  const [row] = await db
    .insert(effortsTable)
    .values({
      exerciseId,
      date:   opts.date   ?? "2099-01-15",
      slot:   (opts.slot  ?? "morning") as "morning",
      amount: String((opts.amount ?? 10).toFixed(2)),
    })
    .returning();
  return row!;
}

// ─── shared state ─────────────────────────────────────────────────────────────

let exId: number;

beforeEach(async () => {
  const ex = await makeExercise();
  exId = ex.id;
});

afterEach(async () => {
  await db.delete(effortsTable).where(eq(effortsTable.exerciseId, exId));
  await db.delete(exercisesTable).where(eq(exercisesTable.id, exId));
});

// ─── GET /api/fitness/exercises ───────────────────────────────────────────────

describe("GET /api/fitness/exercises", () => {
  it("returns the seeded exercise in the list", async () => {
    const res = await request(app).get("/api/fitness/exercises");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = (res.body as Array<{ id: number; name: string }>).find((e) => e.id === exId);
    expect(found).toBeDefined();
    expect(found!.name).toBe("Pull-ups");
  });
});

// ─── POST /api/fitness/efforts ────────────────────────────────────────────────

describe("POST /api/fitness/efforts", () => {
  it("logs a valid effort and returns the shaped row", async () => {
    const res = await request(app)
      .post("/api/fitness/efforts")
      .send({ exerciseId: exId, date: "2099-06-01", amount: 25, slot: "morning" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      exerciseId: exId,
      date:       "2099-06-01",
      amount:     25,
      slot:       "morning",
    });
    expect(typeof res.body.id).toBe("number");
  });

  it("auto-assigns a slot when slot is omitted", async () => {
    const res = await request(app)
      .post("/api/fitness/efforts")
      .send({ exerciseId: exId, date: "2099-06-02", amount: 10 });

    expect(res.status).toBe(201);
    expect(typeof res.body.slot).toBe("string");
    expect(res.body.slot.length).toBeGreaterThan(0);
  });

  it("returns 400 for an invalid slot value", async () => {
    const res = await request(app)
      .post("/api/fitness/efforts")
      .send({ exerciseId: exId, date: "2099-06-03", amount: 10, slot: "invalid-slot" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when amount is zero or negative", async () => {
    const res = await request(app)
      .post("/api/fitness/efforts")
      .send({ exerciseId: exId, date: "2099-06-04", amount: 0 });

    expect(res.status).toBe(400);
  });

  it("returns 404 when exerciseId does not exist", async () => {
    const res = await request(app)
      .post("/api/fitness/efforts")
      .send({ exerciseId: 9_999_999, date: "2099-06-05", amount: 5 });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/exercise not found/i);
  });
});

// ─── GET /api/fitness/summary ─────────────────────────────────────────────────

describe("GET /api/fitness/summary", () => {
  it("returns consistencyStrip and exercises array", async () => {
    const res = await request(app)
      .get("/api/fitness/summary")
      .query({ today: "2099-03-01" });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.consistencyStrip)).toBe(true);
    expect(res.body.consistencyStrip).toHaveLength(14);
    expect(Array.isArray(res.body.exercises)).toBe(true);
  });

  it("reflects a logged effort in todayTotal", async () => {
    const today = "2099-04-15";
    await makeEffort(exId, { date: today, amount: 42 });

    const res = await request(app)
      .get("/api/fitness/summary")
      .query({ today });

    expect(res.status).toBe(200);
    const entry = (res.body.exercises as Array<{ exerciseId: number; todayTotal: number }>).find(
      (e) => e.exerciseId === exId,
    );
    expect(entry).toBeDefined();
    expect(entry!.todayTotal).toBe(42);
  });

  it("computes bestDay from historical efforts", async () => {
    await makeEffort(exId, { date: "2099-01-01", amount: 100 });
    await makeEffort(exId, { date: "2099-01-02", amount: 50 });

    const res = await request(app)
      .get("/api/fitness/summary")
      .query({ today: "2099-04-01" });

    expect(res.status).toBe(200);
    const entry = (res.body.exercises as Array<{ exerciseId: number; bestDay: { date: string; amount: number } | null }>).find(
      (e) => e.exerciseId === exId,
    );
    expect(entry!.bestDay).toMatchObject({ date: "2099-01-01", amount: 100 });
  });
});

// ─── PATCH /api/fitness/exercises/:id — goal management ──────────────────────

describe("PATCH /api/fitness/exercises/:id (goal)", () => {
  it("sets a goal on an exercise", async () => {
    const res = await request(app)
      .patch(`/api/fitness/exercises/${exId}`)
      .send({ goalAmount: 100, goalPeriod: "week" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify it persisted
    const [row] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, exId));
    expect(Number(row!.goalAmount)).toBe(100);
    expect(row!.goalPeriod).toBe("week");
  });

  it("clears a goal by setting goalAmount to null", async () => {
    // First set a goal
    await db.update(exercisesTable).set({ goalAmount: "50", goalPeriod: "day" }).where(eq(exercisesTable.id, exId));

    const res = await request(app)
      .patch(`/api/fitness/exercises/${exId}`)
      .send({ goalAmount: null, goalPeriod: null });

    expect(res.status).toBe(200);

    const [row] = await db.select().from(exercisesTable).where(eq(exercisesTable.id, exId));
    expect(row!.goalAmount).toBeNull();
    expect(row!.goalPeriod).toBeNull();
  });

  it("returns 404 for a non-existent exercise", async () => {
    const res = await request(app)
      .patch("/api/fitness/exercises/9999999")
      .send({ goalAmount: 10, goalPeriod: "day" });

    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/fitness/exercises/:id ───────────────────────────────────────

describe("DELETE /api/fitness/exercises/:id", () => {
  it("deletes an exercise and its efforts (cascade)", async () => {
    // Create a fresh exercise so afterEach doesn't try to delete the already-gone one
    const ex2 = await makeExercise({ name: "Squats" });
    await makeEffort(ex2.id, { date: "2099-02-01", amount: 20 });

    const res = await request(app).delete(`/api/fitness/exercises/${ex2.id}`);
    expect(res.status).toBe(204);

    // Efforts should be gone via cascade
    const efforts = await db.select().from(effortsTable).where(eq(effortsTable.exerciseId, ex2.id));
    expect(efforts).toHaveLength(0);

    // Exercise should be gone
    const exercises = await db.select().from(exercisesTable).where(eq(exercisesTable.id, ex2.id));
    expect(exercises).toHaveLength(0);
  });
});

describe("POST /api/fitness/exercises", () => {
  it("stores the goal fields the input schema accepts", async () => {
    const res = await request(app).post("/api/fitness/exercises").send({
      name: "Goal On Create",
      unit: "reps",
      color: "#123456",
      goalAmount: 40,
      goalPeriod: "week",
      goalStartDate: "2099-01-01",
    });
    expect(res.status).toBe(201);

    try {
      const [row] = await db
        .select()
        .from(exercisesTable)
        .where(eq(exercisesTable.id, res.body.id));
      expect(Number(row!.goalAmount)).toBe(40);
      expect(row!.goalPeriod).toBe("week");
      expect(row!.goalStartDate).toBe("2099-01-01");
      expect(row!.color).toBe("#123456");
    } finally {
      await db.delete(exercisesTable).where(eq(exercisesTable.id, res.body.id));
    }
  });

  it("leaves the goal columns null when no goal is given", async () => {
    const res = await request(app)
      .post("/api/fitness/exercises")
      .send({ name: "No Goal", unit: "min" });
    expect(res.status).toBe(201);

    try {
      const [row] = await db
        .select()
        .from(exercisesTable)
        .where(eq(exercisesTable.id, res.body.id));
      expect(row!.goalAmount).toBeNull();
      expect(row!.goalPeriod).toBeNull();
      expect(row!.goalDeadline).toBeNull();
      expect(row!.active).toBe(true);
    } finally {
      await db.delete(exercisesTable).where(eq(exercisesTable.id, res.body.id));
    }
  });
});
