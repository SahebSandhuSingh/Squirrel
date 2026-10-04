import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { addFix, addFixBatch, emptyTrack, type Fix, type TrackState } from './track';

export const RUN_LOCATION_TASK = 'squirrel-run-location-updates';

export type RunSource = 'gps' | 'demo';
export type RunTrackingSnapshot = {
  track: TrackState;
  lastFixAt: number;
  active: boolean;
  paused: boolean;
  source: RunSource | null;
};

const initial = (): RunTrackingSnapshot => ({
  track: emptyTrack(),
  lastFixAt: 0,
  active: false,
  paused: false,
  source: null,
});

let snapshot = initial();
const listeners = new Set<() => void>();

function publish(next: RunTrackingSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function getRunTrackingSnapshot() {
  return snapshot;
}

export function subscribeRunTracking(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function beginRunTracking(source: RunSource, now = Date.now()) {
  publish({ track: emptyTrack(), lastFixAt: now, active: true, paused: false, source });
}

export function prepareRunTracking(source: RunSource) {
  publish({ track: emptyTrack(), lastFixAt: Date.now(), active: false, paused: false, source });
}

export function endRunTracking() {
  publish({ ...snapshot, active: false, paused: false, source: null });
}

export function setRunTrackingPaused(paused: boolean) {
  publish({ ...snapshot, paused });
}

export function noteRunLocationFix() {
  publish({ ...snapshot, lastFixAt: Date.now() });
}

export function addRunTrackingFix(fix: Fix) {
  if (!snapshot.active || snapshot.paused || !snapshot.source) return;
  publish({ ...snapshot, lastFixAt: Date.now(), track: addFix(snapshot.track, fix) });
}

/** Background batches can arrive out of order; sort each batch before addFix's monotonic gate. */
export function addRunTrackingBatch(fixes: readonly Fix[]) {
  if (!snapshot.active || snapshot.paused || snapshot.source !== 'gps' || fixes.length === 0) return;
  publish({ ...snapshot, lastFixAt: Date.now(), track: addFixBatch(snapshot.track, fixes) });
}

type LocationTaskData = { locations?: Location.LocationObject[] };

// Expo may launch this JavaScript bundle while the app UI is suspended. Keep registration at
// module scope so it runs before the route component renders.
TaskManager.defineTask<LocationTaskData>(RUN_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  addRunTrackingBatch(data.locations.map((location) => ({
    lat: location.coords.latitude,
    lon: location.coords.longitude,
    t: location.timestamp,
    accuracy: location.coords.accuracy,
  })));
});

export const BACKGROUND_LOCATION_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 1000,
  distanceInterval: 0,
  foregroundService: {
    notificationTitle: 'Squirrel run in progress',
    notificationBody: 'Recording your route. Tap to return to Squirrel.',
    notificationColor: '#D7FF1F',
  },
};
