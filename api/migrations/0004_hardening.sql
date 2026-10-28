-- Better Auth database-backed rate limiting storage.
CREATE TABLE "rateLimit" (
  "id" text PRIMARY KEY NOT NULL,
  "key" text NOT NULL,
  "count" integer NOT NULL,
  "lastRequest" integer NOT NULL
);
CREATE UNIQUE INDEX rate_limit_key_idx ON "rateLimit"("key");

-- Avatars record their uploader so only the owner can attach them and they can be deleted on replace.
ALTER TABLE avatars ADD COLUMN owner text;

-- Challenges gain the terminal status 'completed' (accepted challenge whose match was played).
-- SQLite cannot alter a CHECK constraint, so rebuild the table.
CREATE TABLE challenges_new (
  id text PRIMARY KEY NOT NULL,
  challenger_user_id text NOT NULL,
  challenger_player_id text NOT NULL,
  challenger_name text,
  challenger_rank integer,
  defender_user_id text NOT NULL,
  defender_player_id text NOT NULL,
  defender_name text,
  defender_rank integer,
  message text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','accepted','declined','expired','forfeited','cancelled','completed')),
  review_requested integer NOT NULL DEFAULT 0,
  expires_at text,
  responded_at text,
  resolved_by text,
  created_date text NOT NULL,
  updated_date text NOT NULL,
  created_by_id text,
  version integer NOT NULL DEFAULT 0
);
INSERT INTO challenges_new SELECT * FROM challenges;
DROP TABLE challenges;
ALTER TABLE challenges_new RENAME TO challenges;
CREATE INDEX challenges_status_idx ON challenges(status, created_date DESC);
CREATE INDEX challenges_challenger_idx ON challenges(challenger_user_id);
CREATE INDEX challenges_defender_idx ON challenges(defender_user_id);
