import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureSocialBridge, resetIdentityState } from '../../src/identity/index.js';
import { api, app, HAS_DB, sql, useTestApp } from './setup.js';

async function active(userId: string) {
  await api('GET', '/v1/me', userId);
  await api('PUT', '/v1/me/open-to-meet', userId, { enabled: true });
  await api('PUT', '/v1/map/presence', userId, { lat: 22.9637, lng: 88.5284 });
}

const TOKEN = 'test-internal-token';

const social = {
  blocks: new Map<string, string[]>(), // subject -> array of blocked subjects
  mode: 'ok' as 'ok' | 'error' | 'hang',
  blockCalls: [] as string[],
  clear() {
    this.blocks.clear();
    this.blockCalls = [];
    this.mode = 'ok';
  }
};

let server: Server;
let socialUrl = '';

function startFakeSocial() {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      if (social.mode === 'hang') return;
      if (social.mode === 'error') { res.writeHead(500).end('boom'); return; }
      
      if (req.method === 'GET' && req.url?.startsWith('/internal/v1/blocks/')) {
        if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401).end(); return; }
        const sub = decodeURIComponent(req.url.split('/internal/v1/blocks/')[1] || '');
        social.blockCalls.push(sub);
        
        const blocked = social.blocks.get(sub);
        if (!blocked) {
          res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ subject: sub, blocked: [], as_of: new Date().toISOString() }));
          return;
        }
        
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ subject: sub, blocked, as_of: new Date().toISOString() }));
        return;
      }
      
      if (req.method === 'POST' && req.url === '/internal/v1/people/resolve') {
         res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ people: [] }));
         return;
      }

      res.writeHead(404).end();
    });
  });
  return new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => { socialUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; resolve(); }));
}

describe.skipIf(!HAS_DB)('blocks via Social (integration)', () => {
  useTestApp();

  beforeAll(async () => {
    await startFakeSocial();
  });
  afterAll(() => {
    server.close();
    configureSocialBridge(null); // restore to env
  });

  beforeEach(() => {
    social.clear();
    resetIdentityState();
    configureSocialBridge({ url: socialUrl, token: TOKEN });
  });

  it('blocked in Social only: hidden from lists, meetup invite refused', async () => {
    await active('u_sb_1');
    await active('u_sb_2');

    social.blocks.set('u_sb_1', ['u_sb_2']);

    const players = await api('GET', '/v1/map/players', 'u_sb_1');
    expect(players.body.players.find((p: any) => p.user_id === 'u_sb_2')).toBeUndefined();
    
    const nearby = await api('GET', '/v1/activity/nearby', 'u_sb_1');
    expect(nearby.body.nearby.find((p: any) => p.person?.user_id === 'u_sb_2')).toBeUndefined();

    const invite = await api('POST', '/v1/meetups', 'u_sb_1', { place_text: 'Campus cafe', starts_at: new Date(Date.now() + 3600000).toISOString(), invitee_ids: ['u_sb_2'] });
    expect(invite.status).toBe(409);
    expect(invite.body.code).toBe('meetup_blocked');
  });

  it('blocked locally only: still hidden (union holds)', async () => {
    await api('GET', '/v1/me', 'u_sb_3');
    await api('GET', '/v1/me', 'u_sb_4');
    
    social.blocks.set('u_sb_3', []);
    
    await api('POST', '/v1/users/u_sb_4/block', 'u_sb_3');
    
    const invite = await api('POST', '/v1/meetups', 'u_sb_3', { place_text: 'Campus cafe', starts_at: new Date(Date.now() + 3600000).toISOString(), invitee_ids: ['u_sb_4'] });
    expect(invite.status).toBe(409);
    expect(invite.body.code).toBe('meetup_blocked');
  });

  it('Social unreachable: lists return empty with hidden_reason, meetup invite returns 503', async () => {
    await active('u_sb_5');
    await active('u_sb_6');

    social.mode = 'error';

    const players = await api('GET', '/v1/map/players', 'u_sb_5');
    expect(players.status).toBe(200);
    expect(players.body.players).toEqual([]);
    expect(players.body.hidden_reason).toBe('blocks_unavailable');

    const invite = await api('POST', '/v1/meetups', 'u_sb_5', { place_text: 'Campus cafe', starts_at: new Date(Date.now() + 3600000).toISOString(), invitee_ids: ['u_sb_6'] });
    expect(invite.status).toBe(503);
    expect(invite.body.code).toBe('blocks_unavailable');
  });

  it('cached answer older than 30s is refreshed', async () => {
    vi.useFakeTimers();

    await api('GET', '/v1/me', 'u_sb_7');
    await api('GET', '/v1/me', 'u_sb_8');

    social.blocks.set('u_sb_7', []);
    
    await api('GET', '/v1/users/u_sb_8/context', 'u_sb_7');
    expect(social.blockCalls).toContain('u_sb_7');
    social.blockCalls = [];

    await api('GET', '/v1/users/u_sb_8/context', 'u_sb_7');
    expect(social.blockCalls).toHaveLength(0);

    vi.advanceTimersByTime(31000);

    await api('GET', '/v1/users/u_sb_8/context', 'u_sb_7');
    expect(social.blockCalls).toContain('u_sb_7');

    vi.useRealTimers();
  });

  it('Social returns empty list for unseen user: nothing breaks, nobody wrongly hidden', async () => {
    await active('u_sb_9');
    await active('u_sb_10');

    const players = await api('GET', '/v1/map/players', 'u_sb_9');
    expect(players.status).toBe(200);
    expect(players.body.hidden_reason).toBeNull();
    expect(players.body.players.find((p: any) => p.user_id === 'u_sb_10')).toBeDefined();
  });
});
