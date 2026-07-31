ALTER TABLE journal_entries
  ADD COLUMN subject   text,
  ADD COLUMN start_time timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN end_time   timestamptz;

-- Backfill start_time from created_at for existing rows
UPDATE journal_entries SET start_time = created_at;
