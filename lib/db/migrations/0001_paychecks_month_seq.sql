-- Paychecks: replace pay_date + label with month + seq.
--
-- Run this ONCE against the database before `pnpm --filter @workspace/db run push`.
-- Push only syncs structure; it would drop pay_date without carrying the values
-- across, so this script moves the data first and leaves the table already
-- matching the new schema (push then has nothing to do).
--
--   psql "$DATABASE_URL" -f lib/db/migrations/0001_paychecks_month_seq.sql
--
-- Safe to run twice: the backfill is skipped once pay_date is gone.

BEGIN;

ALTER TABLE paychecks ADD COLUMN IF NOT EXISTS month text;
ALTER TABLE paychecks ADD COLUMN IF NOT EXISTS seq integer;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'paychecks' AND column_name = 'pay_date'
  ) THEN
    -- The month comes straight off the old date.
    UPDATE paychecks SET month = to_char(pay_date, 'YYYY-MM');

    -- Position within the month comes from the order the paychecks arrived,
    -- which is what "1st / 2nd / 3rd of the month" always meant. Deriving it
    -- from arrival order rather than the old first/second label also repairs
    -- any row whose label was wrong, and numbers a third paycheck correctly.
    UPDATE paychecks p
    SET seq = ordered.n
    FROM (
      SELECT id,
             row_number() OVER (
               PARTITION BY to_char(pay_date, 'YYYY-MM')
               ORDER BY pay_date, id
             ) AS n
      FROM paychecks
    ) AS ordered
    WHERE p.id = ordered.id;
  END IF;
END $$;

-- Anything still unset is a row with no usable date: park it in the current
-- month so the NOT NULL below can be applied without discarding the record.
UPDATE paychecks SET month = to_char(now(), 'YYYY-MM') WHERE month IS NULL;
UPDATE paychecks SET seq = 1 WHERE seq IS NULL;

ALTER TABLE paychecks ALTER COLUMN month SET NOT NULL;
ALTER TABLE paychecks ALTER COLUMN seq SET NOT NULL;
ALTER TABLE paychecks ALTER COLUMN seq SET DEFAULT 1;

ALTER TABLE paychecks DROP COLUMN IF EXISTS pay_date;
ALTER TABLE paychecks DROP COLUMN IF EXISTS label;

CREATE UNIQUE INDEX IF NOT EXISTS paychecks_month_seq_idx ON paychecks (month, seq);

COMMIT;
