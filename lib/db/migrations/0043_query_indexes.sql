-- Indexes for the query shapes the app actually issues. Every statement uses
-- IF NOT EXISTS so this is safe to re-run.
--
-- Nothing here changes data — these are read-path additions only.

-- journal_entries: the fastest-growing table in the app had no index beyond its
-- primary key, while every read is a date window ordered by start time.
CREATE INDEX IF NOT EXISTS journal_entries_entry_date_idx ON journal_entries (entry_date);
CREATE INDEX IF NOT EXISTS journal_entries_start_time_idx ON journal_entries (start_time);

-- day_highlights: listed in date order on every journal load.
CREATE INDEX IF NOT EXISTS day_highlights_date_idx ON day_highlights (date);

-- monthly_subscription_items: filtered by month on every page load, exactly
-- like monthly_bill_items, which got its index back in 0029.
CREATE INDEX IF NOT EXISTS monthly_subscription_items_month_idx
  ON monthly_subscription_items (month);

-- debt_snapshots: serves the DISTINCT ON that reads each account's current
-- balance on the Debt page.
CREATE INDEX IF NOT EXISTS debt_snapshots_account_latest_idx
  ON debt_snapshots (debt_account_id, snapshot_date DESC, id DESC);

-- cash_spending_log: the entry list and the spending summary both filter by
-- account and then bound or sort by time; neither single-column index covers
-- that pair on its own.
CREATE INDEX IF NOT EXISTS cash_spending_log_account_logged_at_idx
  ON cash_spending_log (cash_account_id, logged_at);
