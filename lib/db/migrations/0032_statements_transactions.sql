CREATE TABLE statements (
  id           serial PRIMARY KEY,
  filename     text NOT NULL,
  uploaded_at  timestamptz DEFAULT now() NOT NULL,
  tx_count     integer NOT NULL DEFAULT 0
);

CREATE TABLE transactions (
  id            serial PRIMARY KEY,
  statement_id  integer NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  date          date NOT NULL,
  description   text NOT NULL,
  amount_cents  integer NOT NULL,
  category      text NOT NULL DEFAULT 'Other',
  notes         text
);

CREATE INDEX transactions_statement_idx ON transactions(statement_id);
CREATE INDEX transactions_date_idx ON transactions(date);
