import { pool } from './src/db/pool.js';

async function run() {
  const res = await pool.query("SELECT id, type, metric, title FROM challenges");
  console.log('All challenges:', res.rows);
  
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
