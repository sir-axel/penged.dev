-- Challengers can take back a regular challenge they sent (status 'cancelled'):
--   revoke_kind 'swapped' = sent to someone else instead in the same step: free, and neither the old send nor the old
--                           receive counts toward the weekly caps;
--   revoke_kind 'revoked' = taken back for good: costs the challenger revoke_penalty rating (what ducking that player
--                           would cost them) and still counts as one of their weekly sends.
ALTER TABLE challenges ADD COLUMN revoke_kind TEXT CHECK (revoke_kind IN ('swapped','revoked'));
ALTER TABLE challenges ADD COLUMN revoke_penalty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE challenges ADD COLUMN revoked_at TEXT;
ALTER TABLE challenges ADD COLUMN swapped_to_id TEXT;
