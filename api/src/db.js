import { HttpError } from './errors.js';

export const nowIso = () => new Date().toISOString();
export const daysAgoIso = (d) => new Date(Date.now() - d * 86400000).toISOString();
export const inFutureIso = (ms) => new Date(Date.now() + ms).toISOString();
export const uuid = () => crypto.randomUUID();

export const stmt = (env, sql, ...params) => env.DB.prepare(sql).bind(...params);
export async function all(env, sql, ...params) {
  return (await stmt(env, sql, ...params).all()).results;
}
export async function first(env, sql, ...params) {
  return (await all(env, sql, ...params))[0] ?? null;
}
export const placeholders = (n) => Array(n).fill('?').join(',');

/*
 * Atomicity on D1 (no interactive transactions):
 *   1. read fresh rows (+ their `version` counters, and meta.ladder_version for rank/membership state),
 *   2. compute every write up front,
 *   3. run them in ONE env.DB.batch([...]) (D1 runs a batch as a single transaction),
 *      led by guard statements. A guard inserts into `_guard`, whose CHECK (ok = 1) fails when the
 *      guarded condition (row version unchanged, status unchanged, ...) no longer holds. The error
 *      rolls back the entire batch, we raise ConflictError and `retrying` re-reads and re-computes
 *      (up to 5 times), finally answering 409.
 */
export class ConflictError extends Error {}

/** Guard statement: aborts the whole batch unless `cond` (SQL expression) is true. */
export const guard = (env, cond, ...params) =>
  stmt(env, `INSERT INTO _guard (ok) SELECT CASE WHEN ${cond} THEN 1 ELSE 0 END`, ...params);

/** Guard that a row still has the version (and optionally status) that was read. */
export const guardRow = (env, table, id, version, status) =>
  status === undefined
    ? guard(env, `EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND version = ?)`, id, version)
    : guard(env, `EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND version = ? AND status = ?)`, id, version, status);

export const ladderVersion = async (env) => (await first(env, "SELECT value FROM meta WHERE key = 'ladder_version'")).value;
export const guardLadder = (env, v) => guard(env, "(SELECT value FROM meta WHERE key = 'ladder_version') = ?", v);
export const bumpLadder = (env) => stmt(env, "UPDATE meta SET value = value + 1 WHERE key = 'ladder_version'");

export async function commit(env, stmts) {
  try {
    return await env.DB.batch([...stmts, env.DB.prepare('DELETE FROM _guard')]);
  } catch (e) {
    const msg = `${e?.message || ''} ${e?.cause?.message || ''}`;
    if (/CHECK constraint failed|UNIQUE constraint failed/i.test(msg)) throw new ConflictError(msg);
    throw e;
  }
}

export async function retrying(fn) {
  for (let i = 0; i < 5; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
    }
  }
  throw new HttpError(409, 'That changed while you were working. Please try again.');
}
