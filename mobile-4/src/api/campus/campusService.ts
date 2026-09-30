/**
 * campus-service (EXPO_PUBLIC_CAMPUS_SERVICE_URL) — the map world, over REST. Only the methods the
 * hybrid routes here (CAMPUS_SERVICE_METHODS); responses are adapted to the contract in
 * campusShapes.ts where campus-service's shape differs. Routes: campus-service/docs/API.md.
 *
 *   same shape    zones, territories, zone, territoryAction, activityZones,
 *                 updatePresence, setOpenToMeet
 *   adapted       mapFeatures (GeoJSON → MapFeatures), nearbyPlayers (hidden_reason code → text),
 *                 activeNow (lite person → PersonCard), sharedZones (by zone → by person),
 *                 heatmap (7d only; {lat,lng} + low/medium/high → HeatCell),
 *                 sharedContext (404 for someone campus-service has never seen → nothing shared),
 *                 submitActivity (fixes the server's ingest check would refuse are dropped first)
 */
import { ApiError } from '@/api/client';
import { restClient } from '@/api/campus/http';
import {
  activeNowFromCampus,
  campusSupportsHeatWindow,
  heatmapFromCampus,
  heatWindowUnavailable,
  ingestAreaOf,
  mapFeaturesFromCampus,
  nearbyPlayersFromCampus,
  pointsForCampus,
  sharedZonesFromCampus,
  type CampusActiveNow,
  type CampusConfig,
  type CampusHeatmap,
  type CampusMapFeatures,
  type CampusServicePart,
  type CampusSharedZones,
  type CampusStats,
} from '@/api/campus/campusShapes';
import type * as T from '@/api/campus/types';

const id = encodeURIComponent;
const NOTHING_SHARED: T.SharedContext = { shared_zones: [], shared_crews: [], shared_events: [], icebreakers: [] };

export function makeCampusServiceApi(base: string): CampusServicePart {
  const { get, send } = restClient(base);
  // /v1/config is static per deploy: fetched once (a failure is retried on the next call).
  let configOnce: Promise<CampusConfig> | null = null;
  const config = () => (configOnce ??= get<CampusConfig>('/v1/config').catch((e: unknown) => {
    configOnce = null;
    throw e;
  }));
  return {
    rawConfig: config,
    rawStats: () => get<CampusStats>('/v1/campus/stats'),
    openToMeet: async () => !!(await get<{ open_to_meet?: boolean }>('/v1/me')).open_to_meet,

    zones: async () => (await get<{ zones: T.Zone[] }>('/v1/zones')).zones,
    territories: () => get<{ territories: T.Territory[]; as_of: string }>('/v1/territories'),
    zone: (zoneId) => get<T.ZoneDetail>(`/v1/zones/${id(zoneId)}`),
    territoryAction: (zoneId, action, idempotencyKey) => send<T.TerritoryActionResult>(`/v1/zones/${id(zoneId)}/${action}`, 'POST', { idempotency_key: idempotencyKey }),

    // One-shot upload: the points are verified by campus-service itself (asynchronously). Fixes the
    // server would refuse (a jump, off campus) are dropped first, so one of them can't sink the run.
    submitActivity: async (input) => {
      const area = ingestAreaOf(await config().catch(() => null));
      const { points } = pointsForCampus(input.points, area);
      if (points.length < 2) {
        throw new ApiError(422, 'This run didn’t pass through campus, so there are no zones to check.', { code: 'no_campus_points', detail: 'This run didn’t pass through campus, so there are no zones to check.' });
      }
      return { activity_id: (await send<{ activity_id: string }>('/v1/activities', 'POST', { ...input, points })).activity_id };
    },
    // While verification runs this answers status 'processing' with no zones.
    activityZones: (activityId) => get<T.ActivityZones>(`/v1/activities/${id(activityId)}/zones`),

    mapFeatures: async () => mapFeaturesFromCampus(await get<CampusMapFeatures>('/v1/map/features')),
    nearbyPlayers: async () => nearbyPlayersFromCampus(await get<T.NearbyPlayers>('/v1/map/players')),
    updatePresence: (p) => send<{ accepted: boolean }>('/v1/map/presence', 'PUT', p),
    activeNow: async () => activeNowFromCampus(await get<CampusActiveNow>('/v1/people/active')),
    setOpenToMeet: (enabled) => send<T.OpenToMeet>('/v1/me/open-to-meet', 'PUT', { enabled }),
    // campus-service only knows people once they've used it; nobody else shares zones with you yet.
    sharedContext: (userId) =>
      get<T.SharedContext>(`/v1/users/${id(userId)}/context`).catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) return { ...NOTHING_SHARED };
        throw e;
      }),

    sharedZones: async () => sharedZonesFromCampus(await get<CampusSharedZones>('/v1/me/shared-zones')),
    heatmap: async (window) => (campusSupportsHeatWindow(window) ? heatmapFromCampus(await get<CampusHeatmap>(`/v1/map/heatmap?window=${id(window)}`), window) : heatWindowUnavailable(window)),
  };
}
