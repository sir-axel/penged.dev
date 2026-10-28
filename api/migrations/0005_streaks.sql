-- Win streaks and the UTC day of a player's last verified match (for the first-match-of-the-day XP bonus).
ALTER TABLE players ADD COLUMN win_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN best_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN last_match_day TEXT;
