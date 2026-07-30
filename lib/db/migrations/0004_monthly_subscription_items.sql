-- Per-month subscription items, mirroring monthly_bill_items.
CREATE TABLE monthly_subscription_items (
  id         SERIAL PRIMARY KEY,
  month      TEXT           NOT NULL,
  name       TEXT           NOT NULL,
  amount     NUMERIC(10,2)  NOT NULL DEFAULT 0,
  sort_order INTEGER        NOT NULL DEFAULT 0
);
