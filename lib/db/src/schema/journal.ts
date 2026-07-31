import { pgTable, serial, text, date, timestamp } from "drizzle-orm/pg-core";

export const journalEntriesTable = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  content: text("content").notNull().default(""),
  entryDate: date("entry_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type JournalEntry = typeof journalEntriesTable.$inferSelect;
export type InsertJournalEntry = typeof journalEntriesTable.$inferInsert;
