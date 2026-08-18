/**
 * The export endpoint is the app's only backup. A table missing from it is
 * silent — the file downloads, looks complete, and simply does not contain
 * that data. Period notes, journal links and the whole cash spending log were
 * all missing, so the second test counts the schema's tables rather than
 * trusting a hand-written list that can drift the same way again.
 */

import { describe, expect, it } from "vitest";
import request from "supertest";
import * as schema from "@workspace/db";
import app from "../../app.js";

/** Every exported payload key that is a table dump. */
const EXPORTED_KEYS = [
  "paychecks",
  "debtAccounts",
  "debtSnapshots",
  "cashAccounts",
  "cashSnapshots",
  "allocations",
  "extraIncome",
  "subscriptions",
  "bills",
  "journalEntries",
  "dayHighlights",
  "journalPeriodNotes",
  "journalLinks",
  "cashSpendingLog",
  "exercises",
  "efforts",
  "foodItems",
  "foodActivities",
] as const;

describe("GET /api/export", () => {
  it("returns an array for every table it claims to dump", async () => {
    const res = await request(app).get("/api/export");
    expect(res.status).toBe(200);
    for (const key of EXPORTED_KEYS) {
      expect(Array.isArray(res.body[key]), `${key} should be an array`).toBe(true);
    }
    expect(typeof res.body.exportedAt).toBe("string");
  });

  it("covers every table in the schema — a new table must be added here too", () => {
    // Drizzle tags each table object with its SQL name under a well-known
    // symbol, so counting the tagged exports counts the tables without having
    // to keep a second hand-written list in step with the first.
    const nameSymbol = Object.getOwnPropertySymbols(schema.paychecksTable).find(
      (sym) => sym.description === "drizzle:Name",
    )!;
    const tableCount = Object.values(schema as Record<string, unknown>).filter(
      (value) => typeof value === "object" && value !== null && nameSymbol in value,
    ).length;

    expect(tableCount).toBe(EXPORTED_KEYS.length);
  });

  it("offers the dump as a dated file download", async () => {
    const res = await request(app).get("/api/export");
    expect(res.headers["content-disposition"]).toMatch(
      /^attachment; filename="zh-export-\d{4}-\d{2}-\d{2}\.json"$/,
    );
  });
});
