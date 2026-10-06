/**
 * NEW TOWN (Rajarhat) — the planned city east of Salt Lake: wide arterials, Eco Park's lake and
 * the newest campuses. Its three Action Areas are the strategic regions; each is split into
 * territories around real anchors. Action Area lines and most anchors are approximate.
 */
import type { LatLng, RegionSpec } from '../../types.ts';
import { SALT_LAKE_CORNERS } from './saltLake.ts';

const { C, D, E, F } = SALT_LAKE_CORNERS;
const P: LatLng = [22.6050, 88.4300];
const Q: LatLng = [22.6230, 88.4440];
const R: LatLng = [22.6320, 88.4700];
const S: LatLng = [22.6230, 88.5000];
const T: LatLng = [22.5950, 88.5070];
const U: LatLng = [22.5700, 88.4980];
const V: LatLng = [22.5580, 88.4700];
// Action Area dividers
const X2: LatLng = [22.5820, 88.4700];
const X3: LatLng = [22.5830, 88.5027];
const Y2: LatLng = [22.6040, 88.4700];
const Y3: LatLng = [22.6040, 88.5048];

export const NEW_TOWN: RegionSpec = {
  id: 'new-town',
  name: 'New Town',
  district: 'NEW TOWN',
  accuracy: 'approximate',
  outline: [F, E, D, C, P, Q, R, S, T, U, V],
  zones: [
    {
      id: 'nt-action-area-1',
      name: 'Action Area I',
      at: [22.5730, 88.4700],
      outline: [F, E, X2, X3, U, V],
      tags: ['tech'],
      blurb: 'The southern blocks: hospitals, IT parks and the first towers of New Town.',
      children: [
        { id: 'nt1-narkelbagan', name: 'Narkelbagan', at: [22.5760, 88.4555], tags: ['market'], blurb: 'Where Sector V’s commuters spill into New Town.' },
        { id: 'nt1-tata-medical', name: 'Tata Medical Center', at: [22.5765, 88.4790], tags: ['campus'], blurb: 'The cancer hospital and its research campus.' },
        { id: 'nt1-central', name: 'AA-I Central', at: [22.5690, 88.4680], tags: ['tech'], blurb: 'Office blocks and the long straight roads runners love.' },
      ],
    },
    {
      id: 'nt-action-area-2',
      name: 'Action Area II',
      at: [22.5930, 88.4750],
      outline: [E, D, C, P, Y2, Y3, T, X3, X2],
      tags: ['park', 'hotspot'],
      blurb: 'Eco Park, the Biswa Bangla Gate and the convention centre — New Town’s showpiece.',
      children: [
        { id: 'nt2-eco-park', name: 'Eco Park', at: [22.6010, 88.4680], tags: ['park', 'water', 'hotspot'], blurb: 'Prakriti Tirtha — 480 acres of lake, trails and cycle paths.' },
        { id: 'nt2-biswa-bangla', name: 'Biswa Bangla Gate', at: [22.5868, 88.4703], tags: ['hotspot'], blurb: 'The ring above the road — sunset crews meet here.' },
        { id: 'nt2-aliah', name: 'Aliah University', at: [22.5835, 88.4815], tags: ['campus', 'student'], blurb: 'Aliah University’s New Town campus.' },
        { id: 'nt2-akankha', name: 'Akankha More', at: [22.5920, 88.4900], tags: ['market'], blurb: 'Food stalls and the eastern arterial.' },
        { id: 'nt2-kestopur', name: 'Kestopur', at: [22.5970, 88.4360], tags: ['water'], blurb: 'The canal edge between Salt Lake and New Town.' },
      ],
    },
    {
      id: 'nt-action-area-3',
      name: 'Action Area III',
      at: [22.6150, 88.4750],
      outline: [P, Q, R, S, Y3, Y2],
      tags: ['campus', 'student'],
      blurb: 'The northern frontier — new campuses and City Centre 2.',
      children: [
        { id: 'nt3-city-centre-2', name: 'City Centre 2', at: [22.6215, 88.4505], tags: ['hotspot', 'market'], blurb: 'The mall at the top of the arterial.' },
        { id: 'nt3-sapoorji', name: 'Sapoorji', at: [22.6080, 88.4820], tags: ['student'], blurb: 'Housing towers full of students and young crews.' },
        { id: 'nt3-st-xaviers', name: 'St. Xavier’s University', at: [22.6140, 88.4960], tags: ['campus', 'student'], blurb: 'St. Xavier’s University, Kolkata — the New Town campus.' },
      ],
    },
  ],
};
