ALTER TABLE debt_snapshots
  ADD COLUMN IF NOT EXISTS logged_at timestamptz DEFAULT now();

ALTER TABLE cash_snapshots
  ADD COLUMN IF NOT EXISTS logged_at timestamptz DEFAULT now();
