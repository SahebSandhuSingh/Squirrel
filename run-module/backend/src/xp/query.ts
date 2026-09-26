/**
 * src/xp/query.ts
 *
 * Reads a user's activity_sessions rows and scores them with the XP rules (ADR-027). This is the
 * one place the Run Module reads activity_sessions; it reads every module's rows for that user,
 * because XP counts runs and exercise sessions alike, and never writes anything.
 */

import { pool } from "../db/pool.js";
import { computeXp, DEFAULT_XP_TIMEZONE, type ActivityRow, type XpSummary } from "./rules.js";

const SELECT_ACTIVITY = `
  SELECT id, type, source_module, started_at, duration_s, metrics, created_at
  FROM   activity_sessions
  WHERE  user_id = $1
`;

/** The IANA time zone XP days follow. An unknown zone falls back to the default rather than
 *  failing every XP read. */
export function xpTimeZone(): string {
  const zone = process.env["XP_TIMEZONE"]?.trim();
  if (!zone) return DEFAULT_XP_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_XP_TIMEZONE;
  }
}

export async function getUserXp(userId: string): Promise<XpSummary> {
  const { rows } = await pool.query<ActivityRow>(SELECT_ACTIVITY, [userId]);
  return computeXp(rows, xpTimeZone());
}

export async function meetsXpGate(userId: string, minXp: number): Promise<boolean> {
  return (await getUserXp(userId)).xp >= minXp;
}
