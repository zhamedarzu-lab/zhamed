-- Allocations: collapse category / bill / account / notes / tags into one note.
--
-- Run this ONCE before `pnpm --filter @workspace/db run push`, for the same
-- reason as 0001 — push syncs structure and would drop the old columns without
-- carrying anything across.
--
--   psql "$DATABASE_URL" -f lib/db/migrations/0002_allocations_amount_note.sql
--
-- Safe to run twice: the backfill is skipped once `category` is gone.

BEGIN;

ALTER TABLE allocations ADD COLUMN IF NOT EXISTS note text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'allocations' AND column_name = 'category'
  ) THEN
    -- The note is now the only place a row can say what it was for, so fold
    -- the old free text and tags into it rather than dropping them.
    UPDATE allocations
    SET note = NULLIF(
      concat_ws(' · ',
        NULLIF(btrim(notes), ''),
        NULLIF(btrim(array_to_string(tags, ' ')), '')
      ), '');

    -- Rows that carried no text of their own keep the pile they sat in, so a
    -- bare $850 bills row still reads as "Bills" instead of going blank.
    UPDATE allocations
    SET note = CASE category
      WHEN 'bills' THEN 'Bills'
      WHEN 'debt' THEN 'Debt'
      WHEN 'credit_dump' THEN 'Credit dump'
      WHEN 'surplus' THEN 'Spending'
      ELSE category
    END
    WHERE note IS NULL OR note = '';
  END IF;
END $$;

UPDATE allocations SET note = '' WHERE note IS NULL;

ALTER TABLE allocations ALTER COLUMN note SET NOT NULL;
ALTER TABLE allocations ALTER COLUMN note SET DEFAULT '';

ALTER TABLE allocations DROP COLUMN IF EXISTS category;
ALTER TABLE allocations DROP COLUMN IF EXISTS debt_account_id;
ALTER TABLE allocations DROP COLUMN IF EXISTS bill_id;
ALTER TABLE allocations DROP COLUMN IF EXISTS notes;
ALTER TABLE allocations DROP COLUMN IF EXISTS tags;

COMMIT;
