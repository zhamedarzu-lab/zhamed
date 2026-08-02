-- Add entry_id to day_highlights so each highlight can link to a journal entry
ALTER TABLE day_highlights ADD COLUMN IF NOT EXISTS entry_id INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL;
