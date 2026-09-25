/**
 * Run tracker — one module-level session that owns GPS, the elapsed clock and the
 * filtered track, independent of any screen.
 *
 * Why a singleton and not component state:
 *  - Background location is delivered to a TaskManager task, which runs outside React.
 *    The task feeds this module; the run screen just subscribes for UI updates.
 *  - The elapsed clock is derived from wall-clock timestamps (Date.now()), so it stays
 *    right after the JS timer is throttled or paused in the background.
 *  - A snapshot is persisted every few fixes, so a killed app can resume the run
 *    (`restore()` → run screen with `?resume=1`) instead of losing it.
 *
 * GPS strategy: request foreground permission; if background permission is available and
 * granted, start `startLocationUpdatesAsync` (keeps tracking with the screen off — needs
 * the app.json plugin config and, on a store build, the location background mode).
 * Otherwise fall back to `watchPositionAsync`, which only runs while the app is in the
 * foreground. `source` tells the UI which one is active so it can say so.
 */
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addFix, emptyTrack, type Fix, type TrackState } from '@/logic/track';

export const RUN_LOCATION_TASK = 'squirrel-run-location';
const SNAPSHOT_KEY = 'squirrel.run.active';
const SNAPSHOT_EVERY = 10; // fixes

export type GpsSource = 'pending' | 'background' | 'foreground' | 'demo';
export type TrackerStatus = 'idle' | 'running' | 'paused';

export type TrackerState = {
  status: TrackerStatus;
  source: GpsSource;
  startedAt: number;
  /** Milliseconds of running time completed before the current segment. */
  elapsedBase: number;
  /** Wall-clock start of the current running segment, or null while paused/idle. */
  runningSince: number | null;
  track: TrackState;
  /** Last reported horizontal accuracy in metres (any fix, running or not). */
  accuracy: number | null;
  /** True if this session was restored from a snapshot after the app was killed. */
  restored: boolean;
};

type Snapshot = Pick<TrackerState, 'startedAt' | 'elapsedBase' | 'track' | 'source'>;

const initial = (): TrackerState => ({
  status: 'idle',
  source: 'pending',
  startedAt: 0,
  elapsedBase: 0,
  runningSince: null,
  track: emptyTrack(),
  accuracy: null,
  restored: false,
});

let state: TrackerState = initial();
const listeners = new Set<(s: TrackerState) => void>();
let watchSub: Location.LocationSubscription | null = null;
let gpsArmed = false;
let sinceSnapshot = 0;

const emit = () => listeners.forEach((l) => l(state));
const set = (patch: Partial<TrackerState>) => {
  state = { ...state, ...patch };
  emit();
};

export const getTrackerState = () => state;

export function subscribe(l: (s: TrackerState) => void): () => void {
  listeners.add(l);
  l(state);
  return () => {
    listeners.delete(l);
  };
}

/** Elapsed running time in whole seconds, from wall-clock timestamps. */
export const elapsedSec = (s: TrackerState = state) => Math.floor((s.elapsedBase + (s.runningSince ? Date.now() - s.runningSince : 0)) / 1000);

const toFix = (loc: Location.LocationObject): Fix => ({ lat: loc.coords.latitude, lon: loc.coords.longitude, t: loc.timestamp, accuracy: loc.coords.accuracy });

function ingest(locations: Location.LocationObject[]) {
  if (!locations.length) return;
  const last = locations[locations.length - 1];
  let track = state.track;
  if (state.status === 'running') for (const loc of locations) track = addFix(track, toFix(loc));
  set({ accuracy: last.coords.accuracy ?? null, track });
  if (state.status === 'running') {
    sinceSnapshot += locations.length;
    if (sinceSnapshot >= SNAPSHOT_EVERY) {
      sinceSnapshot = 0;
      saveSnapshot().catch(() => {});
    }
  }
}

// The background task must be defined at module load (this file is imported from the
// root layout) so it exists when the OS wakes the app to deliver locations.
if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(RUN_LOCATION_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(RUN_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    // Locations can arrive after the app was killed and relaunched headless: restore the
    // session first so they land on the right run.
    if (state.status === 'idle') await restore();
    if (state.status === 'idle') return;
    ingest(data.locations ?? []);
  });
}

async function saveSnapshot() {
  const snap: Snapshot = { startedAt: state.startedAt, elapsedBase: state.elapsedBase + (state.runningSince ? Date.now() - state.runningSince : 0), track: state.track, source: state.source };
  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
}

/** Is there an unfinished run on disk? (Checked by Home to offer "Resume".) */
export async function hasSavedRun(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SNAPSHOT_KEY)) != null;
  } catch {
    return false;
  }
}

/** Load a saved run into the session as paused. Returns false if there was none. */
export async function restore(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return false;
    const snap = JSON.parse(raw) as Snapshot;
    if (!snap.startedAt || !snap.track) return false;
    state = { ...initial(), ...snap, status: 'paused', runningSince: null, restored: true };
    emit();
    return true;
  } catch {
    return false;
  }
}

export async function discardSavedRun() {
  await AsyncStorage.removeItem(SNAPSHOT_KEY).catch(() => {});
}

async function startGps(): Promise<GpsSource> {
  if (Platform.OS === 'web') return 'demo';
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'demo';

  // Background updates keep the run alive with the screen off. Both the permission and
  // the capability can be missing (Expo Go, older OS, user declined "Always").
  try {
    if (await Location.isBackgroundLocationAvailableAsync()) {
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.status === 'granted') {
        if (!(await Location.hasStartedLocationUpdatesAsync(RUN_LOCATION_TASK))) {
          await Location.startLocationUpdatesAsync(RUN_LOCATION_TASK, {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1000,
            distanceInterval: 0,
            activityType: Location.LocationActivityType.Fitness,
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true,
            deferredUpdatesInterval: 1000,
            foregroundService: {
              notificationTitle: 'Squirrel Social is tracking your run',
              notificationBody: 'Every metre counts. Tap to return to the app.',
              notificationColor: '#2F5BFF',
            },
          });
        }
        return 'background';
      }
    }
  } catch {
    // fall through to foreground watching
  }

  watchSub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 }, (loc) => ingest([loc]));
  return 'foreground';
}

async function stopGps() {
  gpsArmed = false;
  watchSub?.remove();
  watchSub = null;
  if (Platform.OS === 'web') return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(RUN_LOCATION_TASK)) await Location.stopLocationUpdatesAsync(RUN_LOCATION_TASK);
  } catch {
    // nothing to stop
  }
}

/** Begin a new run. Resolves once the GPS source is known. */
export async function start(): Promise<void> {
  if (!state.restored) state = { ...initial(), startedAt: Date.now() };
  set({ status: 'running', runningSince: Date.now(), source: 'pending' });
  const source = await startGps();
  gpsArmed = true;
  set({ source });
  saveSnapshot().catch(() => {});
}

export function pause() {
  if (state.status !== 'running') return;
  set({ status: 'paused', elapsedBase: state.elapsedBase + (state.runningSince ? Date.now() - state.runningSince : 0), runningSince: null });
  saveSnapshot().catch(() => {});
}

/** Continue after a pause. For a run restored from a snapshot this also re-arms GPS. */
export function resume() {
  if (state.status !== 'paused') return;
  set({ status: 'running', runningSince: Date.now() });
  if (!gpsArmed) {
    set({ source: 'pending' });
    startGps()
      .then((source) => {
        gpsArmed = true;
        set({ source });
      })
      .catch(() => set({ source: 'demo' }));
  }
}

/** Stop GPS, freeze the clock and return the final track. The snapshot is cleared. */
export async function finish(): Promise<TrackerState> {
  if (state.status === 'running') pause();
  await stopGps();
  const final = { ...state, status: 'idle' as const };
  await discardSavedRun();
  state = { ...initial() };
  emit();
  return final;
}

/** Abandon the run entirely (no upload, nothing kept). */
export async function abandon() {
  await stopGps();
  await discardSavedRun();
  state = initial();
  emit();
}
