-- Rename purchased_on → prepared_on in food_items
ALTER TABLE food_items RENAME COLUMN purchased_on TO prepared_on;

-- Rename the action value 'purchased' → 'prepared' in food_activities
UPDATE food_activities SET action = 'prepared' WHERE action = 'purchased';
