-- Rank is now derived from rating (rating DESC, games played DESC, created_date ASC, id ASC).
-- An expired challenge pays the challenger the defender's penalty ("walkover"); stored so an admin reversal can undo it.
ALTER TABLE challenges ADD COLUMN challenger_rating_gain INTEGER NOT NULL DEFAULT 0;
-- Recompute ranks for existing rows from their ratings.
UPDATE players SET singles_rank = r.rk FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY singles_rating DESC, (singles_wins + singles_losses) DESC, created_date ASC, id ASC) AS rk
  FROM players) AS r
  WHERE players.id = r.id AND players.singles_rank IS NOT r.rk;
UPDATE meta SET value = value + 1 WHERE key = 'ladder_version';
