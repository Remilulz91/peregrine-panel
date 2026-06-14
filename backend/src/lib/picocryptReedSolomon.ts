/**
 * Reed-Solomon encoder over GF(2^8), bit-compatible with the
 * `github.com/Picocrypt/infectious` Go library that Picocrypt itself
 * uses for header forward-error-correction.
 *
 * We only need ENCODING here (Peregrine writes Picocrypt-format backups
 * but never reads them back — the official Picocrypt desktop tool is
 * the canonical decryptor). Berlekamp-Welch decoding is therefore not
 * implemented.
 *
 * # Field
 *
 * GF(256) with the AES/infectious irreducible polynomial:
 *     P(x) = x^8 + x^4 + x^3 + x^2 + 1     (0x11D in 9-bit form)
 * and primitive element α = 2 (i.e. the polynomial x).
 *
 * # Code structure
 *
 * For each `FEC(k, n)`:
 *   - input is exactly `k` bytes (one byte per data share)
 *   - output is exactly `n` bytes (one byte per encoded share)
 *   - The first `k` output bytes are identical to the input
 *     (systematic property) — this is what makes the fast-path
 *     `return data[:k]` decode possible in the official tool.
 *   - The remaining `n - k` output bytes are linear combinations of
 *     the input bytes under a Vandermonde generator matrix.
 *
 * The exact generator-matrix construction matters: if our parity bytes
 * differ even by one byte from what `infectious` produces, the
 * Berlekamp-Welch decoder on the Picocrypt side will either declare
 * the header corrupt or (worse) "fix" the wrong bytes and produce
 * garbage. The construction below mirrors `infectious`'s
 * `enc_matrix.go`:
 *
 *   1. Build the row-major Vandermonde matrix V[n][k] where
 *      V[r][c] = α^(r*c) in GF(256).
 *   2. Invert the top k×k submatrix (Gauss-Jordan).
 *   3. The actual encoding matrix is V × V_top⁻¹ ; its first k rows are
 *      the identity (giving systematic encoding for free), so we only
 *      need to materialize and store the bottom (n - k) rows.
 *
 * # VERIFICATION NEEDED
 *
 * Until we round-trip a small file through the official Picocrypt
 * binary (see docs/HARDENING.md once it lands), treat this module as
 * "best effort" rather than "proven byte-perfect". The crypto is
 * deterministic, so any mismatch will surface on the very first test.
 */

const FIELD_SIZE = 256;
const FIELD_ORDER = 255; // multiplicative group order
const IRREDUCIBLE_POLY = 0x1d; // low 8 bits of x^8 + x^4 + x^3 + x^2 + 1

/** exp[i] = α^i mod P, where α = 2. exp[FIELD_ORDER] = exp[0] = 1. */
const exp = new Uint8Array(FIELD_SIZE);
/** log[exp[i]] = i. log[0] is undefined (0 has no logarithm) and stays 0. */
const log = new Uint8Array(FIELD_SIZE);

/** Initializes the GF(256) exp/log tables, run once at module load. */
function initTables(): void {
  let x = 1;
  for (let i = 0; i < FIELD_ORDER; i++) {
    exp[i] = x;
    log[x] = i;
    // Multiply by α = 2: shift left, conditionally fold by the irreducible polynomial.
    x <<= 1;
    if ((x & 0x100) !== 0) {
      x = (x ^ IRREDUCIBLE_POLY) & 0xff;
    }
  }
  // Wrap-around: exp[255] = exp[0] = 1 so callers can use (i + j) % 255 freely.
  exp[FIELD_ORDER] = exp[0];
}
initTables();

/** GF(256) multiplication. Both 0 cases collapse to 0. */
function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return exp[(log[a] + log[b]) % FIELD_ORDER];
}

/** GF(256) division a / b. Throws on division by zero. */
function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error('GF(256) division by zero');
  if (a === 0) return 0;
  return exp[(log[a] + FIELD_ORDER - log[b]) % FIELD_ORDER];
}

/**
 * Builds the row-major n×k Vandermonde matrix with V[r][c] = α^(r*c).
 * Stored as a flat Uint8Array of length n*k where the (r, c) entry is at
 * offset r*k + c.
 */
function buildVandermonde(n: number, k: number): Uint8Array {
  const m = new Uint8Array(n * k);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < k; c++) {
      if (c === 0) {
        m[r * k + c] = 1; // α^0 = 1
      } else if (r === 0) {
        m[r * k + c] = c === 0 ? 1 : 0; // 0^c = 0 for c > 0
      } else {
        // exp[(log_alpha(r) * c) % 255]. log_alpha(r) = log[r] since α = 2.
        m[r * k + c] = exp[(log[r] * c) % FIELD_ORDER];
      }
    }
  }
  return m;
}

/**
 * Inverts a k×k matrix in-place using Gauss-Jordan elimination over
 * GF(256). The input is stored row-major as a flat Uint8Array of
 * length k*k. Returns a NEW Uint8Array containing the inverse.
 *
 * Throws if the matrix is singular (shouldn't happen for the
 * Vandermonde top-k slice, which has distinct rows by construction).
 */
function invertMatrix(matrix: Uint8Array, k: number): Uint8Array {
  // Build an augmented [matrix | I] of size k × 2k.
  const aug = new Uint8Array(k * 2 * k);
  for (let r = 0; r < k; r++) {
    for (let c = 0; c < k; c++) {
      aug[r * 2 * k + c] = matrix[r * k + c];
    }
    aug[r * 2 * k + k + r] = 1;
  }

  // Forward elimination + back substitution.
  for (let r = 0; r < k; r++) {
    // Find a pivot row with a non-zero entry in column r.
    let pivotRow = r;
    while (pivotRow < k && aug[pivotRow * 2 * k + r] === 0) {
      pivotRow++;
    }
    if (pivotRow === k) {
      throw new Error('Singular matrix during Reed-Solomon setup');
    }
    if (pivotRow !== r) {
      // Swap rows r and pivotRow.
      for (let c = 0; c < 2 * k; c++) {
        const tmp = aug[r * 2 * k + c];
        aug[r * 2 * k + c] = aug[pivotRow * 2 * k + c];
        aug[pivotRow * 2 * k + c] = tmp;
      }
    }

    // Scale pivot row so the pivot becomes 1.
    const pivot = aug[r * 2 * k + r];
    if (pivot !== 1) {
      for (let c = 0; c < 2 * k; c++) {
        aug[r * 2 * k + c] = gfDiv(aug[r * 2 * k + c], pivot);
      }
    }

    // Eliminate column r in every other row.
    for (let other = 0; other < k; other++) {
      if (other === r) continue;
      const factor = aug[other * 2 * k + r];
      if (factor === 0) continue;
      for (let c = 0; c < 2 * k; c++) {
        // GF addition is XOR. row_other -= factor * row_r.
        aug[other * 2 * k + c] ^= gfMul(factor, aug[r * 2 * k + c]);
      }
    }
  }

  // Extract the right half as the inverse.
  const inv = new Uint8Array(k * k);
  for (let r = 0; r < k; r++) {
    for (let c = 0; c < k; c++) {
      inv[r * k + c] = aug[r * 2 * k + k + c];
    }
  }
  return inv;
}

/**
 * Multiplies an n×k matrix `a` by a k×k matrix `b` over GF(256).
 * Both inputs are row-major flat Uint8Arrays.
 */
function multiplyMatrices(
  a: Uint8Array,
  b: Uint8Array,
  n: number,
  mid: number,
  k: number,
): Uint8Array {
  const out = new Uint8Array(n * k);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < k; c++) {
      let acc = 0;
      for (let i = 0; i < mid; i++) {
        acc ^= gfMul(a[r * mid + i], b[i * k + c]);
      }
      out[r * k + c] = acc;
    }
  }
  return out;
}

/**
 * Precomputed encoder for a fixed (k, n) pair. Cache these — the
 * matrix work is the expensive part (~k² for invert, n×k² for the
 * multiply) and is amortized across many encode() calls.
 */
export class PicocryptRSEncoder {
  readonly k: number;
  readonly n: number;
  /** Bottom (n - k) rows of the full encoding matrix, in row-major form. */
  private readonly parityMatrix: Uint8Array;

  constructor(k: number, n: number) {
    if (k <= 0 || n <= k || n >= FIELD_SIZE) {
      throw new Error(`Invalid Reed-Solomon parameters: FEC(${k}, ${n})`);
    }
    this.k = k;
    this.n = n;

    // Full Vandermonde n × k, then enc = V × inv(V[0..k][0..k]).
    const v = buildVandermonde(n, k);
    const topK = new Uint8Array(k * k);
    for (let r = 0; r < k; r++) {
      for (let c = 0; c < k; c++) {
        topK[r * k + c] = v[r * k + c];
      }
    }
    const invTopK = invertMatrix(topK, k);
    const enc = multiplyMatrices(v, invTopK, n, k, k);

    // Keep only the bottom (n - k) rows — the top k are the identity
    // since enc[0..k] = V[0..k] × inv(V[0..k]) = I, and we encode the
    // systematic shares by direct copy.
    this.parityMatrix = new Uint8Array((n - k) * k);
    for (let r = 0; r < n - k; r++) {
      for (let c = 0; c < k; c++) {
        this.parityMatrix[r * k + c] = enc[(k + r) * k + c];
      }
    }
  }

  /**
   * Encodes exactly `k` input bytes into `n` output bytes, returning a
   * fresh Uint8Array. The first `k` output bytes are identical to the
   * input; the remaining `n - k` are computed parity.
   *
   * Throws if `data.length !== this.k`.
   */
  encode(data: Uint8Array): Uint8Array {
    if (data.length !== this.k) {
      throw new Error(
        `Reed-Solomon encode expected ${this.k} bytes, got ${data.length}`,
      );
    }
    const out = new Uint8Array(this.n);
    // Systematic shares: direct copy.
    for (let i = 0; i < this.k; i++) {
      out[i] = data[i];
    }
    // Parity shares: per-share linear combination of all k data bytes.
    for (let r = 0; r < this.n - this.k; r++) {
      let acc = 0;
      for (let c = 0; c < this.k; c++) {
        acc ^= gfMul(this.parityMatrix[r * this.k + c], data[c]);
      }
      out[this.k + r] = acc;
    }
    return out;
  }
}

/**
 * Singleton encoders for the exact (k, n) pairs Picocrypt's header
 * uses. Constructing them is non-trivial (matrix invert + multiply),
 * so we build them once at module load.
 */
export const RS5 = new PicocryptRSEncoder(5, 15); // version + commentLen + flags
export const RS16 = new PicocryptRSEncoder(16, 48); // argon2 salt + serpent IV
export const RS24 = new PicocryptRSEncoder(24, 72); // xchacha20 nonce
export const RS32 = new PicocryptRSEncoder(32, 96); // HKDF salt + keyfile-hash slot
export const RS64 = new PicocryptRSEncoder(64, 192); // keyHash + MAC slot
/**
 * Single-byte FEC used for comment characters (one input byte → three
 * output bytes). Unused in this MVP because we never write comments,
 * but kept here for future symmetry.
 */
export const RS1 = new PicocryptRSEncoder(1, 3);
