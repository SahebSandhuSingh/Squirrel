const fs = require('fs');
let code = fs.readFileSync('src/workers/finalize_run/finalize.ts', 'utf8');

const computeCode = `
    let trackDistanceM = 0;
    let autoPauseTimeS = 0;
    let currentPauseDuration = 0;
    
    for (let i = 1; i < pointsRes.rows.length; i++) {
      const p1 = pointsRes.rows[i-1];
      const p2 = pointsRes.rows[i];
      const dt = (p2.recorded_at.getTime() - p1.recorded_at.getTime()) / 1000;
      
      const dLat = (p2.lat - p1.lat) * Math.PI / 180;
      const dLng = (p2.lng - p1.lng) * Math.PI / 180;
      const latMid = (p1.lat + p2.lat) / 2 * Math.PI / 180;
      const dx = dLng * Math.cos(latMid);
      const dy = dLat;
      const dist = 6371000 * Math.sqrt(dx * dx + dy * dy);
      trackDistanceM += dist;
      
      if (dt > 0) {
        const speed = dist / dt;
        if (speed < 0.5) {
          currentPauseDuration += dt;
        } else {
          if (currentPauseDuration > 10) {
            autoPauseTimeS += currentPauseDuration;
          }
          currentPauseDuration = 0;
        }
      }
    }
    if (currentPauseDuration > 10) {
      autoPauseTimeS += currentPauseDuration;
    }
    
    const movingTimeS = Math.max(0, durationS - Math.floor(autoPauseTimeS));
    let meanSpeedMs: number | null = null;
    if (durationS > 0) {
      meanSpeedMs = trackDistanceM / durationS;
    }
    
    await client.query(
      'UPDATE runs SET distance_m = $1, moving_time_s = $2, elapsed_time_s = $3 WHERE id = $4',
      [trackDistanceM, movingTimeS, durationS, runId]
    );
`;

const startDist = code.indexOf('let trackDistanceM = 0;');
const endDist = code.indexOf('const hashStr', startDist);

code = code.substring(0, startDist) + computeCode + '\n    ' + code.substring(endDist);

// I also need to update the activity session metrics and run object usage!
// Currently it uses run.distance_m etc. Let's update `rejectRun` to use trackDistanceM and movingTimeS.
code = code.replace(/distance_m: run\.distance_m,/g, 'distance_m: trackDistanceM,');
code = code.replace(/moving_time_s: run\.elapsed_time_s, \/\/ reusing as moving_time proxy if absent/g, 'moving_time_s: movingTimeS,');
code = code.replace(/elapsed_time_s: run\.elapsed_time_s,/g, 'elapsed_time_s: durationS,');
// In the success case:
code = code.replace(/moving_time_s: run\.elapsed_time_s,/g, 'moving_time_s: movingTimeS,');


fs.writeFileSync('src/workers/finalize_run/finalize.ts', code);
console.log('updated distance logic');
