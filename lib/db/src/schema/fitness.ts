import { pgTable, serial, text, date } from "drizzle-orm/pg-core";

export const fitnessLogsTable = pgTable("fitness_logs", {
  id: serial("id").primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  workoutType: text("workout_type"),
  notes: text("notes"),
});

export type FitnessLog = typeof fitnessLogsTable.$inferSelect;
export type InsertFitnessLog = typeof fitnessLogsTable.$inferInsert;
