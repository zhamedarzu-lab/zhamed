-- Per-account manual spending log: one row per purchase entered by the user.
CREATE TABLE cash_spending_log (
  id              SERIAL PRIMARY KEY,
  cash_account_id INTEGER NOT NULL REFERENCES cash_accounts(id) ON DELETE CASCADE,
  amount          NUMERIC(10,2) NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  category        TEXT NOT NULL DEFAULT 'Other',
  logged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX cash_spending_log_account_id_idx ON cash_spending_log (cash_account_id);
CREATE INDEX cash_spending_log_logged_at_idx  ON cash_spending_log (logged_at);
