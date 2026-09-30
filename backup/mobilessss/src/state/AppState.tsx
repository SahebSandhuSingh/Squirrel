import { COMING_SOON, isLocked, LOCKED_MISSIONS } from '@/data/features';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as AppStateRN } from 'react-native';
import { DEFAULT_CITY_ID, cityById, type City } from '@/data/cities';
import { crewsForCity, eventsForCity, placesForCity, type Crew, type EventItem, type Place } from '@/data/community';
import { seedMissions, type Mission } from '@/data/missions';
import { STARTER_OWNED, shopItemById } from '@/data/shop';
import { CURRENT_USER_ID, userById, type User } from '@/data/users';
import type { AvatarLook } from '@/types';
import { districtsForCity, type District } from '@/data/territory';
import { runXp, type XpLine } from '@/logic/xp';
import { localDayKey, localWeekKey } from '@/logic/localDay';
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
  /** XP earned today (every addXp award: runs, missions, rewards). */
  xpToday: number;
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
  // Follows, likes, saves and posts live in the Social service (src/api/social.ts).
  // runs & territory
  finishRun: (run: FinishRunInput) => FinishRunResult;
  runXpToday: number;
  districts: District[];
  /** Replace the local XP total with the server's (GET /v1/users/me/xp). */
  /** The server's XP total; `gained` (when known) also counts toward today. */
  syncServerXp: (total: number, gained?: number) => void;
  // exercise
  /** The exercise session in progress (one at a time), or null. */
  activeExercise: ActiveExercise | null;
  beginExercise: (a: Omit<ActiveExercise, 'startedAt'>) => boolean;
  endExercise: () => void;
  /** Record a finished exercise: missions, XP and today's activity. */
  /** Missions and today's activity for a finished workout. XP comes from the server (syncServerXp). */
  completeExercise: (c: CompletedExercise) => void;
  exerciseToday: { sessions: number; minutes: number; kcal: number };
  // feedback
  toasts: ToastMsg[];
  toast: (text: string, icon?: string, color?: string) => void;
};

export type ActiveExercise = { key: string; sessionId?: string; startedAt: number };
export type CompletedExercise = { key: string; slug: string; reps: number; timedSeconds: number; activeSeconds: number; kcal: number };

export type FinishRunInput = { km: number; minutes: number; verdict: Verdict; districtId?: string; serverXp?: number; serverLines?: XpLine[] };
export type FinishRunResult = { xp: number; lines: XpLine[]; capped: boolean; leveledUp: boolean; captured?: District };

const Ctx = createContext<AppState | null>(null);

const toggled = (set: Set<string>, id: string) => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const me = userById(CURRENT_USER_ID);
  const [look, setLook] = useState<AvatarLook>(me.look);
  const [pet, setPet] = useState('pet-nutty');
  const [gear, setGear] = useState('none');
  const [cityId, setCityId] = useState(me.cityId ?? DEFAULT_CITY_ID);
  // Level 13 with 750 / 2000 into it, matching the design.
  const [xp, setXp] = useState(12 * XP_PER_LEVEL + 750);
  const [coins, setCoins] = useState(2350);
  const [missions, setMissions] = useState(seedMissions);
  const [claimed, setClaimed] = useState<Set<string>>(new Set());
  const [owned, setOwned] = useState<Set<string>>(new Set(STARTER_OWNED));
  const [equipped, setEquipped] = useState<Set<string>>(new Set(['a-shades']));
  const [joinedCrews, setJoinedCrews] = useState<Set<string>>(new Set(['pune-crew-1']));
  const [joinedEvents, setJoinedEvents] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastId = useRef(0);

  const city = cityById(cityId);
  const crews = useMemo(() => crewsForCity(cityId), [cityId]);
  const events = useMemo(() => eventsForCity(cityId), [cityId]);
  const places = useMemo(() => placesForCity(cityId), [cityId]);
  const [districtState, setDistrictState] = useState<Record<string, District[]>>({});
  const districts = useMemo(() => districtState[cityId] ?? districtsForCity(cityId), [districtState, cityId]);
  const [runXpToday, setRunXpToday] = useState(0);
  const [xpToday, setXpToday] = useState(0);
  const [activeExercise, setActiveExercise] = useState<ActiveExercise | null>(null);
  const activeExerciseRef = useRef<ActiveExercise | null>(null);
  const [exerciseToday, setExerciseToday] = useState({ sessions: 0, minutes: 0, kcal: 0 });

  // "Today" and "this week" are the phone's own calendar (logic/localDay): at local midnight the
  // day's counters and daily missions start over, and at the local Monday the weekly ones.
  const [calendar, setCalendar] = useState(() => ({ day: localDayKey(), week: localWeekKey() }));
  useEffect(() => {
    const tick = () => setCalendar((c) => {
      const day = localDayKey();
      return day === c.day ? c : { day, week: localWeekKey() };
    });
    const id = setInterval(tick, 30_000);
    const sub = AppStateRN.addEventListener('change', (next) => { if (next === 'active') tick(); });
    return () => { clearInterval(id); sub.remove(); };
  }, []);
  const seenCalendar = useRef(calendar);
  useEffect(() => {
    const before = seenCalendar.current;
    if (before === calendar) return;
    seenCalendar.current = calendar;
    const tabs = new Set(['Daily', ...(calendar.week !== before.week ? ['Weekly'] : [])]);
    setXpToday(0);
    setRunXpToday(0);
    setExerciseToday({ sessions: 0, minutes: 0, kcal: 0 });
    setMissions((all) => all.map((m) => (tabs.has(m.tab) ? { ...m, current: 0 } : m)));
    setClaimed((ids) => new Set([...ids].filter((id) => !seedMissions.some((m) => m.id === id && tabs.has(m.tab)))));
  }, [calendar]);

  const toast = useCallback((text: string, icon?: string, color?: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, icon, color }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const addXp = useCallback(
    (gain: number, coinGain = 0) => {
      let leveledUp = false;
      setXp((prevXp) => {
        const before = Math.floor(prevXp / XP_PER_LEVEL);
        const after = Math.floor((prevXp + gain) / XP_PER_LEVEL);
        leveledUp = after > before;
        return prevXp + gain;
      });
      if (gain > 0) setXpToday((t) => t + gain);
      if (coinGain) setCoins((c) => c + coinGain);
      return { leveledUp };
    },
    [],
  );

  const logMission = useCallback(
    (id: string) => {
      if (LOCKED_MISSIONS.has(id)) return; // feature not launched yet
      setMissions((currentMissions) => {
        const m = currentMissions.find((x) => x.id === id);
        if (!m || m.current >= m.goal) return currentMissions;
        const next = Math.min(m.goal, +(m.current + m.step).toFixed(2));
        const updated = currentMissions.map((x) => (x.id === id ? { ...x, current: next } : x));
        if (next >= m.goal) toast(`Mission complete: ${m.title}`, 'check-decagram', '#3DF0A0');
        return updated;
      });
    },
    [toast],
  );

  const ready = useMemo(() => missions.filter((m) => m.current >= m.goal && !claimed.has(m.id) && !LOCKED_MISSIONS.has(m.id)), [missions, claimed]);
  const claimable = useMemo(
    () => ({ xp: ready.reduce((s, m) => s + m.xp, 0), coins: ready.reduce((s, m) => s + m.coins, 0), count: ready.length }),
    [ready],
  );

  const claimRewards = useCallback(() => {
    let claimableXp = 0;
    let claimableCoins = 0;
    let readyMissions: string[] = [];
    
    setMissions((currentMissions) => {
      const claimedSet = new Set(claimed);
      readyMissions = currentMissions
        .filter((m) => m.current >= m.goal && !claimedSet.has(m.id) && !LOCKED_MISSIONS.has(m.id))
        .map((m) => m.id);
      claimableXp = readyMissions.reduce((s, id) => {
        const m = currentMissions.find((x) => x.id === id);
        return s + (m?.xp ?? 0);
      }, 0);
      claimableCoins = readyMissions.reduce((s, id) => {
        const m = currentMissions.find((x) => x.id === id);
        return s + (m?.coins ?? 0);
      }, 0);
      return currentMissions;
    });
    
    setClaimed((c) => new Set([...c, ...readyMissions]));
    const res = addXp(claimableXp, claimableCoins);
    return { xp: claimableXp, coins: claimableCoins, leveledUp: res.leveledUp };
  }, [claimed, addXp]);

  const level = Math.floor(xp / XP_PER_LEVEL) + 1;

  const buy = useCallback(
    (id: string): BuyResult => {
      const item = shopItemById(id);
      if (!item) return 'owned';
      // Use functional updates to avoid stale closure
      let result: BuyResult = 'ok';
      setOwned((currentOwned) => {
        if (currentOwned.has(id)) {
          result = 'owned';
          return currentOwned;
        }
        return new Set([...currentOwned, id]);
      });
      setCoins((currentCoins) => {
        const currentLevel = Math.floor(xp / XP_PER_LEVEL) + 1;
        if (currentLevel < item.levelRequired) {
          result = 'level';
          return currentCoins;
        }
        if (currentCoins < item.price) {
          result = 'coins';
          return currentCoins;
        }
        return currentCoins - item.price;
      });
      if (result === 'ok') {
        toast(`Unlocked ${item.name}`, 'lock-open-variant', '#FFD21F');
      }
      return result;
    },
    [xp, toast],
  );

  const finishRun = useCallback(
    ({ km, minutes, verdict, districtId, serverXp, serverLines }: FinishRunInput): FinishRunResult => {
      if (verdict === 'rejected') return { xp: 0, lines: [{ label: 'Run rejected — no XP', xp: 0 }], capped: false, leveledUp: false };
      const target = districts.find((d) => d.id === districtId);
      const captured = !!target && km >= 1;
      const local = runXp(km, captured, runXpToday);
      const gain = serverXp ?? local.total;
      const lines = serverLines ?? local.lines;
      setRunXpToday((x) => x + gain);
      setMissions((all) =>
        all.map((m) => {
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
        setDistrictState((all) => ({ ...all, [cityId]: districts.map((d) => (d.id === target.id ? capturedDistrict! : d)) }));
      }
      // Coins are frontend-only (no server currency yet): half the XP, as before.
      const res = addXp(gain, Math.round(gain / 2));
      return { xp: gain, lines, capped: local.capped && serverXp == null, leveledUp: res.leveledUp, captured: capturedDistrict };
    },
    [addXp, districts, runXpToday, cityId],
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
      toast(`Exploring ${cityById(id).name}`, 'map-marker-radius', '#D7FF1F');
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
    toggleEquip: (id) => setEquipped((s) => toggled(s, id)),
    joinedCrews,
    toggleCrew: useCallback((id: string) => {
      setJoinedCrews((s) => {
        const crew = crews.find((c) => c.id === id);
        if (!s.has(id) && crew) toast(`You joined ${crew.name}`, 'account-group', '#D7FF1F');
        return toggled(s, id);
      });
    }, [crews, toast]),
    joinedEvents,
    toggleEvent: useCallback((id: string) => {
      if (isLocked('events')) {
        toast(COMING_SOON.events, 'lock', '#A9A9AE');
        return;
      }
      const ev = events.find((e) => e.id === id);
      if (!joinedEvents.has(id) && ev) {
        toast(`You're going to ${ev.title} · +${ev.xp} XP on check-in`, 'calendar-check', '#D7FF1F');
        setMissions((all) => all.map((m) => (m.id === 'w-event' ? { ...m, current: m.goal } : m)));
      }
      setJoinedEvents((s) => toggled(s, id));
    }, [events, joinedEvents, toast]),
    finishRun,
    runXpToday,
    districts,
    syncServerXp: useCallback((total: number, gained?: number) => {
      setXp(total);
      if (gained && gained > 0) setXpToday((t) => t + gained);
    }, []),
    activeExercise,
    beginExercise: useCallback((a: Omit<ActiveExercise, 'startedAt'>) => {
      // Guard against duplicate sessions (double taps, two screens): first one wins.
      if (activeExerciseRef.current) return false;
      const active = { ...a, startedAt: Date.now() };
      activeExerciseRef.current = active;
      setActiveExercise(active);
      return true;
    }, []),
    endExercise: useCallback(() => {
      activeExerciseRef.current = null;
      setActiveExercise(null);
    }, []),
    completeExercise: useCallback(
      (c: CompletedExercise) => {
        const minutes = Math.max(1, Math.round(c.activeSeconds / 60));
        const bump = (id: string, by: number) =>
          setMissions((all) => all.map((m) => (m.id === id && !LOCKED_MISSIONS.has(id) ? { ...m, current: Math.min(m.goal, +(m.current + by).toFixed(2)) } : m)));
        if (c.slug === 'squat' && c.reps > 0) bump('m-squats', c.reps);
        bump('m-active', minutes);
        bump('w-workouts', 1);
        setExerciseToday((t) => ({ sessions: t.sessions + 1, minutes: t.minutes + minutes, kcal: t.kcal + c.kcal }));
      },
      [],
    ),
    exerciseToday,
    xpToday,
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
