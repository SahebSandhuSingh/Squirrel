/**
 * Bearer-token verification. Production: RS256 via JWKS (AUTH_JWKS_URL) or a PEM public key —
 * the same tokens the Run Module accepts, user id = `sub`. Development only: HS256 with
 * AUTH_DEV_HS256_SECRET so `npm run dev:token` can mint local tokens. Never enabled in production.
 */
import { createRemoteJWKSet, importSPKI, jwtVerify, type JWTPayload, type KeyLike } from 'jose';
import { config } from '../config.js';

export type Principal = { userId: string; claims: JWTPayload };

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let pemKey: KeyLike | null = null;

async function keyResolver() {
  if (config.auth.jwksUrl) {
    if (!jwks) jwks = createRemoteJWKSet(new URL(config.auth.jwksUrl));
    return jwks;
  }
  if (config.auth.publicKeyPem) {
    if (!pemKey) pemKey = await importSPKI(config.auth.publicKeyPem.replace(/\\n/g, '\n'), 'RS256');
    return pemKey;
  }
  return null;
}

export function authConfigured(): boolean {
  return !!(config.auth.jwksUrl || config.auth.publicKeyPem || (!config.isProd && config.auth.devHs256Secret));
}

export async function verifyBearer(token: string): Promise<Principal> {
  const opts = { issuer: config.auth.issuer, audience: config.auth.audience, clockTolerance: 30 };
  const key = await keyResolver();
  if (key) {
    const { payload } = await jwtVerify(token, key as Parameters<typeof jwtVerify>[1], { ...opts, algorithms: ['RS256', 'RS384', 'RS512', 'ES256'] });
    return toPrincipal(payload);
  }
  if (!config.isProd && config.auth.devHs256Secret) {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(config.auth.devHs256Secret), { ...opts, algorithms: ['HS256'] });
    return toPrincipal(payload);
  }
  throw new Error('auth not configured: set AUTH_JWKS_URL or AUTH_PUBLIC_KEY_PEM');
}

function toPrincipal(payload: JWTPayload): Principal {
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('token has no sub');
  return { userId: payload.sub, claims: payload };
}
