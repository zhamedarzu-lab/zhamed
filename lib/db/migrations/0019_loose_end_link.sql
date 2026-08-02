-- Add loose_end_link to journal_entries so a closing entry (subject starts with )))
-- can reference the opening entry (subject starts with ((() it resolves.
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS loose_end_link INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL;
