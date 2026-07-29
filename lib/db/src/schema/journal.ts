import { pgTable, serial, text, date, integer, timestamp } from "drizzle-orm/pg-core";

export const journalEntriesTable = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  date: date("date", { mode: "string" }).notNull().unique(),
  body: text("body").notNull().default(""),
});

export const journalImagesTable = pgTable("journal_images", {
  id: serial("id").primaryKey(),
  journalEntryId: integer("journal_entry_id")
    .notNull()
    .references(() => journalEntriesTable.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  originalName: text("original_name"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export type JournalEntry = typeof journalEntriesTable.$inferSelect;
export type JournalImage = typeof journalImagesTable.$inferSelect;
export type InsertJournalEntry = typeof journalEntriesTable.$inferInsert;
