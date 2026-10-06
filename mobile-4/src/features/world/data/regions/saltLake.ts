/**
 * SALT LAKE (Bidhannagar) — the planned city of blocks and sectors. Its four playable sectors are
 * authored outlines (not grown cells), because the sectors ARE the strategic map here: Sector V
 * is the IT hub, the others are residential blocks around Central Park and the stadium.
 *
 * Sector outlines are approximate (± ~150 m) and share corners with Kolkata and New Town. Correct
 * a sector by moving its corners here; every territory inside it is re-grown automatically.
 */
import type { LatLng, RegionSpec } from '../../types.ts';

/** Shared corners (named so neighbouring regions can reuse them exactly). */
export const SALT_LAKE_CORNERS = {
  /** North-west, by Ultadanga / Bidhannagar Road. */
  A: [22.5985, 88.3945] as LatLng,
  /** North, along the Kestopur canal. */
  B: [22.6005, 88.4120] as LatLng,
  /** North-east. */
  C: [22.5960, 88.4265] as LatLng,
  D: [22.5870, 88.4285] as LatLng,
  /** Sector V's north-east edge, facing New Town. */
  E: [22.5805, 88.4445] as LatLng,
  /** Sector V's south-east edge. */
  F: [22.5655, 88.4420] as LatLng,
  /** South, by Nicco Park. */
  G: [22.5650, 88.4185] as LatLng,
  /** South-west, by the stadium and the Bypass. */
  H: [22.5640, 88.4020] as LatLng,
  /** West, on the Bypass. */
  I: [22.5790, 88.3970] as LatLng,
  /** Centre (City Centre side). */
  J: [22.5870, 88.4110] as LatLng,
  K: [22.5800, 88.4140] as LatLng,
  L: [22.5800, 88.4235] as LatLng,
};
const { A, B, C, D, E, F, G, H, I, J, K, L } = SALT_LAKE_CORNERS;

export const SALT_LAKE: RegionSpec = {
  id: 'salt-lake',
  name: 'Salt Lake',
  district: 'SALT LAKE',
  accuracy: 'approximate',
  outline: [A, B, C, D, E, F, G, H, I],
  zones: [
    {
      id: 'sl-sector-1',
      name: 'Sector I',
      at: [22.5915, 88.4040],
      outline: [A, B, J, I],
      tags: ['market', 'student'],
      blurb: 'City Centre, BD Market and the oldest blocks of Bidhannagar.',
      children: [
        { id: 'sl1-city-centre', name: 'City Centre', at: [22.5882, 88.4085], tags: ['hotspot', 'market'], blurb: 'City Centre Salt Lake — the courtyard every crew meets in.' },
        { id: 'sl1-bd-market', name: 'BD Market', at: [22.5925, 88.4030], tags: ['market'], blurb: 'Rolls, phuchka and post-run refuelling.' },
        { id: 'sl1-ae-block', name: 'AE Block', at: [22.5955, 88.4005], tags: ['park'], blurb: 'Quiet block parks on the north-west edge.' },
      ],
    },
    {
      id: 'sl-sector-2',
      name: 'Sector II',
      at: [22.5880, 88.4195],
      outline: [B, C, D, L, K, J],
      tags: ['park', 'hotspot'],
      blurb: 'Central Park and Karunamoyee — the sector everyone runs through.',
      children: [
        { id: 'sl2-central-park', name: 'Central Park', at: [22.5832, 88.4170], tags: ['park', 'water', 'hotspot'], blurb: 'Salt Lake Central Park — the lake loop and the city’s best morning track.' },
        { id: 'sl2-karunamoyee', name: 'Karunamoyee', at: [22.5850, 88.4225], tags: ['transit', 'hotspot'], blurb: 'The crossing and bus terminus. Everyone passes through.' },
        { id: 'sl2-ck-market', name: 'CK Market', at: [22.5920, 88.4170], tags: ['market'], blurb: 'Block markets and evening adda.' },
        { id: 'sl2-dl-block', name: 'DL Block', at: [22.5940, 88.4235], tags: ['park'], blurb: 'The sector’s north-east corner by the canal.' },
      ],
    },
    {
      id: 'sl-sector-3',
      name: 'Sector III',
      at: [22.5720, 88.4100],
      outline: [I, J, K, L, G, H],
      tags: ['sports', 'student'],
      blurb: 'The stadium sector — FD Park, IA Market and match-day crowds.',
      children: [
        { id: 'sl3-stadium', name: 'Salt Lake Stadium', at: [22.5690, 88.4090], tags: ['sports', 'hotspot'], blurb: 'Yuva Bharati Krirangan. Eighty thousand voices on derby day.' },
        { id: 'sl3-fd-park', name: 'FD Park', at: [22.5770, 88.4040], tags: ['park'], blurb: 'Block parks and the sector’s quiet loops.' },
        { id: 'sl3-ia-market', name: 'IA Market', at: [22.5745, 88.4150], tags: ['market'], blurb: 'Morning bazaar, evening crews.' },
      ],
    },
    {
      id: 'sl-sector-5',
      name: 'Sector V',
      at: [22.5745, 88.4330],
      outline: [D, E, F, G, L],
      tags: ['tech', 'student', 'hotspot'],
      blurb: 'The IT hub. Tech parks by day, food streets and run clubs by night.',
      children: [
        { id: 'sl5-college-more', name: 'College More', at: [22.5745, 88.4330], tags: ['tech', 'student', 'hotspot'], blurb: 'The crossing at the centre of Sector V — campuses and offices.' },
        { id: 'sl5-wipro-more', name: 'Wipro More', at: [22.5795, 88.4375], tags: ['tech'], blurb: 'Sector V’s north-east crossing.' },
        { id: 'sl5-technopolis', name: 'Technopolis', at: [22.5765, 88.4285], tags: ['tech'], blurb: 'Glass towers and the after-work run crowd.' },
        { id: 'sl5-webel-more', name: 'Webel More', at: [22.5690, 88.4335], tags: ['tech', 'market'], blurb: 'Street-food lanes that feed the whole sector.' },
        { id: 'sl5-nicco-park', name: 'Nicco Park', at: [22.5712, 88.4215], tags: ['park', 'water'], blurb: 'Nicco Park and the Jheel Meel water bodies.' },
      ],
    },
  ],
};
