-- Expand the slot enum with two new values
ALTER TYPE "slot" ADD VALUE IF NOT EXISTS 'before_noon' AFTER 'morning';
ALTER TYPE "slot" ADD VALUE IF NOT EXISTS 'afternoon'   AFTER 'noon';
