/**
 * Integration tests for the journal entry endpoints.
 *
 * The journal is the part of the app with the most irreplaceable data in it
 * and had no coverage at all. These pin down the contract the client relies
 * on: a save that did not happen must not answer 200, a date window must not
 * leak entries outside it, and deleting an entry must take its links with it.
 *
 * Each test manages its own data: inserts before the case, deletes after.
 * Tests run serially (singleFork) so there is no cross-test DB contention.
 */

import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { journalEntriesTable, journalLinksTable } from "@workspace/db";
import app from "../../../app.js";

const created: number[] = [];

async function makeEntry(entryDate: string, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/journal/entries")
    .send({ content: "test entry", entryDate, ...overrides });
  expect(res.status).toBe(201);
  created.push(res.body.id);
  return res.body as { id: number; content: string; subject: string | null; color: string };
}

afterEach(async () => {
  if (created.length) {
    await db.delete(journalLinksTable).where(inArray(journalLinksTable.sourceId, created));
    await db.delete(journalEntriesTable).where(inArray(journalEntriesTable.id, created));
    created.length = 0;
  }
});

describe("POST /api/journal/entries", () => {
  it("creates an entry and echoes it back", async () => {
    const entry = await makeEntry("2099-07-04", { subject: "Fourth", content: "fireworks" });
    expect(entry.subject).toBe("Fourth");
    expect(entry.content).toBe("fireworks");
  });

  it("rejects a body with no entryDate", async () => {
    const res = await request(app).post("/api/journal/entries").send({ content: "no date" });
    expect(res.status).toBe(400);
  });

  it("rejects a malformed colour", async () => {
    const res = await request(app)
      .post("/api/journal/entries")
      .send({ content: "x", entryDate: "2099-07-04", color: "red" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/journal/entries", () => {
  it("returns only entries inside the from/to window, inclusive of both ends", async () => {
    const before = await makeEntry("2099-08-01");
    const start = await makeEntry("2099-08-10");
    const end = await makeEntry("2099-08-20");
    const after = await makeEntry("2099-08-30");

    const res = await request(app).get("/api/journal/entries?from=2099-08-10&to=2099-08-20");
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: number }>).map((r) => r.id);

    expect(ids).toContain(start.id);
    expect(ids).toContain(end.id);
    expect(ids).not.toContain(before.id);
    expect(ids).not.toContain(after.id);
  });
});

describe("PATCH /api/journal/entries/:id", () => {
  it("updates the fields it is given and leaves the rest alone", async () => {
    const entry = await makeEntry("2099-09-09", { subject: "before", content: "body" });
    const res = await request(app)
      .patch(`/api/journal/entries/${entry.id}`)
      .send({ subject: "after", entryDate: "2099-09-10" });

    expect(res.status).toBe(200);
    expect(res.body.subject).toBe("after");
    expect(res.body.content).toBe("body");
    expect(res.body.entryDate).toBe("2099-09-10");

    const [persisted] = await db
      .select()
      .from(journalEntriesTable)
      .where(eq(journalEntriesTable.id, entry.id));
    expect(persisted!.entryDate).toBe("2099-09-10");
  });

  it("404s for an id that does not exist rather than reporting a phantom save", async () => {
    const res = await request(app)
      .patch("/api/journal/entries/999999999")
      .send({ content: "into the void" });
    expect(res.status).toBe(404);
  });

  it("400s when the body carries nothing to update", async () => {
    const entry = await makeEntry("2099-09-10");
    const res = await request(app).patch(`/api/journal/entries/${entry.id}`).send({});
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/journal/entries/:id", () => {
  it("removes the entry and the links anchored to it", async () => {
    const entry = await makeEntry("2099-10-10", { content: "anchor text here" });

    const link = await request(app).post("/api/journal/links").send({
      anchorText: "anchor",
      content: "a note about the anchor",
      sourceType: "entry",
      sourceId: entry.id,
    });
    expect(link.status).toBe(201);

    expect((await request(app).delete(`/api/journal/entries/${entry.id}`)).status).toBe(204);

    const [gone] = await db
      .select()
      .from(journalEntriesTable)
      .where(eq(journalEntriesTable.id, entry.id));
    expect(gone).toBeUndefined();

    const orphans = await db
      .select()
      .from(journalLinksTable)
      .where(eq(journalLinksTable.sourceId, entry.id));
    expect(orphans).toEqual([]);
  });
});
