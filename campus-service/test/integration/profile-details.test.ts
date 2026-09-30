import { describe, expect, it } from 'vitest';
import { api, HAS_DB, sql, useTestApp } from './setup.js';

const details = {
  full_name: 'Asha Rao', personal_email: 'asha@gmail.com', college_email: 'u_asha@iiserkol.ac.in',
  phone: '+919876543210', gender: 'female', age: 20, course: 'BS-MS', cgpa: 8.4,
};

describe.skipIf(!HAS_DB)('profile details (integration)', () => {
  useTestApp();

  it('is null until saved', async () => {
    const r = await api('GET', '/v1/me', 'u_fresh');
    expect(r.status).toBe(200);
    expect(r.body.profile_details).toBeNull();
  });

  it('PATCH saves the details and returns them; GET /v1/me reads them back', async () => {
    const r = await api('PATCH', '/v1/me', 'u_asha', { profile_details: details, connection_mode: 'friends', onboarding_completed: true });
    expect(r.status).toBe(200);
    expect(r.body.profile_details).toEqual(details);
    expect(r.body.connection_mode).toBe('friends');
    expect(r.body.onboarding_completed).toBe(true);
    expect((await api('GET', '/v1/me', 'u_asha')).body.profile_details).toEqual(details);
  });

  it('CGPA is optional and round-trips as null', async () => {
    const r = await api('PATCH', '/v1/me', 'u_nocgpa', { profile_details: { ...details, cgpa: null } });
    expect(r.status).toBe(200);
    expect((r.body.profile_details as { cgpa: unknown }).cgpa).toBeNull();
  });

  it('saving again replaces the record (no duplicate rows)', async () => {
    await api('PATCH', '/v1/me', 'u_twice', { profile_details: details });
    const r = await api('PATCH', '/v1/me', 'u_twice', { profile_details: { ...details, age: 21, course: 'PhD' } });
    expect(r.status).toBe(200);
    expect(r.body.profile_details).toMatchObject({ age: 21, course: 'PhD' });
    expect(await sql(`SELECT 1 FROM user_profile_details WHERE user_id = 'u_twice'`)).toHaveLength(1);
  });

  it('a patch without profile_details leaves saved details alone', async () => {
    await api('PATCH', '/v1/me', 'u_keep', { profile_details: details });
    const r = await api('PATCH', '/v1/me', 'u_keep', { bio: 'hi' });
    expect(r.body.profile_details).toEqual(details);
  });

  it('rejects invalid details with 422 and applies nothing from the same patch', async () => {
    const r = await api('PATCH', '/v1/me', 'u_bad', { profile_details: { ...details, phone: '12345' }, bio: 'should not stick', onboarding_completed: true });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('invalid');
    const me = (await api('GET', '/v1/me', 'u_bad')).body;
    expect(me.bio).toBeNull();
    expect(me.onboarding_completed).toBe(false);
    expect(me.profile_details).toBeNull();
  });

  it('a rejected hostel rolls back the details in the same patch', async () => {
    const r = await api('PATCH', '/v1/me', 'u_rollback', { profile_details: details, hostel_id: 'no_such_hostel' });
    expect(r.status).toBe(422);
    expect((await api('GET', '/v1/me', 'u_rollback')).body.profile_details).toBeNull();
  });

  it('rejects a non-campus college email', async () => {
    const r = await api('PATCH', '/v1/me', 'u_gmail', { profile_details: { ...details, college_email: 'asha@gmail.com' } });
    expect(r.status).toBe(422);
  });

  it('details are private: never on the public profile, and other users cannot read them', async () => {
    await api('PATCH', '/v1/me', 'u_private', { profile_details: details });
    await api('GET', '/v1/me', 'u_viewer');
    const pub = await api('GET', '/v1/users/u_private', 'u_viewer');
    expect(pub.status).toBe(200);
    const text = JSON.stringify(pub.body);
    expect(pub.body).not.toHaveProperty('profile_details');
    for (const secret of [details.personal_email, details.phone, details.full_name, 'BS-MS']) expect(text).not.toContain(secret);
    const anon = await api('GET', '/v1/users/u_private', null);
    expect(JSON.stringify(anon.body)).not.toContain(details.phone);
  });

  it('is deleted with the user', async () => {
    await api('PATCH', '/v1/me', 'u_gone', { profile_details: details });
    await sql(`DELETE FROM users WHERE id = 'u_gone'`);
    expect(await sql(`SELECT 1 FROM user_profile_details WHERE user_id = 'u_gone'`)).toHaveLength(0);
  });
});
