import crypto from 'crypto';
import { pool } from './src/db/pool.js';
import { captureTerritory } from './src/workers/finalize_run/capture.js';
import { finalizeRun } from './src/workers/finalize_run/finalize.js';
import { generateRealisticPaceTrack, generateConstantSpeedTrack, generateTeleportTrack } from './src/anticheat/__fixtures__/motion-tracks.js';

async function seedSquare(user, lat, lng, radius) {
    const runId = crypto.randomUUID();
    await pool.query("INSERT INTO runs (id, user_id, status, started_at) VALUES ($1, $2, 'active', now())", [runId, user]);
    const dLat = radius;
    const dLng = radius;
    const pts = [
      { lat: lat - dLat, lng: lng - dLng },
      { lat: lat - dLat, lng: lng + dLng },
      { lat: lat + dLat, lng: lng + dLng },
      { lat: lat + dLat, lng: lng - dLng },
      { lat: lat - dLat, lng: lng - dLng },
    ];
    let time = Date.now() - 100000;
    for (let i = 0; i < pts.length; i++) {
      await pool.query(
        "INSERT INTO run_points (run_id, seq, lat, lng, accuracy_m, recorded_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [runId, i, pts[i].lat, pts[i].lng, 5, new Date(time)]
      );
      time += 5000;
    }
    return runId;
}

async function run() {
  await pool.query("DELETE FROM run_points");
  await pool.query("DELETE FROM run_signatures");
  await pool.query("DELETE FROM activity_sessions");
  await pool.query("DELETE FROM run_scores");
  await pool.query("DELETE FROM run_rejections");
  await pool.query("DELETE FROM idempotency_keys");
  await pool.query("DELETE FROM territories CASCADE");
  await pool.query("DELETE FROM run_batches");
  await pool.query("DELETE FROM run_point_flags");
  await pool.query("DELETE FROM runs CASCADE");
  
  console.log("--- AC2: Partial Overlap ---");
  const user1 = crypto.randomUUID();
  const run1 = await seedSquare(user1, 0, 0, 0.001); // ~48k m2
  const r1 = await finalizeRun(run1);
  
  const user2 = crypto.randomUUID();
  const run2 = await seedSquare(user2, 0, 0.0005, 0.001);
  // manual capture to inspect carved array easily
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const geomB = `POLYGON((-0.0005 -0.001, 0.0015 -0.001, 0.0015 0.001, -0.0005 0.001, -0.0005 -0.001))`;
    const res = await captureTerritory({
      client, runId: run2, ownerId: user2, geomWkt4326: geomB, areaM2: 48000
    });
    console.log("Carved Array:", res.carved);
    await client.query("COMMIT");
  } finally { client.release(); }
  
  console.log("\n--- AC3: Fully Consumed ---");
  const run3 = await seedSquare(user2, 0, 0, 0.002); // huge square over original
  const client2 = await pool.connect();
  try {
    await client2.query("BEGIN");
    const geomC = `POLYGON((-0.002 -0.002, 0.002 -0.002, 0.002 0.002, -0.002 0.002, -0.002 -0.002))`;
    const res3 = await captureTerritory({
      client: client2, runId: run3, ownerId: user2, geomWkt4326: geomC, areaM2: 190000
    });
    console.log("Carved Array:", res3.carved);
    const expiredRows = await client2.query("SELECT id, state FROM territories WHERE state = 'expired'");
    console.log("Expired Rows:", expiredRows.rows);
    await client2.query("COMMIT");
  } finally { client2.release(); }
  
  console.log("\n--- AC4: Three Owners Carved ---");
  await pool.query("DELETE FROM territories CASCADE");
  const uA = crypto.randomUUID();
  const uB = crypto.randomUUID();
  const uC = crypto.randomUUID();
  const uD = crypto.randomUUID();
  const rA = await finalizeRun(await seedSquare(uA, -0.001, -0.001, 0.0005));
  const rB = await finalizeRun(await seedSquare(uB, -0.001,  0.001, 0.0005));
  const rC = await finalizeRun(await seedSquare(uC,  0.001, -0.001, 0.0005));
  
  const client4 = await pool.connect();
  try {
    await client4.query("BEGIN");
    const runD = await seedSquare(uD, 0, 0, 0.002);
    const geomD = `POLYGON((-0.002 -0.002, 0.002 -0.002, 0.002 0.002, -0.002 0.002, -0.002 -0.002))`;
    const res4 = await captureTerritory({
      client: client4, runId: runD, ownerId: uD, geomWkt4326: geomD, areaM2: 190000
    });
    console.log("Carved Array (3 owners):", res4.carved);
    const act = await client4.query("SELECT SUM(area_m2) as s FROM territories WHERE state = 'active'");
    console.log("Total active area after carving 3 owners:", act.rows[0].s);
    await client4.query("COMMIT");
  } finally { client4.release(); }

  console.log("\n--- AC5: No Overlap ---");
  const client5 = await pool.connect();
  try {
    await client5.query("BEGIN");
    const runE = await seedSquare(uA, 0.1005, 0.1005, 0.0005);
    const geomE = `POLYGON((0.1 0.1, 0.101 0.1, 0.101 0.101, 0.1 0.101, 0.1 0.1))`;
    const res5 = await captureTerritory({
      client: client5, runId: runE, ownerId: uA, geomWkt4326: geomE, areaM2: 5000
    });
    console.log("Carved Array (empty):", res5.carved);
    await client5.query("COMMIT");
  } finally { client5.release(); }
  
  console.log("\n--- AC6: Self-overlap ---");
  const client6 = await pool.connect();
  try {
    await client6.query("BEGIN");
    const areaBefore = await pool.query("SELECT sum(area_m2) as s FROM territories WHERE owner_id = $1 AND state = 'active'", [uA]);
    console.log("Area Before:", areaBefore.rows[0].s);
    const runF = await seedSquare(uA, 0.101, 0.101, 0.0005);
    const geomF = `POLYGON((0.1005 0.1005, 0.1015 0.1005, 0.1015 0.1015, 0.1005 0.1015, 0.1005 0.1005))`;
    const res6 = await captureTerritory({
      client: client6, runId: runF, ownerId: uA, geomWkt4326: geomF, areaM2: 5000
    });
    await client6.query("COMMIT");
    const areaAfter = await pool.query("SELECT sum(area_m2) as s FROM territories WHERE owner_id = $1 AND state = 'active'", [uA]);
    console.log("Area After:", areaAfter.rows[0].s);
  } finally { client6.release(); }
  
  console.log("\n--- AC9: Reject band never reaches captureTerritory ---");
  const uRej = crypto.randomUUID();
  const rRej = crypto.randomUUID();
  await pool.query("INSERT INTO runs (id, user_id, status, started_at) VALUES ($1, $2, 'active', now())", [rRej, uRej]);
  const constPts = generateTeleportTrack();
  let timeR = Date.now() - 100000;
  for (let i = 0; i < constPts.length; i++) {
    await pool.query(
      "INSERT INTO run_points (run_id, seq, lat, lng, accuracy_m, recorded_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [rRej, i, constPts[i].lat, constPts[i].lng, 1.5, new Date(timeR)]
    );
    timeR += 1000;
  }
  const resultRej = await finalizeRun(rRej);
  console.log("FinalizeResult:", resultRej);
  const tCount = await pool.query("SELECT count(*) as c FROM territories WHERE run_id = $1", [rRej]);
  console.log("Territories created:", tCount.rows[0].c);

  console.log("\n--- AC10: Capture events count ---");
  const ev = await pool.query("SELECT count(*) as c FROM capture_events");
  console.log("capture_events count:", ev.rows[0].c);
  
  process.exit(0);
}
run();
