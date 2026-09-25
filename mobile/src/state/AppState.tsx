import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { xpApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthProvider';
import { DEFAULT_CITY_ID, cityById, type City } from '@/data/cities';
import { crewsForCity, eventsForCity, placesForCity, type Crew, type EventItem, type Place } from '@/data/community';
import { seedMissions, type Mission } from '@/data/missions';
import { seedPosts, type Post } from '@/data/posts';
import { STARTER_OWNED, shopItemById } from '@/data/shop';
import { CURRENT_USER_ID, userById, users, type User } from '@/data/users';
import type { AvatarLook } from '@/types';
import { districtsForCity, type District } from '@/data/territory';
import { listPendingRuns } from '@/logic/pendingRuns';
import { hasSavedRun } from '@/logic/runTracker';
import { runXp, type XpLine } from '@/logic/xp';
import type { Verdict } from '@/logic/track';

export const XP_PER_LEVEL = 2000;

export type ToastMsg = { id: number; text: string; icon?: string; color?: string };

type BuyResult = 'ok' | 'owned' | 'coins' | 'level';

type AppState = {
  // identity
  me: User & { look: AvatarLook };
  look: AvatarLook;
  setLook: (l: AvatarLook) => void;
  pet: string;
  setPet: (id: string) => void;
  gear: string;
  setGear: (id: string) => void;
  // city
  city: City;
  setCity: (id: string) => void;
  crews: Crew[];
  events: EventItem[];
  places: Place[];
  // progression
  xp: number;
  level: number;
  levelXp: number;
  coins: number;
  addXp: (xp: number, coins?: number) => { leveledUp: boolean };
  // missions
  missions: Mission[];
  logMission: (id: string) => void;
  claimable: { xp: number; coins: number; count: number };
  claimRewards: () => { xp: number; coins: number; leveledUp: boolean };
  claimed: Set<string>;
  // shop
  owned: Set<string>;
  equipped: Set<string>;
  buy: (id: string) => BuyResult;
  toggleEquip: (id: string) => void;
  // social
  joinedCrews: Set<string>;
  toggleCrew: (id: string) => void;
  joinedEvents: Set<string>;
  toggleEvent: (id: string) => void;
  following: Set<string>;
  toggleFollow: (id: string) => void;
  liked: Set<string>;
  toggleLike: (id: string) => void;
  saved: Set<string>;
  toggleSave: (id: string) => void;
  posts: Post[];
  addPost: (p: Omit<Post, 'id' | 'authorId' | 'cityId' | 'area' | 'minutesAgo' | 'likes' | 'comments'>) => void;
  // runs & territory
  finishRun: (run: FinishRunInput) => FinishRunResult;
  runXpToday: number;
  districts: District[];
  /** Replace the local XP total with the server's (GET /v1/users/me/xp). */
  syncServerXp: (total: number) => void;
  /** Finished runs still waiting to reach the server (see logic/pendingRuns). */
  pendingUploads: number;
  /** A run that was in progress when the app was killed and can be resumed. */
  unfinishedRun: boolean;
  /** Re-read the two flags above from disk (after an upload or a resume). */
  refreshRunFlags: () => Promise<void>;
  // persistence
  hydrated: boolean;
  // feedback
  toasts: ToastMsg[];
  toast: (text: string, icon?: string, color?: string) => void;
};

export type FinishRunInput = { km: number; minutes: number; verdict: Verdict; districtId?: string; serverXp?: number; serverLines?: XpLine[] };
export type FinishRunResult = { xp: number; lines: XpLine[]; capped: boolean; leveledUp: boolean; captured?: District };

const Ctx = createContext<AppState | null>(null);

const toggled = (set: Set<string>, id: string) => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

const dayKey = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Persistence — one JSON blob in AsyncStorage, saved (debounced) on every change.
// Seed content (other users' posts, catalogues) is NOT stored; only what the user did.
// ---------------------------------------------------------------------------

const STORE_KEY = 'squirrel.app.v1';

type Persisted = {
  look: AvatarLook;
  pet: string;
  gear: string;
  cityId: string;
  xp: number;
  coins: number;
  missions: Mission[];
  claimed: string[];
  owned: string[];
  equipped: string[];
  joinedCrews: string[];
  joinedEvents: string[];
  following: string[];
  liked: string[];
  saved: string[];
  /** The user's own posts only (ids start with `me-`). */
  myPosts: Post[];
  runXpToday: number;
  runXpDay: string;
  districtState: Record<string, District[]>;
};

/**
 * React runs only the first `setState` updater of an event synchronously; later ones run
 * at render time. So anything that needs to read-then-write several values in one go
 * (buy, claim, add XP) must not rely on side effects inside updaters. We keep the
 * progression numbers in refs that are the source of truth for arithmetic, and mirror
 * them into state for rendering.
 */
function useSyncedState<T>(initial: T): [T, React.MutableRefObject<T>, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  const ref = useRef<T>(initial);
  const set = useCallback((v: T) => {
    ref.current = v;
    setValue(v);
  }, []);
  return [value, ref, set];
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const me = userById(CURRENT_USER_ID);
  const { mode, userId } = useAuth();
  const [look, setLook] = useState<AvatarLook>(me.look);
  const [pet, setPet] = useState('pet-nutty');
  const [gear, setGear] = useState('none');
  const [cityId, setCityId] = useState(me.cityId ?? DEFAULT_CITY_ID);
  // Level 13 with 750 / 2000 into it, matching the design (demo mode only — live mode
  // replaces this with the server's total as soon as it's known).
  const [xp, xpRef, setXpSync] = useSyncedState(12 * XP_PER_LEVEL + 750);
  const [coins, coinsRef, setCoinsSync] = useSyncedState(2350);
  const [missions, missionsRef, setMissionsSync] = useSyncedState<Mission[]>(seedMissions);
  const [claimed, claimedRef, setClaimedSync] = useSyncedState<Set<string>>(new Set());
  const [owned, ownedRef, setOwnedSync] = useSyncedState<Set<string>>(new Set(STARTER_OWNED));
  const [equipped, setEquipped] = useState<Set<string>>(new Set(['a-shades']));
  const [joinedCrews, setJoinedCrews] = useState<Set<string>>(new Set(['pune-crew-2']));
  const [joinedEvents, setJoinedEvents] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState<Set<string>>(new Set(['u_rhea', 'u_meera', 'u_zoya', 'u_isha']));
  const [liked, setLiked] = useState<Set<string>>(new Set(['p3']));
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [posts, setPosts] = useState<Post[]>(seedPosts);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastId = useRef(0);
  const [hydrated, setHydrated] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [unfinishedRun, setUnfinishedRun] = useState(false);

  const city = cityById(cityId);
  const crews = useMemo(() => crewsForCity(cityId), [cityId]);
  const events = useMemo(() => eventsForCity(cityId), [cityId]);
  const places = useMemo(() => placesForCity(cityId), [cityId]);
  const [districtState, districtStateRef, setDistrictStateSync] = useSyncedState<Record<string, District[]>>({});
  const districts = useMemo(() => districtState[cityId] ?? districtsForCity(cityId), [districtState, cityId]);
  // Run XP counts against a daily cap, so it's keyed to the calendar day.
  const [runXpDay, runXpDayRef, setRunXpDaySync] = useSyncedState(dayKey());
  const [runXpTodayRaw, runXpTodayRef, setRunXpTodaySync] = useSyncedState(0);
  const runXpToday = runXpDay === dayKey() ? runXpTodayRaw : 0;

  const toast = useCallback((text: string, icon?: string, color?: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, icon, color }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  // ---- hydrate --------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        if (raw && !cancelled) {
          const p = JSON.parse(raw) as Partial<Persisted>;
          if (p.look) setLook(p.look);
          if (p.pet) setPet(p.pet);
          if (p.gear) setGear(p.gear);
          if (p.cityId) setCityId(p.cityId);
          if (typeof p.xp === 'number') setXpSync(p.xp);
          if (typeof p.coins === 'number') setCoinsSync(p.coins);
          if (p.missions?.length) {
            // Keep seed definitions (titles, rewards may change between builds); restore progress.
            const progress = new Map(p.missions.map((m) => [m.id, m.current]));
            setMissionsSync(seedMissions.map((m) => (progress.has(m.id) ? { ...m, current: progress.get(m.id)! } : m)));
          }
          if (p.claimed) setClaimedSync(new Set(p.claimed));
          if (p.owned) setOwnedSync(new Set([...STARTER_OWNED, ...p.owned]));
          if (p.equipped) setEquipped(new Set(p.equipped));
          if (p.joinedCrews) setJoinedCrews(new Set(p.joinedCrews));
          if (p.joinedEvents) setJoinedEvents(new Set(p.joinedEvents));
          if (p.following) setFollowing(new Set(p.following));
          if (p.liked) setLiked(new Set(p.liked));
          if (p.saved) setSaved(new Set(p.saved));
          if (p.myPosts?.length) setPosts([...p.myPosts, ...seedPosts]);
          if (p.runXpDay) setRunXpDaySync(p.runXpDay);
          if (typeof p.runXpToday === 'number') setRunXpTodaySync(p.runXpToday);
          if (p.districtState) setDistrictStateSync(p.districtState);
        }
      } catch {
        // corrupt or unreadable store: start fresh
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setXpSync, setCoinsSync, setMissionsSync, setClaimedSync, setOwnedSync, setRunXpDaySync, setRunXpTodaySync, setDistrictStateSync]);

  // ---- persist (debounced) ----------------------------------------------------
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const data: Persisted = {
        look,
        pet,
        gear,
        cityId,
        xp,
        coins,
        missions,
        claimed: [...claimed],
        owned: [...owned],
        equipped: [...equipped],
        joinedCrews: [...joinedCrews],
        joinedEvents: [...joinedEvents],
        following: [...following],
        liked: [...liked],
        saved: [...saved],
        myPosts: posts.filter((p) => p.id.startsWith('me-')),
        runXpToday: runXpTodayRaw,
        runXpDay,
        districtState,
      };
      AsyncStorage.setItem(STORE_KEY, JSON.stringify(data)).catch(() => {});
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [hydrated, look, pet, gear, cityId, xp, coins, missions, claimed, owned, equipped, joinedCrews, joinedEvents, following, liked, saved, posts, runXpTodayRaw, runXpDay, districtState]);

  // ---- run flags (pending uploads / unfinished run) ---------------------------
  // Saved uploads belong to the account that recorded them, and only a live session can
  // send them (retrying one in demo mode would award its XP locally, again and again).
  const readRunFlags = useCallback(async () => {
    const [pending, unfinished] = await Promise.all([mode === 'live' ? listPendingRuns(userId) : Promise.resolve([]), hasSavedRun()]);
    return { pending: pending.length, unfinished };
  }, [mode, userId]);
  const refreshRunFlags = useCallback(async () => {
    const f = await readRunFlags();
    setPendingUploads(f.pending);
    setUnfinishedRun(f.unfinished);
  }, [readRunFlags]);
  useEffect(() => {
    let cancelled = false;
    readRunFlags()
      .then((f) => {
        if (cancelled) return;
        setPendingUploads(f.pending);
        setUnfinishedRun(f.unfinished);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [readRunFlags]);

  // ---- server XP -------------------------------------------------------------
  const syncServerXp = useCallback((total: number) => setXpSync(total), [setXpSync]);
  useEffect(() => {
    if (mode !== 'live') return;
    let cancelled = false;
    xpApi
      .me()
      .then((r) => {
        if (!cancelled) setXpSync(r.xp);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mode, setXpSync]);

  // ---- progression -----------------------------------------------------------
  const addXp = useCallback(
    (gain: number, coinGain = 0) => {
      const before = Math.floor(xpRef.current / XP_PER_LEVEL);
      const next = xpRef.current + gain;
      const leveledUp = Math.floor(next / XP_PER_LEVEL) > before;
      setXpSync(next);
      if (coinGain) setCoinsSync(coinsRef.current + coinGain);
      return { leveledUp };
    },
    [xpRef, coinsRef, setXpSync, setCoinsSync],
  );

  const logMission = useCallback(
    (id: string) => {
      const all = missionsRef.current;
      const m = all.find((x) => x.id === id);
      if (!m || m.current >= m.goal) return;
      const next = Math.min(m.goal, +(m.current + m.step).toFixed(2));
      setMissionsSync(all.map((x) => (x.id === id ? { ...x, current: next } : x)));
      if (next >= m.goal) toast(`Mission complete: ${m.title}`, 'check-decagram', '#12B76A');
    },
    [missionsRef, setMissionsSync, toast],
  );

  const ready = useMemo(() => missions.filter((m) => m.current >= m.goal && !claimed.has(m.id)), [missions, claimed]);
  const claimable = useMemo(
    () => ({ xp: ready.reduce((s, m) => s + m.xp, 0), coins: ready.reduce((s, m) => s + m.coins, 0), count: ready.length }),
    [ready],
  );

  const claimRewards = useCallback(() => {
    const readyNow = missionsRef.current.filter((m) => m.current >= m.goal && !claimedRef.current.has(m.id));
    const claimXp = readyNow.reduce((s, m) => s + m.xp, 0);
    const claimCoins = readyNow.reduce((s, m) => s + m.coins, 0);
    if (!readyNow.length) return { xp: 0, coins: 0, leveledUp: false };
    setClaimedSync(new Set([...claimedRef.current, ...readyNow.map((m) => m.id)]));
    const res = addXp(claimXp, claimCoins);
    return { xp: claimXp, coins: claimCoins, leveledUp: res.leveledUp };
  }, [missionsRef, claimedRef, setClaimedSync, addXp]);

  const level = Math.floor(xp / XP_PER_LEVEL) + 1;

  const buy = useCallback(
    (id: string): BuyResult => {
      const item = shopItemById(id);
      if (!item) return 'owned';
      if (ownedRef.current.has(id)) return 'owned';
      const currentLevel = Math.floor(xpRef.current / XP_PER_LEVEL) + 1;
      if (currentLevel < item.levelRequired) return 'level';
      if (coinsRef.current < item.price) return 'coins';
      setCoinsSync(coinsRef.current - item.price);
      setOwnedSync(new Set([...ownedRef.current, id]));
      toast(`Unlocked ${item.name}`, 'lock-open-variant', '#FFB020');
      return 'ok';
    },
    [ownedRef, xpRef, coinsRef, setCoinsSync, setOwnedSync, toast],
  );

  const finishRun = useCallback(
    ({ km, minutes, verdict, districtId, serverXp, serverLines }: FinishRunInput): FinishRunResult => {
      if (verdict === 'rejected') return { xp: 0, lines: [{ label: 'Run rejected — no XP', xp: 0 }], capped: false, leveledUp: false };
      const today = dayKey();
      const usedToday = runXpDayRef.current === today ? runXpTodayRef.current : 0;
      const current = districtStateRef.current[cityId] ?? districtsForCity(cityId);
      const target = current.find((d) => d.id === districtId);
      const captured = !!target && km >= 1;
      const local = runXp(km, captured, usedToday);
      const gain = serverXp ?? local.total;
      const lines = serverLines ?? local.lines;
      setRunXpDaySync(today);
      setRunXpTodaySync(usedToday + gain);
      setMissionsSync(
        missionsRef.current.map((m) => {
          if (m.id === 'w-run') return { ...m, current: Math.min(m.goal, +(m.current + km).toFixed(1)) };
          if (m.id === 'm-active') return { ...m, current: Math.min(m.goal, m.current + minutes) };
          if (m.id === 'm-steps') return { ...m, current: Math.min(m.goal, m.current + Math.round(km * 1300)) };
          return m;
        }),
      );
      let capturedDistrict: District | undefined;
      if (captured && target) {
        const control = Math.min(1, target.control + 0.15);
        capturedDistrict = { ...target, control, status: control >= 0.5 ? 'yours' : 'contested', decayDays: 14 };
        setDistrictStateSync({ ...districtStateRef.current, [cityId]: current.map((d) => (d.id === target.id ? capturedDistrict! : d)) });
      }
      // Coins are frontend-only (no server currency yet): half the XP, as before.
      const res = addXp(gain, Math.round(gain / 2));
      return { xp: gain, lines, capped: local.capped && serverXp == null, leveledUp: res.leveledUp, captured: capturedDistrict };
    },
    [addXp, cityId, districtStateRef, missionsRef, runXpDayRef, runXpTodayRef, setDistrictStateSync, setMissionsSync, setRunXpDaySync, setRunXpTodaySync],
  );

  const value: AppState = {
    me: { ...me, look },
    look,
    setLook,
    pet,
    setPet,
    gear,
    setGear,
    city,
    setCity: (id) => {
      setCityId(id);
      toast(`Exploring ${cityById(id).name}`, 'map-marker-radius', '#2F5BFF');
    },
    crews,
    events,
    places,
    xp,
    level,
    levelXp: xp % XP_PER_LEVEL,
    coins,
    addXp,
    missions,
    logMission,
    claimable,
    claimRewards,
    claimed,
    owned,
    equipped,
    buy,
    toggleEquip: (id) =>
      setEquipped((s) => {
        const next = toggled(s, id);
        // Outfit sets and shoes replace each other: only one per slot can be worn.
        const item = shopItemById(id);
        if (next.has(id) && item?.lookPatch) {
          for (const other of next) {
            const o = other !== id ? shopItemById(other) : undefined;
            if (o?.lookPatch && o.tab === item.tab && o.category === item.category) next.delete(other);
          }
        }
        return next;
      }),
    joinedCrews,
    toggleCrew: useCallback(
      (id: string) => {
        setJoinedCrews((s) => {
          const crew = crews.find((c) => c.id === id);
          if (!s.has(id) && crew) toast(`You joined ${crew.name}`, 'account-group', '#2F5BFF');
          return toggled(s, id);
        });
      },
      [crews, toast],
    ),
    joinedEvents,
    toggleEvent: useCallback(
      (id: string) => {
        const ev = events.find((e) => e.id === id);
        if (!joinedEvents.has(id) && ev) {
          toast(`You're going to ${ev.title} · +${ev.xp} XP on check-in`, 'calendar-check', '#2F5BFF');
          setMissionsSync(missionsRef.current.map((m) => (m.id === 'w-event' ? { ...m, current: m.goal } : m)));
        }
        setJoinedEvents((s) => toggled(s, id));
      },
      [events, joinedEvents, missionsRef, setMissionsSync, toast],
    ),
    following,
    toggleFollow: useCallback(
      (id: string) => {
        setFollowing((s) => {
          if (!s.has(id)) toast(`Following @${users.find((u) => u.id === id)?.handle ?? ''}`, 'account-check', '#2F5BFF');
          return toggled(s, id);
        });
      },
      [toast],
    ),
    liked,
    toggleLike: useCallback((id: string) => setLiked((s) => toggled(s, id)), []),
    saved,
    toggleSave: useCallback(
      (id: string) => {
        setSaved((s) => {
          if (!s.has(id)) toast('Saved to your collection', 'bookmark', '#FFB020');
          return toggled(s, id);
        });
      },
      [toast],
    ),
    posts,
    addPost: useCallback(
      (p) => {
        setPosts((all) => [
          { ...p, id: `me-${Date.now()}`, authorId: me.id, cityId, area: city.areas[0], minutesAgo: 0, likes: 0, comments: 0 },
          ...all,
        ]);
        toast('Posted to your feed · +20 XP', 'send', '#2F5BFF');
        addXp(20);
      },
      [cityId, city, me.id, toast, addXp],
    ),
    finishRun,
    runXpToday,
    districts,
    syncServerXp,
    pendingUploads,
    unfinishedRun,
    refreshRunFlags,
    hydrated,
    toasts,
    toast,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside <AppStateProvider>');
  return ctx;
}
