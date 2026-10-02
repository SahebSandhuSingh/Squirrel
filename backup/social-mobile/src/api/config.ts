/**
 * Backend configuration. Set these in `mobile/.env` (see .env.example):
 *   EXPO_PUBLIC_API_URL   Run Module backend, e.g. https://api.squirrelsocial.in
 *   EXPO_PUBLIC_AUTH_URL  Account service that issues RS256 tokens (does not exist yet)
 *   EXPO_PUBLIC_EXERCISE_API_URL  Exercise Mechanics backend (FastAPI, routes under /api)
 *   EXPO_PUBLIC_SOCIAL_API_URL    Profile + Social service (social-backend/, routes under /v1).
 *                                 Defaults to EXPO_PUBLIC_API_URL: both can sit behind one gateway.
 * With no API URL the app runs in demo mode on the seed data in src/data/.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
export const AUTH_URL = (process.env.EXPO_PUBLIC_AUTH_URL ?? '').replace(/\/$/, '');
export const API_CONFIGURED = API_URL.length > 0;
export const AUTH_CONFIGURED = AUTH_URL.length > 0;
export const EXERCISE_API_URL = (process.env.EXPO_PUBLIC_EXERCISE_API_URL ?? '').replace(/\/$/, '');
export const EXERCISE_API_CONFIGURED = EXERCISE_API_URL.length > 0;
export const SOCIAL_API_URL = ((process.env.EXPO_PUBLIC_SOCIAL_API_URL ?? '') || API_URL).replace(/\/$/, '');
export const SOCIAL_API_CONFIGURED = SOCIAL_API_URL.length > 0;
