/**
 * Mirror of backend/src/lib/sanitize.ts (v0.34.0+).
 *
 * Used to validate inputs CLIENT-SIDE before submit so the user gets
 * an immediate error instead of a 400 round-trip. The backend re-runs
 * the same checks — defence in depth — never trust the client.
 */

const DANGEROUS_CHARS = /[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069\u200B-\u200D\uFEFF\u2060]/;

export class SanitizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SanitizeError';
  }
}

export function sanitizeFreeText(input: string, maxLength: number): string {
  if (typeof input !== 'string') {
    throw new SanitizeError('Input must be a string.');
  }
  const normalised = input.normalize('NFC');
  if (DANGEROUS_CHARS.test(normalised)) {
    throw new SanitizeError('Input contains forbidden control or bidi characters.');
  }
  const trimmed = normalised.trim();
  if (trimmed.length > maxLength) {
    throw new SanitizeError(`Input exceeds ${maxLength} characters.`);
  }
  return trimmed;
}

export function sanitizeFreeTextOptional(input: string | undefined | null, maxLength: number): string {
  if (input === undefined || input === null || input === '') return '';
  return sanitizeFreeText(input, maxLength);
}
