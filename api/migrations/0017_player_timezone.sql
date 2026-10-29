-- IANA time zone per player (from their browser); challenge clocks pause on that zone's weekends.
ALTER TABLE players ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Chicago';
