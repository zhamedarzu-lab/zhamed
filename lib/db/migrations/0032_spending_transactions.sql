-- Statement uploads: one row per uploaded file
CREATE TABLE statement_uploads (
  id SERIAL PRIMARY KEY,
  original_filename TEXT NOT NULL,
  storage_key TEXT NOT NULL DEFAULT '',
  month TEXT NOT NULL,             -- YYYY-MM, the month this statement covers
  row_count INTEGER NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX statement_uploads_month_idx ON statement_uploads (month);

-- Individual transactions parsed from an uploaded statement
CREATE TABLE spending_transactions (
  id SERIAL PRIMARY KEY,
  upload_id INTEGER NOT NULL REFERENCES statement_uploads(id) ON DELETE CASCADE,
  txn_date DATE NOT NULL,
  merchant TEXT NOT NULL DEFAULT '',
  amount NUMERIC(10,2) NOT NULL,   -- positive = expense, negative = credit/refund
  category TEXT NOT NULL DEFAULT 'Other',
  note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX spending_transactions_upload_id_idx ON spending_transactions (upload_id);
CREATE INDEX spending_transactions_txn_date_idx ON spending_transactions (txn_date);
