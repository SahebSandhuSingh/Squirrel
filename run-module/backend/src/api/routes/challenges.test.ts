import { test, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { challengesRoutes } from './challenges.js';
import * as jose from 'jose';
import crypto from 'node:crypto';
import { createTestToken } from "../../auth/test-token.js";
import { requireAuth } from '../../auth/verify-jwt.js';

const TEST_USER = crypto.randomUUID();

const fastify = Fastify();
fastify.decorateRequest('userId', null);

fastify.register(async (app) => {
  app.addHook('onRequest', requireAuth);
  app.register(challengesRoutes, { prefix: '/v1/challenges' });
});

let validToken = '';

beforeAll(async () => {
  validToken = await createTestToken(TEST_USER);
});

afterAll(async () => {
  await fastify.close();
});

test('H11: No token 401 on every route', async () => {
  const routes = [
    { method: 'GET', url: '/v1/challenges/mine' },
    { method: 'POST', url: '/v1/challenges' },
    { method: 'GET', url: '/v1/challenges/some-id' },
    { method: 'POST', url: '/v1/challenges/some-id/accept' },
    { method: 'POST', url: '/v1/challenges/some-id/decline' },
    { method: 'POST', url: '/v1/challenges/some-id/join' },
    { method: 'POST', url: '/v1/challenges/some-id/invite' }
  ];

  for (const route of routes) {
    const response = await fastify.inject(route as any);
    expect(response.statusCode).toBe(401);
  }
});

test('H10: Isolation - cannot GET challenge not part of, nor accept/join', async () => {
  const id = crypto.randomUUID();
  
  // Note: Since these routes check participation (and throw Forbidden), 
  // they correctly deny access to an unrelated user even if the challenge exists/doesn't exist.
  // Wait, if it doesn't exist, they might throw 404/500, but they should throw 403 on participation check!
  
  const getRes = await fastify.inject({
    method: 'GET',
    url: '/v1/challenges/' + id,
    headers: { Authorization: "Bearer " + validToken }
  });
  expect(getRes.statusCode).toBe(403);

  const acceptRes = await fastify.inject({
    method: 'POST',
    url: '/v1/challenges/' + id + '/accept',
    headers: { Authorization: "Bearer " + validToken }
  });
  expect(acceptRes.statusCode).toBe(403);

  const joinRes = await fastify.inject({
    method: 'POST',
    url: '/v1/challenges/' + id + '/join',
    headers: { Authorization: "Bearer " + validToken }
  });
  expect(joinRes.statusCode).toBe(403);
});