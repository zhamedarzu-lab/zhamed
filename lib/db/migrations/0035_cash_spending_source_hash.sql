-- Add source_hash to cash_spending_log for CSV import deduplication.
-- NULL for manually-entered rows; non-null for imported rows (unique prevents re-importing the same row).
ALTER TABLE cash_spending_log
  ADD COLUMN source_hash TEXT;

CREATE UNIQUE INDEX cash_spending_log_source_hash_idx
  ON cash_spending_log (source_hash)
  WHERE source_hash IS NOT NULL;
