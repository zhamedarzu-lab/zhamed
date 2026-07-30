-- Extra income tied to a paycheck: bill surplus, refunds, gifts — money that
-- grows the pool available to allocate without changing the paycheck's own
-- recorded amount.

CREATE TABLE extra_income (
  id          SERIAL PRIMARY KEY,
  paycheck_id INTEGER        NOT NULL REFERENCES paychecks(id) ON DELETE CASCADE,
  amount      NUMERIC(10,2)  NOT NULL DEFAULT 0,
  note        TEXT           NOT NULL DEFAULT ''
);
