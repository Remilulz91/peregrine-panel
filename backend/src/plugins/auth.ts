import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config';

/** Name of the cookie that carries the authentication token. */
export const AUTH_COOKIE = 'peregrine_token';

/** Lifetime of an authentication token, in seconds (7 days). */
const TOKEN_MAX_AGE = 60 * 60 * 24 * 7;

// Describes the content of our JSON Web Tokens, so TypeScript knows the
// shape of `request.user` after a token has been verified.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: string };
    user: { sub: string; role: string };
  }
}

/**
 * Route guard: rejects the request with 401 if no valid token is present.
 * Use it as a `preHandler` on routes that require authentication.
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

/** Signs a token for the given user and stores it in an httpOnly cookie. */
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
