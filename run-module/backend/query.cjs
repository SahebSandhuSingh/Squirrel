const { Pool } = require('pg');
async function run() {
  const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5434/run_module' });
  const res = await pool.query(`SELECT * FROM run_rejections WHERE reason = 'anticheat_rejected'`);
  console.log(res.rows);
  process.exit();
}
run();
