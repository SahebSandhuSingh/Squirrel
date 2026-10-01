/**
 * src/xp/rules.ts
 *
 * The XP rules (ADR-027). Pure: activity rows in, XP out. Nothing is stored — XP is always
 * derived from activity_sessions, so a rule change re-scores history consistently and there is
 * no balance to drift out of sync.
 *
 *   Run (source run_module)        50 for a completed run
 *                                  +1 per 100 m
 *                                  +25 if it captured territory
 *                                  rejected runs earn nothing
 *                                  at most 150 XP from runs per day
 *
 *   Exercise (source exercise_module), by the work that counted
 *                                  2 per full-range rep (rep exercises)
 *                                  1 per 2 counted lifts (timed: high knees)
 *                                  at most 70 XP per session
 *                                  at most 150 XP from exercise per day
 *
 * The Exercise Module counts only controlled reps (and high-knee lifts at running pace): too-fast
 * attempts are reported but never counted. A shallow rep counts toward the set, with a warning,
 * but only full-range reps (`good_reps`) earn XP, and idle time earns nothing. So doing it badly
 * on purpose is not faster XP. Rows written before good reps were
 * reported carry `reps` including shallow ones: their good share is `reps × correct_pct`.
 *
 * "Per day" is the person's own calendar day: the time zone their phone recorded the activity in
 * (metrics.timezone, an IANA name, on runs and exercise sessions alike), else XP_TIMEZONE
 * (default Asia/Kolkata), never UTC: a UTC day would reset at 5:30 am for Indian users and put a
 * 00:30 workout on the day before. Within a day, sessions are counted in the order they started,
 * so the cap always cuts the latest ones.
 *
 * Not built, because they are not defined yet: streaks, personal bests, challenges, daily-goal and
 * rest-day bonuses.
 */

export const RUN_COMPLETION_XP = 50;
export const RUN_METRES_PER_XP = 100;
export const TERRITORY_XP = 25;
export const DAILY_RUN_XP_CAP = 150;

export const EXERCISE_XP_PER_REP = 2;
export const EXERCISE_LIFTS_PER_XP = 2;
export const EXERCISE_SESSION_XP_CAP = 70;
export const DAILY_EXERCISE_XP_CAP = 150;

export const DEFAULT_XP_TIMEZONE = "Asia/Kolkata";

/** One activity_sessions row, as far as XP is concerned. */
export interface ActivityRow {
  id: string;
  type: string;
  source_module: string;
  started_at: Date;
  duration_s: number;
  metrics: Record<string, unknown> | null;
  created_at: Date;
}

export type XpReason =
  | "run_completed"
  | "run_distance"
  | "territory_captured"
  | "run_daily_cap"
  | "exercise_session"
  | "exercise_daily_cap"
  | "challenge completed";

export interface XpLine {
  reason: XpReason;
  xp: number;
}

export interface XpSummary {
  xp: number;
  /** When XP last went up: the latest row that earned any. Null for a user with no XP yet. */
  updated_at: Date | null;
  /** Totals per reason, in a fixed order; they add up to `xp`. Caps appear as negative lines. */
  breakdown: XpLine[];
  /** XP awarded per calendar day (YYYY-MM-DD, in each row's own time zone), after the caps. */
  byDay: Record<string, number>;
}

const REASON_ORDER: XpReason[] = [
  "run_completed",
  "run_distance",
  "territory_captured",
  "run_daily_cap",
  "exercise_session",
  "exercise_daily_cap",
  "challenge completed",
];

const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;

/** XP a single exercise session earns before the daily cap, from its activity metrics. */
export function exerciseSessionXp(metrics: Record<string, unknown> | null): number {
  const m = metrics ?? {};
  let xp: number;
  const lifts = count(m["lifts"]);
  if (lifts !== null) {
    xp = Math.floor(lifts / EXERCISE_LIFTS_PER_XP);
  } else {
    let good = count(m["good_reps"]);
    if (good === null) {
      const reps = count(m["reps"]) ?? 0;
      const correct = typeof m["correct_pct"] === "number" && Number.isFinite(m["correct_pct"]) ? m["correct_pct"] : 0;
      good = Math.floor((reps * Math.min(100, Math.max(0, correct))) / 100);
    }
    xp = good * EXERCISE_XP_PER_REP;
  }
  return Math.min(EXERCISE_SESSION_XP_CAP, xp);
}

/** The lines a single run earns before the daily cap (empty for a rejected run). */
export function runLines(metrics: Record<string, unknown> | null): XpLine[] {
  const m = metrics ?? {};
  // finalize.ts writes rejection_reason: null for accepted and flagged runs, a reason otherwise.
  if (m["rejection_reason"] !== null && m["rejection_reason"] !== undefined) return [];
  const distance = typeof m["distance_m"] === "number" && Number.isFinite(m["distance_m"]) ? m["distance_m"] : 0;
  const lines: XpLine[] = [
    { reason: "run_completed", xp: RUN_COMPLETION_XP },
    { reason: "run_distance", xp: Math.floor(Math.max(0, distance) / RUN_METRES_PER_XP) },
  ];
  if (m["territory_claimed"] === true) lines.push({ reason: "territory_captured", xp: TERRITORY_XP });
  return lines;
}

/** The name if it is a valid IANA time zone, else null. */
export function validTimeZone(zone: unknown): string | null {
  if (typeof zone !== "string" || !zone.trim() || zone.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

/** Calendar day (YYYY-MM-DD) of a moment in the given IANA time zone. */
export function xpDay(moment: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(moment);
}

type Kind = { lines: (row: ActivityRow) => XpLine[]; cap: number; capReason: XpReason };

const KINDS: Record<string, Kind> = {
  // A row counts only when the module that owns its type wrote it.
  "run/run_module": { lines: (row) => runLines(row.metrics), cap: DAILY_RUN_XP_CAP, capReason: "run_daily_cap" },
  "exercise/exercise_module": {
    lines: (row) => {
      const xp = exerciseSessionXp(row.metrics);
      return xp > 0 ? [{ reason: "exercise_session", xp }] : [];
    },
    cap: DAILY_EXERCISE_XP_CAP,
    capReason: "exercise_daily_cap",
  },
};

export function computeXp(rows: ActivityRow[], timeZone: string = DEFAULT_XP_TIMEZONE): XpSummary {
  const ordered = [...rows].sort(
    (a, b) =>
      a.started_at.getTime() - b.started_at.getTime() ||
      a.created_at.getTime() - b.created_at.getTime() ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const totals = new Map<XpReason, number>();
  const usedToday = new Map<string, number>(); // "<kind>|<day>" -> XP already awarded
  const byDay: Record<string, number> = {};
  let updatedAt: Date | null = null;

  for (const row of ordered) {
    const key = `${row.type}/${row.source_module}`;
    const kind = KINDS[key];
    if (!kind) continue;
    const lines = kind.lines(row);
    const raw = lines.reduce((sum, line) => sum + line.xp, 0);
    if (raw <= 0) continue;

    const zone = validTimeZone(row.metrics?.["timezone"]) ?? timeZone;
    const day = xpDay(row.started_at, zone);
    const bucket = `${key}|${day}`;
    const used = usedToday.get(bucket) ?? 0;
    const awarded = Math.min(raw, Math.max(0, kind.cap - used));
    usedToday.set(bucket, used + awarded);
    if (awarded > 0) byDay[day] = (byDay[day] ?? 0) + awarded;

    for (const line of lines) totals.set(line.reason, (totals.get(line.reason) ?? 0) + line.xp);
    if (awarded < raw) totals.set(kind.capReason, (totals.get(kind.capReason) ?? 0) - (raw - awarded));
    if (awarded > 0 && (updatedAt === null || row.created_at > updatedAt)) updatedAt = row.created_at;
  }

  const breakdown = REASON_ORDER.filter((reason) => totals.has(reason)).map((reason) => ({ reason, xp: totals.get(reason)! }));
  return { xp: breakdown.reduce((sum, line) => sum + line.xp, 0), updated_at: updatedAt, breakdown, byDay };
}
