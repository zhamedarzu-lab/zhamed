-- Add new slot enum values. PostgreSQL requires each ADD VALUE in its own statement.
ALTER TYPE slot ADD VALUE IF NOT EXISTS 'early morning';
ALTER TYPE slot ADD VALUE IF NOT EXISTS 'after morning';
ALTER TYPE slot ADD VALUE IF NOT EXISTS 'midnight';
