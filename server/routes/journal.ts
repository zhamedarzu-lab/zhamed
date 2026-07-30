import express from "express";
import multer from "multer";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db.ts";
import { journalEntries, journalImages } from "../../shared/schema.ts";
import { isoDate, isoMonth, journalEntryUpsert } from "../../shared/validation.ts";
import { HttpError, intParam, monthBounds, notFound, parse, route } from "../util.ts";
import { imageStore } from "../storage.ts";

const router = express.Router();

/* Photos are held in memory just long enough to hand them to the store. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new HttpError(415, "Only image files can be attached."));
  },
});

/** A short, single-line taste of the entry for the calendar cell. */
function preview(body: string): string {
  const line = body.replace(/\s+/g, " ").trim();
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
}

async function imagesFor(entryIds: number[]) {
  if (entryIds.length === 0) return new Map<number, Array<typeof journalImages.$inferSelect>>();
  const rows = await db
    .select()
    .from(journalImages)
    .where(inArray(journalImages.journalEntryId, entryIds))
    .orderBy(asc(journalImages.id));

  const grouped = new Map<number, Array<typeof journalImages.$inferSelect>>();
  for (const img of rows) {
    const list = grouped.get(img.journalEntryId) ?? [];
    list.push(img);
    grouped.set(img.journalEntryId, list);
  }
  return grouped;
}

/** Calendar marks for a month. */
router.get(
  "/month/:month",
  route(async (req, res) => {
    const month = parse(isoMonth, req.params.month);
    const { start, end } = monthBounds(month);

    const entries = await db
      .select()
      .from(journalEntries)
      .where(and(gte(journalEntries.date, start), lte(journalEntries.date, end)))
      .orderBy(asc(journalEntries.date));

    const images = await imagesFor(entries.map((e) => e.id));

    res.json(
      entries.map((e) => ({
        date: e.date,
        hasText: e.body.trim().length > 0,
        imageCount: images.get(e.id)?.length ?? 0,
        preview: preview(e.body),
      })),
    );
  }),
);

/** Most recent entries first — powers the "last written" figure on the home page. */
router.get(
  "/entries",
  route(async (_req, res) => {
    const rows = await db
      .select({ id: journalEntries.id, date: journalEntries.date })
      .from(journalEntries)
      .orderBy(desc(journalEntries.date))
      .limit(50);
    res.json(rows);
  }),
);

router.get(
  "/entries/:date",
  route(async (req, res) => {
    const date = parse(isoDate, req.params.date);
    const [entry] = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.date, date));

    /* A day with nothing in it still opens — as a blank page, not an error. */
    if (!entry) {
      res.json({ date, body: "", images: [] });
      return;
    }

    const images = (await imagesFor([entry.id])).get(entry.id) ?? [];
    res.json({
      date: entry.date,
      body: entry.body,
      images: images.map((i) => ({ id: i.id, originalName: i.originalName })),
    });
  }),
);

/** Upsert — the editor autosaves, so this is called repeatedly for one day. */
router.put(
  "/entries/:date",
  route(async (req, res) => {
    const date = parse(isoDate, req.params.date);
    const { body } = parse(journalEntryUpsert, req.body);

    const [row] = await db
      .insert(journalEntries)
      .values({ date, body })
      .onConflictDoUpdate({
        target: journalEntries.date,
        set: { body, updatedAt: new Date() },
      })
      .returning();

    res.json({ date: row.date, body: row.body });
  }),
);

/** Finds the day's entry, creating an empty one if photos arrive first. */
async function entryIdFor(date: string): Promise<number> {
  const [existing] = await db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(eq(journalEntries.date, date));
  if (existing) return existing.id;

  const [created] = await db
    .insert(journalEntries)
    .values({ date, body: "" })
    .onConflictDoUpdate({ target: journalEntries.date, set: { date } })
    .returning({ id: journalEntries.id });
  return created.id;
}

router.post(
  "/entries/:date/images",
  upload.array("images", 10),
  route(async (req, res) => {
    const date = parse(isoDate, req.params.date);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw new HttpError(400, "No photos were attached.");

    const entryId = await entryIdFor(date);

    const stored = await Promise.all(
      files.map(async (file) => ({
        journalEntryId: entryId,
        storageKey: await imageStore.put(file.buffer, file.mimetype),
        originalName: file.originalname || null,
        contentType: file.mimetype,
      })),
    );

    const rows = await db.insert(journalImages).values(stored).returning();
    res.status(201).json(rows.map((i) => ({ id: i.id, originalName: i.originalName })));
  }),
);

router.get(
  "/images/:id/raw",
  route(async (req, res) => {
    const id = intParam(req.params.id);
    const [img] = await db.select().from(journalImages).where(eq(journalImages.id, id));
    if (!img) throw notFound("That photo");

    const bytes = await imageStore.get(img.storageKey);
    res.setHeader("Content-Type", img.contentType ?? "application/octet-stream");
    /* Immutable: a given id always points at the same stored bytes. */
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.send(bytes);
  }),
);

router.delete(
  "/images/:id",
  route(async (req, res) => {
    const id = intParam(req.params.id);
    const [img] = await db.delete(journalImages).where(eq(journalImages.id, id)).returning();
    if (!img) throw notFound("That photo");

    /* The row is the source of truth; a failed object delete shouldn't 500. */
    await imageStore.remove(img.storageKey).catch((err) => {
      console.warn("Could not remove %s from storage: %s", img.storageKey, err.message);
    });

    res.status(204).end();
  }),
);

export default router;
