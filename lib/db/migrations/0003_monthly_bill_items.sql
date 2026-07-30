-- Replace the global bills + bill_payments pair with per-month bill items.
-- Each row is one bill for one month. Deleting April's row leaves March untouched.
-- The app auto-seeds a new month from the most recent previous month's names.

CREATE TABLE monthly_bill_items (
  id         SERIAL PRIMARY KEY,
  month      TEXT           NOT NULL,   -- YYYY-MM
  name       TEXT           NOT NULL,
  amount     NUMERIC(10,2)  NOT NULL DEFAULT 0,
  sort_order INTEGER        NOT NULL DEFAULT 0
);

-- Migrate bills that have at least one payment record
INSERT INTO monthly_bill_items (month, name, amount, sort_order)
SELECT bp.month, b.name, bp.amount_paid, b.sort_order
FROM   bill_payments bp
JOIN   bills b ON b.id = bp.bill_id
ORDER  BY bp.month, b.sort_order;

-- Migrate active bills that were never paid — seed into current month with $0
INSERT INTO monthly_bill_items (month, name, amount, sort_order)
SELECT to_char(CURRENT_DATE, 'YYYY-MM'), b.name, 0, b.sort_order
FROM   bills b
WHERE  b.active = true
  AND  b.id NOT IN (SELECT DISTINCT bill_id FROM bill_payments);
