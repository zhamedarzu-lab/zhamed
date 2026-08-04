-- Remove the statements / spending-transactions feature entirely.
-- spending_transactions references statement_uploads via FK, so drop it first.
DROP TABLE IF EXISTS spending_transactions;
DROP TABLE IF EXISTS statement_uploads;
