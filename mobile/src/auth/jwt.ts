/**
 * The signed-in user's id is the token's `sub` claim. Read without verifying: the server
 * verifies every request, and the app only uses this to recognise its own leaderboard rows.
 */
export function jwtSubject(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const json = decodeURIComponent(
      Array.from(globalThis.atob(b64), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
    );
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === 'string' && sub ? sub : null;
  } catch {
    return null;
  }
}
