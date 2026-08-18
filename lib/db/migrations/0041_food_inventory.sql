CREATE TABLE food_items (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  storage_location TEXT NOT NULL DEFAULT 'pantry',
  status           TEXT NOT NULL DEFAULT 'on_hand',
  purchased_on     DATE,
  store            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX food_items_status_idx ON food_items (status);
CREATE INDEX food_items_location_idx ON food_items (storage_location);

CREATE TABLE food_activities (
  id           SERIAL PRIMARY KEY,
  food_item_id INTEGER NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
  action       TEXT NOT NULL,
  occurred_on  DATE NOT NULL,
  content      TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX food_activities_item_date_idx ON food_activities (food_item_id, occurred_on);

ALTER TABLE journal_links DROP CONSTRAINT journal_links_source_type_check;
ALTER TABLE journal_links
  ADD CONSTRAINT journal_links_source_type_check
  CHECK (source_type IN ('entry', 'period_note', 'food_activity'));