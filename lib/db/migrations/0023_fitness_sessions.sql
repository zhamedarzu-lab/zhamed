-- Drop the vestigial stub (never written to by any route)
DROP TABLE IF EXISTS fitness_logs;

-- Slot enum: closed partition of the day, no "other" bucket
CREATE TYPE slot AS ENUM ('morning', 'noon', 'evening', 'night');

-- Exercises: unit lives here, asked once at creation
CREATE TABLE exercises (
  id         SERIAL PRIMARY KEY,
  name       TEXT    NOT NULL,
  unit       TEXT    NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Efforts: one row per exercise × day × slot
CREATE TABLE efforts (
  id          SERIAL  PRIMARY KEY,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  date        DATE    NOT NULL,
  slot        slot    NOT NULL,
  amount      NUMERIC(10,2) NOT NULL
);

-- Indexes specified in the agreed spec
CREATE INDEX efforts_date_idx        ON efforts(date);
CREATE INDEX efforts_exercise_id_idx ON efforts(exercise_id);
