ALTER TABLE debt_snapshots
  ADD COLUMN paycheck_id INTEGER REFERENCES paychecks(id) ON DELETE SET NULL;
