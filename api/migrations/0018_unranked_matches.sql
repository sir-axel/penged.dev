-- Unranked (casual) matches: XP only, no rating, record, streak, rank or challenge effect.
ALTER TABLE matches ADD COLUMN ranked INTEGER NOT NULL DEFAULT 1;
