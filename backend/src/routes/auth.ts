import type { FastifyInstance } from 'fastify';
import { hashPassword, verifyPassword } from '../lib/password';
import { isRateLimited, recordAttempt, clearAttempts, retryAfterSeconds } from '../lib/rateLimit';
import { logAuthEvent } from '../lib/authEvents';
import {
  countUsers,
  createUser,
  findUserById,
  findUserByUsername,
  setUserPassword,
  type UserRecord,
} from '../lib/users';
import {
  deleteInviteByToken,
  findInviteByToken,
} from '../lib/invites';
import {
  authenticate,
  clearAuthCookie,
  clearMfaPendingCookie,
  readMfaPendingUserId,
  setAuthCookie,
  setMfaPendingCookie,
} from '../plugins/auth';
import {
  buildOtpAuthUri,
  generateSecret,
  verifyTotp,
} from '../lib/totp';
import {
  consumeRecoveryCode,
  disableMfa,
  generateRecoveryCodes,
  hashRecoveryCodes,
  persistMfa,
  remainingRecoveryCodes,
  userHasMfa,
} from '../lib/mfa';

interface SetupBody {
  username: string;
  email: string;
  password: string;
}

interface LoginBody {
  username: string;
  password: string;
}

interface AcceptInviteBody {
  password: string;
}

interface MfaEnableBody {
  secret: string;
  code: string;
}

interface MfaDisableBody {
  password: string;
}

interface MfaVerifyBody {
  code?: string;
  recoveryCode?: string;
}

/** Shapes a user for the API response — never exposes the password hash. */
function publicUser(user: UserRecord) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    mfaEnabled: userHasMfa(user),
    mfaRecoveryRemaining: remainingRecoveryCodes(user),
  };
}

const EMAIL_PATTERN = '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$';
// v0.23.0+: rate-limit budget for the login + MFA verify endpoints.
// 5 attempts per IP per minute, with a 1-minute lockout once reached.
const LOGIN_LIMIT = { max: 5, windowMs: 60_000, lockoutMs: 60_000 };

/** Returns the client IP from Fastify's request. */
function clientIp(request: import('fastify').FastifyRequest): string {
  return (request.ip || '?').trim();
}

const USERNAME_PATTERN = '^[A-Za-z0-9._-]+$';

/**
 * Authentication routes (mounted under /api/auth):
 *   GET  /setup-required     - is the first-run setup still needed?
 *   POST /setup              - create the first account (the administrator)
 *   POST /login              - log in with username + password (may require MFA)
 *   POST /logout             - log out
 *   GET  /me                 - the currently logged-in user (protected)
 *   GET  /invite/:token      - check an invitation and return the username
 *   POST /invite/:token      - set the password and log in (single-use)
 *   POST /mfa/setup          - get a fresh TOTP secret + QR URI (protected)
 *   POST /mfa/enable         - persist the secret after the user enters a code
 *   POST /mfa/disable        - turn MFA off (re-asks for the password)
 *   POST /mfa/verify         - finishes a 2-step login with a TOTP / recovery code
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/setup-required', async () => {
    return { setupRequired: countUsers() === 0 };
  });

  app.post(
    '/setup',
    {
      schema: {
        body: {
          type: 'object',
          required: ['username', 'email', 'password'],
          additionalProperties: false,
          properties: {
            username: {
              type: 'string',
              minLength: 3,
              maxLength: 32,
              pattern: USERNAME_PATTERN,
            },
            email: { type: 'string', pattern: EMAIL_PATTERN, maxLength: 254 },
            password: { type: 'string', minLength: 8, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      if (countUsers() > 0) {
        return reply
          .code(409)
          .send({ error: 'Setup has already been completed.' });
      }
      const { username, email, password } = request.body as SetupBody;
      const user = createUser({
        username,
        email: email.toLowerCase(),
        passwordHash: await hashPassword(password),
        role: 'ADMIN',
      });
      setAuthCookie(app, reply, user);
      return { user: publicUser(user) };
    },
  );

  app.post(
    '/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password'],
          additionalProperties: false,
          properties: {
            username: { type: 'string', minLength: 1, maxLength: 32 },
            password: { type: 'string', minLength: 1, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      const ip = clientIp(request);
      if (isRateLimited(ip, LOGIN_LIMIT)) {
        logAuthEvent({
          kind: 'auth.login_rate_limited',
          username: (request.body as LoginBody)?.username,
          remoteIp: ip,
        });
        const retry = retryAfterSeconds(ip, LOGIN_LIMIT);
        reply.header('Retry-After', String(retry));
        return reply
          .code(429)
          .send({ error: `Too many attempts. Retry in ${retry}s.` });
      }
      const { username, password } = request.body as LoginBody;
      const user = findUserByUsername(username);
      if (!user || !(await verifyPassword(user.passwordHash, password))) {
        recordAttempt(ip, LOGIN_LIMIT);
        logAuthEvent({
          kind: 'auth.login_failed',
          userId: user?.id ?? null,
          username,
          remoteIp: ip,
        });
        return reply
          .code(401)
          .send({ error: 'Invalid username or password.' });
      }
      clearAttempts(ip);
      if (userHasMfa(user)) {
        setMfaPendingCookie(app, reply, user);
        return reply.send({ requiresMfa: true });
      }
      logAuthEvent({
        kind: 'auth.login',
        userId: user.id,
        username: user.username,
        remoteIp: ip,
      });
      setAuthCookie(app, reply, user);
      return { user: publicUser(user) };
    },
  );

  app.post('/logout', async (request, reply) => {
    logAuthEvent({
      kind: 'auth.logout',
      userId: (request.user as { sub?: string } | undefined)?.sub ?? null,
      remoteIp: clientIp(request),
    });
    clearAuthCookie(reply);
    clearMfaPendingCookie(reply);
    return { ok: true };
  });

  app.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const user = findUserById(request.user.sub);
    if (!user) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    return { user: publicUser(user) };
  });

  // --- Invitation flow (unchanged from v0.2.0) ---

  app.get('/invite/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const invite = findInviteByToken(token);
    if (!invite) {
      return reply.code(404).send({ error: 'Invitation not found.' });
    }
    const user = findUserById(invite.userId);
    if (!user) {
      return reply.code(404).send({ error: 'Invitation not found.' });
    }
    return { username: user.username };
  });

  app.post(
    '/invite/:token',
    {
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          additionalProperties: false,
          properties: {
            password: { type: 'string', minLength: 8, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      const { token } = request.params as { token: string };
      const invite = findInviteByToken(token);
      if (!invite) {
        return reply.code(404).send({ error: 'Invitation not found.' });
      }
      const user = findUserById(invite.userId);
      if (!user) {
        return reply.code(404).send({ error: 'Invitation not found.' });
      }
      const { password } = request.body as AcceptInviteBody;
      setUserPassword(user.id, await hashPassword(password));
      deleteInviteByToken(token);
      setAuthCookie(app, reply, user);
      return { user: publicUser(user) };
    },
  );

  // --- MFA flow ------------------------------------------------------

  // Generates a fresh TOTP secret + the otpauth URI for QR rendering.
  // Nothing is persisted yet: the secret travels back to the frontend,
  // and `/mfa/enable` stores it only after the user proves their phone
  // app accepted it.
  app.post('/mfa/setup', { preHandler: authenticate }, async (request, reply) => {
    const user = findUserById(request.user.sub);
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });
    if (userHasMfa(user)) {
      return reply.code(409).send({ error: 'MFA is already enabled.' });
    }
    const secret = generateSecret();
    const otpAuthUri = buildOtpAuthUri({
      secret,
      username: user.username,
      issuer: 'Peregrine',
    });
    return { secret, otpAuthUri };
  });

  // Verifies the user's first TOTP code, then persists the secret and
  // returns the freshly minted recovery codes — shown once, never
  // again (only Argon2 hashes are stored).
  app.post(
    '/mfa/enable',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['secret', 'code'],
          additionalProperties: false,
          properties: {
            secret: { type: 'string', minLength: 16, maxLength: 64 },
            code: { type: 'string', minLength: 6, maxLength: 8 },
          },
        },
      },
    },
    async (request, reply) => {
      const user = findUserById(request.user.sub);
      if (!user) return reply.code(401).send({ error: 'Unauthorized' });
      if (userHasMfa(user)) {
        return reply.code(409).send({ error: 'MFA is already enabled.' });
      }
      const body = request.body as MfaEnableBody;
      if (!verifyTotp(body.secret, body.code)) {
        return reply.code(400).send({
          error:
            'The code did not match. Make sure your phone clock is correct and try again.',
        });
      }
      const recoveryCodes = generateRecoveryCodes();
      const hashed = await hashRecoveryCodes(recoveryCodes);
      persistMfa({
        userId: user.id,
        secret: body.secret,
        hashedRecoveryCodes: hashed,
      });
      return { recoveryCodes };
    },
  );

  // Turning MFA off requires the current password — defence in depth
  // against someone hijacking an unattended browser session.
  app.post(
    '/mfa/disable',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['password'],
          additionalProperties: false,
          properties: {
            password: { type: 'string', minLength: 1, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      const user = findUserById(request.user.sub);
      if (!user) return reply.code(401).send({ error: 'Unauthorized' });
      if (!userHasMfa(user)) {
        return reply.code(409).send({ error: 'MFA is not enabled.' });
      }
      const body = request.body as MfaDisableBody;
      if (!(await verifyPassword(user.passwordHash, body.password))) {
        return reply.code(401).send({ error: 'Incorrect password.' });
      }
      disableMfa(user.id);
      return { ok: true };
    },
  );

  // Step 2 of the login flow: the user has already presented their
  // password (which gave them an MFA-pending cookie); now they prove
  // possession of their second factor.
  app.post(
    '/mfa/verify',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            code: { type: 'string', minLength: 6, maxLength: 8 },
            recoveryCode: { type: 'string', minLength: 8, maxLength: 32 },
          },
        },
      },
    },
    async (request, reply) => {
      const ipForCheck = clientIp(request);
      if (isRateLimited(ipForCheck, LOGIN_LIMIT)) {
        logAuthEvent({ kind: 'auth.login_rate_limited', remoteIp: ipForCheck });
        const retry = retryAfterSeconds(ipForCheck, LOGIN_LIMIT);
        reply.header('Retry-After', String(retry));
        return reply.code(429).send({ error: `Too many attempts. Retry in ${retry}s.` });
      }
      const pendingUserId = readMfaPendingUserId(app, request);
      if (!pendingUserId) {
        return reply.code(401).send({ error: 'No pending login. Sign in again.' });
      }
      const user = findUserById(pendingUserId);
      if (!user || !user.mfaSecret) {
        clearMfaPendingCookie(reply);
        return reply.code(401).send({ error: 'No pending login. Sign in again.' });
      }
      const body = request.body as MfaVerifyBody;

      let ok = false;
      if (body.code) {
        ok = verifyTotp(user.mfaSecret, body.code);
      } else if (body.recoveryCode) {
        ok = await consumeRecoveryCode(user.id, body.recoveryCode);
      } else {
        return reply
          .code(400)
          .send({ error: 'Provide either a code or a recovery code.' });
      }
      if (!ok) {
        const ipFail = clientIp(request);
        recordAttempt(ipFail, LOGIN_LIMIT);
        logAuthEvent({
          kind: 'auth.mfa_failed',
          userId: user.id,
          username: user.username,
          remoteIp: ipFail,
        });
        return reply.code(401).send({ error: 'Invalid code.' });
      }
      const ipOk = clientIp(request);
      clearAttempts(ipOk);
      clearMfaPendingCookie(reply);
      setAuthCookie(app, reply, user);
      logAuthEvent({
        kind: 'auth.login_mfa',
        userId: user.id,
        username: user.username,
        remoteIp: ipOk,
      });
      const fresh = findUserById(user.id)!;
      return { user: publicUser(fresh) };
    },
  );
}
