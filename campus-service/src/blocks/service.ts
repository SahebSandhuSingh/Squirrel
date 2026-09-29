import { getPool, one, type Queryable } from '../db/pool.js';

/** True when either user has blocked the other. Keep all block checks on this helper. */
export async function isBlockedEitherWay(a: string, b: string, q: Queryable = getPool()): Promise<boolean> {
  const r = await one<{ blocked: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM blocks
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)
     ) AS blocked`, [a, b], q,
  );
  return r?.blocked ?? false;
}
