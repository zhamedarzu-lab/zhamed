import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db, foodActivitiesTable, foodItemsTable, journalLinksTable } from "@workspace/db";

const router: IRouter = Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STORAGE_LOCATIONS = ["fridge", "table", "pantry"] as const;
const FOOD_STATUSES = ["on_hand", "finished", "tossed", "avoid"] as const;
const ACTIVITY_ACTIONS = ["prepared", "used", "cooked", "note", "moved", "status"] as const;

const isCalendarDate = (value: string) => {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
};
const calendarDate = z.string().refine(isCalendarDate, "Must be a real YYYY-MM-DD date");

const ItemInput = z.object({
  name: z.string().trim().min(1).max(200),
  storageLocation: z.enum(STORAGE_LOCATIONS).default("pantry"),
  preparedOn: calendarDate.nullable().optional(),
  note: z.string().trim().max(4_000).optional(),
});

const ItemPatch = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  storageLocation: z.enum(STORAGE_LOCATIONS).optional(),
  status: z.enum(FOOD_STATUSES).optional(),
  preparedOn: calendarDate.nullable().optional(),
  occurredOn: calendarDate.optional(),
});

const ActivityInput = z.object({
  action: z.enum(["used", "cooked", "note"]),
  occurredOn: calendarDate,
  content: z.string().trim().min(1).max(4_000),
});

const parseId = (raw: string) => {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
const today = () => new Date().toISOString().slice(0, 10);

router.get("/items", async (_req, res): Promise<void> => {
  const rows = await db.select().from(foodItemsTable)
    .orderBy(asc(foodItemsTable.status), desc(foodItemsTable.updatedAt), asc(foodItemsTable.name));

  // Attach most recent non-prepared activity content as lastNote
  const ids = rows.map((r) => r.id);
  let lastNoteMap: Record<number, string> = {};
  if (ids.length) {
    const recent = await db.select({
      foodItemId: foodActivitiesTable.foodItemId,
      content: foodActivitiesTable.content,
    })
      .from(foodActivitiesTable)
      .where(inArray(foodActivitiesTable.foodItemId, ids))
      .orderBy(desc(foodActivitiesTable.occurredOn), desc(foodActivitiesTable.id));

    // Keep only the first (most recent) per item
    for (const row of recent) {
      if (!lastNoteMap[row.foodItemId] && row.content) {
        lastNoteMap[row.foodItemId] = row.content;
      }
    }
  }

  res.json(rows.map((r) => ({ ...r, lastNote: lastNoteMap[r.id] ?? null })));
});

router.get("/items/:id/activities", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid item id" }); return; }
  const [item] = await db.select().from(foodItemsTable).where(eq(foodItemsTable.id, id));
  if (!item) { res.status(404).json({ error: "Food item not found" }); return; }
  const activities = await db.select().from(foodActivitiesTable)
    .where(eq(foodActivitiesTable.foodItemId, id))
    .orderBy(desc(foodActivitiesTable.occurredOn), desc(foodActivitiesTable.id));
  res.json({ item, activities });
});

router.post("/items", async (req, res): Promise<void> => {
  const parsed = ItemInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", fields: parsed.error.issues }); return; }
  const data = parsed.data;
  const [item] = await db.insert(foodItemsTable).values({
    name: data.name,
    storageLocation: data.storageLocation,
    preparedOn: data.preparedOn ?? null,
  }).returning();

  const activities: Array<typeof foodActivitiesTable.$inferSelect> = [];
  const [activity] = await db.insert(foodActivitiesTable).values({
    foodItemId: item.id, action: "prepared", occurredOn: data.preparedOn ?? today(),
    content: data.note?.trim() || "",
  }).returning();
  activities.push(activity);
  res.status(201).json({ item, activities });
});

router.patch("/items/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid item id" }); return; }
  const parsed = ItemPatch.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", fields: parsed.error.issues }); return; }
  const [existing] = await db.select().from(foodItemsTable).where(eq(foodItemsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Food item not found" }); return; }
  const data = parsed.data;
  const update: Partial<typeof foodItemsTable.$inferInsert> = { updatedAt: new Date() };
  if (data.name !== undefined) update.name = data.name;
  if (data.storageLocation !== undefined) update.storageLocation = data.storageLocation;
  if (data.status !== undefined) update.status = data.status;
  if (data.preparedOn !== undefined) update.preparedOn = data.preparedOn;
  const [item] = await db.update(foodItemsTable).set(update).where(eq(foodItemsTable.id, id)).returning();

  const occurredOn = data.occurredOn ?? today();
  const activities: Array<typeof foodActivitiesTable.$inferSelect> = [];
  if (data.storageLocation && data.storageLocation !== existing.storageLocation) {
    const [activity] = await db.insert(foodActivitiesTable).values({
      foodItemId: id, action: "moved", occurredOn, content: `Moved to ${data.storageLocation}`,
    }).returning();
    activities.push(activity);
  }
  if (data.status && data.status !== existing.status) {
    const label = data.status.replace("_", " ");
    const [activity] = await db.insert(foodActivitiesTable).values({
      foodItemId: id, action: "status", occurredOn, content: `Marked as ${label}`,
    }).returning();
    activities.push(activity);
  }
  res.json({ item, activities });
});

router.delete("/items/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid item id" }); return; }
  const activities = await db.select({ id: foodActivitiesTable.id }).from(foodActivitiesTable)
    .where(eq(foodActivitiesTable.foodItemId, id));
  if (activities.length) {
    await db.delete(journalLinksTable).where(and(
      eq(journalLinksTable.sourceType, "food_activity"),
      inArray(journalLinksTable.sourceId, activities.map(a => a.id)),
    ));
  }
  await db.delete(foodItemsTable).where(eq(foodItemsTable.id, id));
  res.sendStatus(204);
});

router.post("/items/:id/activities", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid item id" }); return; }
  const parsed = ActivityInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", fields: parsed.error.issues }); return; }
  const [item] = await db.select({ id: foodItemsTable.id }).from(foodItemsTable).where(eq(foodItemsTable.id, id));
  if (!item) { res.status(404).json({ error: "Food item not found" }); return; }
  const [activity] = await db.insert(foodActivitiesTable).values({ foodItemId: id, ...parsed.data }).returning();
  await db.update(foodItemsTable).set({ updatedAt: new Date() }).where(eq(foodItemsTable.id, id));
  res.status(201).json(activity);
});

router.patch("/activities/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid activity id" }); return; }
  const parsed = z.object({
    content: z.string().trim().max(4_000).optional(),
    occurredOn: calendarDate.optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", fields: parsed.error.issues }); return; }
  const [existing] = await db.select().from(foodActivitiesTable).where(eq(foodActivitiesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Activity not found" }); return; }
  const update: Partial<typeof foodActivitiesTable.$inferInsert> = {};
  if (parsed.data.content !== undefined) update.content = parsed.data.content;
  if (parsed.data.occurredOn !== undefined) update.occurredOn = parsed.data.occurredOn;
  const [activity] = await db.update(foodActivitiesTable).set(update).where(eq(foodActivitiesTable.id, id)).returning();
  // also update the item's preparedOn if this is a prepared activity and occurredOn changed
  if (existing.action === "prepared" && parsed.data.occurredOn) {
    await db.update(foodItemsTable).set({ preparedOn: parsed.data.occurredOn, updatedAt: new Date() })
      .where(eq(foodItemsTable.id, existing.foodItemId));
  }
  res.json(activity);
});

router.delete("/activities/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid activity id" }); return; }
  await db.delete(journalLinksTable).where(and(
    eq(journalLinksTable.sourceType, "food_activity"),
    eq(journalLinksTable.sourceId, id),
  ));
  await db.delete(foodActivitiesTable).where(eq(foodActivitiesTable.id, id));
  res.sendStatus(204);
});

export default router;
