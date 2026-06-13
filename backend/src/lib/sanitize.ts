/**
 * Centralised input sanitisation library (v0.34.0+).
 *
 * Zero Trust principle: every user-controlled string is run through
 * `sanitizeFreeText` at the route boundary. The function performs a
 * minimal, predictable cleanup that **rejects** dangerous input
 * rather than trying to repair it — silent repairs are how parser
 * differential attacks get in.
 *
 * Steps applied to every input:
 *   1. NFC normalise (collapses combining-char variants of the same
 *      glyph; e.g. precomposed "é" vs "e" + U+0301).
 *   2. Reject if it contains any character from the dangerous set:
 *      - C0 control chars (U+0000 - U+001F).
 *      - DEL (U+007F).
 *      - Bidi override / format chars (U+202A - U+202E, U+2066 - U+2069):
 *        these flip rendering direction and are used in the classic
 *        `evil\u202egpj.exe` filename attack.
 *      - Zero-width chars (U+200B - U+200D, U+FEFF, U+2060): invisible
 *        and routinely used to bypass uniqueness checks.
 *   3. Trim leading + trailing whitespace.
 *   4. Enforce maxLength after normalisation (since NFC can change length).
 */

const DANGEROUS_CHARS = /[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069\u200B-\u200D\uFEFF\u2060]/;

export class SanitizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SanitizeError';
  }
}

/**
 * Sanitises a free-text field. Throws SanitizeError on bad input.
 * Returns a normalised, trimmed, length-capped string.
 */
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

/**
 * Optional sanitiser: returns '' when input is empty / undefined,
 * otherwise behaves like sanitizeFreeText.
 */
export function sanitizeFreeTextOptional(
  input: string | undefined | null,
  maxLength: number,
): string {
  if (input === undefined || input === null || input === '') return '';
  return sanitizeFreeText(input, maxLength);
}

/**
 * Sanitises a reason string passed to RCON (kick/ban/etc.). On top of
 * the standard rules, strips Minecraft chat colour codes (`§`) because
 * they let an attacker render misleading content to other players
 * (`§4§lBANNED FOR HACKING` faking a server message).
 */
export function sanitizeRconReason(input: string, maxLength = 200): string {
  const base = sanitizeFreeText(input, maxLength);
  return base.replace(/§/g, '');
}

/**
 * Validates an uploaded filename — strips any path component (defence
 * in depth), then rejects names that would break on Windows or
 * shell-escape on Unix.
 */
const WINDOWS_RESERVED = /[<>:"/\\|?*]/;
const WINDOWS_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;

export function sanitizeFilename(input: string, maxLength = 255): string {
  if (typeof input !== 'string') {
    throw new SanitizeError('Filename must be a string.');
  }
  const normalised = input.normalize('NFC');
  if (DANGEROUS_CHARS.test(normalised)) {
    throw new SanitizeError('Filename contains forbidden characters.');
  }
  const base = normalised.split(/[/\\]/).pop() ?? '';
  if (base.length === 0 || base === '.' || base === '..') {
    throw new SanitizeError('Invalid filename.');
  }
  if (WINDOWS_RESERVED.test(base) || WINDOWS_RESERVED_NAMES.test(base)) {
    throw new SanitizeError('Filename uses reserved characters or names.');
  }
  if (base.length > maxLength) {
    throw new SanitizeError(`Filename exceeds ${maxLength} characters.`);
  }
  return base;
}
