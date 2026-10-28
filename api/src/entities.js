import { Hono } from 'hono';
import { all, first } from './db.js';
import { HttpError, bad } from './errors.js';
import { ENTITIES, pub } from './schema.js';

export { ENTITIES };
const OPS = { $gte: '>=', $lte: '<=', $gt: '>', $lt: '<' };
const inArr = (col) => `EXISTS (SELECT 1 FROM json_each(${col}) WHERE value = ?)`;

function checkScalar(name, type, v) {
  if (type === 'int') {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw bad(`Field "${name}" expects a number`);
    if (!Number.isInteger(v) || Math.abs(v) > 2147483647) throw bad(`Field "${name}" expects a 32-bit integer`);
  } else if (type === 'bool') {
    if (typeof v !== 'boolean') throw bad(`Field "${name}" expects a boolean`);
  } else if (type === 'ts') {
    if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw bad(`Field "${name}" expects an ISO date`);
  } else if (typeof v !== 'string') {
    throw bad(`Field "${name}" expects a string`);
  }
}
// ts values are compared as ISO text; normalise so "2026-01-01" style input still sorts correctly.
const bindVal = (type, v) => (type === 'bool' ? (v ? 1 : 0) : type === 'ts' ? new Date(v).toISOString() : v);

export function buildWhere(def, filter) {
  if (filter == null) return { sql: '', params: [] };
  if (typeof filter !== 'object' || Array.isArray(filter)) throw bad('filter must be a JSON object');
  const parts = [];
  const params = [];
  for (const [name, cond] of Object.entries(filter)) {
    const type = Object.hasOwn(def.cols, name) ? def.cols[name] : undefined;
    if (!type || type === 'json') throw bad(`Unknown filter field "${name}"`);
    const col = `"${name}"`;
    const isObj = cond !== null && typeof cond === 'object' && !Array.isArray(cond);
    if (!isObj) {
      if (type === 'array') {
        checkScalar(name, 'text', cond);
        parts.push(inArr(col));
        params.push(cond);
      } else if (cond === null) {
        parts.push(`${col} IS NULL`);
      } else {
        checkScalar(name, type, cond);
        parts.push(`${col} = ?`);
        params.push(bindVal(type, cond));
      }
      continue;
    }
    const entries = Object.entries(cond);
    if (!entries.length) throw bad(`Empty operator object for "${name}"`);
    for (const [op, v] of entries) {
      if (op in OPS) {
        if (type === 'array' || type === 'bool') throw bad(`Operator ${op} not allowed on "${name}"`);
        checkScalar(name, type, v);
        parts.push(`${col} ${OPS[op]} ?`);
        params.push(bindVal(type, v));
      } else if (op === '$ne') {
        if (type === 'array') {
          checkScalar(name, 'text', v);
          parts.push(`NOT ${inArr(col)}`);
          params.push(v);
        } else if (v === null) {
          parts.push(`${col} IS NOT NULL`);
        } else {
          checkScalar(name, type, v);
          parts.push(`${col} IS NOT ?`);
          params.push(bindVal(type, v));
        }
      } else if (op === '$in') {
        if (!Array.isArray(v) || v.length > 100) throw bad(`$in on "${name}" needs an array of at most 100 items`);
        const t = type === 'array' ? 'text' : type;
        v.forEach((x) => checkScalar(name, t, x));
        if (!v.length) {
          parts.push('0');
        } else if (type === 'array') {
          parts.push(`EXISTS (SELECT 1 FROM json_each(${col}) WHERE value IN (${v.map(() => '?').join(',')}))`);
          params.push(...v);
        } else {
          parts.push(`${col} IN (${v.map(() => '?').join(',')})`);
          params.push(...v.map((x) => bindVal(type, x)));
        }
      } else {
        throw bad(`Unknown operator "${op}"`);
      }
    }
  }
  return { sql: parts.length ? 'WHERE ' + parts.join(' AND ') : '', params };
}

function parseFilter(raw) {
  if (raw == null || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw bad('filter is not valid JSON');
  }
}
function getDef(name) {
  const def = Object.hasOwn(ENTITIES, name) ? ENTITIES[name] : null;
  if (!def) throw new HttpError(404, 'Not found');
  return def;
}

export const entities = new Hono();

entities.get('/:entity/count', async (c) => {
  const def = getDef(c.req.param('entity'));
  const { sql, params } = buildWhere(def, parseFilter(c.req.query('filter')));
  const r = await first(c.env, `SELECT count(*) AS count FROM ${def.table} ${sql}`, ...params);
  return c.json({ count: r.count });
});

entities.get('/:entity/:id', async (c) => {
  const name = c.req.param('entity');
  const def = getDef(name);
  const r = await first(c.env, `SELECT * FROM ${def.table} WHERE id = ?`, c.req.param('id'));
  if (!r) throw new HttpError(404, 'Not found');
  return c.json(pub(name, r));
});

entities.get('/:entity', async (c) => {
  const name = c.req.param('entity');
  const def = getDef(name);
  const { sql, params } = buildWhere(def, parseFilter(c.req.query('filter')));
  let sort = c.req.query('sort') || '-created_date';
  let dir = 'ASC';
  if (sort.startsWith('-')) {
    dir = 'DESC';
    sort = sort.slice(1);
  }
  const sortType = Object.hasOwn(def.cols, sort) ? def.cols[sort] : undefined;
  if (!sortType || sortType === 'json' || sortType === 'array') throw bad(`Cannot sort by "${sort}"`);
  const limitRaw = c.req.query('limit');
  const skipRaw = c.req.query('skip');
  const limit = limitRaw == null ? 50 : Number(limitRaw);
  const skip = skipRaw == null ? 0 : Number(skipRaw);
  if (!Number.isInteger(limit) || limit < 1) throw bad('limit must be a positive integer');
  if (!Number.isInteger(skip) || skip < 0) throw bad('skip must be a non-negative integer');
  // NULLs last in both directions.
  const rows = await all(
    c.env,
    `SELECT * FROM ${def.table} ${sql} ORDER BY "${sort}" IS NULL, "${sort}" ${dir}, id ASC LIMIT ${Math.min(limit, 500)} OFFSET ${skip}`,
    ...params,
  );
  return c.json({ items: rows.map((r) => pub(name, r)) });
});
