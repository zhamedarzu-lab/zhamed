import { pgTable, serial, text, date, timestamp, boolean, integer, index } from "drizzle-orm/pg-core";

export const journalEntriesTable = pgTable("journal_entries", {
  id:           serial("id").primaryKey(),
  subject:      text("subject"),
  content:      text("content").notNull().default(""),
  entryDate:    date("entry_date", { mode: "string" }).notNull(),
  startTime:    timestamp("start_time", { withTimezone: true }).notNull().defaultNow(),
  endTime:      timestamp("end_time",   { withTimezone: true }),
  color:        text("color").notNull().default("#f5c800"),
  looseEndLink: integer("loose_end_link").references((): any => journalEntriesTable.id),
  looseEndType: text("loose_end_type"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type JournalEntry = typeof journalEntriesTable.$inferSelect;
export type InsertJournalEntry = typeof journalEntriesTable.$inferInsert;

export const dayHighlightsTable = pgTable("day_highlights", {
  id:            serial("id").primaryKey(),
  date:          text("date").notNull(),
  label:         text("label").notNull().default(""),
  color:         text("color").notNull().default("#2b7fff"),
  note:          text("note").notNull().default(""),
  showCountdown: boolean("show_countdown").notNull().default(false),
  startTime:     text("start_time"),
  endTime:       text("end_time"),
  entryId:       integer("entry_id"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DayHighlight = typeof dayHighlightsTable.$inferSelect;
export type InsertDayHighlight = typeof dayHighlightsTable.$inferInsert;

export const journalPeriodNotesTable = pgTable("journal_period_notes", {
  id:         serial("id").primaryKey(),
  periodType: text("period_type").notNull(),
  periodKey:  text("period_key").notNull(),
  content:    text("content").notNull(),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("idx_journal_period_notes_lookup").on(t.periodType, t.periodKey)]);

export type JournalPeriodNote = typeof journalPeriodNotesTable.$inferSelect;
