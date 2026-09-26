/**
 * Backend configuration. Set these in `mobile/.env` (see .env.example):
 *   EXPO_PUBLIC_API_URL           Run Module backend, e.g. https://api.squirrelsocial.in
 *   EXPO_PUBLIC_EXERCISE_API_URL  Exercise Mechanics backend (FastAPI, routes under /api)
 *   EXPO_PUBLIC_AUTH_URL          Where accounts live. Defaults to the Exercise backend, whose
 *                                 /api/auth issues the token both backends accept.
 * With no API URL the app runs in demo mode on the seed data in src/data/.
 */
const trim = (v: string | undefined) => (v ?? '').replace(/\/$/, '');

export const API_URL = trim(process.env.EXPO_PUBLIC_API_URL);
export const API_CONFIGURED = API_URL.length > 0;
export const EXERCISE_API_URL = trim(process.env.EXPO_PUBLIC_EXERCISE_API_URL);
export const EXERCISE_API_CONFIGURED = EXERCISE_API_URL.length > 0;
export const AUTH_URL = trim(process.env.EXPO_PUBLIC_AUTH_URL) || EXERCISE_API_URL;
export const AUTH_CONFIGURED = AUTH_URL.length > 0;
