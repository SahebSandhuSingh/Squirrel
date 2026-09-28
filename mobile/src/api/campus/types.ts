/**
 * Campus social backend — typed contract (users, zones, territories, activity → zone
 * interactions, crews, events, discovery, challenge invites, leaderboards, meetups, badges).
 *
 * Wire format follows the Run Module's conventions: routes under /v1, snake_case fields,
 * ISO-8601 timestamps, `next_cursor` pagination, errors as `{ code?, detail | message }`.
 * These types ARE the contract the screens consume; if the backend ships a different shape,
 * adapt it in api/campus/http.ts rather than in components.
 *
 * Territory model (never conflate these):
 *   RUN        a GPS route (Run Module owns it)
 *   ZONE       a fixed, named area of campus (Narmada Hostel, CC1, Library…)
 *   TERRITORY  the ownership state of one zone
 * A run *interacts* with zones; the backend decides eligibility; the user claims/steals/defends.
 * Crossing a zone never changes ownership by itself.
 */

/** [lat, lng] in WGS84. */
export type LatLng = [number, number];

// ---------------------------------------------------------------------------
// Campus, config, stats
// ---------------------------------------------------------------------------

export type Campus = {
  id: string;
  name: string; // "IISER Kolkata"
  short_name: string; // "IISER K"
  /** Sign-up is limited to these institutional domains, e.g. ["iiserkol.ac.in"]. */
  email_domains: string[];
  center: LatLng;
  launched_at: string | null;
};

export type LaunchStats = {
  users_total: number;
  users_active_now: number;
  zones_total: number;
  zones_claimed: number;
  crews_total: number;
  /** Founding Squirrel spots left, when the backend runs that programme; null otherwise. */
  founding_spots_left: number | null;
  updated_at: string;
};

export type SafetyRequirement = { id: string; label: string; description?: string };

export type AppConfig = {
  campus: Campus;
  features: {
    create_crew: boolean;
    create_event: boolean;
    defend: boolean;
    open_to_meet: boolean;
    /**
     * Date Mode is enabled only when the backend says its safety stack is live
     * (reporting, blocking, verification…). The screen existing is NOT enough.
     */
    date_mode: { available: boolean; reason: string | null; requirements: SafetyRequirement[] };
    meetup_safety_notifications: boolean;
  };
  /** WebSocket endpoint for live updates; null → the app refreshes on focus. */
  realtime_url: string | null;
};

// ---------------------------------------------------------------------------
// People & profiles
// ---------------------------------------------------------------------------

export type ConnectionMode = 'date' | 'friends' | 'crew';

export type PersonLite = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  hostel: string | null;
};

export type Verification = {
  email_verified: boolean;
  email_domain: string | null;
  student_verified: boolean;
  phone_verified: boolean;
  selfie_verified: boolean;
};

export type ProfileStats = {
  total_distance_m: number;
  month_distance_m: number;
  zones_claimed: number;
  territories_defended: number;
  territories_stolen: number;
  crew_memberships: number;
  events_attended: number;
  /** null when the backend doesn't compute streaks. */
  streak_days: number | null;
};

export type ActivityType = 'run' | 'walk';

export type ActivityHistoryItem = {
  id: string;
  type: ActivityType;
  started_at: string;
  distance_m: number;
  duration_s: number;
  zones_count: number;
  status: 'verified' | 'flagged' | 'rejected' | 'processing';
};

export type OwnedTerritory = { zone_id: string; zone_name: string; claimed_at: string; defended_count: number };

export type CrewLite = { id: string; name: string; color: string | null; icon: string | null; role?: 'owner' | 'admin' | 'member' };

export type Profile = PersonLite & {
  bio: string | null;
  connection_mode: ConnectionMode | null;
  open_to_meet: boolean;
  verification: Verification;
  stats: ProfileStats;
  territories: OwnedTerritory[];
  crews: CrewLite[];
  badges: Badge[];
  recent_activities: ActivityHistoryItem[];
  joined_at: string;
  founding_member: boolean;
};

/** The signed-in user: the public profile plus private settings. */
export type Me = Profile & {
  email: string | null;
  hostel_zone_id: string | null;
  date_mode_enabled: boolean;
  onboarding_completed: boolean;
  safety_contact_configured: boolean;
};

export type MePatch = Partial<{
  display_name: string;
  bio: string;
  connection_mode: ConnectionMode;
  hostel_zone_id: string;
  onboarding_completed: boolean;
  date_mode_enabled: boolean;
}>;

export type OpenToMeet = { enabled: boolean; updated_at: string; visible_until: string | null };

export type Icebreaker = {
  id: string;
  text: string; // rendered verbatim — the backend writes it from real shared data
  kind: 'shared_zone' | 'shared_route' | 'shared_crew' | 'shared_event' | 'challenge' | (string & {});
  zone_id?: string | null;
  crew_id?: string | null;
  /** When present, the chip offers this action (e.g. open a challenge for zone X). */
  action?: { type: 'challenge'; zone_id: string | null } | null;
};

export type SharedContext = {
  shared_zones: { zone_id: string; zone_name: string; relation: 'both_claim' | 'both_ran' | 'you_own_they_ran' | 'they_own_you_ran' | (string & {}) }[];
  shared_crews: CrewLite[];
  shared_events: { event_id: string; title: string }[];
  icebreakers: Icebreaker[];
};

/** A discovery card (Friend Mode, Date Mode, Active Now). Activity-first — never photo-first. */
export type PersonCard = PersonLite & {
  connection_mode: ConnectionMode | null;
  bio: string | null;
  activity: { top_activity: ActivityType | null; runs_30d: number; distance_30d_m: number; usual_time: 'morning' | 'evening' | 'night' | null };
  shared: SharedContext;
  /** One-line reason from the backend ("You both run the Sports Ground Loop"). */
  match_reason: string | null;
  /** Date Mode only: backend-suggested low-pressure activities. */
  suggested_activities?: string[];
};

/** Coarse proximity only — never coordinates, never another person's zone. */
export type Proximity = 'very_close' | 'nearby' | 'on_campus';

export type ActivePerson = {
  person: PersonCard;
  activity: { type: ActivityType | 'workout' | 'event'; started_at: string } | null;
  proximity: Proximity | null;
};

export type ActiveNow = { active_now: number; active: ActivePerson[]; nearby: ActivePerson[]; as_of: string };

// ---------------------------------------------------------------------------
// Zones & territory
// ---------------------------------------------------------------------------

export type ZoneKind = 'hostel' | 'academic' | 'sports' | 'food' | 'library' | 'landmark';

export type Zone = {
  id: string;
  name: string;
  short_name: string | null;
  kind: ZoneKind;
  /** Closed ring, [lat, lng]. */
  polygon: LatLng[];
  /** Label anchor. */
  centroid: LatLng;
  /** For hostel zones: the hostel team it belongs to (Hostel vs Hostel). */
  hostel: string | null;
};

export type Territory = {
  zone_id: string;
  owner: PersonLite | null;
  crew: CrewLite | null;
  claimed_at: string | null;
  defended_count: number;
  last_defended_at: string | null;
  /** Someone is eligible to steal it right now / an attack is open. */
  under_challenge: boolean;
  /** Can't be stolen before this time (fresh claims get a shield). */
  shield_until: string | null;
  /** Monotonic per zone; the client keeps the highest version it has seen. */
  version: number;
  updated_at: string;
};

export type ActionAvailability = { allowed: boolean; code: string | null; reason: string | null; expires_at: string | null };
export type ZoneActions = { claim: ActionAvailability; steal: ActionAvailability; defend: ActionAvailability };

export type TerritoryEventType = 'claimed' | 'stolen' | 'defended' | 'released' | 'decayed';
export type TerritoryEvent = { id: string; type: TerritoryEventType; actor: PersonLite | null; previous_owner: PersonLite | null; at: string };

export type ZoneStats = { runs_7d: number; visitors_7d: number; my_visits_7d: number; distance_7d_m: number };

export type ZoneDetail = { zone: Zone; territory: Territory; actions: ZoneActions; stats: ZoneStats; history: TerritoryEvent[] };

export type TerritoryAction = 'claim' | 'steal' | 'defend';
export type TerritoryActionResult = { territory: Territory; actions: ZoneActions; event: TerritoryEvent | null };

// ---------------------------------------------------------------------------
// Activities → zone interactions
// ---------------------------------------------------------------------------

export type ZoneInteraction = {
  zone_id: string;
  zone_name: string;
  interaction: 'passed_through' | 'looped' | 'visited';
  distance_in_zone_m: number;
  time_in_zone_s: number;
  territory: Territory;
  actions: ZoneActions;
};

export type ActivityZones = {
  activity_id: string;
  /** 'processing' → verification not finished; poll again later. */
  status: 'processing' | 'verified' | 'flagged' | 'rejected';
  zones: ZoneInteraction[];
};

export type ActivityPoint = { lat: number; lng: number; recorded_at: string; accuracy_m: number };
export type ActivitySubmit = { type: ActivityType; started_at: string; ended_at: string; points: ActivityPoint[] };

// ---------------------------------------------------------------------------
// Crews & events
// ---------------------------------------------------------------------------

export type Crew = CrewLite & {
  description: string | null;
  members_count: number;
  territories_count: number;
  meets: string | null;
  tags: string[];
  my_membership: 'owner' | 'admin' | 'member' | null;
  joinable: boolean;
};

export type CrewDetail = Crew & {
  members: PersonLite[];
  territories: OwnedTerritory[];
  upcoming_events: EventSummary[];
};

export type CrewCreate = { name: string; description: string; color?: string; icon?: string };

export type EventType = 'run' | 'walk' | 'territory_battle' | 'weekend_war' | 'social' | (string & {});

export type EventSummary = {
  id: string;
  title: string;
  type: EventType;
  starts_at: string;
  ends_at: string | null;
  location: { name: string; zone_id: string | null };
  host: { type: 'crew' | 'user' | 'squirrel'; id: string; name: string };
  participants_count: number;
  capacity: number | null;
  my_rsvp: 'going' | null;
  territory_challenge: { zone_ids: string[]; summary: string; reward_xp: number | null } | null;
};

export type EventDetail = EventSummary & {
  description: string | null;
  participants: PersonLite[];
  rsvp_open: boolean;
  meetup_id: string | null;
};

// ---------------------------------------------------------------------------
// Challenge invites
// ---------------------------------------------------------------------------

export type ChallengeTypeInfo = {
  id: 'territory' | 'weekend_war' | 'zone_race' | 'group_activity' | (string & {});
  label: string;
  description: string;
  requires_zone: boolean;
  targets: ('user' | 'crew')[];
};

export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'active' | 'completed';

export type ChallengeInvite = {
  id: string;
  type: ChallengeTypeInfo['id'];
  type_label: string;
  from: PersonLite;
  target: { type: 'user'; person: PersonLite } | { type: 'crew'; crew: CrewLite };
  zone: { id: string; name: string } | null;
  starts_at: string;
  message: string | null;
  status: InviteStatus;
  direction: 'incoming' | 'outgoing';
  created_at: string;
  result: { winner: PersonLite | CrewLite | null; summary: string } | null;
};

export type ChallengeInviteCreate = {
  type: ChallengeTypeInfo['id'];
  target: { type: 'user' | 'crew'; id: string };
  zone_id: string | null;
  starts_at: string;
  message?: string;
};

// ---------------------------------------------------------------------------
// Leaderboards
// ---------------------------------------------------------------------------

export type LeaderboardPeriod = 'daily' | 'weekly' | 'alltime';

export type SquirrelRow = PersonLite & { rank: number; xp: number; zones_claimed: number; distance_m: number | null };
export type SquirrelBoard = { period: LeaderboardPeriod; entries: SquirrelRow[]; me: SquirrelRow | null; updated_at: string };

export type HostelRow = { rank: number; hostel_id: string; name: string; score: number; territories: number; active_members: number; distance_m: number | null };
export type HostelBoard = { period: LeaderboardPeriod; entries: HostelRow[]; my_hostel_id: string | null; updated_at: string };

// ---------------------------------------------------------------------------
// Meetups & badges
// ---------------------------------------------------------------------------

export type Meetup = {
  id: string;
  title: string;
  starts_at: string;
  location: { name: string; zone_id: string | null };
  event_id: string | null;
  attendees: (PersonLite & { checked_in: boolean })[];
  my_check_in_at: string | null;
  check_in_opens_at: string;
  check_in_closes_at: string;
};

export type SafetyNotification = {
  requested: boolean;
  /** Only 'sent' means the backend confirmed delivery to the safety contact. */
  status: 'sent' | 'failed' | 'not_configured' | 'skipped';
  contact_label: string | null;
};

export type CheckInResult = { meetup_id: string; checked_in_at: string; safety_notification: SafetyNotification };

export type Badge = {
  id: 'early_bird' | 'night_owl' | 'park_regular' | 'founding_squirrel' | (string & {});
  name: string;
  description: string;
  unlocked: boolean;
  unlocked_at: string | null;
  /** null when the badge has no measurable progress. */
  progress: { current: number; target: number } | null;
};

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

export type RealtimeMessage =
  | { type: 'territory.updated'; data: Territory }
  | { type: 'stats.updated'; data: LaunchStats }
  | { type: 'invite.updated'; data: ChallengeInvite }
  | { type: 'event.updated'; data: { event_id: string; participants_count: number } }
  | { type: 'active.updated'; data: { active_now: number } };

// ---------------------------------------------------------------------------
// The service interface both implementations satisfy
// ---------------------------------------------------------------------------

export type Page<T> = { items: T[]; next_cursor: string | null };

export interface CampusApi {
  config(): Promise<AppConfig>;
  stats(): Promise<LaunchStats>;

  me(): Promise<Me>;
  updateMe(patch: MePatch): Promise<Me>;
  setOpenToMeet(enabled: boolean): Promise<OpenToMeet>;
  profile(userId: string): Promise<Profile>;
  sharedContext(userId: string): Promise<SharedContext>;
  badges(): Promise<Badge[]>;

  zones(): Promise<Zone[]>;
  territories(): Promise<{ territories: Territory[]; as_of: string }>;
  zone(zoneId: string): Promise<ZoneDetail>;
  territoryAction(zoneId: string, action: TerritoryAction, idempotencyKey: string): Promise<TerritoryActionResult>;

  /** Used when the Run Module isn't the recorder (dev mock); live runs go through /v1/runs. */
  submitActivity(input: ActivitySubmit): Promise<{ activity_id: string }>;
  activityZones(activityId: string): Promise<ActivityZones>;

  crews(params: { q?: string; scope?: 'all' | 'mine' }): Promise<Page<Crew>>;
  crew(crewId: string): Promise<CrewDetail>;
  joinCrew(crewId: string): Promise<Crew>;
  leaveCrew(crewId: string): Promise<Crew>;
  createCrew(input: CrewCreate): Promise<Crew>;

  events(params: { scope?: 'upcoming' | 'mine' }): Promise<Page<EventSummary>>;
  event(eventId: string): Promise<EventDetail>;
  rsvp(eventId: string, going: boolean): Promise<EventDetail>;

  suggestedPeople(mode: 'friends' | 'date'): Promise<PersonCard[]>;
  activeNow(): Promise<ActiveNow>;

  challengeTypes(): Promise<ChallengeTypeInfo[]>;
  invites(box: 'incoming' | 'outgoing' | 'all'): Promise<ChallengeInvite[]>;
  createInvite(input: ChallengeInviteCreate): Promise<ChallengeInvite>;
  respondInvite(inviteId: string, action: 'accept' | 'decline' | 'cancel'): Promise<ChallengeInvite>;

  squirrelBoard(period: LeaderboardPeriod, limit?: number): Promise<SquirrelBoard>;
  hostelBoard(period: LeaderboardPeriod): Promise<HostelBoard>;

  meetups(): Promise<Meetup[]>;
  meetup(meetupId: string): Promise<Meetup>;
  checkIn(meetupId: string, notifySafetyContact: boolean): Promise<CheckInResult>;
}
