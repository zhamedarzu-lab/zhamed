import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { journalEntriesTable, dayHighlightsTable } from "@workspace/db";
import { and, gte, lte, desc, eq, isNull, like, notInArray, sql } from "drizzle-orm";

const router = Router();

const EntryInput = z.object({
  subject:      z.string().nullable().optional(),
  content:      z.string().default(""),
  entryDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime:    z.string().datetime({ offset: true }).optional(),
  endTime:      z.string().datetime({ offset: true }).nullable().optional(),
  color:        z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  looseEndLink: z.number().int().nullable().optional(),
  looseEndType: z.enum(["open", "close"]).nullable().optional(),
});

// GET /api/journal/entries?from=YYYY-MM-DD&to=YYYY-MM-DD&looseEndLink=:id
router.get("/entries", async (req, res) => {
  const { from, to, looseEndLink } = req.query;
  const conditions = [];
  if (typeof from         === "string") conditions.push(gte(journalEntriesTable.entryDate, from));
  if (typeof to           === "string") conditions.push(lte(journalEntriesTable.entryDate, to));
  if (typeof looseEndLink === "string") conditions.push(eq(journalEntriesTable.looseEndLink, Number(looseEndLink)));

  const rows = await db
    .select()
    .from(journalEntriesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(journalEntriesTable.startTime));

  res.json(rows);
});

// GET /api/journal/loose-ends — all open-end entries
router.get("/loose-ends", async (_req, res) => {
  const rows = await db
    .select()
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.looseEndType, "open"))
    .orderBy(desc(journalEntriesTable.startTime));
  res.json(rows);
});

// GET /api/journal/entries/:id
router.get("/entries/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(journalEntriesTable).where(eq(journalEntriesTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// POST /api/journal/entries
router.post("/entries", async (req, res) => {
  const parsed = EntryInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { subject, content, entryDate, startTime, endTime, looseEndLink, looseEndType } = parsed.data;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const [row] = await db
    .insert(journalEntriesTable)
    .values({
      subject:      subject ?? null,
      content,
      entryDate:    entryDate ?? today,
      startTime:    startTime ? new Date(startTime) : now,
      endTime:      endTime   ? new Date(endTime)   : null,
      color:        parsed.data.color ?? "#e0b04e",
      looseEndLink: looseEndLink ?? null,
      looseEndType: looseEndType ?? null,
    })
    .returning();
  res.status(201).json(row);
});

// PATCH /api/journal/entries/:id
router.patch("/entries/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = EntryInput.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const patch: Record<string, unknown> = {};
  if (parsed.data.subject      !== undefined) patch.subject      = parsed.data.subject;
  if (parsed.data.content      !== undefined) patch.content      = parsed.data.content;
  if (parsed.data.startTime    !== undefined) patch.startTime    = new Date(parsed.data.startTime!);
  if (parsed.data.endTime      !== undefined) patch.endTime      = parsed.data.endTime ? new Date(parsed.data.endTime) : null;
  if (parsed.data.color        !== undefined) patch.color        = parsed.data.color;
  if (parsed.data.looseEndLink !== undefined) patch.looseEndLink = parsed.data.looseEndLink ?? null;
  if (parsed.data.looseEndType !== undefined) patch.looseEndType = parsed.data.looseEndType ?? null;
  if (!Object.keys(patch).length) { res.status(400).json({ error: "Nothing to update" }); return; }
  const [row] = await db
    .update(journalEntriesTable)
    .set(patch)
    .where(eq(journalEntriesTable.id, id))
    .returning();
  res.json(row);
});

// DELETE /api/journal/entries/:id
router.delete("/entries/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, id));
  res.status(204).end();
});

// ── Day Highlights ────────────────────────────────────────────────────

const HighlightInput = z.object({
  date:               z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label:              z.string().default(""),
  note:               z.string().default(""),
  color:              z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#4eaaee"),
  showCountdown:      z.boolean().default(false),
  startTime:          z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  endTime:            z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  // Client-computed ISO datetimes for the linked entry (includes local timezone offset)
  entryStartTimeISO:  z.string().datetime({ offset: true }).nullable().optional(),
  entryEndTimeISO:    z.string().datetime({ offset: true }).nullable().optional(),
});

/** Build journal entry values from highlight fields.
 *  Prefers client-provided ISO strings (which carry the user's local timezone)
 *  over server-side construction from bare HH:MM (which would be UTC). */
function hlEntryValues(data: {
  date: string; label: string; note?: string; color: string;
  startTime?: string | null; endTime?: string | null;
  entryStartTimeISO?: string | null; entryEndTimeISO?: string | null;
}) {
  const startTime = data.entryStartTimeISO
    ? new Date(data.entryStartTimeISO)
    : new Date(`${data.date}T${data.startTime ?? "12:00"}:00`);
  const endTime = data.entryEndTimeISO
    ? new Date(data.entryEndTimeISO)
    : (data.endTime ? new Date(`${data.date}T${data.endTime}:00`) : null);
  return {
    subject:   data.label,
    content:   data.note ?? "",
    entryDate: data.date,
    startTime,
    endTime,
    color:     data.color,
  };
}

// GET /api/journal/highlights
router.get("/highlights", async (_req, res) => {
  const rows = await db
    .select()
    .from(dayHighlightsTable)
    .orderBy(dayHighlightsTable.date);
  res.json(rows);
});

// POST /api/journal/highlights — also creates a linked journal entry
router.post("/highlights", async (req, res) => {
  const parsed = HighlightInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  // Create the linked journal entry first
  const [entry] = await db
    .insert(journalEntriesTable)
    .values(hlEntryValues(parsed.data))
    .returning();

  // Create the highlight with the entry linked
  const [row] = await db
    .insert(dayHighlightsTable)
    .values({ ...parsed.data, entryId: entry.id })
    .returning();

  res.status(201).json(row);
});

// PUT /api/journal/highlights/:id — full replace, syncs linked entry
router.put("/highlights/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = HighlightInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  // Get current highlight to find linked entry
  const [existing] = await db.select().from(dayHighlightsTable).where(eq(dayHighlightsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  let entryId = existing.entryId;
  const ev = hlEntryValues(parsed.data);
  if (entryId) {
    await db.update(journalEntriesTable).set(ev).where(eq(journalEntriesTable.id, entryId));
  } else {
    const [entry] = await db.insert(journalEntriesTable).values(ev).returning();
    entryId = entry.id;
  }

  const [row] = await db
    .update(dayHighlightsTable)
    .set({ ...parsed.data, entryId })
    .where(eq(dayHighlightsTable.id, id))
    .returning();
  res.json(row);
});

// PATCH /api/journal/highlights/:id — partial update, syncs linked entry
router.patch("/highlights/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = HighlightInput.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const patch: Record<string, unknown> = {};
  if (parsed.data.date          !== undefined) patch.date          = parsed.data.date;
  if (parsed.data.label         !== undefined) patch.label         = parsed.data.label;
  if (parsed.data.note          !== undefined) patch.note          = parsed.data.note;
  if (parsed.data.color         !== undefined) patch.color         = parsed.data.color;
  if (parsed.data.showCountdown !== undefined) patch.showCountdown = parsed.data.showCountdown;
  if (parsed.data.startTime     !== undefined) patch.startTime     = parsed.data.startTime ?? null;
  if (parsed.data.endTime       !== undefined) patch.endTime       = parsed.data.endTime   ?? null;
  if (!Object.keys(patch).length) { res.status(400).json({ error: "Nothing to update" }); return; }

  // Get current row so we can sync the entry
  const [existing] = await db.select().from(dayHighlightsTable).where(eq(dayHighlightsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  // Merge patched fields with existing to produce full entry values
  const merged = {
    date:      (parsed.data.date      ?? existing.date),
    label:     (parsed.data.label     ?? existing.label),
    note:      (parsed.data.note      ?? existing.note ?? ""),
    color:     (parsed.data.color     ?? existing.color),
    startTime: parsed.data.startTime  !== undefined ? parsed.data.startTime : existing.startTime,
    endTime:   parsed.data.endTime    !== undefined ? parsed.data.endTime   : existing.endTime,
  };
  const ev = hlEntryValues(merged);

  let entryId = existing.entryId;
  if (entryId) {
    await db.update(journalEntriesTable).set(ev).where(eq(journalEntriesTable.id, entryId));
  } else {
    const [entry] = await db.insert(journalEntriesTable).values(ev).returning();
    entryId = entry.id;
    patch.entryId = entryId;
  }

  const [row] = await db
    .update(dayHighlightsTable)
    .set(patch)
    .where(eq(dayHighlightsTable.id, id))
    .returning();
  res.json(row);
});

// DELETE /api/journal/highlights/:id — also deletes the linked entry
router.delete("/highlights/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(dayHighlightsTable).where(eq(dayHighlightsTable.id, id));
  if (existing?.entryId) {
    await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, existing.entryId));
  }
  await db.delete(dayHighlightsTable).where(eq(dayHighlightsTable.id, id));
  res.status(204).end();
});

export default router;
