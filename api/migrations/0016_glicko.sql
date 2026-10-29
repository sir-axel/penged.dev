-- Glicko-2 ratings (api/src/rating.js): every player gets, per format, a rating deviation (RD, "confidence"), a
-- volatility (sigma) and the time the RD was last updated (one rating period = one day; RD grows with days away from it).
-- Ratings themselves are NOT changed.
ALTER TABLE players ADD COLUMN singles_rd REAL NOT NULL DEFAULT 200;
ALTER TABLE players ADD COLUMN singles_vol REAL NOT NULL DEFAULT 0.06;
ALTER TABLE players ADD COLUMN singles_rd_at TEXT;
ALTER TABLE players ADD COLUMN doubles_rd REAL NOT NULL DEFAULT 200;
ALTER TABLE players ADD COLUMN doubles_vol REAL NOT NULL DEFAULT 0.06;
ALTER TABLE players ADD COLUMN doubles_rd_at TEXT;

-- Backfill = backfillRd(games) in rating.js: RD after the games already played in that format, as if each game taught the
-- ladder 0.22 (Glicko-2 units): Q / sqrt((Q / 200)^2 + games * 0.22), kept within 50..200, Q = 400 / ln 10.
-- The RD is dated at the last verified match in that format, so the days away since then are added on the next match
-- (and in the confidence hint), exactly like any later gap.
UPDATE players SET
  singles_rd = max(50.0, min(200.0, 173.7177927613007 / sqrt((173.7177927613007 / 200.0) * (173.7177927613007 / 200.0)
    + (singles_game_wins + singles_game_losses) * 0.22))),
  singles_rd_at = singles_last_verified_at,
  doubles_rd = max(50.0, min(200.0, 173.7177927613007 / sqrt((173.7177927613007 / 200.0) * (173.7177927613007 / 200.0)
    + (doubles_game_wins + doubles_game_losses) * 0.22))),
  doubles_rd_at = doubles_last_verified_at;
