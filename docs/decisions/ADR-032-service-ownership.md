# ADR-032: Which service owns each shared concept

| Field          | Value                                             |
|---------------|---------------------------------------------------|
| **Status**     | Accepted (table); open items listed at the end    |
| **Date**       | 2026-10-01                                        |
| **Scope**      | Exercise, Social, Run Module, campus-service, app |
| **Supersedes** | —                                                 |

## Context

An audit found users, crews, challenges, leaderboards and blocking each implemented in two or three
backends with separate databases, and no rule for which copy is the truth. The concrete harm so far:
blocks don't share state, so a person blocked in the app (Social) can still see you on the campus map,
in Nearby and in shared zones, and invite you to a meetup (campus-service checks only its own table).

Every new feature names its owner from this table before it is built. A service that needs a concept
it doesn't own **asks the owner** (service-to-service, internal token) and keeps at most a short-lived
cache — never its own editable copy.

Users are identified everywhere by the login `sub` (the Exercise account id). The app only ever sees
Social profile ids; services translate through Social (`POST /internal/v1/people/resolve`).

## Ownership

| Concept | Owner | Everyone else |
|---|---|---|
| Accounts, sign-in, tokens (email, codes, refresh, RS256 keys) | **Exercise** | Store only `sub`. Verify tokens with the public key / JWKS. |
| Public profile: name, username, avatar, hostel, bio | **Social** | Read through Social (campus-service already does). No own copy. |
| Private personal details: age/date of birth, gender, phone, height, weight, course, CGPA, emails | **Exercise** (proposed — see open item 1) | campus-service's `user_profile_details` (004) is to be migrated and removed. |
| Blocking | **Social** (`user_blocks`) | campus-service and Exercise (Partner Hunt) ask Social; their tables are migrated and removed. Checks **fail closed** (see below). |
| Crews (membership, vouching, crew events) | **Social** | campus-service reads membership from Social for crew territory (weekend war); its `crews` tables are retired. |
| XP — the one ledger, levels | **Run Module** (XP engine) | campus-service stops keeping `campus_xp` and reports claim / steal / defend awards to the Run Module. |
| Leaderboards | **The owner of the number**: XP and hostel boards from the Run Module (Social shows them); "zones held" boards from campus-service | No board recomputes another service's number. |
| Progress (XP history, daily rollups) | **Run Module** — absorbs the 8 endpoints the app calls on the planned progress-service | No separate progress-service is built. |
| Named zones, territory, GPS verification, map, presence, Active now, Open to Meet, heatmap, shared zones, meetups (+ post-meetup rating) | **campus-service** | — |
| Runs, GPS route points, run territory polygons | **Run Module** | campus-service receives a one-shot copy of a run's points for zone eligibility only. |
| Workouts, rep counting, coaching, Partner Hunt | **Exercise** | — |
| Feed, posts, follows, notifications, events, waitlist/referrals, Squirrel Dates, badges (incl. rules: Early Bird, Night Owl, Park Regular) | **Social** | — |
| Shared workouts ("workout with a partner") | **Exercise** (proposed — see open item 3) | — |

### "Challenges" is three features

They share a name, not a model. Each stays with its owner under its own name; the app may list them
together.

| Name | What | Owner |
|---|---|---|
| **Duels** | 1-vs-1: most verified km or most workouts in 1–30 days | Social (`social_challenges`) |
| **Goals** | A target (metric, comparator, threshold, window) with an XP reward | Run Module (`challenges`) |
| **Territory battles** | Zone race, territory, weekend war — the winner decided from territory state | campus-service (`challenges`) |

## Blocking contract

- Social exposes a dedicated internal route (not part of `people/resolve`): blocks must be fresh, have
  no side effects, and fail closed, while names may be minutes stale and fail open to a placeholder.
- `GET /internal/v1/blocks/{sub}` (service token) → `{ subject, blocked: [sub…], as_of }`: the full set of
  people blocked **in either direction** for one user. It never writes; a `sub` Social hasn't seen has
  none.
- Callers cache for at most 30 seconds. When Social can't be reached and no fresh answer is cached, the
  check **fails closed**: lists that filter people (Nearby, Active now, map players, shared zones) are
  returned empty with a reason, and actions between two people (meetup invite, challenge) are refused
  with a retryable 503. Fewer people shown, never a blocked person shown.
- During migration campus-service honours the union of Social's answer and its own `blocks` table;
  existing campus and Partner Hunt blocks are copied into Social once with
  `POST /internal/v1/blocks/import` (`{ blocks: [{ blocker, blocked }] }` by `sub`, safe to re-run),
  then the local tables are dropped.
- campus-service checks blocks wherever two people meet: meetups and their notifications, shared zones,
  Nearby, Active now, map players, a person's context, and territory battles.

## Order

1. Blocking (safety).
2. Private personal details: one home, campus-service's copy migrated and removed.
3. One XP ledger (with the progress-service endpoints moving into the Run Module).
4. Crews read from Social.
5. Challenges renamed in docs and app labels.

For each, the owner's side ships first; the consumer's side follows.

## Open items

1. **Private details owner.** Exercise is proposed: it owns the account and already holds age, gender,
   phone, height and weight from sign-up. campus-service's 004 is live with course, CGPA and two emails
   that Exercise lacks. Removal plan if accepted: Exercise adds the missing fields → the app's "About
   you" form talks to Exercise → existing campus rows are copied to Exercise once → campus `/v1/me`
   stops serving them → a later campus migration drops the table.
2. **Ambassador applications.** The app has the screens and no backend has the routes. Where the app
   sends them today: `/v1/ambassador/application` goes to `CAMPUS_API_URL`, which in production falls
   back to Social (`EXPO_PUBLIC_CAMPUS_API_URL` unset); campus-service only receives the methods listed in
   `CAMPUS_SERVICE_METHODS` (mobile-4 `src/api/campus/campusShapes.ts`). So Social needs no app code
   change (switch it on with `EXPO_PUBLIC_LIVE_ENDPOINTS=ambassador` or `BUILT`); campus-service needs
   `ambassador` and `applyAmbassador` added to that list. The same holds for meetups, post-meetup
   rating and `PATCH /v1/me` profile details, which also reach Social today. To be agreed with the app's
   owner before it is built.
3. **Shared workouts.** No backend in this repository implements either `/v1/workout-sessions` (what the
   app calls) or `/v1/shared-workouts`. Exercise is proposed: it already runs live coaching sockets and
   counts reps. If a deployed service serves `/v1/shared-workouts`, its source must be brought into
   this repository first.
4. **Push-up demo in the browser coach** predates sign-in: with sign-in required it cannot create an
   account (password, allowed email domain, token on later calls). Needs a decision: sign in first, or
   a guest mode.
