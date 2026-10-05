import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import Fastify from "fastify";
import { SignJWT } from "jose";
import { JWT_SECRET } from "../../config/env.js";
import { pool } from "../../db/pool.js";
import { progressRoutes } from "./progress.js";

const bearer = async (userId: string) => ({ authorization: `Bearer ${await new SignJWT({ sub: userId, typ: "access" })
  .setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(new TextEncoder().encode(JWT_SECRET))}` });

describe("Progress API", () => {
  const app = Fastify();
  void app.register(progressRoutes);
  const users: string[] = [];

  beforeAll(async () => { await app.ready(); });
  afterEach(async () => {
    await pool.query("DELETE FROM challenge_participants WHERE user_id = ANY($1)", [users]);
    await pool.query("DELETE FROM challenges WHERE created_by = ANY($1)", [users]);
    await pool.query("DELETE FROM activity_sessions WHERE user_id = ANY($1)", [users]);
    await pool.query("DELETE FROM external_xp_awards WHERE user_id = ANY($1)", [users]);
    users.length = 0;
  });
  afterAll(async () => { await app.close(); });

  const newUser = () => { const id = crypto.randomUUID(); users.push(id); return id; };
  async function addRun(userId: string, startedAt: Date, distanceM = 2000) {
    await pool.query(
      `INSERT INTO activity_sessions (id, user_id, type, subtype, started_at, duration_s, calories_kcal, metrics, source_module)
       VALUES ($1, $2, 'run', 'territory_run', $3, 1800, 100, $4, 'run_module')`,
      [crypto.randomUUID(), userId, startedAt, JSON.stringify({ distance_m: distanceM, moving_time_s: 1800,
        territory_claimed: false, rejection_reason: null, timezone: "Asia/Kolkata" })]);
  }
  async function addWorkout(userId: string, startedAt: Date) {
    await pool.query(
      `INSERT INTO activity_sessions (id, user_id, type, subtype, started_at, duration_s, calories_kcal, metrics, source_module)
       VALUES ($1, $2, 'exercise', 'squat', $3, 600, 80, $4, 'exercise_module')`,
      [crypto.randomUUID(), userId, startedAt, JSON.stringify({ good_reps: 25, active_time_s: 600, timezone: "Asia/Kolkata" })]);
  }

  it("GET /v1/progress: a user with no activity receives zero totals in the app's contract shape", async () => {
    const user = newUser();
    const response = await app.inject({ method: "GET", url: "/v1/progress", headers: await bearer(user) });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Object.keys(body).sort()).toEqual(["challengesCompleted", "level", "streak", "timezone", "today", "totalActiveMinutes", "totalCalories", "totalDistanceKm", "totalSteps", "totalWorkoutMinutes", "totalWorkouts", "totalXp", "userId"].sort());
    expect(body.totalXp).toBe(0);
    expect(body.totalWorkouts).toBe(0);
    expect(body.today).toMatchObject({ date: expect.any(String), xp: 0, steps: 0, workouts: 0, workoutMinutes: 0,
      activeMinutes: 0, distanceKm: 0, calories: 0, challengesCompleted: 0, goalsCompleted: 0,
      goals: [], goalsTotal: 0, isToday: true });
  });

  it("GET /v1/progress: lifetime totals include runs, exercise, campus XP and challenge awards", async () => {
    const user = newUser();
    const now = new Date();
    await addRun(user, now, 2000);
    await addWorkout(user, now);
    await pool.query(
      "INSERT INTO external_xp_awards (source, idempotency_key, user_id, amount, reason) VALUES ('campus', $1, $2, 25, 'territory_claim')",
      [crypto.randomUUID(), user]);
    const challengeId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO challenges (id, type, title, metric, comparator, threshold, starts_at, ends_at, xp_reward, state, created_by, resolved_at)
       VALUES ($1, 'daily', 'Test', 'runs_completed', 'gte', 1, now() - interval '1 day', now(), 10, 'resolved', $2, $3)`,
      [challengeId, user, now]);
    await pool.query(
      "INSERT INTO challenge_participants (challenge_id, user_id, status, is_winner, xp_awarded) VALUES ($1, $2, 'completed', true, 10)",
      [challengeId, user]);

    const response = await app.inject({ method: "GET", url: "/v1/progress", headers: await bearer(user) });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.totalXp).toBe(155); // run 70 + exercise 50 + campus 25 + challenge 10
    expect(body.totalWorkouts).toBe(1);
    expect(body.totalDistanceKm).toBeCloseTo(2);
    expect(body.totalWorkoutMinutes).toBe(10);
    expect(body.challengesCompleted).toBe(1);
    expect(body.today.xp).toBe(155);
  });

  it("GET /v1/progress/daily uses the requested XP day and XP timezone boundary", async () => {
    const user = newUser();
    await addRun(user, new Date("2026-09-25T23:00:00.000Z"), 2000); // 04:30 on Sep 26 in Asia/Kolkata
    const response = await app.inject({ method: "GET", url: "/v1/progress/daily?date=2026-09-26", headers: await bearer(user) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ date: "2026-09-26", xp: 70, distanceKm: 2, isToday: false });
  });

  it("GET /v1/progress/weekly returns the requested seven calendar days and totals", async () => {
    const user = newUser();
    await addRun(user, new Date("2026-09-21T08:00:00.000Z"), 2000);
    const response = await app.inject({ method: "GET", url: "/v1/progress/weekly?weekStart=2026-09-21", headers: await bearer(user) });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.weekStart).toBe("2026-09-21");
    expect(body.weekEnd).toBe("2026-09-27");
    expect(Object.keys(body).sort()).toEqual(["activeDays", "activeMinutes", "calories", "challengesCompleted", "change", "days", "distanceKm", "goalsCompleted", "previous", "streak", "steps", "weekEnd", "weekStart", "workoutMinutes", "workouts", "xp"].sort());
    expect(body.days).toHaveLength(7);
    expect(body.days.map((day: { date: string }) => day.date)).toEqual([
      "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]);
    expect(body.xp).toBe(70);
  });

  it("GET /v1/progress/history respects days and rejects an absurd window", async () => {
    const user = newUser();
    const response = await app.inject({ method: "GET", url: "/v1/progress/history?days=5", headers: await bearer(user) });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Object.keys(body).sort()).toEqual(["days", "from", "to"]);
    expect(body.days).toHaveLength(5);
    expect(body.from).toBe(body.days[0].date);
    expect(body.to).toBe(body.days[4].date);
    const absurd = await app.inject({ method: "GET", url: "/v1/progress/history?days=9999", headers: await bearer(user) });
    expect(absurd.statusCode).toBe(400);
  });

  it("all four progress endpoints require a user token", async () => {
    for (const url of ["/v1/progress", "/v1/progress/daily", "/v1/progress/weekly", "/v1/progress/history?days=7"]) {
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    }
  });
});
