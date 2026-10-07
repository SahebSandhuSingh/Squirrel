import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildGeography, ZONES } from '../data/geography.ts';
import { CAMPUS_CREWS } from '../data/crews.ts';
import { campusLayers } from '../engine/features.ts';
import { inRing, metres, plane, signedArea, rng } from '../../world/logic/geometry.ts';
import { allowedActions, applyAction, CAPTURE_AT, reachOf, RuleError } from './rules.ts';
import { PREVIEW_PLAYER, previewCampusMapService, previewSeason, simulate } from '../services/previewService.ts';

const osm = JSON.parse(readFileSync(new URL('../../../api/campus/campusOsm.json', import.meta.url), 'utf8'));
const geo = buildGeography(osm);
const byId = new Map(geo.zones.map((z) => [z.id, z]));
const NOW = 1_800_000_000_000;
const PREVIEW_AT = [88.5249, 22.9643];

test('geography: real IISER Kolkata outline, centred where OpenStreetMap has the campus', () => {
  assert.equal(osm.campus_way, 354549537);
  assert.ok(metres(geo.center, [88.5239, 22.9637]) < 200, `centre ${geo.center}`);
  assert.equal(geo.zones.length, ZONES.length);
});

test('geography: zones tile the campus exactly — no gaps, no overlaps', () => {
  const P = plane(geo.center);
  const campus = Math.abs(signedArea(geo.boundary.slice(0, -1).map(P.to)));
  const sum = geo.zones.reduce((s, z) => s + z.areaM2, 0);
  assert.ok(Math.abs(sum - campus) / campus < 0.002, `zones ${sum} m² vs campus ${campus} m²`);
  for (const z of geo.zones) {
    assert.ok(inRing(z.center, z.polygon[0]), `${z.id}: node outside its zone`);
    for (const o of geo.zones) if (o.id !== z.id) assert.ok(!inRing(z.center, o.polygon[0]), `${z.id}'s node lies inside ${o.id}`);
  }
});

test('geography: zones are named after real landmarks; unnamed areas are labelled descriptive', () => {
  for (const z of geo.zones) {
    if (z.nameSource === 'osm') assert.ok(z.landmarks.length > 0, `${z.id} has no OSM landmark`);
  }
  assert.ok(byId.get('library').landmarks.includes('IISER Kolkata Library'));
  assert.ok(byId.get('icv-hall').landmarks.includes('ICV Hall'));
  assert.equal(byId.get('east-green').nameSource, 'descriptive');
  for (const id of ['faculty-quarters', 'faculty-quarters-d', 'staff-quarters', 'garden-high-school']) assert.ok(byId.get(id).protected, id);
  assert.ok(geo.neighbours.has(['icv-hall', 'mess'].sort().join('|')));
});

test('preview season: deterministic, crews distinct, ownership only in data', () => {
  const a = previewSeason(geo, NOW);
  const b = previewSeason(geo, NOW);
  assert.deepEqual(a.zones.map((z) => [z.id, z.ownerCrewId, z.status, z.activeUsers]), b.zones.map((z) => [z.id, z.ownerCrewId, z.status, z.activeUsers]));
  assert.equal(new Set(CAMPUS_CREWS.map((c) => c.color)).size, CAMPUS_CREWS.length);
  const mine = a.zones.filter((z) => z.ownerCrewId === PREVIEW_PLAYER.crewId);
  assert.equal(mine.length, 3);
  assert.equal(a.player.xp, 1240);
  for (const z of a.zones) {
    if (z.geometry.protected) assert.equal(z.status, 'locked');
    if (z.challenge) assert.notEqual(z.challenge.attackerCrewId, z.ownerCrewId);
  }
});

test('rules: only the moves you can make are offered', () => {
  const st = previewSeason(geo, NOW);
  const z = (id) => st.zones.find((x) => x.id === id);
  const at = (id) => reachOf(z(id), PREVIEW_AT);
  const p = st.player;
  assert.deepEqual(allowedActions(z('nscb'), p, at('nscb')).actions, ['claim']);
  assert.deepEqual(allowedActions(z('mess'), p, at('mess')).actions, ['defend']);
  assert.deepEqual(allowedActions(z('library'), p, at('library')).actions, ['attack']);
  const far = allowedActions(z('nivedita'), p, at('nivedita'));
  assert.deepEqual(far.actions, ['challenge'], 'a challenge can be called from anywhere');
  assert.deepEqual(far.needPresence, ['attack']);
  assert.deepEqual(allowedActions(z('faculty-quarters'), p, at('faculty-quarters')).actions, []);
  assert.deepEqual(allowedActions(z('football-ground'), p, reachOf(z('football-ground'), z('football-ground').center)).actions, [], "someone else's battle");
  assert.throws(() => applyAction(z('nivedita'), null, 'attack', p, at('nivedita'), NOW, 'x'), RuleError);
});

test('rules: claim, attack → capture, defend → repel', () => {
  const st = previewSeason(geo, NOW);
  const p = st.player;
  const z = (id) => st.zones.find((x) => x.id === id);
  const claimed = applyAction(z('nscb'), null, 'claim', p, reachOf(z('nscb'), PREVIEW_AT), NOW, 'a');
  assert.equal(claimed.outcome, 'claimed');
  assert.equal(claimed.zone.ownerCrewId, p.crewId);
  assert.equal(claimed.player.xp, 1240 + 300);

  let lib = z('library');
  let outcome;
  for (let i = 0; i < 10 && outcome !== 'captured'; i++) {
    const allowed = allowedActions(lib, p, reachOf(lib, PREVIEW_AT));
    const move = allowed.actions[0];
    if (lib.challenge.progress >= CAPTURE_AT) assert.equal(move, 'capture');
    const r = applyAction(lib, null, move, p, reachOf(lib, PREVIEW_AT), NOW + i, `b${i}`);
    outcome = r.outcome;
    lib = r.zone;
  }
  assert.equal(outcome, 'captured');
  assert.equal(lib.ownerCrewId, p.crewId);
  assert.equal(lib.challenge, null);

  let mess = z('mess');
  for (let i = 0; i < 3 && mess.challenge; i++) mess = applyAction(mess, null, 'defend', p, reachOf(mess, PREVIEW_AT), NOW, 'c').zone;
  assert.equal(mess.status, 'owned');
});

test('simulation never takes your zones and keeps state valid', () => {
  const st = previewSeason(geo, NOW);
  const r = rng('sim');
  for (let i = 0; i < 400; i++) simulate(st, r, NOW + i * 5000, PREVIEW_PLAYER.crewId);
  assert.equal(st.zones.filter((z) => z.ownerCrewId === PREVIEW_PLAYER.crewId).length, 3);
  for (const z of st.zones) {
    assert.ok(z.activeUsers >= 0 && z.defenseStrength >= 0 && z.defenseStrength <= 100);
    if (z.status === 'locked') assert.equal(z.ownerCrewId, null);
    if (z.challenge) assert.ok(z.challenge.progress > 0 && z.challenge.progress < 100);
  }
});

test('map layers: crew regions merge neighbours; links and attack vectors follow the data', () => {
  const st = previewSeason(geo, NOW);
  const L = campusLayers(st.zones, CAMPUS_CREWS, geo, 'night-owls');
  assert.equal(L.zones.features.length, geo.zones.length);
  const owls = L.regions.features.filter((f) => f.properties.crew === 'night-owls');
  assert.ok(owls.length >= 1 && owls.length < 3, 'ICV Hall and the Dining Hall merge into one region');
  assert.ok(L.links.features.some((f) => [f.properties.from, f.properties.to].sort().join() === ['icv-hall', 'mess'].sort().join()));
  assert.equal(L.vectors.features.length, st.zones.filter((z) => z.challenge).length);
  const lib = L.zones.features.find((f) => f.properties.id === 'library').properties;
  assert.equal(lib.attacking, 1);
  assert.equal(lib.chal, CAMPUS_CREWS[0].color);
});

test('preview service: endpoints answer, moves go through the rules', async () => {
  const svc = previewCampusMapService(geo, { latencyMs: 0, now: () => NOW });
  assert.equal((await svc.getZones()).length, geo.zones.length);
  assert.equal((await svc.getCrews()).length, 4);
  assert.ok((await svc.getTerritories()).length > 0);
  assert.ok((await svc.getZoneActivity('mess')).length > 0);
  const r = await svc.act('nscb', 'claim', PREVIEW_AT);
  assert.equal(r.zone.ownerCrewId, 'night-owls');
  assert.equal((await svc.getPlayer()).xp, 1540);
  await assert.rejects(svc.act('nivedita', 'attack', PREVIEW_AT), RuleError);
});
