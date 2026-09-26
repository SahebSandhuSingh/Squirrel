import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { setApiToken, setTokenRefresher } from '@/api/client';
import { API_CONFIGURED, AUTH_CONFIGURED, EXERCISE_API_CONFIGURED } from '@/api/config';
import { exerciseApi, type ExerciseUser } from '@/api/exercise';
import { accountApi, type NewAccount, type TokenPair } from '@/auth/account';
import { jwtSubject } from '@/auth/jwt';

/**
 * Authentication. One Squirrel Social account (Exercise backend, /api/auth) signs in to both
 * backends: the Run Module accepts the same bearer token, and the Exercise backend serves
 * /api/users/{id}/... only to that account. Tokens live in SecureStore (localStorage on web).
 * The 15-minute access token is refreshed automatically (api/client.ts) with the stored
 * single-use refresh token. A developer can still paste a hand-issued token, or use demo mode.
 */
type Mode = 'loading' | 'signed-out' | 'demo' | 'live';

type AuthState = {
  mode: Mode;
  email: string | null;
  /** Signed-in account id (the token's `sub`, a UUID). */
  userId: string | null;
  apiConfigured: boolean;
  authConfigured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (account: NewAccount) => Promise<void>;
  signInWithToken: (token: string) => Promise<void>;
  continueDemo: () => void;
  signOut: () => Promise<void>;
  /** The signed-in account as the form coach sees it (null when signed out or not configured). */
  exerciseUser: ExerciseUser | null;
};

const KEY = 'squirrel.auth.token';
const REFRESH_KEY = 'squirrel.auth.refresh';
const EMAIL_KEY = 'squirrel.auth.email';
const NAME_KEY = 'squirrel.auth.name';
/** Pre-account builds stored a bare coach id here, which anyone could link. Removed on launch. */
const LEGACY_EXERCISE_KEY = 'squirrel.exercise.user';

const store = {
  get: async (k: string) => (Platform.OS === 'web' ? globalThis.localStorage?.getItem(k) ?? null : SecureStore.getItemAsync(k)),
  set: async (k: string, v: string) => (Platform.OS === 'web' ? globalThis.localStorage?.setItem(k, v) : SecureStore.setItemAsync(k, v)),
  del: async (k: string) => (Platform.OS === 'web' ? globalThis.localStorage?.removeItem(k) : SecureStore.deleteItemAsync(k)),
};

type Name = { first_name: string; last_name: string };
const parseName = (raw: string | null): Name | null => {
  try {
    const n = raw ? (JSON.parse(raw) as Partial<Name>) : null;
    return n && typeof n.first_name === 'string' && typeof n.last_name === 'string' ? { first_name: n.first_name, last_name: n.last_name } : null;
  } catch {
    return null;
  }
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState<Name | null>(null);
  const refreshToken = useRef<string | null>(null);

  const clear = useCallback(async () => {
    await Promise.all([KEY, REFRESH_KEY, EMAIL_KEY, NAME_KEY].map(store.del));
    refreshToken.current = null;
    setApiToken(null);
    setUserId(null);
    setEmail(null);
    setName(null);
  }, []);

  const applyAccess = useCallback((access: string) => {
    setApiToken(access);
    setUserId(jwtSubject(access));
  }, []);

  /** Persist a fresh pair from sign-in, sign-up or refresh. */
  const savePair = useCallback(
    async (pair: TokenPair) => {
      refreshToken.current = pair.refresh_token;
      await Promise.all([store.set(KEY, pair.access_token), store.set(REFRESH_KEY, pair.refresh_token)]);
      applyAccess(pair.access_token);
    },
    [applyAccess],
  );

  // One refresher for the whole app. A refresh that fails means the session is over.
  useEffect(() => {
    setTokenRefresher(async () => {
      const current = refreshToken.current;
      if (!current) return null;
      try {
        const pair = await accountApi.refresh(current);
        await savePair(pair);
        return pair.access_token;
      } catch {
        await clear();
        setMode('signed-out');
        return null;
      }
    });
    return () => setTokenRefresher(null);
  }, [savePair, clear]);

  useEffect(() => {
    (async () => {
      try {
        store.del(LEGACY_EXERCISE_KEY).catch(() => undefined);
        const [t, r, e, n] = await Promise.all([store.get(KEY), store.get(REFRESH_KEY), store.get(EMAIL_KEY), store.get(NAME_KEY)]);
        if (t && (API_CONFIGURED || EXERCISE_API_CONFIGURED)) {
          refreshToken.current = r;
          applyAccess(t);
          setEmail(e);
          setName(parseName(n));
          setMode('live');
        } else setMode('signed-out');
      } catch {
        setMode('signed-out');
      }
    })();
  }, [applyAccess]);

  const rememberName = useCallback(async (n: Name) => {
    setName(n);
    await store.set(NAME_KEY, JSON.stringify(n));
  }, []);

  const signIn = useCallback(
    async (em: string, password: string) => {
      if (!AUTH_CONFIGURED) throw new Error('No account server is configured. Set EXPO_PUBLIC_EXERCISE_API_URL, or continue in demo mode.');
      const pair = await accountApi.login(em, password);
      await savePair(pair);
      await store.set(EMAIL_KEY, em);
      setEmail(em);
      // The name for greetings; the account works without it if the profile can't be read now.
      if (EXERCISE_API_CONFIGURED) {
        const p = await exerciseApi.getProfile(pair.user_id).catch(() => null);
        if (p) await rememberName({ first_name: p.first_name, last_name: p.last_name });
      }
      setMode('live');
    },
    [savePair, rememberName],
  );

  const signUp = useCallback(
    async (account: NewAccount) => {
      if (!AUTH_CONFIGURED) throw new Error('No account server is configured. Set EXPO_PUBLIC_EXERCISE_API_URL, or continue in demo mode.');
      const pair = await accountApi.register(account);
      await savePair(pair);
      await store.set(EMAIL_KEY, account.email);
      setEmail(account.email);
      await rememberName({ first_name: account.first_name, last_name: account.last_name });
      setMode('live');
    },
    [savePair, rememberName],
  );

  const signInWithToken = useCallback(
    async (t: string) => {
      await store.set(KEY, t);
      refreshToken.current = null;
      applyAccess(t);
      setMode('live');
    },
    [applyAccess],
  );

  const signOut = useCallback(async () => {
    await clear();
    setMode('signed-out');
  }, [clear]);

  const exerciseUser = useMemo<ExerciseUser | null>(
    () => (mode === 'live' && userId ? { user_id: userId, first_name: name?.first_name ?? '', last_name: name?.last_name ?? '' } : null),
    [mode, userId, name],
  );

  return (
    <Ctx.Provider
      value={{ mode, email, userId, apiConfigured: API_CONFIGURED, authConfigured: AUTH_CONFIGURED, signIn, signUp, signInWithToken, continueDemo: () => setMode('demo'), signOut, exerciseUser }}
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
