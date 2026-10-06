/**
 * The contract between the territory network and whatever serves it. Today that's the Preview
 * Season (source/preview.ts). A live backend implements the same shape — the suggested routes
 * follow campus-service's conventions (/v1, snake_case, idempotency keys) and the adapter maps
 * them onto these types, so no screen changes when it switches:
 *
 *   GET  /v1/world/territories?bbox=&tier=      shapes + state (L5 only when tier=5 is asked for)
 *   GET  /v1/world/crews
 *   POST /v1/world/territories/{id}/claim | defend | challenge | push   { idempotency_key }
 *   POST /v1/world/territories/{id}/discover    (server checks the visit)
 *   WS   territory.updated · world.activity     (aggregated activity, never positions)
 */
import type { ActivityItem, Territory, TerritoryState } from '../types.ts';
import type { ActionResult, WorldActionKind } from './preview.ts';

export type WorldSourceKind = 'preview' | 'live';

export interface WorldSource {
  readonly kind: WorldSourceKind;
  /** Every territory with its current state. */
  load(): Promise<Territory[]>;
  /** One of your moves; resolves with the territory's next state, or rejects with a reason. */
  act(territory: Territory, kind: WorldActionKind): Promise<ActionResult>;
  /** Live activity; returns an unsubscribe function. */
  subscribe(onEvent: (e: { item: ActivityItem; territoryId: string; next: TerritoryState }) => void): () => void;
}
