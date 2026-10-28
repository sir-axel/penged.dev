-- Per-game rating: every game in a verified match is its own rating event, so each format also keeps a GAME record.
-- Match W-L (singles_wins etc.) is unchanged. K, opponent certainty and the provisional "experience" now count games.
ALTER TABLE players ADD COLUMN singles_game_wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN singles_game_losses INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN doubles_game_wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN doubles_game_losses INTEGER NOT NULL DEFAULT 0;

-- Backfill from the games JSON of every VERIFIED match, per player per format. Existing ratings are NOT recomputed.
CREATE TABLE _gamecount AS
WITH pm AS (
  SELECT p.id AS pid, m.format AS fmt,
    (SELECT count(*) FROM json_each(m.games) WHERE json_extract(value, '$.a') > json_extract(value, '$.b')) AS ga,
    (SELECT count(*) FROM json_each(m.games) WHERE json_extract(value, '$.b') > json_extract(value, '$.a')) AS gb,
    EXISTS (SELECT 1 FROM json_each(m.side_a) WHERE json_extract(value, '$.player_id') = p.id) AS on_a
  FROM players p
  JOIN matches m ON m.status = 'verified' AND EXISTS (SELECT 1 FROM json_each(m.all_player_ids) WHERE value = p.id)
)
SELECT pid, fmt, SUM(CASE WHEN on_a THEN ga ELSE gb END) AS gw, SUM(CASE WHEN on_a THEN gb ELSE ga END) AS gl
FROM pm GROUP BY pid, fmt;

UPDATE players SET
  singles_game_wins   = coalesce((SELECT gw FROM _gamecount WHERE pid = players.id AND fmt = 'singles'), 0),
  singles_game_losses = coalesce((SELECT gl FROM _gamecount WHERE pid = players.id AND fmt = 'singles'), 0),
  doubles_game_wins   = coalesce((SELECT gw FROM _gamecount WHERE pid = players.id AND fmt = 'doubles'), 0),
  doubles_game_losses = coalesce((SELECT gl FROM _gamecount WHERE pid = players.id AND fmt = 'doubles'), 0);
DROP TABLE _gamecount;
