import { pgTable, serial, text, date, timestamp } from "drizzle-orm/pg-core";

export const journalEntriesTable = pgTable("journal_entries", {
  id:        serial("id").primaryKey(),
  subject:   text("subject"),
  content:   text("content").notNull().default(""),
  entryDate: date("entry_date", { mode: "string" }).notNull(),
  startTime: timestamp("start_time", { withTimezone: true }).notNull().defaultNow(),
  endTime:   timestamp("end_time",   { withTimezone: true }),
  color:     text("color").notNull().default("#e0b04e"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type JournalEntry = typeof journalEntriesTable.$inferSelect;
export type InsertJournalEntry = typeof journalEntriesTable.$inferInsert;
