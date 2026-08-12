CREATE TABLE journal_period_notes (
  id          SERIAL PRIMARY KEY,
  period_type TEXT NOT NULL CHECK (period_type IN ('day', 'week', 'month', 'year')),
  period_key  TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_journal_period_notes_lookup
  ON journal_period_notes (period_type, period_key);
