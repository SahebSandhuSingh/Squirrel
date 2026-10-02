import { describe, expect, it } from 'vitest';
import { api, HAS_DB, sql, useTestApp } from './setup.js';

const crewName = () => `crew-${Math.random().toString(36).slice(2)}`;

async function createCrew(owner = 'u_owner') {
  const created = await api('POST', '/v1/crews', owner, { name: crewName() });
  expect(created.status).toBe(201);
  return created.body as { id: string; owner_id: string };
}

async function expectOwnerInvariant(crewId: string, exists = true) {
  const rows = await sql<{ owners: number; owner_matches: number; crews: number }>(
    `SELECT
       (SELECT count(*)::int FROM crew_members WHERE crew_id = $1 AND role = 'owner') AS owners,
       (SELECT count(*)::int FROM crews c JOIN crew_members cm ON cm.crew_id = c.id AND cm.user_id = c.owner_id AND cm.role = 'owner' WHERE c.id = $1) AS owner_matches,
       (SELECT count(*)::int FROM crews WHERE id = $1) AS crews`, [crewId],
  );
  if (exists) expect(rows[0]).toMatchObject({ owners: 1, owner_matches: 1, crews: 1 });
  else expect(rows[0]).toMatchObject({ owners: 0, owner_matches: 0, crews: 0 });
}

describe.skipIf(!HAS_DB)('crews (integration)', () => {
  useTestApp();

  it('create then list: creator is owner and a member', async () => {
    const created = await api('POST', '/v1/crews', 'u_creator', { name: crewName(), description: 'A test crew' });
    expect(created.status).toBe(201);
    const crew = created.body as { id: string; owner_id: string; members: { user_id: string; role: string }[] };
    expect(crew.owner_id).toBe('u_creator');
    expect(crew.members).toContainEqual({ user_id: 'u_creator', role: 'owner' });
    const listed = await api('GET', '/v1/crews', 'u_creator');
    expect((listed.body.crews as { id: string; role: string }[])).toContainEqual(expect.objectContaining({ id: crew.id, role: 'owner' }));
    await expectOwnerInvariant(crew.id);
  });

  it('join is idempotent: joining twice leaves one membership row', async () => {
    const crew = await createCrew();
    expect((await api('POST', `/v1/crews/${crew.id}/join`, 'u_joiner')).status).toBe(200);
    expect((await api('POST', `/v1/crews/${crew.id}/join`, 'u_joiner')).status).toBe(200);
    const rows = await sql<{ n: number }>(`SELECT count(*)::int AS n FROM crew_members WHERE crew_id = $1 AND user_id = 'u_joiner'`, [crew.id]);
    expect(rows[0]!.n).toBe(1);
    await expectOwnerInvariant(crew.id);
  });

  it('a member leaves cleanly and the crew keeps exactly one owner', async () => {
    const crew = await createCrew();
    await api('POST', `/v1/crews/${crew.id}/join`, 'u_member');
    const left = await api('POST', `/v1/crews/${crew.id}/leave`, 'u_member');
    expect(left.body.left).toBe(true);
    expect((await sql(`SELECT 1 FROM crew_members WHERE crew_id = $1 AND user_id = 'u_member'`, [crew.id]))).toHaveLength(0);
    await expectOwnerInvariant(crew.id);
  });

  it('an owner with other members cannot leave without transfer_to', async () => {
    const crew = await createCrew();
    await api('POST', `/v1/crews/${crew.id}/join`, 'u_member');
    const left = await api('POST', `/v1/crews/${crew.id}/leave`, 'u_owner');
    expect(left.status).toBe(409);
    expect(left.body.code).toBe('crew_transfer_required');
    expect(left.body.detail).toContain('Transfer ownership');
    await expectOwnerInvariant(crew.id);
  });

  it('transfer_to must be an existing member and a rejected transfer leaves ownership intact', async () => {
    const crew = await createCrew();
    await api('POST', `/v1/crews/${crew.id}/join`, 'u_member');
    const failed = await api('POST', `/v1/crews/${crew.id}/leave`, 'u_owner', { transfer_to: 'u_stranger' });
    expect(failed.status).toBe(422);
    await expectOwnerInvariant(crew.id);
  });

  it('transfer_to moves ownership and removes the old owner atomically', async () => {
    const crew = await createCrew();
    await api('POST', `/v1/crews/${crew.id}/join`, 'u_successor');
    const left = await api('POST', `/v1/crews/${crew.id}/leave`, 'u_owner', { transfer_to: 'u_successor' });
    expect(left.status).toBe(200);
    expect(left.body.owner_id).toBe('u_successor');
    const state = await sql<{ owner_id: string; owners: number; old_memberships: number }>(
      `SELECT c.owner_id,
       (SELECT count(*)::int FROM crew_members WHERE crew_id = c.id AND role = 'owner') AS owners,
       (SELECT count(*)::int FROM crew_members WHERE crew_id = c.id AND user_id = 'u_owner') AS old_memberships
       FROM crews c WHERE c.id = $1`, [crew.id],
    );
    expect(state[0]).toEqual({ owner_id: 'u_successor', owners: 1, old_memberships: 0 });
    await expectOwnerInvariant(crew.id);
  });

  it('the last member leaving deletes the crew instead of leaving it ownerless', async () => {
    const crew = await createCrew('u_last');
    const left = await api('POST', `/v1/crews/${crew.id}/leave`, 'u_last');
    expect(left.body).toMatchObject({ left: true, crew_deleted: true });
    await expectOwnerInvariant(crew.id, false);
  });
});
