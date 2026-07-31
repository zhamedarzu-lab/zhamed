-- Drop the old global bills + bill_payments tables.
-- These were replaced by monthly_bill_items in migration 0003 and are no
-- longer referenced anywhere in the application.
-- bill_payments references bills via a foreign key, so it must be dropped first.

DROP TABLE IF EXISTS bill_payments;
DROP TABLE IF EXISTS bills;
