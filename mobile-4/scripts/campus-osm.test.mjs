import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCampusGeo, CAMPUS_WAY_ID, insideRing, parseOsmXml, parseOverpassJson } from './campus-osm.mjs';

// A small campus in OSM's own formats: the university outline, Nivedita Hall and the library where
// OpenStreetMap has them, a lake drawn as a multipolygon, a football pitch, a road, a gate and a
// building just outside the fence (which must be left out).
let nextId = 1;
const nodes = [];
const ways = [];
const node = (lat, lon, tags) => {
  const id = nextId++;
  nodes.push({ type: 'node', id, lat, lon, ...(tags ? { tags } : {}) });
  return id;
};
const box = (lat, lon, dLat, dLon) => {
  const ids = [node(lat - dLat, lon - dLon), node(lat - dLat, lon + dLon), node(lat + dLat, lon + dLon), node(lat + dLat, lon - dLon)];
  return [...ids, ids[0]];
};
const way = (id, nodeIds, tags) => ways.push({ type: 'way', id, nodes: nodeIds, tags });

way(CAMPUS_WAY_ID, box(22.9637, 88.5239, 0.004, 0.0065), { amenity: 'university', name: 'Indian Institute of Science Education and Research Kolkata' });
way(1122309838, box(22.96385, 88.52052, 0.0003, 0.0004), { building: 'dormitory', name: 'Nivedita Hall', 'building:levels': '5' });
way(1122312901, box(22.96412, 88.52727, 0.0002, 0.0003), { building: 'university', name: 'IISER Kolkata Library', amenity: 'library' });
way(500, box(22.9645, 88.5215, 0.0004, 0.0006), { leisure: 'pitch', sport: 'soccer', name: 'Football Ground' });
way(501, box(22.9625, 88.5262, 0.0003, 0.0004), {}); // the lake's outer way (tags on the relation)
way(502, [node(22.9605, 88.5239), node(22.9637, 88.5239), node(22.9665, 88.5239)], { highway: 'service', name: 'Spine road' });
way(503, box(22.9700, 88.5300, 0.0002, 0.0002), { building: 'yes', name: 'Off-campus shop' });
way(504, box(22.9630, 88.5230, 0.00003, 0.00003), { building: 'yes', name: 'Tiny kiosk' }); // too small for a zone
node(22.9601, 88.5239, { barrier: 'gate', name: 'Main Gate' });
const relation = { type: 'relation', id: 9001, members: [{ type: 'way', ref: 501, role: 'outer' }], tags: { type: 'multipolygon', natural: 'water', name: 'RC Lake' } };

const overpass = { elements: [...nodes, ...ways, relation] };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const tagsXml = (t = {}) => Object.entries(t).map(([k, v]) => `<tag k="${esc(k)}" v="${esc(v)}"/>`).join('');
const xml = `<?xml version="1.0" encoding="UTF-8"?><osm version="0.6">
${nodes.map((n) => (n.tags ? `<node id="${n.id}" lat="${n.lat}" lon="${n.lon}">${tagsXml(n.tags)}</node>` : `<node id="${n.id}" lat="${n.lat}" lon="${n.lon}"/>`)).join('\n')}
${ways.map((w) => `<way id="${w.id}">${w.nodes.map((r) => `<nd ref="${r}"/>`).join('')}${tagsXml(w.tags)}</way>`).join('\n')}
<relation id="9001"><member type="way" ref="501" role="outer"/>${tagsXml(relation.tags)}</relation>
</osm>`;

test('the OSM export file and the Overpass download give the same campus', () => {
  assert.deepEqual(buildCampusGeo(parseOsmXml(xml)), buildCampusGeo(parseOverpassJson(overpass)));
});

test('named campus areas become zones, with the ids the rest of the system uses', () => {
  const geo = buildCampusGeo(parseOverpassJson(overpass));
  const byName = Object.fromEntries(geo.zones.map((z) => [z.name, z]));
  assert.deepEqual(Object.keys(byName).sort(), ['Football Ground', 'IISER Kolkata Library', 'Nivedita Hall', 'RC Lake']);

  assert.equal(byName['Nivedita Hall'].kind, 'hostel');
  assert.equal(byName['Nivedita Hall'].id, 'nivedita', 'the same id as the placeholder, so territory carries over');
  assert.equal(byName['Nivedita Hall'].hostel, 'nivedita');
  assert.equal(byName['IISER Kolkata Library'].id, 'library');
  assert.equal(byName['IISER Kolkata Library'].kind, 'library');
  assert.equal(byName['RC Lake'].id, 'lake');
  assert.equal(byName['Football Ground'].kind, 'sports');

  // Real positions, unchanged: Nivedita sits where OpenStreetMap has it.
  const [lat, lng] = byName['Nivedita Hall'].centroid;
  assert.ok(Math.abs(lat - 22.96385) < 1e-5 && Math.abs(lng - 88.52052) < 1e-5);
  for (const z of geo.zones) assert.ok(z.polygon.length >= 3 && z.polygon.length <= 30, z.id);
});

test('only what is on campus is drawn; roads are kept up to the fence', () => {
  const geo = buildCampusGeo(parseOverpassJson(overpass));
  const labels = geo.features.buildings.map((b) => b.label);
  assert.ok(labels.includes('Nivedita Hall') && labels.includes('Tiny kiosk'));
  assert.ok(!labels.includes('Off-campus shop'));
  assert.equal(geo.features.buildings.find((b) => b.label === 'Nivedita Hall').levels, 5);
  assert.deepEqual(geo.features.terrain.map((t) => t.kind).sort(), ['field', 'water']);
  assert.equal(geo.features.roads.length, 1);
  assert.equal(geo.features.roads[0].kind, 'road');
  assert.deepEqual(geo.features.pois.map((p) => [p.name, p.kind]), [['Main Gate', 'gate']]);
  for (const b of geo.features.buildings) assert.ok(insideRing(b.polygon[0], geo.boundary) || b.label === 'Tiny kiosk');
  assert.equal(geo.source, 'osm');
});

test('data without the campus outline is refused with a clear message', () => {
  const without = { elements: overpass.elements.filter((e) => e.id !== CAMPUS_WAY_ID) };
  assert.throws(() => buildCampusGeo(parseOverpassJson(without)), /campus outline/);
});
