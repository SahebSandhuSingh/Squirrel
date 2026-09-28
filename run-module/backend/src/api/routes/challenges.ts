import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../../auth/verify-jwt.js';
import { 
  createChallenge, 
  listMyChallenges, 
  getChallenge, 
  acceptInvite, 
  declineInvite, 
  joinGroupChallenge, 
  inviteUser 
} from '../../challenges/service.js';
import { ChallengeType, Comparator } from '../../challenges/types.js';
import { Metric } from '../../challenges/metrics.js';

import { getRateLimitOptions, rateLimitPlugin } from '../rate-limit.js';
import { RATE_LIMIT_WRITE_PER_MIN } from '../../config/env.js';

export const challengesRoutes: FastifyPluginAsync = async (fastify) => {
  if (!fastify.hasDecorator('rateLimit')) await fastify.register(rateLimitPlugin);
  fastify.addHook('onRequest', requireAuth);

  const writeLimit = {
    preHandler: [fastify.rateLimit(getRateLimitOptions(RATE_LIMIT_WRITE_PER_MIN, '1 minute', 'write_min'))]
  };

  fastify.post('/', writeLimit, async (request, reply) => {
    const userId = request.userId;
    const body = request.body as any;
    const ch = await createChallenge(
      userId,
      body.type as ChallengeType,
      body.title,
      body.metric as Metric,
      body.comparator as Comparator,
      body.threshold,
      new Date(body.starts_at),
      new Date(body.ends_at),
      body.xp_reward
    );
    return reply.code(201).send(ch);
  });

  fastify.get('/mine', async (request, reply) => {
    const userId = request.userId;
    const chs = await listMyChallenges(userId);
    return reply.code(200).send(chs);
  });

  fastify.get('/:id', async (request, reply) => {
    const userId = request.userId;
    const { id } = request.params as { id: string };
    try {
      const detail = await getChallenge(id, userId);
      return reply.code(200).send(detail);
    } catch (err: any) {
      if (err.message === 'Forbidden') return reply.code(403).send({ error: 'Forbidden' });
      throw err;
    }
  });

  fastify.post('/:id/accept', writeLimit, async (request, reply) => {
    const userId = request.userId;
    const { id } = request.params as { id: string };
    try {
      await acceptInvite(id, userId);
      return reply.code(200).send({ ok: true });
    } catch (err: any) {
      if (err.message === 'Forbidden') return reply.code(403).send({ error: 'Forbidden' });
      throw err;
    }
  });

  fastify.post('/:id/decline', writeLimit, async (request, reply) => {
    const userId = request.userId;
    const { id } = request.params as { id: string };
    try {
      await declineInvite(id, userId);
      return reply.code(200).send({ ok: true });
    } catch (err: any) {
      if (err.message === 'Forbidden') return reply.code(403).send({ error: 'Forbidden' });
      throw err;
    }
  });

  fastify.post('/:id/join', writeLimit, async (request, reply) => {
    const userId = request.userId;
    const { id } = request.params as { id: string };
    try {
      await joinGroupChallenge(id, userId);
      return reply.code(200).send({ ok: true });
    } catch (err: any) {
      if (err.message === 'Not Found' || err.message === 'Forbidden') return reply.code(403).send({ error: 'Forbidden' });
      return reply.code(400).send({ error: err.message });
    }
  });

  fastify.post('/:id/invite', writeLimit, async (request, reply) => {
    const userId = request.userId;
    const { id } = request.params as { id: string };
    const { invitee_id } = request.body as { invitee_id: string };
    try {
      await inviteUser(id, userId, invitee_id);
      return reply.code(200).send({ ok: true });
    } catch (err: any) {
      if (err.message === 'Forbidden') return reply.code(403).send({ error: 'Forbidden' });
      throw err;
    }
  });
};
