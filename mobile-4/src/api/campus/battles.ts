/**
 * Territory battles: campus-service's challenges (territory duels, zone races, weekend wars). The
 * zone and crew screens call it directly; the Invites screen stays with Social's duels.
 *
 *   GET   /v1/challenge-invites/types
 *   GET   /v1/challenge-invites?box=all        yours, and your crews', each with `actions` for you
 *   POST  /v1/challenge-invites                { type, target, zone_id, starts_at, message? }
 *   POST  /v1/challenge-invites/{id}/{accept|decline|cancel|start|complete}
 *   PATCH /v1/challenge-invites/{id}/schedule  { starts_at }
 * Every write returns the battle as the caller now sees it (new `actions` included).
 */
import { CAMPUS_API_URL, CAMPUS_SERVICE_URL, DEDICATED_CAMPUS_API } from '@/api/config';
import { restClient } from '@/api/campus/http';
import type { ChallengeAction, ChallengeInvite, ChallengeInviteCreate, ChallengeTypeInfo } from '@/api/campus/types';

/** campus-service, or a dedicated campus backend with the same contract. Never Social. */
const BASE = CAMPUS_SERVICE_URL || (DEDICATED_CAMPUS_API ? CAMPUS_API_URL : '');
export const BATTLES_CONFIGURED = BASE.length > 0;

const { get, send } = restClient(BASE);
const path = (id: string) => `/v1/challenge-invites/${encodeURIComponent(id)}`;

export const battlesApi = {
  types: async () => (await get<{ types: ChallengeTypeInfo[] }>('/v1/challenge-invites/types')).types,
  list: async () => (await get<{ invites: ChallengeInvite[] }>('/v1/challenge-invites?box=all')).invites,
  create: (input: ChallengeInviteCreate) => send<ChallengeInvite>('/v1/challenge-invites', 'POST', input),
  act: (id: string, action: Exclude<ChallengeAction, 'schedule'>) => send<ChallengeInvite>(`${path(id)}/${action}`, 'POST'),
  schedule: (id: string, startsAt: string) => send<ChallengeInvite>(`${path(id)}/schedule`, 'PATCH', { starts_at: startsAt }),
};
