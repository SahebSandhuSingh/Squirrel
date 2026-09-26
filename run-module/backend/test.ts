
import { generateConstantSpeedTrack } from './src/anticheat/__fixtures__/motion-tracks.js';
import { processTrack } from './src/geometry/pipeline.js';
async function test() {
  const pts = generateConstantSpeedTrack(101);
  const res = await processTrack(pts);
  console.log('processTrack result:', res.areaM2);
}
test();
