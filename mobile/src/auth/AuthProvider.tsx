import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { setApiToken, setUnauthorizedHandler } from '@/api/client';
import { jwtSubject } from '@/auth/jwt';
import { API_CONFIGURED, AUTH_CONFIGURED, AUTH_URL } from '@/api/config';

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
  /** Set when the server rejected the stored token (401) and the app signed out automatically. */
  sessionExpired: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithToken: (token: string) => Promise<void>;
  continueDemo: () => void;
  signOut: () => Promise<void>;
};

const KEY = 'squirrel.auth.token';
const EMAIL_KEY = 'squirrel.auth.email';

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
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [t, e] = await Promise.all([store.get(KEY), store.get(EMAIL_KEY)]);
        if (t && API_CONFIGURED) {
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
    setSessionExpired(false);
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

  const signOut = useCallback(async () => {
    await Promise.all([store.del(KEY), store.del(EMAIL_KEY)]);
    setApiToken(null);
    setUserId(null);
    setEmail(null);
    setMode('signed-out');
  }, []);

  // An expired / revoked token gets a 401 from every endpoint. Drop it and send the user
  // back to sign-in instead of staying in a "live" mode where nothing works.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setSessionExpired(true);
      signOut().catch(() => {});
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    if (sessionExpired && mode === 'signed-out') router.replace('/sign-in');
  }, [sessionExpired, mode]);

  return (
    <Ctx.Provider value={{ mode, email, userId, apiConfigured: API_CONFIGURED, authConfigured: AUTH_CONFIGURED, sessionExpired, signIn, signInWithToken, continueDemo: () => setMode('demo'), signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside <AuthProvider>');
  return c;
}
