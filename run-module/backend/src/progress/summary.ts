import { pool } from "../db/pool.js";
import { getUserXp, xpTimeZone } from "../xp/query.js";
import { xpDay, validTimeZone, type ActivityRow } from "../xp/rules.js";

export type DayRow = {
  date: string; xp: number; steps: number; workouts: number; workoutMinutes: number;
  activeMinutes: number; distanceKm: number; calories: number; challengesCompleted: number; goalsCompleted: number;
};
export type Streak = { current: number; longest: number; lastQualifyingDate: string | null; todayStatus: "done" | "at_risk" | "none" };

type ProgressActivity = ActivityRow & { user_id: string; calories_kcal: number | string | null };
type ChallengeAward = { xp_awarded: number; resolved_at: Date };

const isoDate = (value: string | undefined, fallback: string): string => {
  const date = value ?? fallback;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw Object.assign(new Error("date must be YYYY-MM-DD"), { statusCode: 400 });
  }
  return date;
};

const shiftDay = (date: string, offset: number): string => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};

const weekStartFor = (date: string): string => shiftDay(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
const number = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

function activityDate(row: ProgressActivity, fallbackZone: string): string {
  return xpDay(row.started_at, validTimeZone(row.metrics?.["timezone"]) ?? fallbackZone);
}

function blankDay(date: string): DayRow {
  return { date, xp: 0, steps: 0, workouts: 0, workoutMinutes: 0, activeMinutes: 0, distanceKm: 0,
    calories: 0, challengesCompleted: 0, goalsCompleted: 0 };
}

export async function readProgress(userId: string): Promise<{ days: Map<string, DayRow>; streak: Streak; timezone: string; xp: number; byDay: Record<string, number> }> {
  const timezone = xpTimeZone();
  const [activityResult, xpSummary, challengeResult] = await Promise.all([
    pool.query<ProgressActivity>(
      `SELECT id, user_id, type, source_module, started_at, duration_s, metrics, created_at, calories_kcal
       FROM activity_sessions WHERE user_id = $1 ORDER BY started_at, created_at, id`, [userId]),
    getUserXp(userId),
    pool.query<ChallengeAward>(
      `SELECT cp.xp_awarded, c.resolved_at
       FROM challenge_participants cp JOIN challenges c ON c.id = cp.challenge_id
       WHERE cp.user_id = $1 AND cp.is_winner IS TRUE AND cp.xp_awarded > 0 AND c.state = 'resolved'
       ORDER BY c.resolved_at`, [userId]),
  ]);

  const days = new Map<string, DayRow>();
  const rowFor = (date: string) => {
    let row = days.get(date);
    if (!row) { row = blankDay(date); days.set(date, row); }
    return row;
  };
  for (const row of activityResult.rows) {
    const day = rowFor(activityDate(row, timezone));
    const metrics = row.metrics ?? {};
    if (row.type === "exercise" && row.source_module === "exercise_module") {
      day.workouts += 1;
      day.workoutMinutes += Math.max(0, number(metrics["active_time_s"] ?? row.duration_s)) / 60;
    }
    if (row.type === "run" && row.source_module === "run_module") {
      day.workouts += 1;
      day.workoutMinutes += Math.max(0, number(metrics["moving_time_s"] ?? row.duration_s)) / 60;
      day.distanceKm += Math.max(0, number(metrics["distance_m"])) / 1000;
      day.activeMinutes += Math.max(0, number(metrics["moving_time_s"] ?? row.duration_s)) / 60;
    } else if (row.type === "exercise" && row.source_module === "exercise_module") {
      day.activeMinutes += Math.max(0, number(metrics["active_time_s"] ?? row.duration_s)) / 60;
    }
    day.steps += Math.max(0, number(metrics["steps"]));
    day.calories += Math.max(0, number(row.calories_kcal));
  }

  const challengeXpByDay: Record<string, number> = {};
  for (const award of challengeResult.rows) {
    const date = xpDay(award.resolved_at, timezone);
    const day = rowFor(date);
    day.challengesCompleted += 1;
    challengeXpByDay[date] = (challengeXpByDay[date] ?? 0) + award.xp_awarded;
  }
  for (const [date, row] of days) row.xp = (xpSummary.byDay[date] ?? 0) + (challengeXpByDay[date] ?? 0);
  // Round at the day bucket so daily, weekly, history, and lifetime views share identical minutes.
  for (const row of days.values()) {
    row.workoutMinutes = Math.round(row.workoutMinutes);
    row.activeMinutes = Math.round(row.activeMinutes);
  }

  // Daily goals have no agreed targets/reward rules yet (ADR-027), so return the contract's
  // empty-goals state instead of inventing goals or bonus XP.
  const today = xpDay(new Date(), timezone);
  const activeDates = [...days.values()].filter((day) => day.workouts > 0 || day.distanceKm > 0 || day.steps > 0)
    .map((day) => day.date).sort();
  const active = new Set(activeDates);
  const yesterday = shiftDay(today, -1);
  let current = 0;
  let cursor = active.has(today) ? today : yesterday;
  while (active.has(cursor)) { current += 1; cursor = shiftDay(cursor, -1); }
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of activeDates) {
    run = previous !== null && shiftDay(previous, 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }
  const lastQualifyingDate = activeDates.at(-1) ?? null;
  const streak: Streak = { current, longest, lastQualifyingDate,
    todayStatus: active.has(today) ? "done" : active.has(yesterday) ? "at_risk" : "none" };
  return { days, streak, timezone, xp: xpSummary.xp, byDay: xpSummary.byDay };
}

export function progressDay(data: Awaited<ReturnType<typeof readProgress>>, date: string, isToday: boolean): DayRow & {
  goals: never[]; goalsTotal: number; streak: Streak; isToday: boolean;
} {
  return { ...dayRow(data, date),
    goals: [], goalsTotal: 0, streak: data.streak, isToday };
}

function dayRow(data: Awaited<ReturnType<typeof readProgress>>, date: string): DayRow {
  const row = data.days.get(date);
  return { ...blankDay(date), ...(row ?? {}), xp: row?.xp ?? data.byDay[date] ?? 0 };
}

export function progressTotals(rows: DayRow[]) {
  const totals = rows.reduce((total, day) => ({
    xp: total.xp + day.xp, steps: total.steps + day.steps, workouts: total.workouts + day.workouts,
    workoutMinutes: total.workoutMinutes + day.workoutMinutes, activeMinutes: total.activeMinutes + day.activeMinutes,
    distanceKm: total.distanceKm + day.distanceKm, calories: total.calories + day.calories,
    challengesCompleted: total.challengesCompleted + day.challengesCompleted,
    goalsCompleted: total.goalsCompleted + day.goalsCompleted,
  }), { xp: 0, steps: 0, workouts: 0, workoutMinutes: 0, activeMinutes: 0, distanceKm: 0,
    calories: 0, challengesCompleted: 0, goalsCompleted: 0 });
  return { ...totals, activeDays: rows.filter((day) => day.workouts > 0 || day.distanceKm > 0 || day.steps > 0).length };
}

export function levelForXp(totalXp: number) {
  const level = Math.floor(totalXp / 2000) + 1;
  const xpForCurrentLevel = (level - 1) * 2000;
  const xpForNextLevel = level * 2000;
  return { level, currentXP: totalXp, xpForCurrentLevel, xpForNextLevel,
    progress: (totalXp - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel) };
}

export async function lifetimeProgress(userId: string) {
  const data = await readProgress(userId);
  const rows = [...data.days.values()];
  const totals = progressTotals(rows);
  const today = xpDay(new Date(), data.timezone);
  return { userId, timezone: data.timezone, totalXp: data.xp, level: levelForXp(data.xp),
    totalWorkouts: totals.workouts, totalWorkoutMinutes: totals.workoutMinutes, totalActiveMinutes: totals.activeMinutes,
    totalSteps: totals.steps, totalDistanceKm: totals.distanceKm, totalCalories: totals.calories,
    challengesCompleted: totals.challengesCompleted, streak: data.streak, today: progressDay(data, today, true) };
}

export async function dailyProgress(userId: string, date?: string) {
  const data = await readProgress(userId);
  const today = xpDay(new Date(), data.timezone);
  const requested = isoDate(date, today);
  return progressDay(data, requested, requested === today);
}

export async function weeklyProgress(userId: string, weekStart?: string) {
  const data = await readProgress(userId);
  const today = xpDay(new Date(), data.timezone);
  const start = weekStartFor(isoDate(weekStart, weekStartFor(today)));
  const days = Array.from({ length: 7 }, (_, i) => dayRow(data, shiftDay(start, i)));
  const previous = Array.from({ length: 7 }, (_, i) => dayRow(data, shiftDay(start, i - 7)));
  const currentTotals = progressTotals(days);
  const previousTotals = progressTotals(previous);
  const changeKeys = ["xp", "steps", "workouts", "workoutMinutes", "activeMinutes", "challengesCompleted"] as const;
  const change = Object.fromEntries(changeKeys.map((key) => [key, previousTotals[key] === 0 ? null : (currentTotals[key] - previousTotals[key]) / previousTotals[key]]));
  return { ...currentTotals, weekStart: start, weekEnd: shiftDay(start, 6), streak: data.streak, previous: previousTotals, change, days };
}

export async function progressHistory(userId: string, days: number) {
  if (!Number.isInteger(days) || days < 1 || days > 366) throw Object.assign(new Error("days must be between 1 and 366"), { statusCode: 400 });
  const data = await readProgress(userId);
  const to = xpDay(new Date(), data.timezone);
  const from = shiftDay(to, 1 - days);
  return { from, to, days: Array.from({ length: days }, (_, i) => dayRow(data, shiftDay(from, i))) };
}
