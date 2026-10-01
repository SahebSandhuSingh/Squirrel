/**
 * Ambassador programme on the Social service (contract from the squirrel-social-v3 upload; the
 * backend team is adding these routes):
 *
 *   GET    /v1/ambassador                → status (application, referral code, recruit count)
 *   POST   /v1/ambassador/application    { statement (20–1000 chars) } → apply / edit / re-apply after rejection
 *   DELETE /v1/ambassador/application    withdraw a pending application
 *   GET    /v1/ambassador/recruits       → recruits you brought in (approved ambassadors only) + total
 *   POST   /v1/ambassador/referrals      { code } → record which ambassador recruited you (once)
 *   GET    /v1/users/me/recruiter        → { ambassador, recruited_at }
 *
 * Off until the 'ambassador' capability is live (api/availability.ts — flip it in BUILT, or list
 * it in EXPO_PUBLIC_LIVE_ENDPOINTS); until then every call rejects as "not live yet".
 */
import { EndpointUnavailableError, isEndpointAvailable } from '@/api/availability';
import { api } from '@/api/client';
import { SOCIAL_API_CONFIGURED, SOCIAL_API_URL } from '@/api/config';
import type { SUser } from '@/api/social/types';

export type AmbassadorApplicationStatus = 'pending' | 'approved' | 'rejected';
export type AmbassadorApplication = {
  id: string;
  user: SUser;
  statement: string;
  status: AmbassadorApplicationStatus;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};
export type AmbassadorProgramme = { application: AmbassadorApplication | null; is_ambassador: boolean; referral_code: string | null; recruits_count: number };
export type Recruit = { user: SUser; recruited_at: string };
export type RecruitPage = { items: Recruit[]; next_cursor: string | null; total: number };
export type Recruiter = { ambassador: SUser | null; recruited_at: string | null };

export const AMBASSADOR_STATEMENT_MIN = 20;
export const AMBASSADOR_STATEMENT_MAX = 1000;

export const ambassadorProgrammeLive = () => SOCIAL_API_CONFIGURED && isEndpointAvailable('ambassador');

const call = <T,>(path: string, init: { method?: 'POST' | 'DELETE'; body?: unknown } = {}) =>
  ambassadorProgrammeLive() ? api<T>(path, { ...init, base: SOCIAL_API_URL }) : Promise.reject(new EndpointUnavailableError('ambassador'));

export const ambassadorApi = {
  status: () => call<AmbassadorProgramme>('/v1/ambassador'),
  apply: (statement: string) => call<AmbassadorApplication>('/v1/ambassador/application', { method: 'POST', body: { statement } }),
  withdraw: () => call<void>('/v1/ambassador/application', { method: 'DELETE' }),
  recruits: (cursor?: string | null) => call<RecruitPage>(`/v1/ambassador/recruits${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  claimReferral: (code: string) => call<Recruiter>('/v1/ambassador/referrals', { method: 'POST', body: { code: code.trim().toUpperCase() } }),
  myRecruiter: () => call<Recruiter>('/v1/users/me/recruiter'),
};
