/**
 * The contract between the IISER Kolkata map and its backend.
 *
 *   GET  /zones                       Zone[]   (state; geometry may be omitted — the app has it)
 *   GET  /territories                 Territory[]
 *   GET  /territories/:id             Territory
 *   GET  /crews                       Crew[]
 *   GET  /zones/:id/activity          Activity[]   newest first
 *   GET  /me                          Player
 *   POST /zones/:id/claim             ActionResult  body { position: [lng, lat] | null }
 *   POST /zones/:id/attack            ActionResult
 *   POST /zones/:id/capture           ActionResult
 *   POST /zones/:id/defend            ActionResult
 *   POST /zones/:id/challenge         ActionResult
 *
 * The server decides; the app only offers the moves logic/rules.ts says are allowed and shows
 * whatever the server answers. Live changes arrive through `subscribe` (a socket, when a backend
 * has one; the preview simulates the campus).
 */
import type { ActionResult, Activity, Crew, LngLat, Player, Territory, Zone, ZoneAction } from '../types';

export type LiveEvent = { type: 'zone'; zone: Zone } | { type: 'activity'; activity: Activity };

export interface CampusMapService {
  /** 'preview': simulated on this device, labelled in the UI. 'live': a real backend. */
  readonly mode: 'preview' | 'live';
  getZones(): Promise<Zone[]>;
  getTerritories(): Promise<Territory[]>;
  getTerritory(id: string): Promise<Territory | null>;
  getCrews(): Promise<Crew[]>;
  getZoneActivity(zoneId: string): Promise<Activity[]>;
  getPlayer(): Promise<Player>;
  act(zoneId: string, action: ZoneAction, position: LngLat | null): Promise<ActionResult>;
  subscribe(listener: (e: LiveEvent) => void): () => void;
}

export const CAMPUS_MAP_ROUTES = {
  zones: '/zones',
  territories: '/territories',
  territory: (id: string) => `/territories/${encodeURIComponent(id)}`,
  crews: '/crews',
  activity: (zoneId: string) => `/zones/${encodeURIComponent(zoneId)}/activity`,
  me: '/me',
  action: (zoneId: string, action: ZoneAction) => `/zones/${encodeURIComponent(zoneId)}/${action}`,
} as const;
