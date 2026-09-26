/**
 * Squirrel Social accounts (Exercise backend, /api/auth). One sign-in serves both backends: the
 * access token is a JWT signed with the secret the Run Module also verifies with, and its `sub`
 * is the account's UUID, which is also the Exercise user id.
 *
 *   POST /api/auth/register { email, password (≥ 8), first_name, last_name } → 201 TokenPair · 409 email taken
 *   POST /api/auth/login    { email, password }                              → TokenPair · 401
 *   POST /api/auth/refresh  { refresh_token }                                → TokenPair · 401 (single-use, rotates)
 */
import { ApiError, api } from '@/api/client';
import { AUTH_URL } from '@/api/config';

export type TokenPair = {
  user_id: string;
  token_type: 'bearer';
  access_token: string;
  access_token_expires_at: number;
  refresh_token: string;
  refresh_token_expires_at: number;
};

export type NewAccount = { email: string; password: string; first_name: string; last_name: string };

const auth = (path: string, body: unknown) => api<TokenPair>(`/api/auth${path}`, { body, base: AUTH_URL, anonymous: true });

/** Friendly wording for the sign-in screen; anything else keeps the server's own message. */
function explain(e: unknown, fallback: string): never {
  if (e instanceof ApiError) {
    if (e.status === 401) throw new Error('Wrong email or password.');
    if (e.status === 409) throw new Error('An account with this email already exists. Sign in instead.');
    if (e.status === 0) throw new Error("Can't reach the server. Check your connection and try again.");
    throw new Error(e.message || fallback);
  }
  throw e instanceof Error ? e : new Error(fallback);
}

export const accountApi = {
  login: (email: string, password: string) => auth('/login', { email, password }).catch((e) => explain(e, 'Sign-in failed.')),
  register: (account: NewAccount) => auth('/register', account).catch((e) => explain(e, 'Could not create the account.')),
  /** No friendly wording: a failed refresh just means "sign in again". */
  refresh: (refreshToken: string) => auth('/refresh', { refresh_token: refreshToken }),
};
