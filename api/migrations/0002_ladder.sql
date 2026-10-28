-- JSON values (side_a, side_b, games, rating_changes, *_ids) are stored as TEXT.
-- `version` columns are internal optimistic-concurrency counters (never returned by the API).
CREATE TABLE players (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL UNIQUE,
  username text NOT NULL,
  username_lower text NOT NULL UNIQUE,
  display_name text,
  avatar_url text,
  bio text,
  singles_rating integer NOT NULL DEFAULT 1400,
  doubles_rating integer NOT NULL DEFAULT 1400,
  singles_rank integer,
  singles_wins integer NOT NULL DEFAULT 0,
  singles_losses integer NOT NULL DEFAULT 0,
  doubles_wins integer NOT NULL DEFAULT 0,
  doubles_losses integer NOT NULL DEFAULT 0,
  xp integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  unanswered_challenges integer NOT NULL DEFAULT 0,
  under_review integer NOT NULL DEFAULT 0,
  last_active_at text,
  created_date text NOT NULL,
  updated_date text NOT NULL,
  created_by_id text,
  version integer NOT NULL DEFAULT 0
);
CREATE INDEX players_rank_idx ON players(singles_rank);

CREATE TABLE matches (
  id text PRIMARY KEY NOT NULL,
  format text NOT NULL CHECK (format IN ('singles','doubles')),
  target integer NOT NULL CHECK (target IN (11,21)),
  side_a text NOT NULL,
  side_b text NOT NULL,
  games text NOT NULL,
  games_a integer NOT NULL,
  games_b integer NOT NULL,
  winner_side text NOT NULL CHECK (winner_side IN ('a','b')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','declined','disputed','expired','cancelled')),
  all_player_ids text NOT NULL,
  all_user_ids text NOT NULL,
  accepted_user_ids text NOT NULL DEFAULT '[]',
  submitted_by_name text,
  submitted_by_user_id text,
  note text,
  rating_changes text NOT NULL DEFAULT '[]',
  expires_at text,
  verified_at text,
  created_date text NOT NULL,
  updated_date text NOT NULL,
  created_by_id text,
  version integer NOT NULL DEFAULT 0
);
CREATE INDEX matches_status_created_idx ON matches(status, created_date DESC);
CREATE INDEX matches_created_idx ON matches(created_date DESC);

CREATE TABLE challenges (
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
    CHECK (status IN ('open','accepted','declined','expired','forfeited','cancelled')),
  review_requested integer NOT NULL DEFAULT 0,
  expires_at text,
  responded_at text,
  resolved_by text,
  created_date text NOT NULL,
  updated_date text NOT NULL,
  created_by_id text,
  version integer NOT NULL DEFAULT 0
);
CREATE INDEX challenges_status_idx ON challenges(status, created_date DESC);
CREATE INDEX challenges_challenger_idx ON challenges(challenger_user_id);
CREATE INDEX challenges_defender_idx ON challenges(defender_user_id);

-- Atomicity helpers (see src/db.js): batch guards insert into _guard; a failed condition violates the
-- CHECK and rolls back the whole D1 batch. meta.ladder_version covers rank/membership changes.
CREATE TABLE _guard (ok integer NOT NULL CHECK (ok = 1));
CREATE TABLE meta (key text PRIMARY KEY NOT NULL, value integer NOT NULL);
INSERT INTO meta (key, value) VALUES ('ladder_version', 0);
