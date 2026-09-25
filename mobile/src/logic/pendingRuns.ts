/**
 * Runs that finished but haven't (fully) reached the server yet.
 *
 * A run is saved here the moment the user finishes it, before the upload starts, and
 * removed once the server reaches a terminal status. If the upload fails halfway, the
 * saved `progress` records how far it got (run created? how many points accepted?
 * finished?) so a retry — from the summary screen or the Home banner — resumes at that
 * step and never creates a second run on the server.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SubmitProgress } from '@/api/endpoints';
import type { Fix } from '@/logic/track';

const KEY = 'squirrel.runs.pending';

export type PendingRun = {
  /** Same as progress.clientRunId; stable identity for the list. */
  id: string;
  startedAt: number;
  /** Elapsed running time (ms) as measured on the device. */
  elapsedMs: number;
  fixes: Fix[];
  progress: SubmitProgress;
  /** Last error message shown to the user, if any. */
  lastError?: string;
  attempts: number;
};

async function readAll(): Promise<PendingRun[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as PendingRun[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeAll(list: PendingRun[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

export const listPendingRuns = readAll;

export async function savePendingRun(run: PendingRun) {
  const list = await readAll();
  const i = list.findIndex((r) => r.id === run.id);
  if (i >= 0) list[i] = run;
  else list.push(run);
  await writeAll(list);
}

export async function removePendingRun(id: string) {
  const list = await readAll();
  await writeAll(list.filter((r) => r.id !== id));
}

export async function clearPendingRuns() {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}
