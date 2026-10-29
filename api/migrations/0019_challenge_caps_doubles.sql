-- Challenge caps, challenging down (top 3) and doubles challenges.
-- downward = 1: a top-3 player challenged someone ranked below them; declining or ignoring it costs nobody anything.
-- format 'doubles': challenger + partner vs defender + defender partner. The partner and both defenders must all accept
-- (accepted_user_ids); one decline closes it (declined_by_user_id); no penalty, no walkover. all_user_ids / all_player_ids = every participant.
ALTER TABLE challenges ADD COLUMN format TEXT NOT NULL DEFAULT 'singles' CHECK (format IN ('singles','doubles'));
ALTER TABLE challenges ADD COLUMN downward INTEGER NOT NULL DEFAULT 0;
ALTER TABLE challenges ADD COLUMN challenger_partner_user_id TEXT;
ALTER TABLE challenges ADD COLUMN challenger_partner_player_id TEXT;
ALTER TABLE challenges ADD COLUMN challenger_partner_name TEXT;
ALTER TABLE challenges ADD COLUMN defender_partner_user_id TEXT;
ALTER TABLE challenges ADD COLUMN defender_partner_player_id TEXT;
ALTER TABLE challenges ADD COLUMN defender_partner_name TEXT;
ALTER TABLE challenges ADD COLUMN all_user_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE challenges ADD COLUMN all_player_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE challenges ADD COLUMN accepted_user_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE challenges ADD COLUMN declined_by_user_id TEXT;
UPDATE challenges SET all_user_ids = json_array(challenger_user_id, defender_user_id),
  all_player_ids = json_array(challenger_player_id, defender_player_id);
-- Weekly caps count challenges by creation time.
CREATE INDEX challenges_created_idx ON challenges(created_date);
