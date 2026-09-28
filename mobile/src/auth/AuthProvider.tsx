import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { setApiToken } from '@/api/client';
import type { ExerciseUser } from '@/api/exercise';
import { jwtSubject } from '@/auth/jwt';
import { API_CONFIGURED, AUTH_CONFIGURED, AUTH_URL, CAMPUS_API_CONFIGURED, CAMPUS_MOCKS_ENABLED, PROGRESS_API_CONFIGURED } from '@/api/config';

/** Some backend that authenticates the bearer token is configured (Run Module, campus and/or progress-service). */
const BEARER_BACKEND = API_CONFIGURED || CAMPUS_API_CONFIGURED || PROGRESS_API_CONFIGURED;

/** Dev-mock sign-in code (only when there's no account service and the campus dev mock is on). */
const DEV_EMAIL_CODE = '246810';

/** Campus sign-up is limited to institutional emails. The backend enforces the exact domains. */
export const isAcademicEmail = (e: string) => /^[^\s@]+@([a-z0-9-]+\.)*[a-z0-9-]+\.ac\.in$/i.test(e.trim());

/**
 * Authentication. Every Run Module endpoint needs `Authorization: Bearer <token>` (RS256).
 * No account service exists yet (assessment §4.4 / §7.1), so:
 *  - with EXPO_PUBLIC_AUTH_URL set, sign-in POSTs email/password to `${AUTH_URL}/token`
 *    and expects `{ access_token }` — adjust to the real service's contract;
 *  - a developer can paste a token issued by hand (useful for testing against the backend);
 *  - otherwise the app runs in demo mode.
 */
type Mode = 'loading' | 'signed-out' | 'demo' | 'live';

type AuthState = {
  mode: Mode;
  email: string | null;
  /** Signed-in user's id (JWT `sub`), when live and the token carries one. */
  userId: string | null;
  apiConfigured: boolean;
  authConfigured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /**
   * Email-code sign-in for .ac.in addresses: start sends a code, verify exchanges it for a token.
   * Returns `devCode` only in the dev mock (no account service configured).
   */
  requestEmailCode: (email: string) => Promise<{ devCode?: string }>;
  verifyEmailCode: (email: string, code: string) => Promise<void>;
  signInWithToken: (token: string) => Promise<void>;
  continueDemo: () => void;
  signOut: () => Promise<void>;
  /**
   * Exercise Mechanics identity. That backend has no tokens: POST /api/users mints a user_id,
   * which is kept in the same secure store as the Run token and cleared on sign-out.
   */
  exerciseUser: ExerciseUser | null;
  setExerciseUser: (u: ExerciseUser | null) => Promise<void>;
};

const KEY = 'squirrel.auth.token';
const EMAIL_KEY = 'squirrel.auth.email';
const EXERCISE_KEY = 'squirrel.exercise.user';

const store = {
  get: async (k: string) => (Platform.OS === 'web' ? globalThis.localStorage?.getItem(k) ?? null : SecureStore.getItemAsync(k)),
  set: async (k: string, v: string) => (Platform.OS === 'web' ? globalThis.localStorage?.setItem(k, v) : SecureStore.setItemAsync(k, v)),
  del: async (k: string) => (Platform.OS === 'web' ? globalThis.localStorage?.removeItem(k) : SecureStore.deleteItemAsync(k)),
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [exerciseUser, setExerciseUserState] = useState<ExerciseUser | null>(null);

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
        if (t && BEARER_BACKEND) {
          setApiToken(t);
          setUserId(jwtSubject(t));
          setEmail(e);
          setMode('live');
        } else setMode('signed-out');
      } catch {
        setMode('signed-out');
      }
    })();
  }, []);

  const signInWithToken = useCallback(async (t: string) => {
    await store.set(KEY, t);
    setApiToken(t);
    setUserId(jwtSubject(t));
    setMode('live');
  }, []);

  const signIn = useCallback(
    async (em: string, password: string) => {
      if (!AUTH_CONFIGURED) throw new Error('No account service is configured yet. Continue in demo mode, or paste a developer token.');
      const res = await fetch(`${AUTH_URL}/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em, password }) });
      if (!res.ok) throw new Error(res.status === 401 ? 'Wrong email or password.' : `Sign-in failed (${res.status}).`);
      const { access_token } = (await res.json()) as { access_token?: string };
      if (!access_token) throw new Error('Sign-in response had no access_token.');
      await store.set(EMAIL_KEY, em);
      setEmail(em);
      await signInWithToken(access_token);
    },
    [signInWithToken],
  );

  // ASSUMPTION: account-service routes for email codes (POST /email/start, POST /email/verify →
  // { access_token }). Adjust here when the real contract lands.
  const requestEmailCode = useCallback(async (em: string) => {
    if (!isAcademicEmail(em)) throw new Error('Use your institute email (it ends in .ac.in).');
    if (AUTH_CONFIGURED) {
      const res = await fetch(`${AUTH_URL}/email/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em.trim() }) });
      if (res.status === 403 || res.status === 422) throw new Error('That email isn’t on the campus list yet.');
      if (!res.ok) throw new Error(`Couldn’t send the code (${res.status}).`);
      return {};
    }
    if (CAMPUS_MOCKS_ENABLED) return { devCode: DEV_EMAIL_CODE };
    throw new Error('No account service is connected yet. Explore the demo for now.');
  }, []);

  const verifyEmailCode = useCallback(
    async (em: string, code: string) => {
      if (AUTH_CONFIGURED) {
        const res = await fetch(`${AUTH_URL}/email/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em.trim(), code: code.trim() }) });
        if (res.status === 400 || res.status === 401) throw new Error('That code didn’t work. Check it and try again.');
        if (!res.ok) throw new Error(`Sign-in failed (${res.status}).`);
        const { access_token } = (await res.json()) as { access_token?: string };
        if (!access_token) throw new Error('Sign-in response had no access_token.');
        await store.set(EMAIL_KEY, em.trim());
        setEmail(em.trim());
        await signInWithToken(access_token);
        return;
      }
      if (CAMPUS_MOCKS_ENABLED) {
        if (code.trim() !== DEV_EMAIL_CODE) throw new Error('That code didn’t work. (Dev code: 246810)');
        setEmail(em.trim());
        setMode('demo'); // dev mock session: no real token exists
        return;
      }
      throw new Error('No account service is connected yet.');
    },
    [signInWithToken],
  );

  const signOut = useCallback(async () => {
    await Promise.all([store.del(KEY), store.del(EMAIL_KEY), store.del(EXERCISE_KEY)]);
    setExerciseUserState(null);
    setApiToken(null);
    setUserId(null);
    setEmail(null);
    setMode('signed-out');
  }, []);

  const setExerciseUser = useCallback(async (u: ExerciseUser | null) => {
    if (u) await store.set(EXERCISE_KEY, JSON.stringify({ user_id: u.user_id, first_name: u.first_name, last_name: u.last_name }));
    else await store.del(EXERCISE_KEY);
    setExerciseUserState(u);
  }, []);

  return (
    <Ctx.Provider value={{ mode, email, userId, apiConfigured: BEARER_BACKEND, authConfigured: AUTH_CONFIGURED, signIn, requestEmailCode, verifyEmailCode, signInWithToken, continueDemo: () => setMode('demo'), signOut, exerciseUser, setExerciseUser }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside <AuthProvider>');
  return c;
}
