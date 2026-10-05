import { describe, it, expect, vi } from 'vitest';
import { HAS_DB, useTestApp, api, sql } from './setup.js';
import { query } from '../../src/db/pool.js';

async function createMeetup(hostId: string, inviteeIds: string[], startHoursFromNow = 2) {
  const startsAt = new Date(Date.now() + startHoursFromNow * 3600_000).toISOString();
  const res = await api('POST', '/v1/meetups', hostId, { place_text: 'Test Place', starts_at: startsAt, invitee_ids: inviteeIds });
  if (res.status !== 201) throw new Error('meetup creation failed ' + JSON.stringify(res.body));
  return res.body.id as string;
}

async function seedUser(id: string) {
  await sql(`INSERT INTO users (id, display_name, created_at, updated_at) VALUES ($1, $1, now(), now()) ON CONFLICT DO NOTHING`, [id]);
}

describe.skipIf(!HAS_DB)('Meetup check-in (integration)', () => {
  useTestApp();

  it('an attendee checks in and can then rate', async () => {
    await seedUser('host1');
    await seedUser('guest1');
    const meetupId = await createMeetup('host1', ['guest1'], 0.1); 
    
    const res = await api('POST', `/v1/meetups/${meetupId}/check-in`, 'guest1', { notify_safety_contact: false });
    expect(res.status).toBe(200);
    expect(res.body.meetup_id).toBe(meetupId);
    expect(res.body.checked_in_at).toBeDefined();

    await sql(`UPDATE meetups SET status = 'completed'`);
    const rateGet = await api('GET', `/v1/meetups/${meetupId}/rating`, 'guest1');
    expect(rateGet.body.can_rate).toBe(true);
  });

  it('someone who did not check in cannot rate', async () => {
    await seedUser('host2');
    await seedUser('guest2');
    const meetupId = await createMeetup('host2', ['guest2'], 0.1);
    
    await sql(`UPDATE meetups SET status = 'completed'`);
    const rateGet = await api('GET', `/v1/meetups/${meetupId}/rating`, 'guest2');
    expect(rateGet.body.can_rate).toBe(false);
  });

  it('checking in twice is a no-op (replay-safe)', async () => {
    await seedUser('host3');
    await seedUser('guest3');
    const meetupId = await createMeetup('host3', ['guest3'], 0.1);
    
    const res1 = await api('POST', `/v1/meetups/${meetupId}/check-in`, 'guest3');
    const res2 = await api('POST', `/v1/meetups/${meetupId}/check-in`, 'guest3');
    expect(res2.status).toBe(200);
    expect(res1.body).toEqual(res2.body);
  });

  it('someone not invited cannot check in', async () => {
    await seedUser('host4');
    await seedUser('unrelated');
    await seedUser('guest4');
    const meetupId = await createMeetup('host4', ['guest4'], 0.1);

    const res = await api('POST', `/v1/meetups/${meetupId}/check-in`, 'unrelated');
    expect(res.status).toBe(404); 
  });

  it('timing rule is enforced', async () => {
    await seedUser('host5');
    await seedUser('guest5');
    const meetupId = await createMeetup('host5', ['guest5'], 2);

    const res = await api('POST', `/v1/meetups/${meetupId}/check-in`, 'guest5');
    expect(res.status).toBe(409);
  });

  it('a blocked pair behaves as meetups already do', async () => {
    await seedUser('host6');
    await seedUser('guest6');
    const meetupId = await createMeetup('host6', ['guest6'], 0.1);

    await sql(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ('host6', 'guest6')`);

    const res = await api('POST', `/v1/meetups/${meetupId}/check-in`, 'guest6');
    expect(res.status).toBe(404);
  });

  it('Social unreachable: check-in succeeds but logs error (or gracefully continues)', async () => {
    await seedUser('host7');
    await seedUser('guest7');
    const meetupId = await createMeetup('host7', ['guest7'], 0.1);
    
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('Network error')));

    const res = await api('POST', `/v1/meetups/${meetupId}/check-in`, 'host7');
    
    expect(res.status).toBe(200);
    fetchSpy.mockRestore();
  });
});
