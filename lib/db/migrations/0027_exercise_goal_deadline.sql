-- Add deadline-based goal support to exercises
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS goal_deadline   TEXT,
  ADD COLUMN IF NOT EXISTS goal_start_date TEXT;
