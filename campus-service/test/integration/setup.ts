import { beforeAll, afterAll } from 'vitest';
import { getPool, closePool, query } from '../../src/db/pool.js';
import { migrate } from '../../src/db/migrate.js';
import { seedZones } from '../../src/seed/run.js';
import { buildApp } from '../../src/app.js';
import { mintDevToken } from '../../src/auth/dev-token.js';
import { verifyActivity } from '../../src/verification/worker.js';
import type { FastifyInstance } from 'fastify';
import type { Point } from '../../src/activities/gps.js';

export const HAS_DB = !!process.env.TEST_DATABASE_URL;

export let app: FastifyInstance;
const silent = { info() {}, warn() {}, error() {} };

export async function resetDb() {
  const pool = getPool();
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  await seedZones();
}

export function useTestApp() {
  beforeAll(async () => {
    await resetDb();
    app = await buildApp({ logger: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await closePool();
  });
}

export async function tokenFor(userId: string, name = userId) {
  return mintDevToken(userId, { name, email: `${userId}@iiserkol.ac.in` });
}

export async function api(method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, userId: string | null, body?: unknown) {
  const headers: Record<string, string> = {};
  if (userId) headers.authorization = `Bearer ${await tokenFor(userId)}`;
  const res = await app.inject({ method, url, headers, payload: body as never });
  return { status: res.statusCode, body: res.json() as Record<string, unknown> & Record<string, never> };
}

/** Upload a full activity and run verification synchronously (the worker does the same thing asynchronously). */
export async function submitAndVerify(userId: string, points: Point[], type: 'run' | 'walk' = 'run') {
  const r = await api('POST', '/v1/activities', userId, { type, started_at: points[0]!.recorded_at, ended_at: points[points.length - 1]!.recorded_at, points });
  if (r.status !== 201) throw new Error(`submit failed: ${r.status} ${JSON.stringify(r.body)}`);
  const id = r.body.activity_id as string;
  await verifyActivity(id, silent);
  return id;
}

export async function sql<T extends Record<string, unknown> = Record<string, unknown>>(text: string, params: unknown[] = []) {
  return (await query<T>(text, params)).rows;
}
