/** Standalone verification worker process (npm run start:worker). */
import pino from 'pino';
import { closePool } from './db/pool.js';
import { startRealtimeFanout } from './realtime/bus.js';
import { startWorker } from './verification/worker.js';
import { config } from './config.js';

const log = pino({ level: config.logLevel });
const abort = new AbortController();
process.on('SIGINT', () => abort.abort());
process.on('SIGTERM', () => abort.abort());
await startRealtimeFanout(log);
await startWorker(log, abort.signal);
await closePool();
