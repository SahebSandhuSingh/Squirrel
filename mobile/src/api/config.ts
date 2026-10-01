/**
 * Backend configuration. Set these in `mobile/.env` (see .env.example):
 *   EXPO_PUBLIC_API_URL   Run Module backend, e.g. https://api.squirrelsocial.in
 *   EXPO_PUBLIC_AUTH_URL  Separate account service (optional). Without it, sign-in uses the Exercise backend's
 *                         /api/auth (email code → register / login / refresh), whose tokens the Social service,
 *                         Run Module and progress-service also accept
 *   EXPO_PUBLIC_SOCIAL_API_URL    Social service (profiles, waitlist + referrals, crews, events, check-ins, feed,
 *                                 leaderboards, notifications + push, media)
 *   EXPO_PUBLIC_ALLOWED_EMAIL_DOMAINS  sign-up email domains, comma-separated (default iiserkol.ac.in)
 *   EXPO_PUBLIC_EXERCISE_API_URL  Exercise Mechanics backend (FastAPI, routes under /api)
 *   EXPO_PUBLIC_PROGRESS_API_URL  progress-service (XP, levels, progress, challenges, leaderboards; routes under /v1)
 *   EXPO_PUBLIC_CAMPUS_API_URL    campus social backend (zones, territories, crews, events, people…); defaults to EXPO_PUBLIC_API_URL
 *   EXPO_PUBLIC_CAMPUS_SERVICE_URL campus-service (routes under /v1): when set, it serves the map world — zones,
 *                                 territory + claim / steal / defend, activity → zones, map players + presence,
 *                                 Active now, Open to Meet, shared zones, heatmap — and meetups (+ rating), ahead of
 *                                 the Social service and the campus backend (api/campus/campusShapes.ts)
 *   EXPO_PUBLIC_REALTIME_URL      optional WebSocket for live updates (the backend's /v1/config can also provide it)
 * Only public URLs belong here. Never put server secrets or API keys in EXPO_PUBLIC_* variables.
 * A screen whose backend isn't configured shows a "not connected" / "not live yet" state. There is no
 * sample or seed data and no mock backend: everything shown comes from a real server.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
export const AUTH_URL = (process.env.EXPO_PUBLIC_AUTH_URL ?? '').replace(/\/$/, '');
export const API_CONFIGURED = API_URL.length > 0;
export const AUTH_CONFIGURED = AUTH_URL.length > 0;
export const EXERCISE_API_URL = (process.env.EXPO_PUBLIC_EXERCISE_API_URL ?? '').replace(/\/$/, '');
export const EXERCISE_API_CONFIGURED = EXERCISE_API_URL.length > 0;
export const PROGRESS_API_URL = (process.env.EXPO_PUBLIC_PROGRESS_API_URL ?? '').replace(/\/$/, '');
export const PROGRESS_API_CONFIGURED = PROGRESS_API_URL.length > 0;
const RAW_CAMPUS_URL = (process.env.EXPO_PUBLIC_CAMPUS_API_URL ?? '').replace(/\/$/, '');
/** Campus social backend. Same host as the Run Module unless configured separately. */
export const CAMPUS_API_URL = RAW_CAMPUS_URL || API_URL;
export const CAMPUS_API_CONFIGURED = CAMPUS_API_URL.length > 0;
/** campus-service base URL (no trailing slash; the app appends the /v1 paths itself, like the others). */
export const CAMPUS_SERVICE_URL = (process.env.EXPO_PUBLIC_CAMPUS_SERVICE_URL ?? '').replace(/\/$/, '');
export const CAMPUS_SERVICE_CONFIGURED = CAMPUS_SERVICE_URL.length > 0;
export const SOCIAL_API_URL = (process.env.EXPO_PUBLIC_SOCIAL_API_URL ?? '').replace(/\/$/, '');
export const SOCIAL_API_CONFIGURED = SOCIAL_API_URL.length > 0;
/** Sign-up is limited to these institutional domains (IISER Kolkata first). The backend enforces it too. */
export const ALLOWED_EMAIL_DOMAINS: string[] = (process.env.EXPO_PUBLIC_ALLOWED_EMAIL_DOMAINS ?? 'iiserkol.ac.in')
  .split(',')
  .map((d: string) => d.trim().toLowerCase().replace(/^@/, ''))
  .filter(Boolean);
export const REALTIME_URL = (process.env.EXPO_PUBLIC_REALTIME_URL ?? '').replace(/\/$/, '');
