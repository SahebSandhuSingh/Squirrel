/**
 * src/api/routes/xp.ts
 *
 * XP (ADR-027). Nothing here is stored: every read derives XP from activity_sessions.
 *
 *   GET /v1/users/me/xp                    the signed-in user   → { xp, updated_at, breakdown }
 *   GET /v1/users/:userId/xp               service only         → { xp, updatedAt }
 *   GET /v1/users/:userId/xp-gate?minXP=N  service only         → true | false
 *   GET /v1/leaderboard/xp?window=daily|weekly&limit=N   any user → { window, day, entries[{rank, user_id, xp}],
 *                                          me, total_ranked }: XP earned today (or in the last 7 days) in
 *                                          XP_TIMEZONE, after the caps; the Social service adds names and
 *                                          hostels (its /v1/leaderboards/xp and /hostels)
 *
 * The two service routes are the Integration Contract's getUserXP / meetsXPGate, for Partner Hunt
 * in the Exercise Module, which must ask about OTHER users. A user token cannot call them.
 * minXP is the caller's (a product decision the Run Module does not store).
 */

import type { FastifyPluginAsync } from "fastify";
import { requireAuth, requireService } from "../../auth/verify-jwt.js";
import { getUserXp, getXpBoard, meetsXpGate, type XpBoardWindow } from "../../xp/query.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MIN_XP = 1_000_000;
const MAX_BOARD_LIMIT = 1000;

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

  const boardEntry = {
    type: "object",
    required: ["rank", "user_id", "xp"],
    properties: { rank: { type: "integer" }, user_id: { type: "string" }, xp: { type: "integer" } },
  } as const;

  fastify.get<{ Querystring: { window?: string; limit?: string } }>(
    "/v1/leaderboard/xp",
    {
      onRequest: [requireAuth],
      schema: {
        response: {
          200: {
            type: "object",
            required: ["window", "day", "entries", "me", "total_ranked"],
            properties: {
              window: { type: "string" },
              day: { type: "string" },
              entries: { type: "array", items: boardEntry },
              me: { anyOf: [boardEntry, { type: "null" }] },
              total_ranked: { type: "integer" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const window = request.query.window ?? "daily";
      if (window !== "daily" && window !== "weekly") return reply.code(400).send({ error: "window must be daily or weekly" });
      const raw = request.query.limit ?? "10";
      const limit = /^\d{1,4}$/.test(raw) ? Number(raw) : NaN;
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BOARD_LIMIT) {
        return reply.code(400).send({ error: `limit must be between 1 and ${MAX_BOARD_LIMIT}` });
      }
      const board = await getXpBoard(window as XpBoardWindow);
      return {
        window,
        day: board.day,
        entries: board.entries.slice(0, limit),
        me: board.entries.find((e) => e.user_id === request.userId) ?? null,
        total_ranked: board.entries.length,
      };
    }
  );

  fastify.post<{ Body: { subject: string; amount: number; reason: string; source: string; idempotency_key: string } }>(
    "/internal/v1/xp/award",
    {
      onRequest: [requireService],
      schema: {
        body: {
          type: "object",
          required: ["subject", "amount", "reason", "source", "idempotency_key"],
          properties: {
            subject: { type: "string" },
            amount: { type: "integer" },
            reason: { type: "string" },
            source: { type: "string" },
            idempotency_key: { type: "string" }
          }
        },
        response: { 200: { type: "integer" } }
      }
    },
    async (request, reply) => {
      const { subject, amount, reason, source, idempotency_key } = request.body;
      if (!UUID_REGEX.test(subject)) return reply.code(400).send({ error: "subject must be a UUID" });
      
      const { pool } = await import("../../db/pool.js");
      await pool.query(
        `INSERT INTO external_xp_awards (source, idempotency_key, user_id, amount, reason) 
         VALUES ($1, $2, $3, $4, $5) 
         ON CONFLICT (source, idempotency_key) DO NOTHING`,
        [source, idempotency_key, subject, amount, reason]
      );
      
      const summary = await getUserXp(subject);
      return summary.xp;
    }
  );

  fastify.post<{ Body: { subjects: string[] } }>(
    "/internal/v1/xp/totals",
    {
      onRequest: [requireService],
      schema: {
        body: {
          type: "object",
          required: ["subjects"],
          properties: {
            subjects: { type: "array", items: { type: "string" }, maxItems: 200 }
          }
        }
      }
    },
    async (request, reply) => {
      const { subjects } = request.body;
      if (!Array.isArray(subjects) || subjects.length > 200) {
         return reply.code(400).send({ error: "subjects array required, max 200" });
      }
      
      const bad = subjects.find((s) => !UUID_REGEX.test(s));
      if (bad) {
        return reply.code(400).send({ error: `subject must be a UUID: ${bad}` });
      }
      
      const res: Record<string, number> = {};
      
      // Batch execute in parallel to be fast
      await Promise.all(
        subjects.map(async (subject) => {
          const summary = await getUserXp(subject);
          res[subject] = summary.xp;
        })
      );
      
      return res;
    }
  );
};
