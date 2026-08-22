-- Allow a journal link to point directly to another journal record.
ALTER TABLE journal_links ADD COLUMN target_type TEXT;
ALTER TABLE journal_links ADD COLUMN target_id INTEGER;

ALTER TABLE journal_links
  ADD CONSTRAINT journal_links_target_pair_check
  CHECK (
    (target_type IS NULL AND target_id IS NULL)
    OR (target_type = 'entry' AND target_id IS NOT NULL)
  );

CREATE INDEX idx_journal_links_target
  ON journal_links (target_type, target_id);