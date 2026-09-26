import { startFinalizeRunWorker } from './finalize_run/queue.js';
import { startLeaderboardSyncWorker, scheduleSnapshotJob } from './leaderboard_sync/queue.js';
import { startDecayWorker, scheduleDecayJob } from './decay/queue.js';
import { startNotificationWorker } from '../notifications/emitter.js';
import { pool } from '../db/pool.js';
import { redis } from '../redis/client.js';

async function main() {
  console.log('Starting background workers...');
  
  const workers = [
    startFinalizeRunWorker(),
    startLeaderboardSyncWorker(),
    startDecayWorker(),
    startNotificationWorker()
  ];
  
  await scheduleSnapshotJob();
  console.log('Scheduled hourly snapshot job.');
  
  await scheduleDecayJob();
  console.log('Scheduled nightly decay job.');

  process.on('SIGINT', async () => {
    console.log('\nShutting down workers...');
    await Promise.all(workers.map(w => w.close()));
    await pool.end();
    redis.quit();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Failed to start workers:', err);
  process.exit(1);
});