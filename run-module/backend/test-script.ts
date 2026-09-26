import { generateRealisticPaceTrack } from './src/anticheat/__fixtures__/motion-tracks.js';
import { processTrack } from './src/geometry/pipeline.js';
async function test() {
  const pts = generateRealisticPaceTrack();
  console.log('length:', pts.length, 'first:', pts[0].lat, pts[0].lng, 'last:', pts[pts.length - 1].lat, pts[pts.length - 1].lng);
  const res = await processTrack(pts);
  console.log(res);
}
test();
