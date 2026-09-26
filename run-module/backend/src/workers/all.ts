/**
 * src/workers/all.ts
 *
 * Every background worker and scheduled job, in one place. Started by src/workers/start.ts (its own
 * process, the normal setup) or, with RUN_WORKERS_IN_API=1, by the API process itself, for hosts
 * without background workers (e.g. Render's free plan).
 */

import type { Worker } from 'bullmq';
import { startFinalizeRunWorker } from './finalize_run/queue.js';
import { startLeaderboardSyncWorker, scheduleSnapshotJob } from './leaderboard_sync/queue.js';
import { startDecayWorker, scheduleDecayJob } from './decay/queue.js';
import { startNotificationWorker } from '../notifications/emitter.js';

export async function startAllWorkers(): Promise<Worker[]> {
  const workers = [
    startFinalizeRunWorker(),
    startLeaderboardSyncWorker(),
    startDecayWorker(),
    startNotificationWorker(),
  ];

  await scheduleSnapshotJob();
  console.log('Scheduled hourly snapshot job.');

  await scheduleDecayJob();
  console.log('Scheduled nightly decay job.');

  return workers;
}
