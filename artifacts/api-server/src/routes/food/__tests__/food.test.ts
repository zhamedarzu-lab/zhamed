import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { db, foodActivitiesTable, foodItemsTable, journalLinksTable } from "@workspace/db";
import app from "../../../app.js";

const createdItemIds: number[] = [];

afterEach(async () => {
  for (const id of createdItemIds.splice(0)) {
    const activities = await db.select({ id: foodActivitiesTable.id }).from(foodActivitiesTable)
      .where(eq(foodActivitiesTable.foodItemId, id));
    if (activities.length) {
      await db.delete(journalLinksTable).where(and(
        eq(journalLinksTable.sourceType, "food_activity"),
        eq(journalLinksTable.sourceId, activities[0]!.id),
      ));
    }
    await db.delete(foodItemsTable).where(eq(foodItemsTable.id, id));
  }
});

async function createItem(name = "Test mixed nuts") {
  const res = await request(app).post("/api/food/items").send({
    name, storageLocation: "pantry", purchasedOn: "2099-04-15", store: "Test market",
  });
  expect(res.status).toBe(201);
  createdItemIds.push(res.body.item.id);
  return res.body.item as { id: number; status: string; storageLocation: string };
}

describe("Food inventory", () => {
  it("creates an item and preserves its purchase history", async () => {
    const item = await createItem();
    const res = await request(app).get(`/api/food/items/${item.id}/activities`);
    expect(res.status).toBe(200);
    expect(res.body.item).toMatchObject({ id: item.id, name: "Test mixed nuts", status: "on_hand" });
    expect(res.body.activities).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "purchased", occurredOn: "2099-04-15", content: "Bought from Test market" }),
    ]));
  });

  it("rejects invalid food input", async () => {
    const res = await request(app).post("/api/food/items").send({ name: "", storageLocation: "shed" });
    expect(res.status).toBe(400);
  });

  it("rejects impossible calendar dates instead of passing them through to the database", async () => {
    const item = await request(app).post("/api/food/items").send({
      name: "Bad date", storageLocation: "pantry", purchasedOn: "2099-02-30",
    });
    expect(item.status).toBe(400);

    const valid = await createItem("Date validation");
    const activity = await request(app).post(`/api/food/items/${valid.id}/activities`).send({
      action: "note", occurredOn: "2099-13-01", content: "This must not save",
    });
    expect(activity.status).toBe(400);
  });

  it("records an activity and generates status and location history", async () => {
    const item = await createItem("Test beans");
    const activity = await request(app).post(`/api/food/items/${item.id}/activities`).send({
      action: "cooked", occurredOn: "2099-04-16", content: "Cooked with rice",
    });
    expect(activity.status).toBe(201);

    const changed = await request(app).patch(`/api/food/items/${item.id}`).send({
      storageLocation: "freezer", status: "finished", occurredOn: "2099-04-17",
    });
    expect(changed.status).toBe(200);
    expect(changed.body.item).toMatchObject({ storageLocation: "freezer", status: "finished" });
    expect(changed.body.activities).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "moved", content: "Moved to freezer" }),
      expect.objectContaining({ action: "status", content: "Marked as finished" }),
    ]));
  });

  it("allows food activity links and removes them when the activity is deleted", async () => {
    const item = await createItem("Test almonds");
    const activity = await request(app).post(`/api/food/items/${item.id}/activities`).send({
      action: "note", occurredOn: "2099-04-16", content: "The almond tasted like the tin can",
    });
    const activityId = activity.body.id as number;
    const link = await request(app).post("/api/journal/links").send({
      sourceType: "food_activity", sourceId: activityId, anchorText: "almond",
      content: "An odd metallic taste.", occurrence: 0,
    });
    expect(link.status).toBe(201);

    const deleted = await request(app).delete(`/api/food/activities/${activityId}`);
    expect(deleted.status).toBe(204);
    const links = await db.select().from(journalLinksTable).where(and(
      eq(journalLinksTable.sourceType, "food_activity"),
      eq(journalLinksTable.sourceId, activityId),
    ));
    expect(links).toHaveLength(0);
  });
});