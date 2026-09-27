import { cityById } from '@/data/cities';

/**
 * Territory — the Run Module's core mechanic (capture from closed runs, conflict with
 * rival crews, 14-day decay, leaderboard by area). Demo data here mirrors that model;
 * when the API is live this should come from the backend's territory endpoints.
 * Districts are generated from the active city's areas, so nothing is tied to one city.
 */
export type TerritoryStatus = 'yours' | 'rival' | 'contested' | 'neutral';

export type District = {
  id: string;
  name: string;
  status: TerritoryStatus;
  /** Your crew's share of the district, 0..1. */
  control: number;
  areaKm2: number;
  xpToClaim: number;
  defenders: number;
  rivalCrew?: string;
  /** Days until unrefreshed ground decays (backend decays after 14 days). */
  decayDays: number;
  /** Polygon in map units (400 × 600), plus a label anchor. */
  poly: [number, number][];
  label: [number, number];
};

const SLOTS: { poly: [number, number][]; label: [number, number] }[] = [
  { poly: [[150, 250], [250, 230], [290, 300], [250, 370], [160, 380], [120, 310]], label: [205, 305] },
  { poly: [[30, 90], [140, 70], [165, 160], [120, 230], [40, 210]], label: [95, 150] },
  { poly: [[270, 90], [370, 110], [380, 220], [300, 240], [260, 170]], label: [320, 165] },
  { poly: [[40, 400], [140, 390], [160, 490], [70, 540], [25, 470]], label: [92, 462] },
  { poly: [[280, 400], [370, 380], [385, 500], [300, 540], [255, 470]], label: [330, 420] },
  { poly: [[170, 60], [250, 50], [260, 150], [180, 170]], label: [215, 110] },
  { poly: [[180, 420], [260, 410], [270, 520], [190, 540]], label: [215, 470] },
];

const PLAN: { status: TerritoryStatus; control: number; rival?: string }[] = [
  { status: 'yours', control: 0.82 },
  { status: 'rival', control: 0.18, rival: 'Night Owls' },
  { status: 'contested', control: 0.48, rival: 'Sunrise Syndicate' },
  { status: 'yours', control: 0.64 },
  { status: 'rival', control: 0.3, rival: 'Iron Mile Club' },
  { status: 'neutral', control: 0 },
  { status: 'contested', control: 0.52, rival: 'Night Owls' },
];

export function districtsForCity(cityId: string): District[] {
  const city = cityById(cityId);
  return city.areas.slice(0, SLOTS.length).map((name, i) => {
    const p = PLAN[i];
    return {
      id: `${city.id}-d${i}`,
      name,
      status: p.status,
      control: p.control,
      areaKm2: +(1.2 + ((i * 37) % 23) / 10).toFixed(1),
      xpToClaim: Math.round((1 - p.control) * 3000 + 400),
      defenders: 6 + ((i * 11) % 19),
      rivalCrew: p.rival,
      decayDays: 3 + ((i * 5) % 12),
      poly: SLOTS[i].poly,
      label: SLOTS[i].label,
    };
  });
}

export const statusColor: Record<TerritoryStatus, string> = {
  yours: '#2F5BFF',
  rival: '#FF4D8D',
  contested: '#FFB020',
  neutral: '#A0A8BA',
};

export const statusLabel: Record<TerritoryStatus, string> = {
  yours: 'Your crew',
  rival: 'Rival crew',
  contested: 'Contested',
  neutral: 'Unclaimed',
};

/** Territory-area leaderboard (backend ranks by area: daily / weekly / all-time). */
export const territoryBoard = {
  daily: [
    { name: 'Rhea K.', userId: 'u_rhea', km2: 0.9 },
    { name: 'Zoya F.', userId: 'u_zoya', km2: 0.7 },
    { name: 'You', userId: 'u_aanya', km2: 0.6, me: true },
    { name: 'Dev P.', userId: 'u_dev', km2: 0.4 },
    { name: 'Kabir R.', userId: 'u_kabir', km2: 0.3 },
  ],
  weekly: [
    { name: 'Meera J.', userId: 'u_meera', km2: 4.8 },
    { name: 'Rhea K.', userId: 'u_rhea', km2: 4.1 },
    { name: 'Zoya F.', userId: 'u_zoya', km2: 3.6 },
    { name: 'You', userId: 'u_aanya', km2: 2.9, me: true },
    { name: 'Aarav M.', userId: 'u_aarav', km2: 2.2 },
  ],
  all_time: [
    { name: 'Meera J.', userId: 'u_meera', km2: 38.2 },
    { name: 'Rhea K.', userId: 'u_rhea', km2: 31.5 },
    { name: 'Zoya F.', userId: 'u_zoya', km2: 27.9 },
    { name: 'Aarav M.', userId: 'u_aarav', km2: 21.3 },
    { name: 'You', userId: 'u_aanya', km2: 14.6, me: true },
  ],
};
