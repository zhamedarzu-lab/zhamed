-- Add occurrence index so links can distinguish repeated anchor phrases
ALTER TABLE journal_links ADD COLUMN occurrence INTEGER NOT NULL DEFAULT 0;
