import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { missions as seedMissions, type Mission } from '@/data/mock';

type MissionTab = keyof typeof seedMissions;

const XP_PER_LEVEL = 2000;

type AppState = {
  avatar: number;
  setAvatar: (i: number) => void;
  outfit: string;
  setOutfit: (id: string) => void;
  coins: number;
  xp: number;
  level: number;
  levelXp: number;
  xpPerLevel: number;
  missions: Record<MissionTab, Mission[]>;
  logMission: (tab: MissionTab, id: string) => void;
  claimable: number;
  claimRewards: () => { xp: number; leveledUp: boolean };
  owned: Set<string>;
  buy: (id: string, price: number) => boolean;
  joinedCrews: Set<string>;
  toggleCrew: (id: string) => void;
  joinedEvents: Set<string>;
  toggleEvent: (id: string) => void;
  liked: Set<string>;
  toggleLike: (id: string) => void;
  saved: Set<string>;
  toggleSave: (id: string) => void;
  claimed: Set<string>;
};

const Ctx = createContext<AppState | null>(null);

const toggle = (set: Set<string>, id: string) => {
  const next = new Set(set);
  next.has(id) ? next.delete(id) : next.add(id);
  return next;
};

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [avatar, setAvatar] = useState(1);
  const [outfit, setOutfit] = useState('o1');
  const [coins, setCoins] = useState(2350);
  // Total XP: level 13 with 750/2000 progress into it (matches the design).
  const [xp, setXp] = useState(12 * XP_PER_LEVEL + 750);
  const [missions, setMissions] = useState(seedMissions);
  const [claimed, setClaimed] = useState<Set<string>>(new Set());
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [joinedCrews, setJoinedCrews] = useState<Set<string>>(new Set());
  const [joinedEvents, setJoinedEvents] = useState<Set<string>>(new Set());
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());

  const logMission = useCallback((tab: MissionTab, id: string) => {
    setMissions((all) => ({
      ...all,
      [tab]: all[tab].map((m) => (m.id === id ? { ...m, current: Math.min(m.goal, +(m.current + m.step).toFixed(2)) } : m)),
    }));
  }, []);

  const completedUnclaimed = useMemo(
    () => Object.values(missions).flat().filter((m) => m.current >= m.goal && !claimed.has(m.id)),
    [missions, claimed],
  );
  const claimable = completedUnclaimed.reduce((sum, m) => sum + m.xp, 0);

  const claimRewards = useCallback(() => {
    const gained = completedUnclaimed.reduce((sum, m) => sum + m.xp, 0);
    const before = Math.floor(xp / XP_PER_LEVEL);
    const after = Math.floor((xp + gained) / XP_PER_LEVEL);
    setXp(xp + gained);
    setCoins((c) => c + Math.round(gained / 2));
    setClaimed((c) => new Set([...c, ...completedUnclaimed.map((m) => m.id)]));
    return { xp: gained, leveledUp: after > before };
  }, [completedUnclaimed, xp]);

  const buy = useCallback(
    (id: string, price: number) => {
      if (owned.has(id) || coins < price) return false;
      setCoins(coins - price);
      setOwned(new Set([...owned, id]));
      return true;
    },
    [coins, owned],
  );

  const value: AppState = {
    avatar,
    setAvatar,
    outfit,
    setOutfit,
    coins,
    xp,
    level: Math.floor(xp / XP_PER_LEVEL) + 1,
    levelXp: xp % XP_PER_LEVEL,
    xpPerLevel: XP_PER_LEVEL,
    missions,
    logMission,
    claimable,
    claimRewards,
    owned,
    buy,
    joinedCrews,
    toggleCrew: (id) => setJoinedCrews((s) => toggle(s, id)),
    joinedEvents,
    toggleEvent: (id) => setJoinedEvents((s) => toggle(s, id)),
    liked,
    toggleLike: (id) => setLiked((s) => toggle(s, id)),
    saved,
    toggleSave: (id) => setSaved((s) => toggle(s, id)),
    claimed,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside <AppStateProvider>');
  return ctx;
}

export type { MissionTab };
