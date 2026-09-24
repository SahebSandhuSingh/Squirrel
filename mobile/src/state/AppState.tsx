import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { DEFAULT_CITY_ID, cityById, type City } from '@/data/cities';
import { crewsForCity, eventsForCity, placesForCity, type Crew, type EventItem, type Place } from '@/data/community';
import { seedMissions, type Mission } from '@/data/missions';
import { seedPosts, type Post } from '@/data/posts';
import { STARTER_OWNED, shopItemById } from '@/data/shop';
import { CURRENT_USER_ID, userById, users, type User } from '@/data/users';
import type { AvatarLook } from '@/types';

export const XP_PER_LEVEL = 2000;

export type ToastMsg = { id: number; text: string; icon?: string; color?: string };

type BuyResult = 'ok' | 'owned' | 'coins' | 'level';

type AppState = {
  // identity
  me: User;
  look: AvatarLook;
  setLook: (l: AvatarLook) => void;
  pet: string;
  setPet: (id: string) => void;
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
  // runs
  finishRun: (km: number, minutes: number) => { xp: number; leveledUp: boolean };
  // feedback
  toasts: ToastMsg[];
  toast: (text: string, icon?: string, color?: string) => void;
};

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

  const toast = useCallback((text: string, icon?: string, color?: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, icon, color }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const addXp = useCallback(
    (gain: number, coinGain = 0) => {
      const before = Math.floor(xp / XP_PER_LEVEL);
      const after = Math.floor((xp + gain) / XP_PER_LEVEL);
      setXp(xp + gain);
      if (coinGain) setCoins((c) => c + coinGain);
      return { leveledUp: after > before };
    },
    [xp],
  );

  const logMission = useCallback(
    (id: string) => {
      const m = missions.find((x) => x.id === id);
      if (!m || m.current >= m.goal) return;
      const next = Math.min(m.goal, +(m.current + m.step).toFixed(2));
      setMissions(missions.map((x) => (x.id === id ? { ...x, current: next } : x)));
      if (next >= m.goal) toast(`Mission complete: ${m.title}`, 'check-decagram', '#3DF0A0');
    },
    [missions, toast],
  );

  const ready = useMemo(() => missions.filter((m) => m.current >= m.goal && !claimed.has(m.id)), [missions, claimed]);
  const claimable = useMemo(
    () => ({ xp: ready.reduce((s, m) => s + m.xp, 0), coins: ready.reduce((s, m) => s + m.coins, 0), count: ready.length }),
    [ready],
  );

  const claimRewards = useCallback(() => {
    const res = addXp(claimable.xp, claimable.coins);
    setClaimed((c) => new Set([...c, ...ready.map((m) => m.id)]));
    return { xp: claimable.xp, coins: claimable.coins, leveledUp: res.leveledUp };
  }, [addXp, claimable, ready]);

  const level = Math.floor(xp / XP_PER_LEVEL) + 1;

  const buy = useCallback(
    (id: string): BuyResult => {
      const item = shopItemById(id);
      if (!item) return 'owned';
      if (owned.has(id)) return 'owned';
      if (level < item.levelRequired) return 'level';
      if (coins < item.price) return 'coins';
      setCoins(coins - item.price);
      setOwned(new Set([...owned, id]));
      toast(`Unlocked ${item.name}`, 'lock-open-variant', '#FFD43B');
      return 'ok';
    },
    [coins, level, owned, toast],
  );

  const finishRun = useCallback(
    (km: number, minutes: number) => {
      const gain = Math.round(km * 20 + minutes);
      setMissions((all) =>
        all.map((m) => {
          if (m.id === 'w-run') return { ...m, current: Math.min(m.goal, +(m.current + km).toFixed(1)) };
          if (m.id === 'm-active') return { ...m, current: Math.min(m.goal, m.current + minutes) };
          if (m.id === 'm-steps') return { ...m, current: Math.min(m.goal, m.current + Math.round(km * 1300)) };
          return m;
        }),
      );
      const res = addXp(gain, Math.round(gain / 2));
      return { xp: gain, leveledUp: res.leveledUp };
    },
    [addXp],
  );

  const value: AppState = {
    me: { ...me, look },
    look,
    setLook,
    pet,
    setPet,
    city,
    setCity: (id) => {
      setCityId(id);
      toast(`Exploring ${cityById(id).name}`, 'map-marker-radius', '#35DFFF');
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
    toggleCrew: (id) => {
      const crew = crews.find((c) => c.id === id);
      if (!joinedCrews.has(id) && crew) toast(`You joined ${crew.name}`, 'account-group', '#35DFFF');
      setJoinedCrews(toggled(joinedCrews, id));
    },
    joinedEvents,
    toggleEvent: (id) => {
      const ev = events.find((e) => e.id === id);
      if (!joinedEvents.has(id) && ev) {
        toast(`You're going to ${ev.title} · +${ev.xp} XP on check-in`, 'calendar-check', '#FF35B5');
        setMissions((all) => all.map((m) => (m.id === 'w-event' ? { ...m, current: m.goal } : m)));
      }
      setJoinedEvents(toggled(joinedEvents, id));
    },
    following,
    toggleFollow: (id) => {
      if (!following.has(id)) toast(`Following @${users.find((u) => u.id === id)?.handle ?? ''}`, 'account-check', '#FF35B5');
      setFollowing(toggled(following, id));
    },
    liked,
    toggleLike: (id) => setLiked((s) => toggled(s, id)),
    saved,
    toggleSave: (id) => {
      if (!saved.has(id)) toast('Saved to your collection', 'bookmark', '#FFD43B');
      setSaved(toggled(saved, id));
    },
    posts,
    addPost: (p) => {
      setPosts((all) => [
        { ...p, id: `me-${Date.now()}`, authorId: me.id, cityId, area: city.areas[0], minutesAgo: 0, likes: 0, comments: 0 },
        ...all,
      ]);
      toast('Posted to your feed · +20 XP', 'send', '#FF35B5');
      setXp((x) => x + 20);
    },
    finishRun,
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
