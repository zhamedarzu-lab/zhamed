import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { journalEntriesTable } from "@workspace/db";
import { and, gte, lte, desc, eq } from "drizzle-orm";

const router = Router();

const CreateEntryInput = z.object({
  content: z.string().default(""),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
    .orderBy(desc(journalEntriesTable.createdAt));

  res.json(rows);
});

// POST /api/journal/entries
router.post("/entries", async (req, res) => {
  const parsed = CreateEntryInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { content, entryDate } = parsed.data;
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db
    .insert(journalEntriesTable)
    .values({ content, entryDate: entryDate ?? today })
    .returning();
  res.status(201).json(row);
});

// DELETE /api/journal/entries/:id
router.delete("/entries/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(journalEntriesTable).where(eq(journalEntriesTable.id, id));
  res.status(204).end();
});

export default router;
