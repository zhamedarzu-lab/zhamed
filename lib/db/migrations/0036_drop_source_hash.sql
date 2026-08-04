-- Remove CSV import deduplication column; import feature has been removed.
DROP INDEX IF EXISTS cash_spending_log_source_hash_idx;
ALTER TABLE cash_spending_log DROP COLUMN IF EXISTS source_hash;
