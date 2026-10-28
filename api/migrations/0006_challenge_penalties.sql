-- Ducking a challenge costs the defender rating + rank. Stored on the challenge so it can be shown and reversed.
ALTER TABLE challenges ADD COLUMN penalty_rating INTEGER;
ALTER TABLE challenges ADD COLUMN penalty_rank_before INTEGER;
ALTER TABLE challenges ADD COLUMN penalty_rank_after INTEGER;
ALTER TABLE challenges ADD COLUMN penalty_reason TEXT;
ALTER TABLE challenges ADD COLUMN penalized_at TEXT;
ALTER TABLE challenges ADD COLUMN reversed INTEGER NOT NULL DEFAULT 0;
CREATE INDEX challenges_penalized_idx ON challenges(penalized_at);
