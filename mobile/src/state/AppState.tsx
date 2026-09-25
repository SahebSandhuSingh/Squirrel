import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { DEFAULT_CITY_ID, cityById, type City } from '@/data/cities';
import { crewsForCity, eventsForCity, placesForCity, type Crew, type EventItem, type Place } from '@/data/community';
import { seedMissions, type Mission } from '@/data/missions';
import { seedPosts, type Post } from '@/data/posts';
import { STARTER_OWNED, shopItemById } from '@/data/shop';
import { CURRENT_USER_ID, userById, users, type User } from '@/data/users';
import type { AvatarLook } from '@/types';
import { districtsForCity, type District } from '@/data/territory';
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
  const [joinedCrews, setJoinedCrews] = useState<Set<string>>(new Set(['pune-crew-2']));
  const [joinedEvents, setJoinedEvents] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState<Set<string>>(new Set(['u_rhea', 'u_meera', 'u_zoya', 'u_isha']));
  const [liked, setLiked] = useState<Set<string>>(new Set(['p3']));
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [posts, setPosts] = useState<Post[]>(seedPosts);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastId = useRef(0);

  const city = cityById(cityId);
  const crews = useMemo(() => crewsForCity(cityId), [cityId]);
  const events = useMemo(() => eventsForCity(cityId), [cityId]);
  const places = useMemo(() => placesForCity(cityId), [cityId]);
  const [districtState, setDistrictState] = useState<Record<string, District[]>>({});
  const districts = useMemo(() => districtState[cityId] ?? districtsForCity(cityId), [districtState, cityId]);
  const [runXpToday, setRunXpToday] = useState(0);

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
      if (coinGain) setCoins((c) => c + coinGain);
      return { leveledUp };
    },
    [],
  );

  const logMission = useCallback(
    (id: string) => {
      setMissions((currentMissions) => {
        const m = currentMissions.find((x) => x.id === id);
        if (!m || m.current >= m.goal) return currentMissions;
        const next = Math.min(m.goal, +(m.current + m.step).toFixed(2));
        const updated = currentMissions.map((x) => (x.id === id ? { ...x, current: next } : x));
        if (next >= m.goal) toast(`Mission complete: ${m.title}`, 'check-decagram', '#12B76A');
        return updated;
      });
    },
    [toast],
  );

  const ready = useMemo(() => missions.filter((m) => m.current >= m.goal && !claimed.has(m.id)), [missions, claimed]);
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
        .filter((m) => m.current >= m.goal && !claimedSet.has(m.id))
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
        toast(`Unlocked ${item.name}`, 'lock-open-variant', '#FFB020');
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
    toggleEquip: (id) => setEquipped((s) => toggled(s, id)),
    joinedCrews,
    toggleCrew: useCallback((id: string) => {
      setJoinedCrews((s) => {
        const crew = crews.find((c) => c.id === id);
        if (!s.has(id) && crew) toast(`You joined ${crew.name}`, 'account-group', '#2F5BFF');
        return toggled(s, id);
      });
    }, [crews, toast]),
    joinedEvents,
    toggleEvent: useCallback((id: string) => {
      const ev = events.find((e) => e.id === id);
      if (!joinedEvents.has(id) && ev) {
        toast(`You're going to ${ev.title} · +${ev.xp} XP on check-in`, 'calendar-check', '#2F5BFF');
        setMissions((all) => all.map((m) => (m.id === 'w-event' ? { ...m, current: m.goal } : m)));
      }
      setJoinedEvents((s) => toggled(s, id));
    }, [events, joinedEvents, toast]),
    following,
    toggleFollow: useCallback((id: string) => {
      setFollowing((s) => {
        if (!s.has(id)) toast(`Following @${users.find((u) => u.id === id)?.handle ?? ''}`, 'account-check', '#2F5BFF');
        return toggled(s, id);
      });
    }, [toast]),
    liked,
    toggleLike: useCallback((id: string) => setLiked((s) => toggled(s, id)), []),
    saved,
    toggleSave: useCallback((id: string) => {
      setSaved((s) => {
        if (!s.has(id)) toast('Saved to your collection', 'bookmark', '#FFB020');
        return toggled(s, id);
      });
    }, [toast]),
    posts,
    addPost: useCallback((p) => {
      setPosts((all) => [
        { ...p, id: `me-${Date.now()}`, authorId: me.id, cityId, area: city.areas[0], minutesAgo: 0, likes: 0, comments: 0 },
        ...all,
      ]);
      toast('Posted to your feed · +20 XP', 'send', '#2F5BFF');
      setXp((x) => x + 20);
    }, [cityId, city, me.id, toast]),
    finishRun,
    runXpToday,
    districts,
    syncServerXp: (total) => setXp(total),
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
