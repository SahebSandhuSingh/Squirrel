/**
 * XP rules, mirrored from the Run Module backend so the app's numbers match what the
 * server will award (see Frontend_Backend_Compatibility_Assessment §4.2):
 *   50 for completing a run + 10 per km + 25 if the run captured territory,
 *   with run XP capped at 150 per day.
 * The backend stores no levels or coins; levels are derived here from the XP total.
 * When the API is live, the server's figure (GET /v1/users/me/xp) always wins.
 */
export const RUN_COMPLETION_XP = 50;
export const XP_PER_KM = 10;
export const TERRITORY_XP = 25;
export const DAILY_RUN_XP_CAP = 150;
export const XP_PER_LEVEL = 2000;

export type XpLine = { label: string; xp: number };

export function runXp(km: number, territoryCaptured: boolean, runXpAlreadyToday: number): { total: number; lines: XpLine[]; capped: boolean } {
  const lines: XpLine[] = [
    { label: 'Run completed', xp: RUN_COMPLETION_XP },
    { label: `Distance · ${km.toFixed(2)} km`, xp: Math.round(km * XP_PER_KM) },
  ];
  if (territoryCaptured) lines.push({ label: 'Territory captured', xp: TERRITORY_XP });
  const raw = lines.reduce((s, l) => s + l.xp, 0);
  const room = Math.max(0, DAILY_RUN_XP_CAP - runXpAlreadyToday);
  const total = Math.min(raw, room);
  if (total < raw) lines.push({ label: `Daily run cap (${DAILY_RUN_XP_CAP} XP)`, xp: total - raw });
  return { total, lines, capped: total < raw };
}

export const levelFromXp = (xp: number) => Math.floor(xp / XP_PER_LEVEL) + 1;
export const xpIntoLevel = (xp: number) => xp % XP_PER_LEVEL;
