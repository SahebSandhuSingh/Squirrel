/**
 * src/api/routes/xp.ts
 *
 * XP (ADR-027). Nothing here is stored: every read derives XP from activity_sessions.
 *
 *   GET /v1/users/me/xp                    the signed-in user   → { xp, updated_at, breakdown }
 *   GET /v1/users/:userId/xp               service only         → { xp, updatedAt }
 *   GET /v1/users/:userId/xp-gate?minXP=N  service only         → true | false
 *
 * The two service routes are the Integration Contract's getUserXP / meetsXPGate, for Partner Hunt
 * in the Exercise Module, which must ask about OTHER users. A user token cannot call them.
 * minXP is the caller's (a product decision the Run Module does not store).
 */

import type { FastifyPluginAsync } from "fastify";
import { requireAuth, requireService } from "../../auth/verify-jwt.js";
import { getUserXp, meetsXpGate } from "../../xp/query.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MIN_XP = 1_000_000;

const line = {
  type: "object",
  required: ["reason", "xp"],
  properties: { reason: { type: "string" }, xp: { type: "integer" } },
} as const;

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugins are async by contract
export const xpRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/v1/users/me/xp",
    {
      onRequest: [requireAuth],
      schema: {
        response: {
          200: {
            type: "object",
            required: ["xp", "updated_at", "breakdown"],
            properties: {
              xp: { type: "integer" },
              updated_at: { type: ["string", "null"] },
              breakdown: { type: "array", items: line },
            },
          },
        },
      },
    },
    async (request) => {
      const summary = await getUserXp(request.userId);
      return { xp: summary.xp, updated_at: summary.updated_at?.toISOString() ?? null, breakdown: summary.breakdown };
    }
  );

  fastify.get<{ Params: { userId: string } }>(
    "/v1/users/:userId/xp",
    {
      onRequest: [requireService],
      schema: {
        response: {
          200: {
            type: "object",
            required: ["xp", "updatedAt"],
            properties: { xp: { type: "integer" }, updatedAt: { type: ["string", "null"] } },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;
      if (!UUID_REGEX.test(userId)) return reply.code(400).send({ error: "userId must be a UUID" });
      const summary = await getUserXp(userId);
      return { xp: summary.xp, updatedAt: summary.updated_at?.toISOString() ?? null };
    }
  );

  fastify.get<{ Params: { userId: string }; Querystring: { minXP?: string } }>(
    "/v1/users/:userId/xp-gate",
    { onRequest: [requireService], schema: { response: { 200: { type: "boolean" } } } },
    async (request, reply) => {
      const { userId } = request.params;
      if (!UUID_REGEX.test(userId)) return reply.code(400).send({ error: "userId must be a UUID" });
      const raw = request.query.minXP;
      const minXp = raw !== undefined && /^\d{1,7}$/.test(raw) ? Number(raw) : NaN;
      if (!Number.isInteger(minXp) || minXp > MAX_MIN_XP) {
        return reply.code(400).send({ error: "minXP must be a whole number of XP" });
      }
      return meetsXpGate(userId, minXp);
    }
  );
};
