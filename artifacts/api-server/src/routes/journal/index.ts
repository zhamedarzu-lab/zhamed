import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { journalEntriesTable, dayHighlightsTable } from "@workspace/db";
import { and, gte, lte, desc, eq } from "drizzle-orm";

const router = Router();

const EntryInput = z.object({
  subject:   z.string().nullable().optional(),
  content:   z.string().default(""),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().datetime({ offset: true }).optional(),
  endTime:   z.string().datetime({ offset: true }).nullable().optional(),
  color:     z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

// GET /api/journal/entries?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/entries", async (req, res) => {
  const { from, to } = req.query;
  const conditions = [];
  if (typeof from === "string") conditions.push(gte(journalEntriesTable.entryDate, from));
  if (typeof to   === "string") conditions.push(lte(journalEntriesTable.entryDate, to));

  const rows = await db
    .select()
    .from(journalEntriesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(journalEntriesTable.startTime));

  res.json(rows);
});

// POST /api/journal/entries
router.post("/entries", async (req, res) => {
  const parsed = EntryInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { subject, content, entryDate, startTime, endTime } = parsed.data;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const [row] = await db
    .insert(journalEntriesTable)
    .values({
      subject:   subject ?? null,
      content,
      entryDate: entryDate ?? today,
      startTime: startTime ? new Date(startTime) : now,
      endTime:   endTime   ? new Date(endTime)   : null,
      color:     parsed.data.color ?? "#e0b04e",
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
  if (parsed.data.subject   !== undefined) patch.subject   = parsed.data.subject;
  if (parsed.data.content   !== undefined) patch.content   = parsed.data.content;
  if (parsed.data.startTime !== undefined) patch.startTime = new Date(parsed.data.startTime!);
  if (parsed.data.endTime   !== undefined) patch.endTime   = parsed.data.endTime ? new Date(parsed.data.endTime) : null;
  if (parsed.data.color     !== undefined) patch.color     = parsed.data.color;
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
  date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label:         z.string().default(""),
  color:         z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#4eaaee"),
  showCountdown: z.boolean().default(false),
});

// GET /api/journal/highlights
router.get("/highlights", async (_req, res) => {
  const rows = await db
    .select()
    .from(dayHighlightsTable)
    .orderBy(dayHighlightsTable.date);
  res.json(rows);
});

// POST /api/journal/highlights
router.post("/highlights", async (req, res) => {
  const parsed = HighlightInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const [row] = await db
    .insert(dayHighlightsTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(row);
});

// PUT /api/journal/highlights/:id
router.put("/highlights/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = HighlightInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const [row] = await db
    .update(dayHighlightsTable)
    .set(parsed.data)
    .where(eq(dayHighlightsTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// PATCH /api/journal/highlights/:id
router.patch("/highlights/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = HighlightInput.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const patch: Record<string, unknown> = {};
  if (parsed.data.date          !== undefined) patch.date          = parsed.data.date;
  if (parsed.data.label         !== undefined) patch.label         = parsed.data.label;
  if (parsed.data.color         !== undefined) patch.color         = parsed.data.color;
  if (parsed.data.showCountdown !== undefined) patch.showCountdown = parsed.data.showCountdown;
  if (!Object.keys(patch).length) { res.status(400).json({ error: "Nothing to update" }); return; }
  const [row] = await db
    .update(dayHighlightsTable)
    .set(patch)
    .where(eq(dayHighlightsTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// DELETE /api/journal/highlights/:id
router.delete("/highlights/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(dayHighlightsTable).where(eq(dayHighlightsTable.id, id));
  res.status(204).end();
});

export default router;
