import {
  pgTable,
  pgEnum,
  serial,
  text,
  varchar,
  date,
  integer,
  boolean,
  numeric,
  index,
} from "drizzle-orm/pg-core";

export const slotEnum = pgEnum("slot", [
  "early morning", "morning", "before_noon", "after morning",
  "noon", "afternoon", "evening", "night", "midnight",
]);

export const exercisesTable = pgTable("exercises", {
  id:         serial("id").primaryKey(),
  name:       text("name").notNull(),
  unit:       text("unit").notNull(),
  color:      varchar("color", { length: 7 }),
  active:     boolean("active").notNull().default(true),
  sortOrder:  integer("sort_order").notNull().default(0),
  goalAmount:    numeric("goal_amount", { precision: 10, scale: 2 }),
  goalPeriod:    text("goal_period").$type<"day" | "week" | "month">(),
  goalDeadline:  text("goal_deadline"),   // YYYY-MM-DD — set goal to hit by a specific date
  goalStartDate: text("goal_start_date"), // YYYY-MM-DD — when the deadline goal tracking began
});

export const effortsTable = pgTable(
  "efforts",
  {
    id:         serial("id").primaryKey(),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercisesTable.id, { onDelete: "cascade" }),
    date:   date("date", { mode: "string" }).notNull(),
    slot:   slotEnum("slot").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  },
  (t) => [
    index("efforts_date_idx").on(t.date),
    index("efforts_exercise_id_idx").on(t.exerciseId),
  ],
);

export type Exercise       = typeof exercisesTable.$inferSelect;
export type InsertExercise = typeof exercisesTable.$inferInsert;
export type Effort         = typeof effortsTable.$inferSelect;
export type InsertEffort   = typeof effortsTable.$inferInsert;
