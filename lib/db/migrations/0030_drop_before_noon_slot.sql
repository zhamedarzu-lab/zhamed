-- Drop the `before_noon` slot value.
--
-- It was the only value written with an underscore among nine otherwise
-- space-separated ones, and neither currentSlot() on the client nor autoSlot()
-- on the server could ever return it — both step from 'morning' (08–11)
-- straight to 'after morning' (11–12). It was selectable by hand but never
-- assigned, and duplicated the meaning of 'after morning'.
--
-- PostgreSQL cannot remove a value from an enum in place, so the type is
-- rebuilt and the column swapped over. Any row still carrying the value is
-- folded into 'after morning', which is what it meant.
--
--   psql "$DATABASE_URL" -f lib/db/migrations/0030_drop_before_noon_slot.sql
--
-- Safe to run twice: the whole body is skipped once the value is gone.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'slot' AND e.enumlabel = 'before_noon'
  ) THEN
    -- Park any existing rows on the value that replaces it.
    EXECUTE $sql$
      UPDATE efforts SET slot = 'after morning' WHERE slot = 'before_noon'
    $sql$;

    CREATE TYPE slot_new AS ENUM (
      'early morning', 'morning', 'after morning', 'noon',
      'afternoon', 'evening', 'night', 'midnight'
    );

    ALTER TABLE efforts
      ALTER COLUMN slot TYPE slot_new USING slot::text::slot_new;

    DROP TYPE slot;
    ALTER TYPE slot_new RENAME TO slot;
  END IF;
END $$;

COMMIT;
