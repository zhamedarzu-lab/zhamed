CREATE TABLE journal_links (
  id          SERIAL PRIMARY KEY,
  anchor_text TEXT NOT NULL,
  content     TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('entry', 'period_note')),
  source_id   INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_journal_links_source
  ON journal_links (source_type, source_id);
