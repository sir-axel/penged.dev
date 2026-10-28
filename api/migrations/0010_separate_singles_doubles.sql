-- Singles and doubles are fully separate ladders: per-format streaks and a per-format doubles rank.
-- The shared win_streak / best_streak columns stay (rows are not rewritten) but are no longer read or written.
ALTER TABLE players ADD COLUMN singles_win_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN singles_best_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN doubles_win_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN doubles_best_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN doubles_rank INTEGER;

-- Backfill streaks by walking each player's VERIFIED matches of one format in (verified_at, id) order.
-- lc = losses so far; wins sharing an lc value form one unbroken run, so a win's streak is its row number inside the run.
-- current streak = streak of the player's latest match if it was a win, else 0; best = longest run.
CREATE TABLE _streak AS
WITH pm AS (
  SELECT p.id AS pid, m.format AS fmt, m.verified_at AS t, m.id AS mid,
    CASE WHEN m.winner_side = 'a'
      THEN EXISTS (SELECT 1 FROM json_each(m.side_a) WHERE json_extract(value, '$.player_id') = p.id)
      ELSE EXISTS (SELECT 1 FROM json_each(m.side_b) WHERE json_extract(value, '$.player_id') = p.id) END AS won
  FROM players p
  JOIN matches m ON m.status = 'verified' AND EXISTS (SELECT 1 FROM json_each(m.all_player_ids) WHERE value = p.id)
),
lc AS (
  SELECT *, SUM(1 - won) OVER (PARTITION BY pid, fmt ORDER BY t, mid) AS losses_so_far,
    ROW_NUMBER() OVER (PARTITION BY pid, fmt ORDER BY t DESC, mid DESC) AS recency
  FROM pm
),
runs AS (
  SELECT *, CASE WHEN won = 1 THEN ROW_NUMBER() OVER (PARTITION BY pid, fmt, losses_so_far, won ORDER BY t, mid) ELSE 0 END AS streak
  FROM lc
)
SELECT pid, fmt, MAX(streak) AS best, MAX(CASE WHEN recency = 1 THEN streak ELSE 0 END) AS cur
FROM runs GROUP BY pid, fmt;

UPDATE players SET
  singles_win_streak  = coalesce((SELECT cur  FROM _streak WHERE pid = players.id AND fmt = 'singles'), 0),
  singles_best_streak = coalesce((SELECT best FROM _streak WHERE pid = players.id AND fmt = 'singles'), 0),
  doubles_win_streak  = coalesce((SELECT cur  FROM _streak WHERE pid = players.id AND fmt = 'doubles'), 0),
  doubles_best_streak = coalesce((SELECT best FROM _streak WHERE pid = players.id AND fmt = 'doubles'), 0);
DROP TABLE _streak;

-- Initial doubles rank: doubles_rating DESC, doubles games DESC, created_date, id. Inactive (last verified doubles
-- match over 30 days ago) = NULL; players who never played doubles stay ranked. Mirrors DOUBLES_RANK_SQL in rating.js.
UPDATE players SET doubles_rank = r.rk FROM (
  SELECT id, CASE WHEN active THEN ROW_NUMBER() OVER (PARTITION BY active
    ORDER BY doubles_rating DESC, (doubles_wins + doubles_losses) DESC, created_date ASC, id ASC) END AS rk
  FROM (SELECT *, (doubles_last_verified_at IS NULL OR doubles_last_verified_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')) AS active FROM players)) AS r
  WHERE players.id = r.id AND players.doubles_rank IS NOT r.rk;
UPDATE meta SET value = value + 1 WHERE key = 'ladder_version';
