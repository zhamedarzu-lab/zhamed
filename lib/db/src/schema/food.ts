import { date, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const foodItemsTable = pgTable("food_items", {
  id:              serial("id").primaryKey(),
  name:            text("name").notNull(),
  storageLocation: text("storage_location").notNull().default("pantry"),
  status:          text("status").notNull().default("on_hand"),
  purchasedOn:     date("purchased_on", { mode: "string" }),
  store:           text("store"),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("food_items_status_idx").on(t.status),
  index("food_items_location_idx").on(t.storageLocation),
]);

export const foodActivitiesTable = pgTable("food_activities", {
  id:         serial("id").primaryKey(),
  foodItemId: integer("food_item_id").notNull().references(() => foodItemsTable.id, { onDelete: "cascade" }),
  action:     text("action").notNull(),
  occurredOn: date("occurred_on", { mode: "string" }).notNull(),
  content:    text("content").notNull().default(""),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("food_activities_item_date_idx").on(t.foodItemId, t.occurredOn),
]);

export type FoodItem = typeof foodItemsTable.$inferSelect;
export type FoodActivity = typeof foodActivitiesTable.$inferSelect;