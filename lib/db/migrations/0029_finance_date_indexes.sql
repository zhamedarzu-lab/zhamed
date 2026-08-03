-- Add indexes on date/month columns for tables that will grow over time.
-- All statements use IF NOT EXISTS so they are safe to re-run.

-- paychecks: queried by month when loading a specific pay period
CREATE INDEX IF NOT EXISTS paychecks_month_idx ON paychecks (month);

-- monthly_bill_items: every page load filters by month
CREATE INDEX IF NOT EXISTS monthly_bill_items_month_idx ON monthly_bill_items (month);

-- debt_snapshots: filtered by account + date range on the Debt page
CREATE INDEX IF NOT EXISTS debt_snapshots_date_idx ON debt_snapshots (snapshot_date);
CREATE INDEX IF NOT EXISTS debt_snapshots_account_id_idx ON debt_snapshots (debt_account_id);

-- cash_snapshots: filtered by account + date range on the Cash page
CREATE INDEX IF NOT EXISTS cash_snapshots_date_idx ON cash_snapshots (snapshot_date);
CREATE INDEX IF NOT EXISTS cash_snapshots_account_id_idx ON cash_snapshots (cash_account_id);

-- allocations: nearly always filtered by paycheckId
CREATE INDEX IF NOT EXISTS allocations_paycheck_id_idx ON allocations (paycheck_id);
