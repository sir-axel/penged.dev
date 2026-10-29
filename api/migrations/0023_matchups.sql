-- Weekly matchmaking ("This week's match", singles only). Every player with a singles ladder position at generation time
-- gets ONE assigned opponent per week (Monday 00:00 -> next Monday 00:00 America/Chicago). Many players may pick the same
-- opponent. player_id OWES the match. The opponent is a MYSTERY to the owner until they accept (said_yes_at): accept
-- reveals them and sends the challenge; decline costs the max loss right away; no answer costs it at week end.
-- Rows are written only by functions.js (ensureMatchupWeek / matchupYes / matchupDecline / matchupBackOut /
-- settleMatchups / verifyPlan), guarded on version.
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
  -- the raw quote at generation (a dominant 2-0 either way, played as a challenge, bounties included)
  quote_win INTEGER,
  quote_loss INTEGER,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','committed','played','cleared','backed_out','missed','declined')),
  said_yes_at TEXT, -- accepted ("Accept"): the opponent is revealed from here on
  -- frozen at generation: max_win = quote_win; max_loss = quote_loss scaled by loss_factor so it stays under the win
  -- (loss_factor = min(1, MATCHUP_LOSS_RATIO x max_win / quote_loss)); a lost matched game is scaled by loss_factor too
  max_win INTEGER,
  max_loss INTEGER,
  loss_factor REAL,
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

-- A challenge sent from a matchup ("Accept"). It skips the weekly caps, the one-active rule and the pair cooldown
-- (and does not count toward them), otherwise it is a normal singles challenge.
ALTER TABLE challenges ADD COLUMN matchup_id TEXT;
