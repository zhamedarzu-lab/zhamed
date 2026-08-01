CREATE TABLE IF NOT EXISTS day_highlights (
  id             SERIAL PRIMARY KEY,
  date           TEXT NOT NULL,
  label          TEXT NOT NULL DEFAULT '',
  color          TEXT NOT NULL DEFAULT '#4eaaee',
  show_countdown BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
