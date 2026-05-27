import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config';

/** Name of the cookie that carries the authentication token. */
export const AUTH_COOKIE = 'peregrine_token';

/**
 * Name of the short-lived cookie used during the two-step MFA login.
 * Holds a JWT with a `mfa: 'pending'` claim so it can't accidentally
 * be mistaken for a real session.
 */
export const MFA_PENDING_COOKIE = 'peregrine_mfa_pending';

/** Lifetime of an authentication token, in seconds (7 days). */
const TOKEN_MAX_AGE = 60 * 60 * 24 * 7;

/** Lifetime of an MFA-pending token, in seconds (5 minutes). */
const MFA_PENDING_MAX_AGE = 5 * 60;

// Describes the content of our JSON Web Tokens, so TypeScript knows the
// shape of `request.user` after a token has been verified.
//
// The payload type is a little broader than the user type: signing
// accepts an optional `mfa: 'pending'` claim that we set on the MFA-
// pending intermediate token, but route handlers that look at
// `request.user` should only ever see fully authenticated sessions.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: string; mfa?: 'pending' };
    user: { sub: string; role: string };
  }
}

/**
 * Route guard: rejects the request with 401 if no valid token is present.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    await reply.code(401).send({ error: 'Unauthorized' });
  }
}

/**
 * Route guard: like `authenticate`, but also rejects non-admin users
 * with 403.
 */
export async function authenticateAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    await reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
  if (request.user.role !== 'ADMIN') {
    await reply.code(403).send({ error: 'Forbidden' });
  }
}

/** Signs a session token for the given user and stores it in an httpOnly cookie. */
export function setAuthCookie(
  app: FastifyInstance,
  reply: FastifyReply,
  user: { id: string; role: string },
): void {
  const token = app.jwt.sign(
    { sub: user.id, role: user.role },
    { expiresIn: TOKEN_MAX_AGE },
  );
  reply.setCookie(AUTH_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: TOKEN_MAX_AGE,
  });
}

/** Removes the authentication cookie (used on logout). */
export function clearAuthCookie(reply: FastifyReply): void {
  reply.clearCookie(AUTH_COOKIE, { path: '/' });
}

/**
 * Stores a short-lived "MFA-pending" cookie carrying the user's id.
 * After the user submits a valid TOTP code or recovery code, the verify
 * endpoint swaps this for a real session via `setAuthCookie` and clears
 * this one with `clearMfaPendingCookie`.
 */
export function setMfaPendingCookie(
  app: FastifyInstance,
  reply: FastifyReply,
  user: { id: string; role: string },
): void {
  const token = app.jwt.sign(
    { sub: user.id, role: user.role, mfa: 'pending' },
    { expiresIn: MFA_PENDING_MAX_AGE },
  );
  reply.setCookie(MFA_PENDING_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: MFA_PENDING_MAX_AGE,
  });
}

/** Removes the MFA-pending cookie. */
export function clearMfaPendingCookie(reply: FastifyReply): void {
  reply.clearCookie(MFA_PENDING_COOKIE, { path: '/' });
}

/**
 * Reads + verifies the MFA-pending cookie and returns the user id it
 * was issued for, or null if missing / invalid / expired / not a
 * pending token. Used by /api/auth/mfa/verify.
 */
export function readMfaPendingUserId(
  app: FastifyInstance,
  request: FastifyRequest,
): string | null {
  const raw = request.cookies[MFA_PENDING_COOKIE];
  if (!raw) return null;
  try {
    const payload = app.jwt.verify(raw) as {
      sub: string;
      mfa?: string;
    };
    if (payload.mfa !== 'pending') return null;
    return payload.sub;
  } catch {
    return null;
  }
}
