/**
 * Social service client (EXPO_PUBLIC_SOCIAL_API_URL). Same bearer token as every other service:
 * the Exercise backend issues it, the Social service, Run Module and progress-service accept it.
 * Routes are exactly the Social service's (saheb branch). Screens mostly reach these through
 * `campusApi` (api/campus/socialAdapter.ts maps them onto the campus contract); the ones with no
 * campus equivalent — waitlist + referrals, push tokens, vouching, the feed, daily stats — are
 * used directly from here.
 */
import { api } from '@/api/client';
import { SOCIAL_API_CONFIGURED, SOCIAL_API_URL } from '@/api/config';
import type * as S from '@/api/social/types';

export { SOCIAL_API_CONFIGURED };
const base = SOCIAL_API_URL;
const id = encodeURIComponent;
const qs = (p: Record<string, string | number | boolean | null | undefined>) => {
  const s = Object.entries(p)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return s ? `?${s}` : '';
};
const get = <T,>(path: string) => api<T>(path, { base });
const send = <T,>(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown) => api<T>(path, { base, method, body: body ?? (method === 'DELETE' ? undefined : {}) });

export const socialApi = {
  // profiles
  myProfile: () => get<S.SProfile>('/v1/users/me/profile'),
  updateMyProfile: (patch: S.SProfilePatch) => send<S.SProfile>('/v1/users/me/profile', 'PATCH', patch),
  profile: (userId: string) => get<S.SProfile>(`/v1/users/${id(userId)}/profile`),
  searchUsers: (q: string, limit = 20) => get<S.SUserPage>(`/v1/users/search${qs({ q, limit })}`),
  following: (userId: string, limit = 50) => get<S.SUserPage>(`/v1/users/${id(userId)}/following${qs({ limit })}`),
  follow: (userId: string) => send<S.SFollowStatus>(`/v1/users/${id(userId)}/follow`, 'POST'),
  unfollow: (userId: string) => send<S.SFollowStatus>(`/v1/users/${id(userId)}/follow`, 'DELETE'),

  // waitlist + referrals ("invite 3 to skip the line"), founding badges
  membership: () => get<S.SMembership>('/v1/me/membership'),
  claimReferral: (code: string) => send<S.SMembership>('/v1/me/referral', 'POST', { code: code.trim().toUpperCase() }),
  communityConfig: () => get<S.SCommunityConfig>('/v1/community/config'),

  // crews
  crews: (mine = false, q?: string) => get<{ items: S.SCrew[]; next_cursor: string | null }>(`/v1/crews${qs({ mine: mine || undefined, q })}`),
  crew: (crewId: string) => get<S.SCrewDetail>(`/v1/crews/${id(crewId)}`),
  createCrew: (input: S.SCrewCreate) => send<S.SCrewDetail>('/v1/crews', 'POST', input),
  joinCrew: (crewId: string) => send<S.SCrewDetail>(`/v1/crews/${id(crewId)}/join`, 'POST'),
  leaveCrew: (crewId: string) => send<void>(`/v1/crews/${id(crewId)}/membership`, 'DELETE'),
  vouch: (crewId: string, userId: string) => send<S.SVouch>(`/v1/crews/${id(crewId)}/members/${id(userId)}/vouch`, 'POST'),
  unvouch: (crewId: string, userId: string) => send<S.SVouch>(`/v1/crews/${id(crewId)}/members/${id(userId)}/vouch`, 'DELETE'),

  // events + check-ins
  events: (scope: 'upcoming' | 'mine' = 'upcoming') => get<{ items: S.SEvent[]; next_cursor: string | null }>(`/v1/events${qs({ scope })}`),
  event: (eventId: string) => get<S.SEvent>(`/v1/events/${id(eventId)}`),
  createEvent: (input: S.SEventCreate) => send<S.SEvent>('/v1/events', 'POST', input),
  cancelEvent: (eventId: string) => send<void>(`/v1/events/${id(eventId)}`, 'DELETE'),
  rsvp: (eventId: string, status: 'going' | 'interested' = 'going') => send<S.SEvent>(`/v1/events/${id(eventId)}/rsvp`, 'POST', { status }),
  cancelRsvp: (eventId: string) => send<S.SEvent>(`/v1/events/${id(eventId)}/rsvp`, 'DELETE'),
  eventCheckIn: (eventId: string, notifyUserIds: string[] = [], note = '') => send<S.SCheckIn>(`/v1/events/${id(eventId)}/checkin`, 'POST', { notify_user_ids: notifyUserIds, note }),
  checkIn: (place: string, notifyUserIds: string[] = [], note = '') => send<S.SCheckIn>('/v1/checkins', 'POST', { place, notify_user_ids: notifyUserIds, note }),

  // head-to-head challenges
  challenges: () => get<{ items: S.SChallenge[] }>('/v1/challenges'),
  createChallenge: (opponentId: string, metric: 'km' | 'workouts', days: number) => send<S.SChallenge>('/v1/challenges', 'POST', { opponent_id: opponentId, metric, days }),
  respondChallenge: (challengeId: string, action: 'accept' | 'decline' | 'cancel') => send<S.SChallenge>(`/v1/challenges/${id(challengeId)}/${action}`, 'POST'),

  // boards + daily stats
  xpBoard: (window: 'daily' | 'weekly', limit = 10) => get<S.SXpBoard>(`/v1/leaderboards/xp${qs({ window, limit })}`),
  hostelBoard: (window: 'daily' | 'weekly') => get<S.SHostelBoard>(`/v1/leaderboards/hostels${qs({ window })}`),
  dailyStats: (days = 7) => get<S.SDailyStats>(`/v1/stats/daily${qs({ days })}`),

  // notifications + push
  notifications: (limit = 30) => get<S.SNotificationPage>(`/v1/notifications${qs({ limit })}`),
  unreadCount: () => get<{ unread: number }>('/v1/notifications/unread-count'),
  markRead: (ids: string[] | null) => send<{ unread: number }>('/v1/notifications/read', 'POST', { ids }),
  registerPushToken: (token: string, platform: 'ios' | 'android' | 'web') => send<void>('/v1/me/push-tokens', 'POST', { token, platform }),
  removePushToken: (token: string) => send<void>(`/v1/me/push-tokens/${id(token)}`, 'DELETE'),

  // media (presigned upload)
  createUpload: (purpose: 'post' | 'avatar', contentType: string, byteSize: number) => send<S.SUploadTicket>('/v1/media/uploads', 'POST', { purpose, content_type: contentType, byte_size: byteSize }),
  completeUpload: (mediaId: string) => send<S.SMedia>(`/v1/media/${id(mediaId)}/complete`, 'POST'),

  // feed + posts
  feed: (kind: S.SFeedKind = 'for_you', cursor?: string | null) => get<S.SFeed>(`/v1/feed${qs({ feed: kind, cursor })}`),
  post: (postId: string) => get<S.SPost>(`/v1/posts/${id(postId)}`),
  createPost: (input: S.SPostCreate) => send<S.SPost>('/v1/posts', 'POST', input),
  deletePost: (postId: string) => send<void>(`/v1/posts/${id(postId)}`, 'DELETE'),
  like: (postId: string, on: boolean) => send<{ liked: boolean; likes_count: number }>(`/v1/posts/${id(postId)}/like`, on ? 'POST' : 'DELETE'),
  save: (postId: string, on: boolean) => send<{ saved: boolean }>(`/v1/posts/${id(postId)}/save`, on ? 'POST' : 'DELETE'),
  comments: (postId: string) => get<S.SCommentPage>(`/v1/posts/${id(postId)}/comments`),
  comment: (postId: string, body: string) => send<S.SComment>(`/v1/posts/${id(postId)}/comments`, 'POST', { body }),
  deleteComment: (commentId: string) => send<void>(`/v1/comments/${id(commentId)}`, 'DELETE'),
};
