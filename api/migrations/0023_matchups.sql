-- Weekly matchmaking ("This week's match", singles only). Every player with a singles ladder position at generation time
-- gets ONE assigned opponent per week (Monday 00:00 -> next Monday 00:00 America/Chicago). Many players may pick the same
-- opponent. player_id OWES the match: play it, or lose the max loss at week end. Rows are written only by functions.js
-- (ensureMatchupWeek / matchupYes / matchupBackOut / settleMatchups / verifyPlan), guarded on version.
-- matchup_weeks has one row per generated week: its PRIMARY KEY makes generation race-safe (the second concurrent batch
-- fails on it and rolls back all of its inserts), and UNIQUE (week_start, player_id) backs that up.
CREATE TABLE matchup_weeks (
  week_start TEXT PRIMARY KEY NOT NULL,
  week_end TEXT NOT NULL,
  players INTEGER NOT NULL DEFAULT 0,
  created_date TEXT NOT NULL
);

CREATE TABLE matchups (
  id TEXT PRIMARY KEY NOT NULL,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  player_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  opponent_player_id TEXT NOT NULL,
  opponent_user_id TEXT NOT NULL,
  -- why this opponent (facts at generation, from the owner's point of view)
  score REAL NOT NULL DEFAULT 0,
  never_played INTEGER NOT NULL DEFAULT 0,
  last_played_days INTEGER,
  dodged_by_them INTEGER NOT NULL DEFAULT 0,
  dodged_by_me INTEGER NOT NULL DEFAULT 0,
  opponent_rank INTEGER,
  -- what's on the line for the owner when generated (for the email); max_* are frozen when the owner says yes
  quote_win INTEGER,
  quote_loss INTEGER,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','committed','played','cleared','backed_out','missed')),
  said_yes_at TEXT,
  max_win INTEGER,
  max_loss INTEGER,
  challenge_id TEXT,
  match_id TEXT,
  penalty_rating INTEGER,
  penalty_reason TEXT,
  penalty_rank_before INTEGER,
  penalty_rank_after INTEGER,
  settled_at TEXT,
  created_date TEXT NOT NULL,
  updated_date TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  UNIQUE (week_start, player_id)
);
CREATE INDEX matchups_opponent_idx ON matchups(week_start, opponent_player_id);
CREATE INDEX matchups_unsettled_idx ON matchups(settled_at, week_end);

-- A challenge sent from a matchup ("I'm in"). It skips the weekly caps, the one-active rule and the pair cooldown
-- (and does not count toward them), otherwise it is a normal singles challenge.
ALTER TABLE challenges ADD COLUMN matchup_id TEXT;
