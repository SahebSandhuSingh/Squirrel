/**
 * campus-service (EXPO_PUBLIC_CAMPUS_SERVICE_URL) over REST. Only the contract methods routed here
 * (CAMPUS_SERVICE_METHODS in campusShapes.ts); responses are adapted to the contract where
 * campus-service's shape differs. Routes: campus-service/docs/API.md.
 *
 *   same shape    zones (GET /v1/zones), territories (GET /v1/territories), zone (GET /v1/zones/{id}),
 *                 territoryAction (POST /v1/zones/{id}/claim|steal|defend), updatePresence (PUT /v1/map/presence),
 *                 setOpenToMeet (PUT /v1/me/open-to-meet)
 *   adapted       mapFeatures (GeoJSON → MapFeatures), nearbyPlayers (hidden_reason code → text),
 *                 activeNow (lite person → PersonCard), sharedZones (by zone → by person),
 *                 heatmap (7d only; {lat,lng} + low/medium/high → HeatCell),
 *                 sharedContext (404 for someone campus-service has never seen → nothing shared),
 *                 submitActivity (fixes the server's ingest check would refuse are dropped first),
 *                 activityZones (an activity campus-service never received → a clear error),
 *                 meetups / meetup (host + invitees → the app's Meetup)
 *   undocumented  checkIn (POST /v1/meetups/{id}/check-in), meetupRating / rateMeetup
 *                 (GET /v1/meetups/{id}/rating, POST /v1/meetups/{id}/ratings): campus-service owns them
 *                 (ADR-032) but its API reference has no such routes yet, so they stay gated in
 *                 api/campus/index.ts ('meetupCheckIn', 'meetupRating') until campus-service serves them.
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
  meetupFromCampus,
  meetupsFromCampus,
  nearbyPlayersFromCampus,
  NOTHING_SHARED,
  pointsForCampus,
  sharedZonesFromCampus,
  type CampusActiveNow,
  type CampusConfig,
  type CampusHeatmap,
  type CampusMapFeatures,
  type CampusMeetup,
  type CampusServicePart,
  type CampusSharedZones,
  type CampusStats,
} from '@/api/campus/campusShapes';
import type * as T from '@/api/campus/types';

const id = encodeURIComponent;

const NOT_ON_CAMPUS_SERVICE = 'Zone checks need this activity on the campus service, and it hasn’t received it.';

export function makeCampusServiceApi(base: string): CampusServicePart {
  const { get, send } = restClient(base);
  // /v1/config is static per deploy: fetched once (a failure is retried on the next call).
  let configOnce: Promise<CampusConfig> | null = null;
  const config = () =>
    (configOnce ??= get<CampusConfig>('/v1/config').catch((e: unknown) => {
      configOnce = null;
      throw e;
    }));
  // Your campus-service user id (a Social profile id with its identity bridge on): names a meetup by who else is in it.
  let meOnce: Promise<string | null> | null = null;
  const meId = () =>
    (meOnce ??= get<{ user_id?: string }>('/v1/me').then(
      (m) => m.user_id ?? null,
      () => {
        meOnce = null;
        return null;
      },
    ));

  return {
    rawConfig: config,
    rawStats: () => get<CampusStats>('/v1/campus/stats'),
    openToMeet: async () => !!(await get<{ open_to_meet?: boolean }>('/v1/me')).open_to_meet,

    zones: async () => (await get<{ zones: T.Zone[] }>('/v1/zones')).zones,
    territories: () => get<{ territories: T.Territory[]; as_of: string }>('/v1/territories'),
    zone: (zoneId) => get<T.ZoneDetail>(`/v1/zones/${id(zoneId)}`),
    territoryAction: (zoneId, action, idempotencyKey) => send<T.TerritoryActionResult>(`/v1/zones/${id(zoneId)}/${action}`, 'POST', { idempotency_key: idempotencyKey }),

    // One-shot upload: campus-service verifies the points itself (asynchronously). Fixes it would
    // refuse (a jump, off campus) are dropped first, so one of them can't sink the whole activity.
    submitActivity: async (input) => {
      const area = ingestAreaOf(await config().catch(() => null));
      const { points } = pointsForCampus(input.points, area);
      if (points.length < 2) {
        const detail = 'This activity didn’t pass through campus, so there are no zones to check.';
        throw new ApiError(422, detail, { code: 'no_campus_points', detail });
      }
      return { activity_id: (await send<{ activity_id: string }>('/v1/activities', 'POST', { ...input, points })).activity_id };
    },
    // While verification runs this answers status 'processing' with no zones. campus-service only
    // knows activities uploaded to it (POST /v1/activities): any other id is 404 (or 422, not a uuid).
    activityZones: (activityId) =>
      get<T.ActivityZones>(`/v1/activities/${id(activityId)}/zones`).catch((e: unknown) => {
        if (e instanceof ApiError && (e.status === 404 || e.status === 422)) throw new ApiError(404, NOT_ON_CAMPUS_SERVICE, { code: 'activity_not_on_campus_service', detail: NOT_ON_CAMPUS_SERVICE });
        throw e;
      }),

    mapFeatures: async () => mapFeaturesFromCampus(await get<CampusMapFeatures>('/v1/map/features')),
    nearbyPlayers: async () => nearbyPlayersFromCampus(await get<T.NearbyPlayers>('/v1/map/players')),
    updatePresence: (p) => send<{ accepted: boolean }>('/v1/map/presence', 'PUT', p),
    activeNow: async () => activeNowFromCampus(await get<CampusActiveNow>('/v1/people/active')),
    setOpenToMeet: (enabled) => send<T.OpenToMeet>('/v1/me/open-to-meet', 'PUT', { enabled }),
    // campus-service only knows people once they've used it; someone it's never seen shares nothing with you yet.
    sharedContext: (userId) =>
      get<T.SharedContext>(`/v1/users/${id(userId)}/context`).catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) return NOTHING_SHARED();
        throw e;
      }),

    sharedZones: async () => sharedZonesFromCampus(await get<CampusSharedZones>('/v1/me/shared-zones')),
    heatmap: async (window) => (campusSupportsHeatWindow(window) ? heatmapFromCampus(await get<CampusHeatmap>(`/v1/map/heatmap?window=${id(window)}`), window) : heatWindowUnavailable(window)),

    meetups: async () => {
      const [r, me] = await Promise.all([get<{ meetups: CampusMeetup[] }>('/v1/meetups'), meId()]);
      return meetupsFromCampus(r.meetups, me);
    },
    meetup: async (meetupId) => {
      const [m, me] = await Promise.all([get<CampusMeetup>(`/v1/meetups/${id(meetupId)}`), meId()]);
      return meetupFromCampus(m, me);
    },
    // Safety-contact semantics: campus-service notifies your safety contact (config
    // features.meetup_safety_notifications); no friend picker. Gated as 'meetupCheckIn' (undocumented route).
    checkIn: (meetupId, notifySafetyContact) => send<T.CheckInResult>(`/v1/meetups/${id(meetupId)}/check-in`, 'POST', { notify_safety_contact: notifySafetyContact }),
    // Gated as 'meetupRating' until campus-service serves (and documents) these two routes.
    meetupRating: (meetupId) => get<T.MeetupRatingState>(`/v1/meetups/${id(meetupId)}/rating`),
    rateMeetup: (meetupId, input, key) => send<T.MeetupRatingResult>(`/v1/meetups/${id(meetupId)}/ratings`, 'POST', { ...input, idempotency_key: key }),
  };
}
