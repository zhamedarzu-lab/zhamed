-- Replace text-marker convention (((  ))) with a proper loose_end_type column.
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS loose_end_type TEXT CHECK (loose_end_type IN ('open', 'close'));

-- Backfill: subjects containing ((( → open, strip the marker
UPDATE journal_entries
SET loose_end_type = 'open',
    subject = NULLIF(TRIM(REPLACE(subject, '(((', '')), '')
WHERE subject LIKE '%(((%';

-- Backfill: subjects containing ))) → close, strip the marker
UPDATE journal_entries
SET loose_end_type = 'close',
    subject = NULLIF(TRIM(REPLACE(subject, ')))', '')), '')
WHERE subject LIKE '%)))%';
