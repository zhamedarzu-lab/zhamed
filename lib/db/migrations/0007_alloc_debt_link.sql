ALTER TABLE allocations
  ADD COLUMN debt_account_id INTEGER REFERENCES debt_accounts(id) ON DELETE SET NULL,
  ADD COLUMN applied_snapshot_id INTEGER REFERENCES debt_snapshots(id) ON DELETE SET NULL;
