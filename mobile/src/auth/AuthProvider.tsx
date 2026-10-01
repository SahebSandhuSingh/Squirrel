import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { setApiToken } from '@/api/client';
import type { ExerciseUser } from '@/api/exercise';
import { jwtExpiry, jwtSubject } from '@/auth/jwt';
import { socialApi } from '@/api/social';
import { ALLOWED_EMAIL_DOMAINS, API_CONFIGURED, AUTH_CONFIGURED, AUTH_URL, CAMPUS_API_CONFIGURED, EXERCISE_API_CONFIGURED, EXERCISE_API_URL, PROGRESS_API_CONFIGURED, SOCIAL_API_CONFIGURED } from '@/api/config';

/**
 * Where accounts live. A separate account service (EXPO_PUBLIC_AUTH_URL) wins; otherwise the
 * Exercise backend's /api/auth issues the tokens — the Social service, Run Module and
 * progress-service all accept them.
 */
const ACCOUNTS: 'custom' | 'exercise' | null = AUTH_CONFIGURED ? 'custom' : EXERCISE_API_CONFIGURED ? 'exercise' : null;

/** Some backend that authenticates the bearer token is configured. */
const BEARER_BACKEND = API_CONFIGURED || CAMPUS_API_CONFIGURED || PROGRESS_API_CONFIGURED || SOCIAL_API_CONFIGURED || ACCOUNTS !== null;

/** Sign-up is limited to the campus's email domains (IISER Kolkata: iiserkol.ac.in). The backend enforces it too. */
export const isCampusEmail = (e: string) => {
  const m = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/.exec(e.trim().toLowerCase());
  return !!m && ALLOWED_EMAIL_DOMAINS.some((d) => m[1] === d || m[1].endsWith(`.${d}`));
};
/** @deprecated kept for older callers; same check as isCampusEmail. */
export const isAcademicEmail = isCampusEmail;
export const campusDomainsText = ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(' or ');

/**
 * Authentication. Every backend needs `Authorization: Bearer <token>`.
 *  - Exercise accounts (default): POST /api/auth/email-code → /register {email, code, password,
 *    first_name, last_name}; /login {email, password}; /refresh {refresh_token}. The access token
 *    is refreshed shortly before it expires and at start-up.
 *  - EXPO_PUBLIC_AUTH_URL: `${AUTH_URL}/token`, /email/start, /email/verify (adjust when it lands).
 *  - a developer can paste a token issued by hand;
 *  - otherwise you can look around signed out ('demo'): screens then show sign-in / not-connected
 *    states — never sample data.
 */
type Mode = 'loading' | 'signed-out' | 'demo' | 'live';

export type RegisterInput = { email: string; code: string; password: string; firstName: string; lastName: string };

type AuthState = {
  mode: Mode;
  email: string | null;
  /** Signed-in user's id (JWT `sub`), when live and the token carries one. */
  userId: string | null;
  apiConfigured: boolean;
  authConfigured: boolean;
  /** Which account service handles sign-in, if any. */
  accounts: 'custom' | 'exercise' | null;
  signIn: (email: string, password: string) => Promise<void>;
  /** Sends a 6-digit code to a campus address. Rejects with `AccountExistsError` when the email already has an account. */
  requestEmailCode: (email: string) => Promise<void>;
  /** Exercise accounts: create the account with the emailed code. */
  register: (input: RegisterInput) => Promise<void>;
  /** Custom account service only: exchange the emailed code for a token. */
  verifyEmailCode: (email: string, code: string) => Promise<void>;
  signInWithToken: (token: string) => Promise<void>;
  continueDemo: () => void;
  signOut: () => Promise<void>;
  /**
   * Exercise Mechanics coach profile id (POST /api/users), kept in the same secure store as the
   * token and cleared on sign-out.
   */
  exerciseUser: ExerciseUser | null;
  setExerciseUser: (u: ExerciseUser | null) => Promise<void>;
};

export class AccountExistsError extends Error {
  constructor() {
    super('You already have an account with this email. Sign in with your password.');
    this.name = 'AccountExistsError';
  }
}

const KEY = 'squirrel.auth.token';
const REFRESH_KEY = 'squirrel.auth.refresh';
const EMAIL_KEY = 'squirrel.auth.email';
const EXERCISE_KEY = 'squirrel.exercise.user';

const store = {
  get: async (k: string) => (Platform.OS === 'web' ? globalThis.localStorage?.getItem(k) ?? null : SecureStore.getItemAsync(k)),
  set: async (k: string, v: string) => (Platform.OS === 'web' ? globalThis.localStorage?.setItem(k, v) : SecureStore.setItemAsync(k, v)),
  del: async (k: string) => (Platform.OS === 'web' ? globalThis.localStorage?.removeItem(k) : SecureStore.deleteItemAsync(k)),
};

type TokenPair = { access_token: string; refresh_token?: string; access_token_expires_at?: number };

/** POST to the Exercise backend's /api/auth; turns its errors into sentences people can act on. */
async function exerciseAuth(path: string, body: object): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${EXERCISE_API_URL}/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('Can’t reach the account service. Check your connection and try again.');
  }
  if (res.ok) return res;
  const detail = await res
    .json()
    .then((b: { detail?: unknown }) => (typeof b.detail === 'string' ? b.detail : null))
    .catch(() => null);
  if (res.status === 409) throw new AccountExistsError();
  if (res.status === 403) throw new Error(detail ?? `Sign-up is open to ${campusDomainsText} addresses only.`);
  if (res.status === 401) throw new Error(path === 'refresh' ? 'Your session expired. Sign in again.' : 'Wrong email or password.');
  if (res.status === 429) throw new Error(detail ?? 'Too many tries. Wait a minute and try again.');
  if (res.status === 400) throw new Error(detail ?? 'That code didn’t work. Check it, or ask for a new one.');
  if (res.status === 422) throw new Error(detail ?? 'Check the details and try again.');
  throw new Error(detail ?? `Something went wrong (${res.status}).`);
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [exerciseUser, setExerciseUserState] = useState<ExerciseUser | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set below; the timer calls through the ref so `adopt` and the refresh don't depend on each other. */
  const refreshRef = useRef<() => Promise<boolean>>(async () => false);

  const clearSession = useCallback(async () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = null;
    await Promise.all([store.del(KEY), store.del(REFRESH_KEY), store.del(EMAIL_KEY), store.del(EXERCISE_KEY)]);
    setExerciseUserState(null);
    setApiToken(null);
    setUserId(null);
    setEmail(null);
  }, []);

  /** Use an access token now, and (Exercise accounts) refresh it a minute before it expires. */
  const adopt = useCallback(
    async (pair: TokenPair) => {
      await store.set(KEY, pair.access_token);
      if (pair.refresh_token) await store.set(REFRESH_KEY, pair.refresh_token);
      setApiToken(pair.access_token);
      setUserId(jwtSubject(pair.access_token));
      setMode('live');
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      const exp = pair.access_token_expires_at ?? jwtExpiry(pair.access_token);
      if (ACCOUNTS === 'exercise' && exp) {
        const wait = Math.max(5_000, exp * 1000 - Date.now() - 60_000);
        // setTimeout overflows past ~24.8 days; tokens never live that long, but stay safe.
        refreshTimer.current = setTimeout(() => void refreshRef.current(), Math.min(wait, 2 ** 31 - 1));
      }
    },
    [],
  );

  const refreshNow = useCallback(async (): Promise<boolean> => {
    const rt = await store.get(REFRESH_KEY);
    if (!rt || ACCOUNTS !== 'exercise') return false;
    try {
      const pair = (await (await exerciseAuth('refresh', { refresh_token: rt })).json()) as TokenPair;
      await adopt(pair);
      return true;
    } catch (e) {
      // Only a rejected refresh token ends the session; a network blip retries at the next start.
      if (e instanceof Error && /expired/i.test(e.message)) {
        await clearSession();
        setMode('signed-out');
      }
      return false;
    }
  }, [adopt, clearSession]);
  useEffect(() => {
    refreshRef.current = refreshNow;
  }, [refreshNow]);

  useEffect(() => {
    (async () => {
      try {
        const [t, e, x] = await Promise.all([store.get(KEY), store.get(EMAIL_KEY), store.get(EXERCISE_KEY)]);
        try {
          const parsed = x ? (JSON.parse(x) as Partial<ExerciseUser>) : null;
          if (parsed?.user_id && parsed.first_name) setExerciseUserState(parsed as ExerciseUser);
        } catch {
          // corrupt cache: treat as no exercise profile
        }
        if (!t || !BEARER_BACKEND) return setMode('signed-out');
        setEmail(e);
        const exp = jwtExpiry(t);
        if (exp && exp * 1000 < Date.now() + 30_000 && (await refreshNow())) return;
        await adopt({ access_token: t });
      } catch {
        setMode('signed-out');
      }
    })();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [adopt, refreshNow]);

  const signInWithToken = useCallback(async (t: string) => adopt({ access_token: t }), [adopt]);

  const remember = async (em: string) => {
    await store.set(EMAIL_KEY, em);
    setEmail(em);
  };

  const signIn = useCallback(
    async (raw: string, password: string) => {
      const em = raw.trim();
      if (ACCOUNTS === 'exercise') {
        const pair = (await (await exerciseAuth('login', { email: em, password })).json()) as TokenPair;
        await remember(em);
        return adopt(pair);
      }
      if (ACCOUNTS !== 'custom') throw new Error('No account service is connected yet. Look around without signing in for now.');
      const res = await fetch(`${AUTH_URL}/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em, password }) });
      if (!res.ok) throw new Error(res.status === 401 ? 'Wrong email or password.' : `Sign-in failed (${res.status}).`);
      const { access_token } = (await res.json()) as { access_token?: string };
      if (!access_token) throw new Error('Sign-in response had no access_token.');
      await remember(em);
      await adopt({ access_token });
    },
    [adopt],
  );

  const requestEmailCode = useCallback(async (raw: string) => {
    const em = raw.trim();
    if (!isCampusEmail(em)) throw new Error(`Use your campus email (${campusDomainsText}).`);
    if (ACCOUNTS === 'exercise') {
      await exerciseAuth('email-code', { email: em });
      return;
    }
    if (ACCOUNTS === 'custom') {
      // ASSUMPTION: account-service routes POST /email/start, POST /email/verify → { access_token }.
      const res = await fetch(`${AUTH_URL}/email/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em }) });
      if (res.status === 403 || res.status === 422) throw new Error('That email isn’t on the campus list yet.');
      if (!res.ok) throw new Error(`Couldn’t send the code (${res.status}).`);
      return;
    }
    throw new Error('No account service is connected yet, so sign-in codes can’t be sent.');
  }, []);

  const register = useCallback(
    async ({ email: raw, code, password, firstName, lastName }: RegisterInput) => {
      if (ACCOUNTS !== 'exercise') throw new Error('Account creation needs the account service.');
      const em = raw.trim();
      const pair = (await (await exerciseAuth('register', { email: em, code: code.trim(), password, first_name: firstName.trim(), last_name: lastName.trim() })).json()) as TokenPair;
      await remember(em);
      await adopt(pair);
      // The Social profile starts as "New Squirrel"; give it the name you just entered.
      if (SOCIAL_API_CONFIGURED) await socialApi.updateMyProfile({ display_name: `${firstName.trim()} ${lastName.trim()}`.slice(0, 50) }).catch(() => null);
    },
    [adopt],
  );

  const verifyEmailCode = useCallback(
    async (raw: string, code: string) => {
      if (ACCOUNTS !== 'custom') throw new Error('Finish creating your account with a password.');
      const em = raw.trim();
      const res = await fetch(`${AUTH_URL}/email/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em, code: code.trim() }) });
      if (res.status === 400 || res.status === 401) throw new Error('That code didn’t work. Check it and try again.');
      if (!res.ok) throw new Error(`Sign-in failed (${res.status}).`);
      const { access_token } = (await res.json()) as { access_token?: string };
      if (!access_token) throw new Error('Sign-in response had no access_token.');
      await remember(em);
      await adopt({ access_token });
    },
    [adopt],
  );

  const signOut = useCallback(async () => {
    await clearSession();
    setMode('signed-out');
  }, [clearSession]);

  const setExerciseUser = useCallback(async (u: ExerciseUser | null) => {
    if (u) await store.set(EXERCISE_KEY, JSON.stringify({ user_id: u.user_id, first_name: u.first_name, last_name: u.last_name }));
    else await store.del(EXERCISE_KEY);
    setExerciseUserState(u);
  }, []);

  return (
    <Ctx.Provider
      value={{ mode, email, userId, apiConfigured: BEARER_BACKEND, authConfigured: ACCOUNTS !== null, accounts: ACCOUNTS, signIn, requestEmailCode, register, verifyEmailCode, signInWithToken, continueDemo: () => setMode('demo'), signOut, exerciseUser, setExerciseUser }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside <AuthProvider>');
  return c;
}
