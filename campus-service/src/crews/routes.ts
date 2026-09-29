import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPool, many, one, query, withTransaction } from '../db/pool.js';
import { requireAuth, currentUser } from '../auth/plugin.js';
import { errors } from '../lib/errors.js';
import { isUuid } from '../lib/ids.js';
import { getPeopleLite } from '../users/repo.js';

type CrewRow = {
  id: string; name: string; description: string | null; color: string | null; icon: string | null;
  owner_id: string; created_at: string; member_count?: number; role?: string;
};
type MemberRow = { user_id: string; role: 'owner' | 'admin' | 'member'; joined_at: string };

const CreateBody = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(280).nullable().optional(),
  color: z.string().trim().max(32).nullable().optional(),
  icon: z.string().trim().max(64).nullable().optional(),
}).strict();
const IdParams = z.object({ id: z.string().refine(isUuid, 'invalid id') });
const LeaveBody = z.object({ transfer_to: z.string().min(1).max(128).optional() }).strict();

export async function crewRoutes(app: FastifyInstance) {
  app.post('/v1/crews', { preHandler: requireAuth }, async (req, reply) => {
    const user = currentUser(req);
    const body = CreateBody.parse(req.body ?? {});
    try {
      const crew = await withTransaction(async (tx) => {
        const created = await one<CrewRow>(
          `INSERT INTO crews (name, description, color, icon, owner_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [body.name, body.description ?? null, body.color ?? null, body.icon ?? null, user.id], tx,
        );
        await query(`INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'owner')`, [created!.id, user.id], tx);
        return created!;
      });
      reply.code(201);
      return { ...crew, members: [{ user_id: user.id, role: 'owner' }] };
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw errors.conflict('crew_name_taken', 'A crew with that name already exists.');
      throw error;
    }
  });

  app.get('/v1/crews', { preHandler: requireAuth }, async (req) => {
    const user = currentUser(req);
    const crews = await many<CrewRow>(
      `SELECT c.*, cm.role,
              (SELECT count(*)::int FROM crew_members m WHERE m.crew_id = c.id) AS member_count
       FROM crew_members cm JOIN crews c ON c.id = cm.crew_id
       WHERE cm.user_id = $1 ORDER BY c.created_at DESC, c.id`, [user.id],
    );
    return { crews };
  });

  app.get('/v1/crews/:id', { preHandler: requireAuth }, async (req) => {
    const user = currentUser(req);
    const { id } = IdParams.parse(req.params);
    const crew = await one<CrewRow>(
      `SELECT c.*, cm.role,
              (SELECT count(*)::int FROM crew_members m WHERE m.crew_id = c.id) AS member_count
       FROM crews c JOIN crew_members cm ON cm.crew_id = c.id AND cm.user_id = $2
       WHERE c.id = $1`, [id, user.id],
    );
    // Hide both nonexistent crews and crews the caller does not belong to.
    if (!crew) throw errors.notFound('Crew');
    const members = await many<MemberRow>(`SELECT user_id, role, joined_at FROM crew_members WHERE crew_id = $1 ORDER BY joined_at, user_id`, [id]);
    const people = await getPeopleLite(members.map((m) => m.user_id), getPool());
    return { ...crew, members: members.map((m) => ({ ...m, person: people.get(m.user_id) ?? null })) };
  });

  app.post('/v1/crews/:id/join', { preHandler: requireAuth }, async (req) => {
    const user = currentUser(req);
    const { id } = IdParams.parse(req.params);
    return withTransaction(async (tx) => {
      const crew = await one<{ id: string }>(`SELECT id FROM crews WHERE id = $1 FOR UPDATE`, [id], tx);
      if (!crew) throw errors.notFound('Crew');
      await query(`INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT (crew_id, user_id) DO NOTHING`, [id, user.id], tx);
      return { joined: true, crew_id: id };
    });
  });

  app.post('/v1/crews/:id/leave', { preHandler: requireAuth }, async (req) => {
    const user = currentUser(req);
    const { id } = IdParams.parse(req.params);
    const body = LeaveBody.parse(req.body ?? {});
    return withTransaction(async (tx) => {
      const crew = await one<{ id: string; owner_id: string }>(`SELECT id, owner_id FROM crews WHERE id = $1 FOR UPDATE`, [id], tx);
      if (!crew) throw errors.notFound('Crew');
      const membership = await one<MemberRow>(`SELECT user_id, role, joined_at FROM crew_members WHERE crew_id = $1 AND user_id = $2 FOR UPDATE`, [id, user.id], tx);
      if (!membership) throw errors.notFound('Crew');

      if (crew.owner_id !== user.id) {
        if (body.transfer_to !== undefined) throw errors.invalid('Only the crew owner can transfer ownership.');
        await query(`DELETE FROM crew_members WHERE crew_id = $1 AND user_id = $2`, [id, user.id], tx);
        return { left: true, crew_deleted: false };
      }

      const otherMembers = await many<{ user_id: string }>(`SELECT user_id FROM crew_members WHERE crew_id = $1 AND user_id <> $2 FOR UPDATE`, [id, user.id], tx);
      if (!otherMembers.length) {
        await query(`DELETE FROM crews WHERE id = $1`, [id], tx);
        return { left: true, crew_deleted: true };
      }
      if (!body.transfer_to) {
        throw errors.conflict('crew_transfer_required', 'Transfer ownership to an existing crew member before leaving.', { transfer_to_required: true });
      }
      if (body.transfer_to === user.id) throw errors.invalid('Transfer ownership to another crew member.');
      const successor = await one<{ user_id: string }>(`SELECT user_id FROM crew_members WHERE crew_id = $1 AND user_id = $2 FOR UPDATE`, [id, body.transfer_to], tx);
      if (!successor) throw errors.invalid('transfer_to must already be a member of this crew.');

      // The owner_id and owner role move, and the former owner leaves, atomically.
      await query(`UPDATE crew_members SET role = 'member' WHERE crew_id = $1 AND role = 'owner'`, [id], tx);
      await query(`UPDATE crews SET owner_id = $2 WHERE id = $1`, [id, successor.user_id], tx);
      await query(`UPDATE crew_members SET role = 'owner' WHERE crew_id = $1 AND user_id = $2`, [id, successor.user_id], tx);
      await query(`DELETE FROM crew_members WHERE crew_id = $1 AND user_id = $2`, [id, user.id], tx);
      return { left: true, crew_deleted: false, owner_id: successor.user_id };
    });
  });
}
