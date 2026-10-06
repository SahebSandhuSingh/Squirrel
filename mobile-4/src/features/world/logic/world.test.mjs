import assert from 'node:assert/strict';
import test from 'node:test';
import { CITIES, HOOGHLY, PLACES, REGIONS, UNRESOLVED, territoryShapes } from '../data/world.ts';
import { CREWS, MY_CREW_ID } from '../data/crews.ts';
import { defenceRating, levelFromXp, levelProgress } from './buildWorld.ts';
import { inRing, metres, rng, voronoiCells } from './geometry.ts';
import { ambientEvent, applyAction, planFor, previewWorld, START_UNDISCOVERED } from '../source/preview.ts';

const shapes = territoryShapes();
const byId = new Map(shapes.map((s) => [s.id, s]));

test('voronoi: cells tile a square without gaps or overlaps', () => {
  const square = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const cells = voronoiCells(square, [[25, 25], [75, 25], [50, 80]]);
  const area = (r) => Math.abs(r.reduce((s, [x, y], i) => s + x * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * y, 0)) / 2;
  assert.equal(Math.round(cells.reduce((s, c) => s + area(c), 0)), 10000);
  assert.ok(inRing([25, 25], cells[0]) && !inRing([25, 25], cells[1]) && !inRing([25, 25], cells[2]));
});

test('every territory id is unique and every authored seed produced a territory', () => {
  assert.equal(new Set(shapes.map((s) => s.id)).size, shapes.length);
  const authored = REGIONS.flatMap((r) => [...(r.seeds ?? []), ...(r.zones ?? [])]).flatMap((s) => [s, ...(s.children ?? [])]);
  const missing = authored.filter((s) => !byId.has(s.id)).map((s) => s.id);
  assert.deepEqual(missing, [], `seeds that grew no territory (outside their region or parent cell): ${missing}`);
});

test('every territory is a real closed polygon that contains its own label point', () => {
  for (const t of shapes) {
    assert.ok(t.ring.length >= 4, t.id);
    assert.deepEqual(t.ring[0], t.ring[t.ring.length - 1], `${t.id} ring not closed`);
    assert.ok(t.areaKm2 > 0.003, `${t.id} is too small (${t.areaKm2} km²)`);
    assert.ok(inRing(t.centroid, t.ring), `${t.id}: label point outside its outline`);
  }
});

test('zones in one region do not overlap; micro territories stay inside their zone', () => {
  for (const t of shapes) {
    const siblings = shapes.filter((o) => o.id !== t.id && o.tier === t.tier && o.parentId === t.parentId && o.region === t.region);
    for (const o of siblings) assert.ok(!inRing(t.centroid, o.ring), `${t.id}'s centre lies inside ${o.id}`);
    if (t.parentId) assert.ok(inRing(t.centroid, byId.get(t.parentId).ring), `${t.id} escaped ${t.parentId}`);
  }
});

test('the special student zones are split into playable micro territories', () => {
  const kids = (id) => shapes.filter((s) => s.parentId === id).map((s) => s.name);
  assert.equal(kids('college-street').length, 8);
  assert.ok(kids('college-street').includes('Coffee House'));
  assert.deepEqual(shapes.filter((s) => s.region === 'SALT LAKE' && s.tier === 4).map((s) => s.name), ['Sector I', 'Sector II', 'Sector III', 'Sector V']);
  assert.ok(kids('sl-sector-5').includes('College More'));
  assert.equal(shapes.filter((s) => s.region === 'NEW TOWN' && s.tier === 4).length, 3);
  assert.ok(kids('dhakuria').includes('Rabindra Sarobar'));
  assert.ok(kids('jadavpur').includes('Jadavpur University'));
  assert.ok(byId.has('kl-iiser-kolkata') && byId.has('kl-kalyani-university') && byId.has('kl-bckv') && byId.has('kl-aiims-kalyani'));
});

test('geography sits where it should: everything inside the Bengal box, Kolkata seeds east of the river', () => {
  const inBengal = ([lat, lng]) => lat > 21.4 && lat < 27.4 && lng > 85.8 && lng < 89.95;
  for (const p of PLACES) assert.ok(inBengal(p.at), p.id);
  for (const c of CITIES) assert.ok(inBengal(c.at), c.id);
  for (const p of HOOGHLY) assert.ok(inBengal(p), 'hooghly');
  // College Street is ~1 km from Sealdah station and ~1.5 km from Howrah Bridge.
  const cs = byId.get('college-street').centroid;
  assert.ok(metres(cs, [88.3700, 22.5675]) < 1600);
  for (const u of UNRESOLVED) assert.ok(!PLACES.some((p) => p.name.toLowerCase() === u.asked.toLowerCase()), `${u.id} is both resolved and unresolved`);
});

test('levels and defence ratings follow the published thresholds', () => {
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(1500), 2);
  assert.equal(levelFromXp(8420), 4);
  assert.equal(levelFromXp(99_999), 5);
  assert.equal(levelProgress(99_999), 1);
  assert.equal(defenceRating(78), 'HIGH');
  assert.equal(defenceRating(90), 'FORTIFIED');
  assert.equal(defenceRating(10), 'LOW');
});

test('preview season: deterministic, and College Street tells the opening story', () => {
  const a = previewWorld(shapes, 1_000_000);
  const b = previewWorld(shapes, 1_000_000);
  assert.deepEqual(a.map((t) => [t.id, t.state.ownerCrewId, t.state.status, t.state.xp]), b.map((t) => [t.id, t.state.ownerCrewId, t.state.status, t.state.xp]));
  const cs = a.find((t) => t.id === 'college-street');
  assert.equal(cs.state.ownerCrewId, 'night-owls');
  assert.equal(cs.state.challengerCrewId, 'south-side');
  assert.equal(cs.state.control, 74);
  assert.equal(cs.level, 4);
  assert.equal(cs.state.activeUsers, 32);
  assert.deepEqual(cs.state.recent.map((r) => r.xp), [320, 180, 95]);
  for (const t of a) {
    if (t.state.ownerCrewId) assert.ok(CREWS.some((c) => c.id === t.state.ownerCrewId), t.id);
    if (t.state.status === 'contested' || t.state.status === 'under_attack') assert.ok(t.state.challengerCrewId && t.state.challengerCrewId !== t.state.ownerCrewId, t.id);
    assert.ok(t.state.control >= 0 && t.state.control <= 100);
  }
  for (const id of START_UNDISCOVERED) assert.ok(byId.has(id), `unknown undiscovered id ${id}`);
});

test('your moves: claim, defend, challenge, push and capture follow the rules', () => {
  const world = previewWorld(shapes, 0);
  const get = (id) => world.find((t) => t.id === id);
  const square = get('cs-college-square');
  assert.equal(planFor(square, true).kind, 'claim');
  assert.equal(planFor(square, false).kind, 'scout');
  const claimed = applyAction(square, 'claim', 1);
  assert.equal(claimed.outcome, 'claimed');
  assert.equal(claimed.state.ownerCrewId, MY_CREW_ID);
  assert.equal(claimed.reward, 250);

  const cs = get('college-street');
  assert.equal(planFor(cs, true).kind, 'defend');
  const defended = applyAction(cs, 'defend', 2);
  assert.equal(defended.state.control, 82);
  assert.equal(defended.outcome, 'repelled', '74% + 8 crosses 80%: the challengers are driven out');

  const rival = world.find((t) => t.state.status === 'owned' && t.state.ownerCrewId && t.state.ownerCrewId !== MY_CREW_ID);
  assert.equal(planFor(rival, true).kind, 'challenge');
  const challenged = applyAction(rival, 'challenge', 3);
  assert.equal(challenged.state.challengerCrewId, MY_CREW_ID);
  let t = { ...rival, state: challenged.state };
  let outcome;
  for (let i = 0; i < 10 && outcome !== 'captured'; i++) {
    assert.equal(planFor(t, true).kind, 'push');
    const r = applyAction(t, 'push', 4 + i, MY_CREW_ID, () => 0.5);
    outcome = r.outcome;
    t = { ...t, state: r.state };
  }
  assert.equal(outcome, 'captured');
  assert.equal(t.state.ownerCrewId, MY_CREW_ID);

  assert.equal(planFor(get('maidan'), true).kind, 'locked');
});

test('ambient activity is aggregated: crews and counts, never a position', () => {
  const world = previewWorld(shapes, 0);
  const found = new Set(shapes.map((s) => s.id));
  const r = rng('t');
  for (let i = 0; i < 200; i++) {
    const e = ambientEvent(world, found, r, i);
    assert.ok(e);
    assert.doesNotMatch(e.item.text, /\d+\.\d{3,}/, 'no coordinates in activity text');
    assert.ok(e.next.control >= 0 && e.next.control <= 100);
  }
});

test('search: finds colleges by alias, zones by name, and never reveals who holds uncharted ground', async () => {
  const { buildIndex, search } = await import('./search.ts');
  const world = previewWorld(shapes, 0);
  const found = new Set(shapes.map((s) => s.id).filter((id) => !START_UNDISCOVERED.has(id)));
  const index = buildIndex({ territories: world, discovered: found, places: PLACES, crews: CREWS, cities: CITIES, unresolved: UNRESOLVED, crewName: (id) => CREWS.find((c) => c.id === id)?.name ?? null });
  assert.equal(search(index, 'College Street')[0].territoryId, 'college-street');
  assert.equal(search(index, 'college st')[0].territoryId, 'college-street');
  assert.match(search(index, 'saint xaviers')[0].title, /Xavier/);
  assert.match(search(index, 'st xaviers')[0].title, /Xavier/);
  assert.equal(search(index, 'JU')[0].title, 'Jadavpur University');
  assert.equal(search(index, 'vidhan nagar')[0].title, 'Salt Lake (Bidhannagar)');
  assert.equal(search(index, 'night owls')[0].crewId, 'night-owls');
  assert.equal(search(index, 'shokpur')[0].kind, 'pending');
  assert.equal(search(index, 'shokpur')[0].target, null, 'an unconfirmed place is never flown to');
  const bridge = search(index, 'dhakuria bridge')[0];
  assert.match(bridge.subtitle, /Uncharted/);
  assert.doesNotMatch(bridge.subtitle, /South Side/);
  assert.ok(search(index, 'presidncy').length > 0, 'typo-tolerant');
});

test('camera: the HUD names the level and the place under the visible centre', async () => {
  const { levelOf, regionTitle } = await import('./camera.ts');
  const world = previewWorld(shapes, 0);
  assert.equal(levelOf(6), 'bengal');
  assert.equal(levelOf(9), 'metro');
  assert.equal(levelOf(11), 'city');
  assert.equal(regionTitle(world, [87.95, 24.25], 6).title, 'West Bengal');
  assert.equal(regionTitle(world, [88.4172, 22.5832], 12.8).title, 'Sector II');
  assert.deepEqual(regionTitle(world, [88.4172, 22.5832], 12.8).crumbs, ['Bengal', 'Salt Lake']);
  assert.equal(regionTitle(world, [88.4172, 22.5832], 14.5).title, 'Central Park');
});
