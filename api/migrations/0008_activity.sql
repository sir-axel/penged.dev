-- When each player last had a verified match per format: drives rust, inactivity (off the ranked ladder) and provisional status.
ALTER TABLE players ADD COLUMN singles_last_verified_at TEXT;
ALTER TABLE players ADD COLUMN doubles_last_verified_at TEXT;
UPDATE players SET singles_last_verified_at = (
  SELECT max(m.verified_at) FROM matches m
  WHERE m.status = 'verified' AND m.format = 'singles'
    AND EXISTS (SELECT 1 FROM json_each(m.all_player_ids) WHERE value = players.id));
UPDATE players SET doubles_last_verified_at = (
  SELECT max(m.verified_at) FROM matches m
  WHERE m.status = 'verified' AND m.format = 'doubles'
    AND EXISTS (SELECT 1 FROM json_each(m.all_player_ids) WHERE value = players.id));
-- Recompute ranks: players whose last verified singles match is over 30 days old drop off the ranked ladder.
UPDATE players SET singles_rank = r.rk FROM (
  SELECT id, CASE WHEN active THEN ROW_NUMBER() OVER (PARTITION BY active
    ORDER BY singles_rating DESC, (singles_wins + singles_losses) DESC, created_date ASC, id ASC) END AS rk
  FROM (SELECT *, (singles_last_verified_at IS NULL OR singles_last_verified_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')) AS active FROM players)) AS r
  WHERE players.id = r.id AND players.singles_rank IS NOT r.rk;
UPDATE meta SET value = value + 1 WHERE key = 'ladder_version';
