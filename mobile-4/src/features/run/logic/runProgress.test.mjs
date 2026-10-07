import assert from 'node:assert/strict';
import test from 'node:test';
import { advance, emptyProgress, influenceOf, paceZone, rollingPace, INFLUENCE_M } from './runProgress.ts';
import { worldDemoPosition, WORLD_DEMO_LOOP_M } from './worldDemo.ts';
import { territoryShapes } from '../../world/data/world.ts';
import { previewWorld } from '../../world/source/preview.ts';

const world = previewWorld(territoryShapes(), 0);
/** A steady 3 m/s run along the College Street demo loop, one fix per second. */
const runFixes = (seconds, speed = 3) => Array.from({ length: seconds }, (_, s) => {
  const [lat, lon] = worldDemoPosition(s * speed);
  return { lat, lon, t: 1_000_000 + s * 1000, accuracy: 5 };
});

test('the College Street demo loop is a real loop through several micro territories', () => {
  assert.ok(WORLD_DEMO_LOOP_M > 900 && WORLD_DEMO_LOOP_M < 2500, `loop is ${WORLD_DEMO_LOOP_M} m`);
  const { progress } = advance(emptyProgress(), runFixes(Math.ceil(WORLD_DEMO_LOOP_M / 3)), world);
  const names = progress.order.map((id) => world.find((t) => t.id === id).name);
  assert.ok(names.length >= 5, `crossed ${names}`);
  for (const n of ['Coffee House', 'Presidency', 'Medical College']) assert.ok(names.includes(n), `${n} not crossed: ${names}`);
});

test('entering, influence, powering and splits arrive as events, once each', () => {
  const fixes = runFixes(900); // 2.7 km
  let p = emptyProgress();
  const events = [];
  // Feed in uneven chunks, like GPS batches.
  for (let i = 1; i <= fixes.length; i += 1 + (i % 7)) {
    const r = advance(p, fixes.slice(0, i), world);
    p = r.progress;
    events.push(...r.events);
  }
  const r = advance(p, fixes, world);
  p = r.progress;
  events.push(...r.events);
  assert.equal(p.processed, fixes.length);
  assert.ok(Math.abs(p.meters - 2697) < 60, `distance ${p.meters}`);
  assert.deepEqual(events.filter((e) => e.kind === 'split').map((e) => e.km), [1, 2]);
  for (const e of events.filter((e) => e.kind === 'split')) assert.ok(Math.abs(e.sec - 333) <= 3, `split ${e.sec}s at 3 m/s`);
  const powered = events.filter((e) => e.kind === 'powered').map((e) => e.id);
  assert.equal(new Set(powered).size, powered.length, 'each territory powers once');
  for (const id of powered) assert.ok(p.byTerritory[id].meters >= INFLUENCE_M.micro);
  const firstEnters = events.filter((e) => e.kind === 'enter' && e.first).map((e) => e.id);
  assert.deepEqual(firstEnters, p.order);
  assert.ok(p.bestStreak >= 3);
  // Metres in territories never exceed the whole run.
  assert.ok(Object.values(p.byTerritory).reduce((s, t) => s + t.meters, 0) <= p.meters + 1);
});

test('GPS jumps add no distance', () => {
  const fixes = runFixes(20);
  fixes.push({ lat: 22.70, lon: 88.40, t: fixes[19].t + 1000, accuracy: 5 });
  const { progress } = advance(emptyProgress(), fixes, world);
  assert.ok(progress.meters < 70);
});

test('influence, rolling pace and pace zones', () => {
  assert.equal(influenceOf({ tier: 5 }, 100), 0.5);
  assert.equal(influenceOf({ tier: 4 }, 1200), 1);
  assert.ok(Math.abs(rollingPace(runFixes(60, 3)) - 333.3) < 5);
  assert.ok(Number.isNaN(rollingPace(runFixes(2))));
  assert.equal(paceZone(250, 'run').label, 'Fast');
  assert.equal(paceZone(333, 'run').label, 'Steady');
  assert.equal(paceZone(600, 'run').label, 'Easy');
  assert.equal(paceZone(600, 'walk').label, 'Tempo');
  assert.equal(paceZone(NaN, 'run'), null);
});
