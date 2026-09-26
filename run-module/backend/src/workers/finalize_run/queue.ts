import { Queue, Worker } from 'bullmq';
import { redis } from '../../redis/client.js';
import { finalizeRun } from './finalize.js';
import { pool } from '../../db/pool.js';

export const finalizeRunQueue = new Queue('finalize_run', {
  connection: redis,
});

export const enqueueFinalizeRun = async (runId: string) => {
  // Use runId as jobId to prevent duplicate jobs for the same run
  await finalizeRunQueue.add('finalize', { runId }, { jobId: runId });
};

// Only start the worker if this file is run directly
export function startFinalizeRunWorker() {
  console.log('Starting finalizeRun worker...');
  
  const worker = new Worker(
    'finalize_run',
    async (job) => {
      try {
        const result = await finalizeRun(job.data.runId);
        if (!result.ok) {
          console.log(`run ${job.data.runId} outcome: rejected with reason ${result.reason}`);
        } else {
          const res = await pool.query('SELECT status FROM runs WHERE id = $1', [job.data.runId]);
          console.log(`run ${job.data.runId} outcome: ${res.rows[0]?.status}`);
        }
      } catch (err) {
        console.error(`finalizeRun failed for run ${job.data.runId}:`, err);
        throw err;
      }
    },
    { connection: redis }
  );

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
  });

  return worker;
}
