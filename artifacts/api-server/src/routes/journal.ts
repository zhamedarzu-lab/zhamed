import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import multer from "multer";
import { z } from "zod";
import { db, journalEntriesTable, journalImagesTable } from "@workspace/db";
import { imageStore } from "../lib/imageStore.js";

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
});

function parseId(raw: string): number {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) throw Object.assign(new Error("Invalid id"), { status: 400 });
  return n;
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/heic": "heic",
  };
  return map[mime] ?? "bin";
}

// GET /journal/entries — recent entries for the Home dashboard
router.get("/entries", async (_req, res): Promise<void> => {
  const entries = await db
    .select({ id: journalEntriesTable.id, date: journalEntriesTable.date })
    .from(journalEntriesTable)
    .where(sql`${journalEntriesTable.body} != ''`)
    .orderBy(desc(journalEntriesTable.date))
    .limit(10);
  res.json(entries);
});

// GET /journal/month/:month — calendar marks
router.get("/month/:month", async (req, res): Promise<void> => {
  const month = req.params.month;
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "Invalid month" });
    return;
  }

  const [year, mon] = month.split("-").map(Number);
  const firstDay = `${month}-01`;
  const lastDay = `${month}-${String(new Date(year, mon, 0).getDate()).padStart(2, "0")}`;

  const entries = await db
    .select()
    .from(journalEntriesTable)
    .where(and(gte(journalEntriesTable.date, firstDay), lte(journalEntriesTable.date, lastDay)));

  const entryIds = entries.map((e) => e.id);
  const images =
    entryIds.length > 0
      ? await db
          .select({ journalEntryId: journalImagesTable.journalEntryId })
          .from(journalImagesTable)
          .where(inArray(journalImagesTable.journalEntryId, entryIds))
      : [];

  const imageCount = new Map<number, number>();
  for (const img of images) {
    imageCount.set(img.journalEntryId, (imageCount.get(img.journalEntryId) ?? 0) + 1);
  }

  res.json(
    entries.map((e) => ({
      date: e.date,
      hasText: e.body.trim().length > 0,
      imageCount: imageCount.get(e.id) ?? 0,
      preview: e.body.slice(0, 80),
    })),
  );
});

// GET /journal/entries/:date — single entry with images
router.get("/entries/:date", async (req, res): Promise<void> => {
  const date = req.params.date;

  let [entry] = await db
    .select()
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.date, date));

  if (!entry) {
    const [created] = await db
      .insert(journalEntriesTable)
      .values({ date, body: "" })
      .returning();
    entry = created;
  }

  const images = await db
    .select({ id: journalImagesTable.id, originalName: journalImagesTable.originalName })
    .from(journalImagesTable)
    .where(eq(journalImagesTable.journalEntryId, entry.id));

  res.json({ date: entry.date, body: entry.body, images });
});

// PUT /journal/entries/:date — upsert body (autosave)
router.put("/entries/:date", async (req, res): Promise<void> => {
  const date = req.params.date;
  const parsed = z.object({ body: z.string() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "body field required" });
    return;
  }

  const [existing] = await db
    .select()
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.date, date));

  if (existing) {
    await db
      .update(journalEntriesTable)
      .set({ body: parsed.data.body })
      .where(eq(journalEntriesTable.id, existing.id));
  } else {
    await db.insert(journalEntriesTable).values({ date, body: parsed.data.body });
  }

  res.json({ ok: true });
});

// POST /journal/entries/:date/images — multipart upload
router.post(
  "/entries/:date/images",
  upload.array("images", 10),
  async (req, res): Promise<void> => {
    const date = req.params.date;
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files in request" });
      return;
    }

    let [entry] = await db
      .select()
      .from(journalEntriesTable)
      .where(eq(journalEntriesTable.date, date));

    if (!entry) {
      const [created] = await db
        .insert(journalEntriesTable)
        .values({ date, body: "" })
        .returning();
      entry = created;
    }

    const inserted: Array<{ id: number; originalName: string | null }> = [];

    for (const file of files) {
      const contentType = file.mimetype || "application/octet-stream";
      const key = await imageStore.put(file.buffer, contentType);
      const [img] = await db
        .insert(journalImagesTable)
        .values({
          journalEntryId: entry.id,
          storageKey: key,
          originalName: file.originalname ?? null,
        })
        .returning();
      inserted.push({ id: img.id, originalName: img.originalName });
    }

    res.status(201).json(inserted);
  },
);

// GET /journal/images/:id/raw — serve image bytes
router.get("/images/:id/raw", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [img] = await db
    .select()
    .from(journalImagesTable)
    .where(eq(journalImagesTable.id, id));

  if (!img) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  try {
    const buffer = await imageStore.get(img.storageKey);
    const ext = img.storageKey.split(".").pop()?.toLowerCase() ?? "bin";
    const contentType =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "png"
          ? "image/png"
          : ext === "gif"
            ? "image/gif"
            : ext === "webp"
              ? "image/webp"
              : "application/octet-stream";

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "private, max-age=86400");
    res.send(buffer);
  } catch {
    res.status(404).json({ error: "Image data not found" });
  }
});

// DELETE /journal/images/:id
router.delete("/images/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const [img] = await db
    .select()
    .from(journalImagesTable)
    .where(eq(journalImagesTable.id, id));

  if (!img) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await imageStore.remove(img.storageKey).catch(() => {
    /* best-effort delete from storage */
  });
  await db.delete(journalImagesTable).where(eq(journalImagesTable.id, id));
  res.sendStatus(204);
});

export default router;
