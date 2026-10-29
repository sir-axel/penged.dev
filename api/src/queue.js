import { first, nowIso } from './db.js';

/**
 * Cheap badge count for the "To confirm" queue: results waiting on MY sign-off plus challenges waiting on MY
 * answer (singles: I am the defender; doubles: I am invited and have not accepted yet). One round trip, one SQL
 * statement (two scalar subqueries). Expired items are not counted.
 */
export async function myQueueCount({ env, user }) {
  const now = nowIso();
  const r = await first(
    env,
    `SELECT
       (SELECT count(*) FROM matches m
         WHERE m.status = 'pending' AND (m.expires_at IS NULL OR m.expires_at > ?)
           AND EXISTS (SELECT 1 FROM json_each(m.all_user_ids) WHERE value = ?)
           AND NOT EXISTS (SELECT 1 FROM json_each(m.accepted_user_ids) WHERE value = ?)) AS matches,
       (SELECT count(*) FROM challenges c
         WHERE c.status = 'open' AND (c.expires_at IS NULL OR c.expires_at > ?)
           AND ((c.format = 'singles' AND c.defender_user_id = ?)
             OR (c.format = 'doubles' AND c.challenger_user_id <> ?
                 AND EXISTS (SELECT 1 FROM json_each(c.all_user_ids) WHERE value = ?)
                 AND NOT EXISTS (SELECT 1 FROM json_each(c.accepted_user_ids) WHERE value = ?)))) AS challenges`,
    now, user.id, user.id, now, user.id, user.id, user.id, user.id,
  );
  const matches = r?.matches || 0;
  const challenges = r?.challenges || 0;
  return { matches, challenges, total: matches + challenges };
}
