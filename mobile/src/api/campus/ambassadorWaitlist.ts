/**
 * Campus Ambassador waitlist — frontend contract for an endpoint that doesn't exist yet.
 *
 *   POST /v1/ambassador/waitlist   AmbassadorWaitlistRequest → 201 AmbassadorWaitlistEntry
 *                                  409 = already on the list (treated as on the list)
 *
 * Not to be confused with POST /v1/ambassador/application (the reviewed application). The
 * waitlist collects contact + campus details first.
 *
 * Gated per endpoint (api/availability.ts, capability 'ambassadorWaitlist'), like shared
 * workouts: it only ever calls a LIVE campus API, never the dev mock. `joinAmbassadorWaitlist`
 * never invents a result — it resolves only on a real 2xx (or the server's 409 "already on the
 * list"), rejects with EndpointUnavailableError while the endpoint isn't live (switched off, or
 * 404/405/501 from the server), and rethrows every real error (401, 422, 5xx, offline).
 */
import { EndpointUnavailableError, isEndpointAvailable } from '@/api/availability';
import { api, ApiError } from '@/api/client';
import { CAMPUS_API_URL } from '@/api/config';
import { CAMPUS_SOURCE } from '@/api/campus';

export const YEARS_OF_STUDY = ['1st year', '2nd year', '3rd year', '4th year', '5th year', 'Postgrad'] as const;
export type YearOfStudy = (typeof YEARS_OF_STUDY)[number];

export type AmbassadorWaitlistRequest = {
  full_name: string;
  personal_email: string;
  college_email: string;
  /** E.164 */
  phone: string;
  college: string;
  /** Set when the college is the user's campus from /v1/config. */
  campus_id: string | null;
  course: string;
  year_of_study: YearOfStudy;
  motivation: string | null;
  /** Instagram handle without the @. */
  instagram: string | null;
};

export type AmbassadorWaitlistEntry = { id: string; status: 'waitlisted'; created_at: string };
export type WaitlistResult = { entry: AmbassadorWaitlistEntry | null; alreadyListed: boolean };

export const AMBASSADOR_WAITLIST_PATH = '/v1/ambassador/waitlist';

/** Can this build submit at all? (Capability on and a live campus API.) */
export const ambassadorWaitlistLive = () => isEndpointAvailable('ambassadorWaitlist') && CAMPUS_SOURCE === 'live';

export async function joinAmbassadorWaitlist(body: AmbassadorWaitlistRequest): Promise<WaitlistResult> {
  if (!ambassadorWaitlistLive()) throw new EndpointUnavailableError('ambassadorWaitlist');
  try {
    const entry = await api<AmbassadorWaitlistEntry>(AMBASSADOR_WAITLIST_PATH, { body, base: CAMPUS_API_URL });
    return { entry: entry ?? null, alreadyListed: false };
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 405 || e.status === 501)) throw new EndpointUnavailableError('ambassadorWaitlist');
    if (e instanceof ApiError && e.status === 409) return { entry: null, alreadyListed: true };
    throw e;
  }
}
