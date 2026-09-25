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

// One key per run, so a single oversized or corrupt entry can't take the others with it
// (and a failed read never turns into "overwrite the list with just this run").
const PREFIX = 'squirrel.runs.pending.';
/** Pre-per-key format: every run in one JSON array. Migrated on first read. */
const LEGACY_KEY = 'squirrel.runs.pending';

export type PendingRun = {
  /** Same as progress.clientRunId; stable identity for the list. */
  id: string;
  /** Account (token `sub`) that recorded the run; only that account may upload it. */
  owner?: string | null;
  startedAt: number;
  /** Elapsed running time (ms) as measured on the device. */
  elapsedMs: number;
  fixes: Fix[];
  progress: SubmitProgress;
  /** Last error message shown to the user, if any. */
  lastError?: string;
  attempts: number;
};

async function migrateLegacy() {
  const raw = await AsyncStorage.getItem(LEGACY_KEY);
  if (raw == null) return;
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    list = [];
  }
  if (Array.isArray(list)) {
    for (const r of list as PendingRun[]) if (r?.id) await AsyncStorage.setItem(PREFIX + r.id, JSON.stringify(r));
  }
  await AsyncStorage.removeItem(LEGACY_KEY);
}

async function readAll(): Promise<PendingRun[]> {
  await migrateLegacy().catch(() => {});
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
  const out: PendingRun[] = [];
  for (const k of keys) {
    try {
      const raw = await AsyncStorage.getItem(k);
      const r = raw ? (JSON.parse(raw) as PendingRun) : null;
      if (r?.id) out.push(r);
    } catch {
      // unreadable entry: skip it, but leave it on disk
    }
  }
  return out.sort((a, b) => a.startedAt - b.startedAt);
}

/**
 * Saved runs the given account may upload, oldest first. Runs saved before owners were
 * recorded have no owner and are offered to whoever is signed in.
 */
export async function listPendingRuns(owner: string | null): Promise<PendingRun[]> {
  try {
    return (await readAll()).filter((r) => r.owner === undefined || r.owner === owner);
  } catch {
    return [];
  }
}

export async function savePendingRun(run: PendingRun) {
  await AsyncStorage.setItem(PREFIX + run.id, JSON.stringify(run));
}

export async function removePendingRun(id: string) {
  await AsyncStorage.removeItem(PREFIX + id);
}

export async function clearPendingRuns() {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX) || k === LEGACY_KEY);
    await AsyncStorage.multiRemove(keys);
  } catch {
    // nothing to clear
  }
}
