/**
 * Social service response / request shapes — mirrored one-to-one from its Pydantic schemas
 * (saheb: squirrel-social-profile-social-fixed/social-backend/app/schemas.py + schemas_community.py).
 */
import type { AvatarLook } from '@/types';

export type SUser = {
  id: string;
  username: string;
  display_name: string;
  avatar_look: AvatarLook | null;
  avatar_url: string | null;
  level: number;
  verified: boolean;
};

export type SBadge = { id: string; kind: string; title: string; description: string; awarded_at: string };

export type SProfileStats = {
  xp: number;
  level: number;
  level_xp: number;
  xp_per_level: number;
  xp_synced_at: string | null;
  streak_days: number;
  followers: number;
  following: number;
  posts: number;
  activities: number;
  month: string | null;
  month_km: number;
  month_runs: number;
  month_workouts: number;
};

export type SProfileUser = {
  id: string;
  username: string;
  display_name: string;
  avatar_look: AvatarLook | null;
  avatar_url: string | null;
  bio: string | null;
  city_id: string | null;
  area: string | null;
  college: string | null;
  hostel: string | null;
  interests: string[];
  visibility: string;
  verified: boolean;
  created_at: string;
};

export type SProfileCrew = { id: string; name: string; interest: string; role: string; member_since: string; vouches: number };

export type SActivity = {
  id: string;
  type: string;
  source: 'run_module' | 'exercise' | 'manual';
  verified: boolean;
  name: string | null;
  distance_km: number | null;
  duration_minutes: number | null;
  pace: string | null;
  calories: number | null;
  started_at: string;
};

export type SFollowStatus = { following: boolean; followed_by: boolean; requested: boolean };

export type SProfile = {
  user: SProfileUser;
  stats: SProfileStats;
  badges: SBadge[];
  crews: SProfileCrew[];
  recent_posts: SPost[];
  recent_activities: SActivity[];
  is_me: boolean;
  restricted: boolean;
  relationship: SFollowStatus | null;
  username_confirmed: boolean | null;
};

export type SProfilePatch = Partial<{
  username: string;
  display_name: string;
  bio: string;
  college: string;
  hostel: string;
  interests: string[];
  avatar_look: AvatarLook;
  avatar_media_id: string;
}>;

export type SFollowListItem = SUser & { city_id: string | null; area: string | null; interests: string[]; followed_at: string | null; following: boolean; requested: boolean; is_me: boolean };
export type SUserPage = { items: SFollowListItem[]; next_cursor: string | null };

// ---- waitlist + referrals ------------------------------------------------------------
export type SMembership = {
  position: number;
  effective_position: number;
  members_total: number;
  referral_code: string;
  invite_url: string | null;
  referrals: number;
  referrals_to_skip: number;
  skipped: boolean;
  admitted: boolean;
  email_verified: boolean;
  founding: { badge_id: string; title: string; rank: number } | null;
  referred_by: SUser | null;
};

export type SCommunityConfig = { hostels: string[]; founding_first: number; founding_total: number; referrals_to_skip: number; timezone: string };

// ---- crews -----------------------------------------------------------------------------
export type SInterest = 'running' | 'walking' | 'cycling' | 'yoga' | 'hiit' | 'climbing' | 'nutrition' | 'other';
export const S_INTERESTS: SInterest[] = ['running', 'walking', 'cycling', 'yoga', 'hiit', 'climbing', 'nutrition', 'other'];

export type SCrew = {
  id: string;
  name: string;
  tagline: string;
  interest: string;
  meets: string;
  scope: string;
  hostel: string | null;
  members_count: number;
  created_at: string;
  is_member: boolean;
  my_role: string | null;
  member_since: string | null;
  preview: SUser[];
};
export type SCrewMember = { user: SUser; role: string; member_since: string; vouches: number; vouched_by_me: boolean; is_me: boolean };
export type SCrewDetail = SCrew & { members: SCrewMember[]; upcoming_events: SEvent[] };
export type SCrewCreate = { name: string; tagline?: string; interest: SInterest; meets?: string; scope?: 'campus' | 'online'; hostel?: string | null };
export type SVouch = { vouches: number; vouched_by_me: boolean };

// ---- events + check-ins -----------------------------------------------------------------
export type SEvent = {
  id: string;
  title: string;
  description: string;
  kind: string;
  venue: string;
  online: boolean;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  going_count: number;
  cancelled: boolean;
  crew: { id: string; name: string; interest: string } | null;
  host: SUser;
  my_rsvp: 'going' | 'interested' | null;
  checked_in: boolean;
  attendees: SUser[];
};
export type SEventCreate = { title: string; description?: string; kind: SInterest; venue?: string; online?: boolean; starts_at: string; ends_at?: string | null; capacity?: number | null; crew_id?: string | null };
export type SCheckIn = { id: string; place: string; event_id: string | null; note: string; notified: number; created_at: string };

// ---- challenges (head-to-head) ------------------------------------------------------------
export type SChallenge = {
  id: string;
  metric: 'km' | 'workouts' | string;
  days: number;
  status: string;
  created_at: string;
  starts_at: string | null;
  ends_at: string | null;
  me: { user: SUser; score: number };
  opponent: { user: SUser; score: number };
  i_challenged: boolean;
  winner_id: string | null;
};

// ---- notifications ----------------------------------------------------------------------
export type SNotification = { id: string; kind: string; title: string; body: string; data: Record<string, unknown>; actor: SUser | null; created_at: string; read: boolean };
export type SNotificationPage = { items: SNotification[]; next_cursor: string | null; unread: number };

// ---- boards + stats -------------------------------------------------------------------------
export type SXpEntry = { rank: number; xp: number; user: SUser; hostel: string | null; is_me: boolean };
export type SXpBoard = { window: 'daily' | 'weekly'; day: string; entries: SXpEntry[]; me: SXpEntry | null; available: boolean };
export type SHostelEntry = { rank: number; hostel: string; xp: number; members: number; active: number; is_mine: boolean };
export type SHostelBoard = { window: 'daily' | 'weekly'; day: string; enabled: boolean; entries: SHostelEntry[]; available: boolean };
export type SDayStats = { day: string; active_members: number; runs: number; km: number; workouts: number };
export type SDailyStats = { timezone: string; today: SDayStats; me_today: { runs: number; km: number; workouts: number }; days: SDayStats[] };

// ---- media ------------------------------------------------------------------------------
export type SUploadTicket = { media_id: string; upload_url: string; method: 'PUT'; headers: Record<string, string>; expires_at: string };
export type SMedia = { media_id: string; status: 'pending' | 'ready'; url: string | null };

// ---- posts + feed -------------------------------------------------------------------------
export type SPost = {
  id: string;
  author: SUser;
  caption: string;
  activity: SActivity | null;
  city_id: string | null;
  area: string | null;
  backdrop: { scene: string; seed: number };
  media_url: string | null;
  sticker: string | null;
  crew_name: string | null;
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean;
  saved_by_me: boolean;
  is_mine: boolean;
  following_author: boolean;
  requested_author: boolean;
  created_at: string;
};
export type SFeed = { items: SPost[]; next_cursor: string | null };
export type SFeedKind = 'for_you' | 'following' | 'nearby';
export type SPostCreate = { caption?: string; backdrop?: { scene: string; seed: number }; sticker?: string | null; media_id?: string | null };
export type SComment = { id: string; post_id: string; author: SUser; body: string; created_at: string; can_delete: boolean };
export type SCommentPage = { items: SComment[]; next_cursor: string | null; total: number };
