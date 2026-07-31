-- Recreate journal_entries for multi-entry-per-day with timestamps
DROP TABLE IF EXISTS journal_images CASCADE;
DROP TABLE IF EXISTS journal_entries CASCADE;

CREATE TABLE journal_entries (
  id         serial PRIMARY KEY,
  content    text        NOT NULL DEFAULT '',
  entry_date date        NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
