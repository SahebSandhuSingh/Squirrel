/**
 * Input rules, mirrored from social-backend/app/rules.py so the app can explain a problem before
 * a round trip. The server enforces them regardless; keep both files in step.
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const USERNAME_RE = /^[a-z][a-z0-9._]{2,19}$/;
const RESERVED = new Set([
  'admin', 'administrator', 'api', 'app', 'help', 'me', 'mod', 'moderator', 'null', 'official',
  'root', 'settings', 'squirrel', 'squirrelsocial', 'staff', 'support', 'system', 'undefined', 'username',
]);

export const normalizeUsername = (raw: string) => raw.trim().toLowerCase();

/** Why a (normalised) username is invalid, or null. Same wording as the server. */
export function usernameProblem(u: string): string | null {
  if (u.length < USERNAME_MIN || u.length > USERNAME_MAX) return `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters.`;
  if (!USERNAME_RE.test(u)) return "Use lowercase letters, numbers, '.' or '_', starting with a letter.";
  if (u.includes('..') || u.endsWith('.')) return "Dots can't be doubled or come last.";
  if (RESERVED.has(u)) return 'That username is reserved.';
  return null;
}

export const CAPTION_MAX = 280;
export const COMMENT_MAX = 500;
export const BIO_MAX = 160;
export const DISPLAY_NAME_MAX = 40;
export const INTERESTS_MAX = 8;
export const INTEREST_MAX_LEN = 24;
export const COLLEGE_MAX = 80;
