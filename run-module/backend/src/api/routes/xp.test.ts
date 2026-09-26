import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import crypto from "crypto";
import Fastify from "fastify";
import { SignJWT } from "jose";
import { xpRoutes } from "./xp.js";
import { pool } from "../../db/pool.js";
import { JWT_SECRET } from "../../config/env.js";

const key = (): Uint8Array => new TextEncoder().encode(JWT_SECRET);
const userToken = (sub: string): Promise<string> =>
  new SignJWT({ sub, typ: "access" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(key());
const serviceToken = (claims: Record<string, unknown> = {}, expires = true): Promise<string> => {
  const jwt = new SignJWT({ sub: "exercise_module", typ: "service", ...claims }).setProtectedHeader({ alg: "HS256" });
  return (expires ? jwt.setExpirationTime("5m") : jwt).sign(key());
};
const bearer = (token: string): { authorization: string } => ({ authorization: `Bearer ${token}` });

type MeXp = { xp: number; updated_at: string | null; breakdown: { reason: string; xp: number }[] };
type UserXp = { xp: number; updatedAt: string | null };

describe("XP routes", () => {
  const fastify = Fastify();
  void fastify.register(xpRoutes);
  const users: string[] = [];

  beforeAll(async () => {
    await fastify.ready();
  });
  afterEach(async () => {
    await pool.query("DELETE FROM activity_sessions WHERE user_id = ANY($1)", [users]);
    users.length = 0;
  });
  afterAll(async () => {
    await pool.end();
  });

  function newUser(): string {
    const id = crypto.randomUUID();
    users.push(id);
    return id;
  }

  async function addRun(userId: string, startedAt: Date, metrics: Record<string, unknown>): Promise<void> {
    await pool.query(
      `INSERT INTO activity_sessions (id, user_id, type, subtype, started_at, duration_s, intensity, metrics, source_module)
       VALUES ($1, $2, 'run', 'territory_run', $3, 1800, 'moderate', $4, 'run_module')`,
      [crypto.randomUUID(), userId, startedAt, JSON.stringify(metrics)]
    );
  }

  async function addWorkout(userId: string, startedAt: Date, durationS: number): Promise<void> {
    await pool.query(
      `INSERT INTO activity_sessions (id, user_id, type, subtype, started_at, duration_s, metrics, source_module)
       VALUES ($1, $2, 'exercise', 'squat', $3, $4, '{"reps": 40}', 'exercise_module')`,
      [crypto.randomUUID(), userId, startedAt, durationS]
    );
  }

  it("GET /v1/users/me/xp: 0 for a new user, then the user's own XP with a breakdown", async () => {
    const ana = newUser();
    const empty = await fastify.inject({ method: "GET", url: "/v1/users/me/xp", headers: bearer(await userToken(ana)) });
    expect(empty.statusCode).toBe(200);
    expect(empty.json<MeXp>()).toEqual({ xp: 0, updated_at: null, breakdown: [] });

    await addRun(ana, new Date("2026-09-26T01:00:00Z"), { distance_m: 5000, territory_claimed: true, rejection_reason: null });
    await addWorkout(ana, new Date("2026-09-26T12:00:00Z"), 25 * 60);
    await addRun(newUser(), new Date("2026-09-26T01:00:00Z"), { distance_m: 9000, territory_claimed: true, rejection_reason: null });

    const res = await fastify.inject({ method: "GET", url: "/v1/users/me/xp", headers: bearer(await userToken(ana)) });
    expect(res.statusCode).toBe(200);
    const body = res.json<MeXp>();
    expect(body.xp).toBe(125 + 50); // her run and her 25-minute workout; not the other user's run
    expect(body.breakdown).toEqual([
      { reason: "run_completed", xp: 50 },
      { reason: "run_distance", xp: 50 },
      { reason: "territory_captured", xp: 25 },
      { reason: "exercise_session", xp: 50 },
    ]);
    expect(typeof body.updated_at).toBe("string");
  });

  it("GET /v1/users/me/xp needs a user token", async () => {
    expect((await fastify.inject({ method: "GET", url: "/v1/users/me/xp" })).statusCode).toBe(401);
    const asService = await fastify.inject({ method: "GET", url: "/v1/users/me/xp", headers: bearer(await serviceToken()) });
    expect(asService.statusCode).toBe(401);
  });

  it("getUserXP and meetsXPGate for Partner Hunt", async () => {
    const bob = newUser();
    await addRun(bob, new Date("2026-09-26T01:00:00Z"), { distance_m: 2000, territory_claimed: false, rejection_reason: null });
    const service = bearer(await serviceToken());

    const xp = await fastify.inject({ method: "GET", url: `/v1/users/${bob}/xp`, headers: service });
    expect(xp.statusCode).toBe(200);
    const status = xp.json<UserXp>();
    expect(status.xp).toBe(70);
    expect(Number.isNaN(Date.parse(status.updatedAt ?? ""))).toBe(false); // when the row was recorded

    const pass = await fastify.inject({ method: "GET", url: `/v1/users/${bob}/xp-gate?minXP=70`, headers: service });
    expect(pass.statusCode).toBe(200);
    expect(pass.body).toBe("true");
    const fail = await fastify.inject({ method: "GET", url: `/v1/users/${bob}/xp-gate?minXP=100`, headers: service });
    expect(fail.body).toBe("false");

    const nobody = await fastify.inject({ method: "GET", url: `/v1/users/${crypto.randomUUID()}/xp`, headers: service });
    expect(nobody.json<UserXp>()).toEqual({ xp: 0, updatedAt: null });
  });

  it("service routes refuse user tokens, unexpiring or wrong service tokens, and bad input", async () => {
    const bob = newUser();
    const url = `/v1/users/${bob}/xp-gate?minXP=100`;
    const refused = [
      {},
      bearer(await userToken(bob)),
      bearer(await serviceToken({}, false)),
      bearer(await serviceToken({ sub: "someone_else" })),
      bearer(await serviceToken({ typ: "access" })),
      bearer(await new SignJWT({ sub: "exercise_module", typ: "service" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(new TextEncoder().encode("wrong-secret"))),
    ];
    for (const headers of refused) {
      expect((await fastify.inject({ method: "GET", url, headers })).statusCode).toBe(401);
      expect((await fastify.inject({ method: "GET", url: `/v1/users/${bob}/xp`, headers })).statusCode).toBe(401);
    }
    const service = bearer(await serviceToken());
    for (const bad of [`/v1/users/not-a-uuid/xp-gate?minXP=1`, `/v1/users/${bob}/xp-gate`, `/v1/users/${bob}/xp-gate?minXP=-1`,
                       `/v1/users/${bob}/xp-gate?minXP=abc`, `/v1/users/not-a-uuid/xp`]) {
      expect((await fastify.inject({ method: "GET", url: bad, headers: service })).statusCode).toBe(400);
    }
  });
});
