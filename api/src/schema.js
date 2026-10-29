// Entity column whitelists + row decoding. type: text|int|bool|ts|array|json.
// array/json columns are TEXT (JSON) in D1; bool columns are INTEGER 0/1.
const common = { id: 'text', created_date: 'ts', updated_date: 'ts', created_by_id: 'text' };
export const ENTITIES = {
  Player: {
    table: 'players',
    cols: {
      ...common, user_id: 'text', username: 'text', username_lower: 'text', display_name: 'text',
      avatar_url: 'text', bio: 'text', singles_rating: 'int', doubles_rating: 'int', singles_rank: 'int', doubles_rank: 'int',
      singles_wins: 'int', singles_losses: 'int', doubles_wins: 'int', doubles_losses: 'int', singles_game_wins: 'int', singles_game_losses: 'int', doubles_game_wins: 'int', doubles_game_losses: 'int', xp: 'int',
      level: 'int', win_streak: 'int', best_streak: 'int', singles_win_streak: 'int', singles_best_streak: 'int', doubles_win_streak: 'int', doubles_best_streak: 'int', last_match_day: 'text', unanswered_challenges: 'int', under_review: 'bool', last_active_at: 'ts', singles_last_verified_at: 'ts', doubles_last_verified_at: 'ts', singles_rd: 'num', singles_vol: 'num', singles_rd_at: 'ts', doubles_rd: 'num', doubles_vol: 'num', doubles_rd_at: 'ts', timezone: 'text',
    },
  },
  Match: {
    table: 'matches',
    cols: {
      ...common, format: 'text', target: 'int', side_a: 'json', side_b: 'json', games: 'json',
      games_a: 'int', games_b: 'int', winner_side: 'text', status: 'text', all_player_ids: 'array',
      all_user_ids: 'array', accepted_user_ids: 'array', submitted_by_name: 'text',
      submitted_by_user_id: 'text', note: 'text', rating_changes: 'json', expires_at: 'ts', verified_at: 'ts', ranked: 'bool',
    },
  },
  Challenge: {
    table: 'challenges',
    cols: {
      ...common, challenger_user_id: 'text', challenger_player_id: 'text', challenger_name: 'text',
      challenger_rank: 'int', defender_user_id: 'text', defender_player_id: 'text', defender_name: 'text',
      defender_rank: 'int', message: 'text', status: 'text', review_requested: 'bool', expires_at: 'ts',
      responded_at: 'ts', resolved_by: 'text', penalty_rating: 'int', challenger_rating_gain: 'int', penalty_rank_before: 'int',
      penalty_rank_after: 'int', penalty_reason: 'text', penalized_at: 'ts', reversed: 'bool',
      format: 'text', downward: 'bool', challenger_partner_user_id: 'text', challenger_partner_player_id: 'text', challenger_partner_name: 'text',
      defender_partner_user_id: 'text', defender_partner_player_id: 'text', defender_partner_name: 'text',
      all_user_ids: 'array', all_player_ids: 'array', accepted_user_ids: 'array', declined_by_user_id: 'text',
    },
  },
};

/** Decode JSON text + booleans, keeping ALL keys (incl. internal `version`). */
export function decodeInternal(entity, row) {
  if (!row) return null;
  const { cols } = ENTITIES[entity];
  const out = { ...row };
  for (const [k, t] of Object.entries(cols)) {
    if (!(k in out) || out[k] == null) continue;
    if (t === 'json' || t === 'array') out[k] = typeof out[k] === 'string' ? JSON.parse(out[k]) : out[k];
    else if (t === 'bool') out[k] = !!out[k];
  }
  return out;
}
/** Public output shape: whitelisted columns only, decoded. */
export function pub(entity, row) {
  if (!row) return null;
  const d = decodeInternal(entity, row);
  const out = {};
  for (const k of Object.keys(ENTITIES[entity].cols)) out[k] = d[k] === undefined ? null : d[k];
  return out;
}
