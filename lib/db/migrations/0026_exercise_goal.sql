ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS goal_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS goal_period text CHECK (goal_period IN ('day','week','month'));
