import { createHmac, randomBytes } from 'node:crypto';

/**
 * Hand-rolled TOTP (RFC 6238) + base32 codec, in ~60 lines and no
 * external dependency. The output matches Google Authenticator, Authy,
 * 1Password, Bitwarden, etc. — anything that speaks RFC 4226/6238.
 *
 * Algorithm summary:
 *   counter = floor(now / 30)
 *   hmac    = HMAC-SHA1(secret, counter as 8-byte big-endian)
 *   offset  = hmac[19] & 0x0f
 *   code    = (4 bytes starting at offset, masked) mod 10^6
 */

/** RFC 4648 base32 alphabet (no padding chars in our encoding). */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** TOTP time step, in seconds (the RFC default). */
const STEP_SECONDS = 30;

/** Number of digits in the generated code. */
const DIGITS = 6;

/** Encodes a Buffer as a base32 string (no padding). */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

/** Decodes a base32 string (case-insensitive, padding optional) into a Buffer. */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const index = ALPHABET.indexOf(ch);
    if (index < 0) {
      throw new Error(`Invalid base32 character: ${ch}`);
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/**
 * Generates a fresh 20-byte (160-bit) random secret and returns it as
 * a base32 string — the format expected by every TOTP app.
 */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Computes the 6-digit code for a given secret and Unix timestamp (s). */
export function totpCode(
  base32Secret: string,
  unixSeconds: number,
): string {
  const secret = base32Decode(base32Secret);
  const counter = Math.floor(unixSeconds / STEP_SECONDS);

  const counterBuf = Buffer.alloc(8);
  // Big-endian 64-bit counter. JS bitops are 32-bit, so write the high
  // 32 bits then the low 32 bits.
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);

  const hmac = createHmac('sha1', secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const code = binary % 10 ** DIGITS;
  return String(code).padStart(DIGITS, '0');
}

/**
 * Verifies a 6-digit code against a secret. Accepts a small window
 * around "now" (±1 step = ±30 s) to tolerate clock drift between the
 * server and the user's phone.
 */
export function verifyTotp(
  base32Secret: string,
  code: string,
  now: Date = new Date(),
  windowSteps = 1,
): boolean {
  const clean = code.replace(/\D/g, '');
  if (clean.length !== DIGITS) return false;
  const t = Math.floor(now.getTime() / 1000);
  for (let drift = -windowSteps; drift <= windowSteps; drift++) {
    if (totpCode(base32Secret, t + drift * STEP_SECONDS) === clean) {
      return true;
    }
  }
  return false;
}

/**
 * Builds the otpauth:// URI consumed by every authenticator app when
 * scanned as a QR code. `label` is what the app shows next to the code
 * (we use `Peregrine:<username>`); `issuer` is the small text below.
 */
export function buildOtpAuthUri(input: {
  secret: string;
  username: string;
  issuer?: string;
}): string {
  const issuer = input.issuer ?? 'Peregrine';
  const label = `${issuer}:${input.username}`;
  const params = new URLSearchParams({
    secret: input.secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}
