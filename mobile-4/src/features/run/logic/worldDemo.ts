/**
 * The labelled demo route for the Territory Network run view: a loop through College Street's
 * micro territories (Coffee House → Hindu & Hare → Boi Para North → Presidency → Medical College
 * → Boi Para South → College Square). Used only where GPS can't exist (the web preview); the run
 * screen marks it "Demo route · simulated" and never uploads it.
 */
const LOOP: [number, number][] = [
  [22.5766, 88.3641], [22.5778, 88.3647], [22.5786, 88.3640], [22.5795, 88.3634], [22.5790, 88.3622],
  [22.5770, 88.3620], [22.5752, 88.3612], [22.5733, 88.3606], [22.5722, 88.3622], [22.5720, 88.3636],
  [22.5735, 88.3648], [22.5752, 88.3654], [22.5760, 88.3646], [22.5766, 88.3641],
];

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
const dist = (a: [number, number], b: [number, number]) => {
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const SEGS = LOOP.slice(1).map((p, i) => dist(LOOP[i], p));
export const WORLD_DEMO_LOOP_M = SEGS.reduce((s, d) => s + d, 0);

/** [lat, lng] after `meters` along the loop (wraps). */
export function worldDemoPosition(meters: number): [number, number] {
  let m = ((meters % WORLD_DEMO_LOOP_M) + WORLD_DEMO_LOOP_M) % WORLD_DEMO_LOOP_M;
  for (let i = 0; i < SEGS.length; i++) {
    if (m <= SEGS[i]) {
      const t = SEGS[i] ? m / SEGS[i] : 0;
      return [LOOP[i][0] + (LOOP[i + 1][0] - LOOP[i][0]) * t, LOOP[i][1] + (LOOP[i + 1][1] - LOOP[i][1]) * t];
    }
    m -= SEGS[i];
  }
  return LOOP[0];
}
