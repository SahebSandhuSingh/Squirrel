/**
 * Search across the network: territories, zones, colleges and universities, landmarks, hotspots,
 * crews and areas — plus the places whose location isn't confirmed yet (listed, never flown to).
 * Ranking: exact > prefix > word prefix > alias > substring > in-order letters (typo-tolerant).
 */
import type { City, Crew, Place, Territory, UnresolvedPlace } from '../types.ts';
import { toLngLat } from '../types.ts';

export type SearchKind = 'territory' | 'zone' | 'university' | 'college' | 'landmark' | 'hotspot' | 'park' | 'crew' | 'area' | 'pending';

export type SearchResult = {
  key: string;
  kind: SearchKind;
  title: string;
  subtitle: string;
  /** Where to fly ([lng, lat], zoom) — or a territory to select. */
  target: { center: [number, number]; zoom: number } | null;
  territoryId?: string;
  crewId?: string;
  score: number;
};

type Entry = Omit<SearchResult, 'score'> & { terms: string[] };

export const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`.]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    // "college st" → "college street" (a leading "St." stays "st", as in "st xaviers").
    .replace(/(.) st$/, '$1 street');

const PLACE_KIND: Record<Place['kind'], SearchKind> = { university: 'university', college: 'college', landmark: 'landmark', park: 'park', lake: 'park', sports: 'landmark', hotspot: 'hotspot', junction: 'landmark', transit: 'landmark' };

export function buildIndex(input: { territories: Territory[]; discovered: Set<string>; places: Place[]; crews: Crew[]; cities: City[]; unresolved: UnresolvedPlace[]; crewName: (id: string | null) => string | null }): Entry[] {
  const out: Entry[] = [];
  for (const t of input.territories) {
    // Uncharted ground is findable by name, but who holds it stays hidden until it's discovered.
    const found = input.discovered.has(t.id);
    const owner = found ? input.crewName(t.state.ownerCrewId) : null;
    out.push({
      key: `t:${t.id}`,
      kind: t.tier === 4 && t.split ? 'zone' : 'territory',
      title: t.name,
      subtitle: [t.region === 'KOLKATA' ? 'Kolkata' : titleCase(t.region), t.tier === 4 && t.split ? 'Zone' : found ? `Level ${t.level}` : null, !found ? 'Uncharted' : owner ?? (t.state.status === 'locked' ? 'Locked' : 'Unclaimed')].filter(Boolean).join(' · '),
      target: { center: t.centroid, zoom: t.tier === 5 ? 15.2 : t.split ? 13.4 : t.areaKm2 > 12 ? 12 : 13.6 },
      territoryId: t.id,
      terms: [t.name, t.region, ...(t.tags.includes('campus') ? ['campus', 'college', 'university'] : [])],
    });
  }
  for (const p of input.places) {
    out.push({ key: `p:${p.id}`, kind: PLACE_KIND[p.kind], title: p.name, subtitle: `${titleCase(p.kind)}${p.accuracy === 'approximate' ? ' · approx. location' : ''}`, target: { center: toLngLat(p.at), zoom: Math.max(p.minZoom + 0.8, 14.4) }, terms: [p.name, ...(p.aliases ?? [])] });
  }
  for (const c of input.crews) out.push({ key: `c:${c.id}`, kind: 'crew', title: c.name, subtitle: `Crew · ${c.members} members · home: ${c.home}`, target: null, crewId: c.id, terms: [c.name, c.short] });
  for (const c of input.cities) out.push({ key: `a:${c.id}`, kind: 'area', title: c.name, subtitle: c.campus ? `City · ${c.campus}` : 'City', target: { center: toLngLat(c.at), zoom: c.rank === 1 ? 11.2 : 10.5 }, terms: [c.name] });
  for (const a of AREAS) out.push({ key: `a:${a.id}`, kind: 'area', title: a.title, subtitle: a.subtitle, target: { center: a.center, zoom: a.zoom }, terms: a.terms });
  for (const u of input.unresolved) out.push({ key: `u:${u.id}`, kind: 'pending', title: u.asked, subtitle: 'Location not confirmed yet', target: null, terms: [u.asked, ...u.candidates.map((c) => c.name)] });
  return out.map((e) => ({ ...e, terms: e.terms.map(normalise) }));
}

const AREAS = [
  { id: 'bengal', title: 'West Bengal', subtitle: 'State view', center: [87.95, 24.25] as [number, number], zoom: 5.9, terms: ['West Bengal', 'Bengal', 'WB'] },
  { id: 'salt-lake', title: 'Salt Lake (Bidhannagar)', subtitle: 'Area · Sectors I, II, III, V', center: [88.418, 22.581] as [number, number], zoom: 13.1, terms: ['Salt Lake', 'Bidhannagar', 'Vidhan Nagar', 'Bidhan Nagar', 'Saltlake'] },
  { id: 'new-town', title: 'New Town (Rajarhat)', subtitle: 'Area · Action Areas I–III', center: [88.472, 22.596] as [number, number], zoom: 12.6, terms: ['New Town', 'Newtown', 'Rajarhat'] },
  { id: 'kalyani', title: 'Kalyani · Mohanpur', subtitle: 'Area · campus belt', center: [88.48, 22.968] as [number, number], zoom: 12.2, terms: ['Kalyani', 'Mohanpur', 'Haringhata'] },
  { id: 'howrah', title: 'Howrah', subtitle: 'Area · west bank', center: [88.315, 22.595] as [number, number], zoom: 12.4, terms: ['Howrah', 'Shibpur'] },
];

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])(\w)/g, (_, a, b) => a + b.toUpperCase());

function scoreTerm(q: string, term: string, isAlias: boolean): number {
  if (!term) return 0;
  if (term === q) return isAlias ? 90 : 100;
  if (term.startsWith(q)) return isAlias ? 75 : 85;
  if (term.split(' ').some((w) => w.startsWith(q))) return isAlias ? 62 : 70;
  if (q.length >= 3 && term.includes(q)) return 45;
  if (q.length >= 4 && subsequence(q.replace(/ /g, ''), term.replace(/ /g, ''))) return 18;
  return 0;
}

function subsequence(q: string, s: string): boolean {
  let i = 0;
  for (let j = 0; j < s.length && i < q.length; j++) if (s[j] === q[i]) i++;
  return i === q.length;
}

const KIND_BOOST: Partial<Record<SearchKind, number>> = { zone: 6, university: 5, area: 4, territory: 3, crew: 2 };

export function search(index: Entry[], query: string, limit = 8): SearchResult[] {
  const q = normalise(query);
  if (!q) return [];
  const out: SearchResult[] = [];
  for (const e of index) {
    let best = 0;
    e.terms.forEach((t, i) => (best = Math.max(best, scoreTerm(q, t, i > 0))));
    if (best > 0) {
      const { terms: _terms, ...rest } = e;
      out.push({ ...rest, score: best + (KIND_BOOST[e.kind] ?? 0) });
    }
  }
  // Same title from a territory and a place (e.g. "Eco Park"): keep the territory — it's playable.
  const seen = new Set<string>();
  return out
    .sort((a, b) => b.score - a.score || a.title.length - b.title.length)
    .filter((r) => {
      const k = normalise(r.title);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}
