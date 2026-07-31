CREATE TABLE cash_accounts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE cash_snapshots (
  id SERIAL PRIMARY KEY,
  cash_account_id INTEGER NOT NULL REFERENCES cash_accounts(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  balance NUMERIC(10, 2) NOT NULL
);
