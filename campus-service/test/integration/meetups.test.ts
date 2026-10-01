import { describe, expect, it } from 'vitest';
import { api, HAS_DB, sql, useTestApp } from './setup.js';

const future = () => new Date(Date.now() + 60 * 60_000).toISOString();
const provision = async (...ids: string[]) => { for (const id of ids) await api('GET', '/v1/me', id); };

async function createMeetup(host: string, invitees: string[], extra: Record<string, unknown> = {}) {
  const created = await api('POST', '/v1/meetups', host, { place_text: 'Campus cafe', starts_at: future(), invitee_ids: invitees, ...extra });
  return created;
}

describe.skipIf(!HAS_DB)('meetups (integration)', () => {
  useTestApp();

  it('creates with two invitees: proposed, three participant rows, host accepted', async () => {
    await provision('u_mh1', 'u_mg1', 'u_mg2');
    const created = await createMeetup('u_mh1', ['u_mg1', 'u_mg2']);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('proposed');
    expect(created.body.participants).toHaveLength(3);
    expect((created.body.participants as { user_id: string; role: string; status: string }[])).toContainEqual(expect.objectContaining({ user_id: 'u_mh1', role: 'host', status: 'accepted' }));
    expect(await sql(`SELECT meetup_id FROM meetup_participants WHERE meetup_id = $1`, [created.body.id])).toHaveLength(3);
    expect((await api('GET', '/v1/notifications', 'u_mg1')).body.items).toEqual(expect.arrayContaining([expect.objectContaining({ backend_type: 'meetup.invited' })]));
  });

  it('one guest accepts and status becomes confirmed; open_to_meet false does not gate invitation or acceptance', async () => {
    await provision('u_mh2', 'u_mg3');
    await api('PUT', '/v1/me/open-to-meet', 'u_mg3', { enabled: false });
    const created = await createMeetup('u_mh2', ['u_mg3']);
    expect(created.status).toBe(201);
    const invitee = (created.body.participants as { user_id: string; person: { open_to_meet: boolean } }[]).find((p) => p.user_id === 'u_mg3');
    expect(invitee?.person.open_to_meet).toBe(false);
    const accepted = await api('POST', `/v1/meetups/${created.body.id}/accept`, 'u_mg3');
    expect(accepted.body.status).toBe('confirmed');
    expect((accepted.body.participants as { user_id: string; status: string }[]).find((p) => p.user_id === 'u_mg3')?.status).toBe('accepted');
    expect((await api('GET', '/v1/notifications', 'u_mh2')).body.items).toEqual(expect.arrayContaining([expect.objectContaining({ backend_type: 'meetup.accepted' })]));
  });

  it('every guest declining cancels the meetup and decline accepts no reason field', async () => {
    await provision('u_mh3', 'u_mg4', 'u_mg5');
    const created = await createMeetup('u_mh3', ['u_mg4', 'u_mg5']);
    const id = created.body.id as string;
    expect((await api('POST', `/v1/meetups/${id}/decline`, 'u_mg4', { reason: 'private' })).status).toBe(422);
    expect((await api('POST', `/v1/meetups/${id}/decline`, 'u_mg4')).body.status).toBe('proposed');
    expect((await api('POST', `/v1/meetups/${id}/decline`, 'u_mg5')).body.status).toBe('cancelled');
    const notices = (await api('GET', '/v1/notifications', 'u_mh3')).body.items as { backend_type: string; data: Record<string, unknown> }[];
    const declines = notices.filter((n) => n.backend_type === 'meetup.declined');
    expect(declines).toHaveLength(2);
    expect(declines.every((n) => Object.keys(n.data).every((k) => ['meetup_id', 'status'].includes(k)))).toBe(true);
    expect(notices).toEqual(expect.arrayContaining([expect.objectContaining({ backend_type: 'meetup.cancelled' })]));
  });

  it('host cancellation cancels the meetup and guests can no longer accept', async () => {
    await provision('u_mh4', 'u_mg6');
    const created = await createMeetup('u_mh4', ['u_mg6']);
    const id = created.body.id as string;
    expect((await api('POST', `/v1/meetups/${id}/cancel`, 'u_mh4')).body.status).toBe('cancelled');
    expect((await api('POST', `/v1/meetups/${id}/accept`, 'u_mg6')).status).toBe(409);
    expect((await api('GET', '/v1/notifications', 'u_mg6')).body.items).toEqual(expect.arrayContaining([expect.objectContaining({ backend_type: 'meetup.cancelled' })]));
  });

  it('an accepted guest leaves and the meetup remains confirmed while another guest remains', async () => {
    await provision('u_mh5', 'u_mg7', 'u_mg8');
    const created = await createMeetup('u_mh5', ['u_mg7', 'u_mg8']);
    const id = created.body.id as string;
    await api('POST', `/v1/meetups/${id}/accept`, 'u_mg7');
    const left = await api('POST', `/v1/meetups/${id}/leave`, 'u_mg7');
    expect(left.body.status).toBe('confirmed');
    expect((left.body.participants as { user_id: string; status: string }[]).find((p) => p.user_id === 'u_mg7')?.status).toBe('declined');
  });

  it('a blocked user cannot be invited in either direction', async () => {
    await provision('u_bh1', 'u_bg1', 'u_bh2', 'u_bg2');
    await api('POST', '/v1/users/u_bg1/block', 'u_bh1');
    await api('POST', '/v1/users/u_bh2/block', 'u_bg2');
    expect((await createMeetup('u_bh1', ['u_bg1'])).body.code).toBe('meetup_blocked');
    expect((await createMeetup('u_bh2', ['u_bg2'])).body.code).toBe('meetup_blocked');
  });

  it('a block created after an invite hides it and prevents acceptance', async () => {
    await provision('u_bh3', 'u_bg3');
    const created = await createMeetup('u_bh3', ['u_bg3']);
    const id = created.body.id as string;
    await api('POST', '/v1/users/u_bh3/block', 'u_bg3');
    expect((await api('GET', '/v1/meetups', 'u_bg3')).body.meetups).toHaveLength(0);
    expect((await api('GET', `/v1/meetups/${id}`, 'u_bg3')).status).toBe(404);
    expect((await api('POST', `/v1/meetups/${id}/accept`, 'u_bg3')).status).toBe(404);
    expect((await api('GET', '/v1/notifications', 'u_bg3')).body.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ backend_type: 'meetup.invited' })]));
    expect((await api('POST', `/v1/meetups/${id}/cancel`, 'u_bh3')).body.status).toBe('cancelled');
  });

  it('rejects a starts_at value in the past', async () => {
    await provision('u_mh6', 'u_mg9');
    const created = await createMeetup('u_mh6', ['u_mg9'], { starts_at: new Date(Date.now() - 60_000).toISOString() });
    expect(created.status).toBe(422);
    expect(created.body.detail).toContain('future');
  });

  it('rejects inviting yourself', async () => {
    await provision('u_mh7');
    const created = await createMeetup('u_mh7', ['u_mh7']);
    expect(created.status).toBe(422);
    expect(created.body.detail).toContain('yourself');
  });

  it('returns 404 to a non-participant requesting meetup details', async () => {
    await provision('u_mh8', 'u_mg10', 'u_mstranger');
    const created = await createMeetup('u_mh8', ['u_mg10']);
    expect((await api('GET', `/v1/meetups/${created.body.id}`, 'u_mstranger')).status).toBe(404);
  });

  it('derives completed on read after starts_at passes without changing stored status', async () => {
    await provision('u_mh9', 'u_mg11');
    const created = await createMeetup('u_mh9', ['u_mg11']);
    const id = created.body.id as string;
    await api('POST', `/v1/meetups/${id}/accept`, 'u_mg11');
    await sql(`UPDATE meetups SET starts_at = now() - interval '1 minute' WHERE id = $1`, [id]);
    expect((await api('GET', `/v1/meetups/${id}`, 'u_mh9')).body.status).toBe('completed');
    const stored = await sql<{ status: string }>(`SELECT status FROM meetups WHERE id = $1`, [id]);
    expect(stored[0]!.status).toBe('confirmed');
    expect((await api('POST', `/v1/meetups/${id}/cancel`, 'u_mh9')).status).toBe(409);
  });
});
