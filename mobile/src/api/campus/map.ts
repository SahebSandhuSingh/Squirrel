/**
 * Map service. Screens call these, never fetch directly. Everything except the device
 * location comes from the backend (campusApi → REST or the dev mock).
 */
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { campusApi, CAMPUS_SOURCE } from '@/api/campus';
import type { LatLng, MapFeatures, NearbyPlayers, PresenceUpdate, Territory, Zone } from '@/api/campus/types';

export type MapData = { zones: Zone[]; features: MapFeatures; territories: Territory[] };

/** The static-ish world (zones + base map) and current territory state in one call. */
export async function getMapData(): Promise<MapData> {
  const [zones, features, t] = await Promise.all([campusApi.zones(), campusApi.mapFeatures(), campusApi.territories()]);
  return { zones, features, territories: t.territories };
}
export const getNearbyUsers = (): Promise<NearbyPlayers> => campusApi.nearbyPlayers();
export const getTerritories = () => campusApi.territories();
export const getZonePlayers = (zoneId: string) => campusApi.zonePlayers(zoneId);
export const searchPeople = (q: string) => campusApi.searchPeople(q);
export const reportPresence = (p: PresenceUpdate) => campusApi.updatePresence(p);

export type LocationPermission = 'granted' | 'undetermined' | 'denied' | 'blocked' | 'services_off' | 'unsupported';
export type UserLocation = { position: LatLng; accuracy_m: number | null; simulated: boolean };

export async function getLocationPermission(ask = false): Promise<LocationPermission> {
  // Browsers expose GPS through navigator.geolocation (expo-location wraps it); some embeds don't.
  if (Platform.OS === 'web' && (typeof navigator === 'undefined' || !navigator.geolocation)) return 'unsupported';
  try {
    if (!(await Location.hasServicesEnabledAsync())) return 'services_off';
    const p = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
    if (p.status === 'granted') return 'granted';
    if (p.status === 'undetermined') return 'undetermined';
    return p.canAskAgain ? 'denied' : 'blocked';
  } catch {
    return 'services_off';
  }
}

/** Dev mock only: a stand-in position on campus when the device has no GPS (web). */
export const DEV_SIMULATED_LOCATION: LatLng | null = CAMPUS_SOURCE === 'mock' ? [22.96445, 88.52505] : null;

/** One-off device location (your own, never shared with other users by the app). */
export async function getUserLocation(): Promise<UserLocation | null> {
  if ((await getLocationPermission()) !== 'granted') {
    return DEV_SIMULATED_LOCATION ? { position: DEV_SIMULATED_LOCATION, accuracy_m: 25, simulated: true } : null;
  }
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { position: [loc.coords.latitude, loc.coords.longitude], accuracy_m: loc.coords.accuracy ?? null, simulated: false };
}
