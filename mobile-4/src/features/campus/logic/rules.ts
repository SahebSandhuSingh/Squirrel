/**
 * The rules of the campus game, as pure functions. The preview service runs them; a real
 * backend is the authority and the app only uses them to decide which buttons to show.
 *
 *   CLAIM      neutral zone, you're there                         → your crew holds it
 *   ATTACK     a rival holds it, you're there                     → it's contested, the push grows
 *   CAPTURE    your crew's attack is past 75 %, you're there       → the zone changes hands
 *   DEFEND     your crew holds it and it's contested or weakened  → strength up, attackers pushed back
 *   CHALLENGE  a rival holds it and nobody is attacking           → a formal 2-hour crew battle;
 *              you can call it from anywhere
 * Protected zones (residences, the school) take no actions at all.
 */
import type { ActionResult, Activity, Challenge, LngLat, Player, Territory, Zone, ZoneAction } from '../types.ts';
import { inRing, metres } from '../../world/logic/geometry.ts';

/** How close you must be to act on a zone (or be inside it). */
export const ACTION_RANGE_M = 300;
export const CAPTURE_AT = 75;
export const CHALLENGE_MS = 2 * 60 * 60 * 1000;
/** A hold lapses if nobody defends it for a week. */
export const HOLD_MS = 7 * 24 * 60 * 60 * 1000;

export type Reach = { inside: boolean; distanceM: number; inRange: boolean };

export function reachOf(zone: Pick<Zone, 'geometry' | 'center'>, me: LngLat | null): Reach | null {
  if (!me) return null;
  const inside = inRing(me, zone.geometry.polygon[0]);
  const distanceM = inside ? 0 : Math.round(metres(me, zone.center));
  return { inside, distanceM, inRange: inside || distanceM <= ACTION_RANGE_M };
}

export type Allowed = {
  /** Actions you can take now, most important first. */
  actions: ZoneAction[];
  /** Actions you could take if you were closer. */
  needPresence: ZoneAction[];
  /** Why nothing is possible, when nothing is. */
  reason: string | null;
};

export function allowedActions(zone: Zone, player: Player, reach: Reach | null): Allowed {
  const mine = !!player.crewId && zone.ownerCrewId === player.crewId;
  const rival = !!zone.ownerCrewId && !mine;
  const ch = zone.challenge;
  const wanted: ZoneAction[] = [];
  if (zone.status === 'locked') return { actions: [], needPresence: [], reason: 'Protected ground — residences and the school are never playable.' };
  if (!player.crewId) return { actions: [], needPresence: [], reason: 'Join a crew to claim territory.' };
  if (zone.status === 'neutral') wanted.push('claim');
  if (mine && (zone.status === 'contested' || zone.defenseStrength < 100)) wanted.push('defend');
  if (rival) {
    const ours = ch && ch.attackerCrewId === player.crewId;
    if (ours && ch.progress >= CAPTURE_AT) wanted.push('capture');
    else if (!ch || ours) wanted.push('attack');
    if (!ch) wanted.push('challenge');
  }
  const here = !!reach?.inRange;
  const actions = wanted.filter((a) => a === 'challenge' || here);
  const needPresence = wanted.filter((a) => a !== 'challenge' && !here);
  let reason: string | null = null;
  if (!wanted.length) reason = mine ? 'Fully defended. Nothing to do here right now.' : ch ? 'Another crew is already fighting for this zone.' : null;
  return { actions, needPresence, reason };
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

export class RuleError extends Error {
  code: 'not_allowed' | 'out_of_range' | 'locked' | 'no_crew';
  constructor(code: RuleError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

/** Apply one move. `now` and `id` come from the caller so this stays deterministic. */
export function applyAction(zone: Zone, territory: Territory | null, action: ZoneAction, player: Player, reach: Reach | null, now: number, id: string): ActionResult & { activity: Activity } {
  const allowed = allowedActions(zone, player, reach);
  if (zone.status === 'locked') throw new RuleError('locked', 'This zone is protected.');
  if (!player.crewId) throw new RuleError('no_crew', 'Join a crew first.');
  if (allowed.needPresence.includes(action)) throw new RuleError('out_of_range', `Get within ${ACTION_RANGE_M} m to ${action}.`);
  if (!allowed.actions.includes(action)) throw new RuleError('not_allowed', `You can't ${action} this zone right now.`);
  const crew = player.crewId;
  let z: Zone = { ...zone, updatedAt: now };
  let t = territory;
  let outcome: ActionResult['outcome'];
  let xp = 0;

  const take = () => {
    z = { ...z, ownerCrewId: crew, status: 'owned', defenseStrength: 40, challenge: null, lastCapturedAt: now };
    t = { id: `t-${z.id}-${now}`, zoneId: z.id, crewId: crew, strength: 40, capturedAt: now, expiresAt: now + HOLD_MS };
  };

  switch (action) {
    case 'claim':
      take();
      outcome = 'claimed';
      xp = zone.xpValue;
      break;
    case 'attack':
    case 'capture': {
      const gain = action === 'capture' ? 100 : Math.max(8, 30 - Math.round(zone.defenseStrength / 5));
      const ch: Challenge = zone.challenge ?? { id: `c-${z.id}-${now}`, zoneId: z.id, attackerCrewId: crew, defenderCrewId: zone.ownerCrewId as string, progress: 0, startedAt: now, endsAt: now + CHALLENGE_MS };
      const progress = clamp(ch.progress + gain);
      if (progress >= 100) {
        take();
        outcome = 'captured';
        xp = zone.xpValue + 150;
      } else {
        z = { ...z, status: 'contested', challenge: { ...ch, progress }, defenseStrength: clamp(zone.defenseStrength - gain / 2) };
        if (t) t = { ...t, strength: z.defenseStrength };
        outcome = 'attacked';
        xp = 40;
      }
      break;
    }
    case 'defend': {
      const strength = clamp(zone.defenseStrength + 15);
      const ch = zone.challenge ? { ...zone.challenge, progress: clamp(zone.challenge.progress - 25) } : null;
      const repelled = !!zone.challenge && ch!.progress <= 0;
      z = { ...z, defenseStrength: strength, challenge: repelled ? null : ch, status: repelled || !ch ? 'owned' : 'contested' };
      if (t) t = { ...t, strength, expiresAt: now + HOLD_MS };
      outcome = repelled ? 'repelled' : 'defended';
      xp = repelled ? 120 : 30;
      break;
    }
    case 'challenge':
      z = { ...z, status: 'contested', challenge: { id: `c-${z.id}-${now}`, zoneId: z.id, attackerCrewId: crew, defenderCrewId: zone.ownerCrewId as string, progress: 0, startedAt: now, endsAt: now + CHALLENGE_MS } };
      outcome = 'challenged';
      xp = 20;
      break;
  }
  return {
    zone: z,
    territory: t,
    outcome: outcome!,
    xpGained: xp,
    player: { ...player, xp: player.xp + xp },
    activity: { id, zoneId: z.id, userId: player.userId, xp, timestamp: now, kind: action === 'capture' ? 'capture' : action, crewId: crew },
  };
}

/** Level 1–5 from how strongly a zone is held. */
export const holdLevel = (z: Pick<Zone, 'defenseStrength' | 'status'>) => (z.status === 'neutral' || z.status === 'locked' ? 0 : Math.max(1, Math.min(5, Math.ceil(z.defenseStrength / 20))));

export const defenseLabel = (n: number) => (n >= 85 ? 'FORTIFIED' : n >= 60 ? 'STRONG' : n >= 35 ? 'HOLDING' : 'WEAK');
