/**
 * src/xp/query.ts
 *
 * Reads a user's activity_sessions rows and scores them with the XP rules (ADR-027). This is the
 * one place the Run Module reads activity_sessions; it reads every module's rows for that user,
 * because XP counts runs and exercise sessions alike, and never writes anything.
 */

import { pool } from "../db/pool.js";
import { computeXp, DEFAULT_XP_TIMEZONE, validTimeZone, xpDay, type ActivityRow, type XpSummary } from "./rules.js";

const SELECT_ACTIVITY = `
  SELECT id, type, source_module, started_at, duration_s, metrics, created_at
  FROM   activity_sessions
  WHERE  user_id = $1
`;

const SELECT_CHALLENGE_XP = `
  SELECT COALESCE(SUM(cp.xp_awarded), 0) AS xp,
         MAX(c.resolved_at) AS updated_at
  FROM challenge_participants cp
  JOIN challenges c ON c.id = cp.challenge_id
  WHERE cp.user_id = $1
    AND cp.is_winner IS TRUE
    AND cp.xp_awarded > 0
    AND c.state = 'resolved'
`;

/** The IANA time zone XP days follow for rows that do not carry their own. An unknown zone falls
 *  back to the default rather than failing every XP read. */
export function xpTimeZone(): string {
  return validTimeZone(process.env["XP_TIMEZONE"]?.trim()) ?? DEFAULT_XP_TIMEZONE;
}

export async function getUserXp(userId: string): Promise<XpSummary> {
  const { rows } = await pool.query<ActivityRow>(SELECT_ACTIVITY, [userId]);
  const summary = computeXp(rows, xpTimeZone());
  const challenge = await pool.query<{ xp: string | number; updated_at: Date | null }>(SELECT_CHALLENGE_XP, [userId]);
  const challengeXp = Number(challenge.rows[0]?.xp ?? 0);
  if (challengeXp <= 0) return summary;

  const challengeUpdatedAt = challenge.rows[0]?.updated_at ?? null;
  return {
    ...summary,
    xp: summary.xp + challengeXp,
    updated_at:
      challengeUpdatedAt && (!summary.updated_at || challengeUpdatedAt > summary.updated_at)
        ? challengeUpdatedAt
        : summary.updated_at,
    breakdown: [...summary.breakdown, { reason: "challenge completed", xp: challengeXp }],
  };
}

export async function meetsXpGate(userId: string, minXp: number): Promise<boolean> {
  return (await getUserXp(userId)).xp >= minXp;
}

export type XpBoardWindow = "daily" | "weekly";
export const XP_BOARD_DAYS: Record<XpBoardWindow, number> = { daily: 1, weekly: 7 };

export interface XpBoardEntry {
  rank: number;
  user_id: string;
  xp: number;
}

export interface XpBoard {
  window: XpBoardWindow;
  /** Today, in XP_TIMEZONE: the last day of the window. */
  day: string;
  /** Everyone who earned XP in the window, most first; equal XP shares a rank. */
  entries: XpBoardEntry[];
}

/** The calendar days (YYYY-MM-DD, XP_TIMEZONE) of the window ending today. */
export function windowDays(window: XpBoardWindow, now: Date, timeZone: string): string[] {
  const days: string[] = [];
  for (let i = 0; days.length < XP_BOARD_DAYS[window] && i < 40; i++) {
    const day = xpDay(new Date(now.getTime() - i * 86_400_000), timeZone);
    if (!days.includes(day)) days.push(day);
  }
  return days;
}

/** Rank users by the XP they earned in the window's days (after the daily caps, ADR-027). */
export function rankXp(byUser: Map<string, Record<string, number>>, days: string[]): XpBoardEntry[] {
  const totals = [...byUser.entries()]
    .map(([user_id, byDay]) => ({ user_id, xp: days.reduce((sum, d) => sum + (byDay[d] ?? 0), 0) }))
    .filter((e) => e.xp > 0)
    .sort((a, b) => b.xp - a.xp || (a.user_id < b.user_id ? -1 : 1));
  let rank = 0;
  return totals.map((e, i) => {
    if (i === 0 || e.xp !== totals[i - 1]!.xp) rank = i + 1;
    return { rank, user_id: e.user_id, xp: e.xp };
  });
}

export async function getXpBoard(window: XpBoardWindow, now: Date = new Date()): Promise<XpBoard> {
  const timeZone = xpTimeZone();
  const days = windowDays(window, now, timeZone);
  // Two extra days: rows are bucketed by their own time zone, which can be a day off XP_TIMEZONE.
  const { rows } = await pool.query<ActivityRow & { user_id: string }>(
    `SELECT user_id, id, type, source_module, started_at, duration_s, metrics, created_at
     FROM   activity_sessions
     WHERE  started_at >= $1`,
    [new Date(now.getTime() - (XP_BOARD_DAYS[window] + 2) * 86_400_000)],
  );
  const perUser = new Map<string, ActivityRow[]>();
  for (const row of rows) {
    const list = perUser.get(row.user_id) ?? [];
    list.push(row);
    perUser.set(row.user_id, list);
  }
  const byUser = new Map<string, Record<string, number>>();
  for (const [userId, userRows] of perUser) byUser.set(userId, computeXp(userRows, timeZone).byDay);
  return { window, day: days[0]!, entries: rankXp(byUser, days) };
}
