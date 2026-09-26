import { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import zlib from 'zlib';
import util from 'util';
import { requireAuth } from '../../auth/verify-jwt.js';
import { pool } from '../../db/pool.js';
import { createRunSchema, uploadPointsSchema, finishRunSchema, getRunSummarySchema } from '../schemas/runs.js';
import { enqueueFinalizeRun } from '../../workers/finalize_run/queue.js';

const gunzip = util.promisify(zlib.gunzip);

// Read queries
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RUNS_SQL = readFileSync(join(__dirname, '../../../../db/queries/runs.sql'), 'utf8');

const sqlFragments = RUNS_SQL.split(/----+/).map(s => s.trim()).filter(s => s.length > 0);
// The first element is the file header comment, so we shift it off
if (sqlFragments[0]!.startsWith('-- db/queries')) {
  sqlFragments.shift();
}
const INSERT_RUN = sqlFragments[0] as string;
const SELECT_RUN_FOR_VALIDATION = sqlFragments[1] as string;
const CHECK_IDEMPOTENCY = sqlFragments[2] as string;
const INSERT_IDEMPOTENCY = sqlFragments[3] as string;
const INSERT_POINT = sqlFragments[4] as string;
const UPDATE_RUN_STATUS_FINISHING = sqlFragments[5] as string;
const GET_RUN_SUMMARY = sqlFragments[6] as string;

// Helper to safely access row data
interface RunRow {
  user_id: string;
  status: string;
}

interface IdempotencyRow {
  response: any;
}

const runsRoutes: FastifyPluginAsync = async (fastify) => {
  // We need to parse application/json and application/gzip.
  // Actually, @fastify/compress does not decompress incoming bodies automatically.
  // We can add a content type parser for gzipped JSON.
  
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, async (req: any, body: Buffer) => {
    let payload = body;
    if (req.headers['content-encoding'] === 'gzip') {
      payload = await gunzip(body);
    }
    return JSON.parse(payload.toString('utf8'));
  });

  fastify.post('/v1/runs', {
    preHandler: requireAuth,
    schema: createRunSchema,
  }, async (request, reply) => {
    const { started_at } = (request.body as { started_at?: string }) || {};
    const runId = crypto.randomUUID();
    const userId = request.userId; // Trust boundary: only read from token subject

    await pool.query(INSERT_RUN, [runId, userId, started_at || new Date().toISOString()]);

    return reply.status(201).send({ run_id: runId });
  });

  fastify.post('/v1/runs/:id/points', {
    preHandler: requireAuth,
    schema: uploadPointsSchema,
    bodyLimit: 10485760, // 10MB to accommodate up to 1000 points easily
  }, async (request, reply) => {
    const runId = (request.params as { id: string }).id;
    const userId = request.userId;
    const { idempotency_key, points } = request.body as { idempotency_key: string, points: any[] };

    if (points.length > 1000) {
      return reply.status(413).send({ error: 'Payload Too Large', message: 'Maximum 1000 points per batch' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Validate run ownership and status
      const runRes = await client.query<RunRow>(SELECT_RUN_FOR_VALIDATION, [runId]);
      if (runRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.status(404).send({ error: 'Not Found', message: 'Run not found' });
      }
      if (runRes.rows[0]!.user_id !== userId) {
        await client.query('ROLLBACK');
        return reply.status(403).send({ error: 'Forbidden', message: 'Not your run' });
      }
      if (runRes.rows[0]!.status !== 'active' && runRes.rows[0]!.status !== 'paused') {
        await client.query('ROLLBACK');
        return reply.status(409).send({ error: 'Conflict', message: 'Run is not in an active or paused state' });
      }

      // Check idempotency
      const idempRes = await client.query<IdempotencyRow>(CHECK_IDEMPOTENCY, [runId, idempotency_key]);
      if (idempRes.rows.length > 0) {
        await client.query('ROLLBACK');
        return reply.status(200).send(idempRes.rows[0]!.response);
      }

      // We have an empty array? No-op.
      if (points.length === 0) {
        const response = { accepted: 0, duplicates_ignored: 0 };
        await client.query(INSERT_IDEMPOTENCY, [runId, idempotency_key, JSON.stringify(response)]);
        await client.query('COMMIT');
        return reply.status(202).send(response);
      }

            // Insert points
      let accepted = 0;
      let duplicates = 0;
      let firstSeq = null;
      let lastSeq = null;
      
      for (const p of points) {
        if (firstSeq === null || p.seq < firstSeq) firstSeq = p.seq;
        if (lastSeq === null || p.seq > lastSeq) lastSeq = p.seq;
        
        const res = await client.query(INSERT_POINT, [
          runId, p.seq, p.lat, p.lng, p.accuracy_m, p.recorded_at
        ]);
        
        if (p.is_mock !== undefined) {
          await client.query(`INSERT INTO run_point_flags (run_id, seq, is_mock) VALUES ($1, $2, $3) ON CONFLICT (run_id, seq) DO NOTHING`, [runId, p.seq, p.is_mock]);
        }
        
        if (res.rowCount === 0) {
          duplicates++;
        } else {
          accepted++;
        }
      }

      await client.query(`INSERT INTO run_batches (id, run_id, point_count, first_seq, last_seq) VALUES ($1, $2, $3, $4, $5)`, [crypto.randomUUID(), runId, points.length, firstSeq, lastSeq]);

      const response = { accepted, duplicates_ignored: duplicates };
      await client.query(INSERT_IDEMPOTENCY, [runId, idempotency_key, JSON.stringify(response)]);

      await client.query('COMMIT');
      return reply.status(202).send(response);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  fastify.post('/v1/runs/:id/finish', {
    preHandler: requireAuth,
    schema: finishRunSchema,
  }, async (request, reply) => {
    const runId = (request.params as { id: string }).id;
    const userId = request.userId;

    const runRes = await pool.query<RunRow>(SELECT_RUN_FOR_VALIDATION, [runId]);
    if (runRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Not Found', message: 'Run not found' });
    }
    if (runRes.rows[0]!.user_id !== userId) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Not your run' });
    }
    
    // Update status to finishing (idempotent if already finishing it will return 0 rows updated, but we enqueue anyway or conditionally?)
    // "Calling finish twice returns 202 both times and enqueues at most one job"
    // We can use UPDATE ... AND status IN ('active', 'paused') to only affect rows that are ready.
    const updateRes = await pool.query(UPDATE_RUN_STATUS_FINISHING, [runId]);
    
    // If we updated the row, enqueue a job. If it was already finishing/finalized, updateRes.rowCount === 0.
    if (updateRes.rowCount && updateRes.rowCount > 0) {
      await enqueueFinalizeRun(runId);
    }

    return reply.status(202).send({ run_id: runId, status: 'finishing' });
  });

  fastify.get('/v1/runs/:id', {
    preHandler: requireAuth,
    schema: getRunSummarySchema,
  }, async (request, reply) => {
    const runId = (request.params as { id: string }).id;
    const userId = request.userId; // Trust boundary: only read from token subject

    interface SummaryRow {
      run_id: string;
      user_id: string;
      status: string;
      started_at: Date;
      distance_m: number | null;
      moving_time_s: number | null;
      elapsed_time_s: number | null;
      t_id: string | null;
      t_area_m2: number | null;
      t_claimed_at: Date | null;
      t_geometry: any;
      rr_reason: string | null;
      rr_detail: string | null;
      rr_rejected_at: Date | null;
      rs_aggregate: number | null;
      rs_band: string | null;
      rs_layers: any;
    }

    const res = await pool.query<SummaryRow>(GET_RUN_SUMMARY, [runId]);
    if (res.rows.length === 0) {
      return reply.status(404).send({ error: 'Not Found', message: 'Run not found' });
    }

    const row = res.rows[0]!;
    if (row.user_id !== userId) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Not your run' });
    }

    let territory = null;
    if (row.t_id) {
      territory = {
        id: row.t_id,
        area_m2: row.t_area_m2,
        claimed_at: row.t_claimed_at ? row.t_claimed_at.toISOString() : undefined,
        geometry: row.t_geometry,
      };
    }

    let rejection = null;
    if (row.rr_reason) {
      rejection = {
        reason: row.rr_reason,
        detail: row.rr_detail,
        rejected_at: row.rr_rejected_at ? row.rr_rejected_at.toISOString() : undefined,
      };
    }

    return reply.status(200).send({
      run_id: row.run_id,
      status: row.status,
      started_at: row.started_at.toISOString(),
      stats: {
        distance_m: row.distance_m || 0,
        moving_time_s: row.moving_time_s || 0,
        elapsed_time_s: row.elapsed_time_s || 0,
      },
      territory,
      rejection,
      score: row.rs_band ? {
        aggregate: row.rs_aggregate,
        band: row.rs_band,
        decisive_layer: row.rs_aggregate === 0.0 && Array.isArray(row.rs_layers) ? (row.rs_layers.find((l: any) => l.score === 0.0)?.layer || null) : null
      } : null,
    });
  });
};

export default runsRoutes;
