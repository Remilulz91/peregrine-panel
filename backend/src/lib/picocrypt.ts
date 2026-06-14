/**
 * Picocrypt v1.48 strict-format encryptor.
 *
 * Produces files that are byte-for-byte compatible with the official
 * Picocrypt desktop application (`https://github.com/Picocrypt/Picocrypt`)
 * so users can take a backup off the server and decrypt it on any
 * platform Picocrypt ships for (Windows / macOS / Linux).
 *
 * # Scope of this MVP
 *
 * Only the **baseline** Picocrypt mode is implemented:
 *   - No paranoid mode (no Serpent cascade) — flag[0] = 0
 *   - No keyfiles                                — flag[1] = 0, flag[2] = 0
 *   - No Reed-Solomon body encoding              — flag[3] = 0, flag[4] = 0
 *   - No deniability (the CLI doesn't support it either)
 *   - No comments (commentLen = "00000")
 *
 * These are the most common options for an encrypted-backup use case
 * and they keep the implementation surface small. The Picocrypt
 * decryptor handles a flag-by-flag matrix, so adding paranoid / RS /
 * etc. later is a strict extension: any file produced by THIS code
 * stays decryptable by all future Picocrypt versions.
 *
 * # Crypto details (mirrored from the official spec)
 *
 *  - Argon2id with hardcoded params: time=4, memory=1 GiB, parallelism=4
 *    → 32-byte master key. **This is the slow step** (~5–10 s and
 *    ~1 GiB RAM on the worker that runs it).
 *  - keyHash = SHA3-512(masterKey)            — stored in the header so
 *    Picocrypt can fail-fast on wrong passwords without doing any body
 *    work.
 *  - HKDF-SHA3-256(masterKey, hkdfSalt) →
 *      32-byte BLAKE2b-512 MAC subkey  ‖
 *      32-byte Serpent key            (unused in non-paranoid mode but
 *                                       still consumed from the HKDF
 *                                       stream, otherwise the byte
 *                                       offsets break).
 *  - XChaCha20 raw stream cipher (NOT XChaCha20-Poly1305): the body is
 *    a pure XOR of the plaintext with the keystream. Integrity comes
 *    from the global keyed BLAKE2b over the ciphertext, NOT from per-
 *    chunk Poly1305 tags.
 *  - Header forward-error-correction: every fixed field is
 *    Reed-Solomon expanded by 3× (e.g. the 16-byte Argon2 salt becomes
 *    48 bytes on disk). See `picocryptReedSolomon.ts`.
 *
 * # Header layout (789 bytes when no comments)
 *
 *     offset  size  field
 *     ------  ----  --------------------------------------------------
 *          0    15  Version string "v1.48"      (RS5)
 *         15    15  Comment length "00000"      (RS5)
 *         30    15  Flags [0,0,0,0,0]           (RS5)
 *         45    48  Argon2id salt   (16 raw)    (RS16)
 *         93    96  HKDF salt       (32 raw)    (RS32)
 *        189    48  Serpent IV      (16 raw)    (RS16)
 *        237    72  XChaCha20 nonce (24 raw)    (RS24)
 *        309   192  SHA3-512(key)   (64 raw)    (RS64)
 *        501    96  keyfile hash    (32 raw)    (RS32, all-zero here)
 *        597   192  MAC tag         (64 raw)    (RS64, patched at end)
 *        789   ---  encrypted body starts here
 *
 * Verification: after we have a real Picocrypt binary on hand, encrypt
 * a 1-byte file with a fixed password / salt / nonce in both this
 * implementation and the reference CLI, then `cmp` the outputs.
 */

import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { hashRaw, Algorithm } from '@node-rs/argon2';
import { blake2b } from '@noble/hashes/blake2b';
import { sha3_512, sha3_256 } from '@noble/hashes/sha3';
import { hkdf } from '@noble/hashes/hkdf';
// The standard `libsodium-wrappers` build does NOT expose the raw
// `crypto_stream_xchacha20_xor_ic` primitive — only the AEAD variants
// (which would add Poly1305 tags and break Picocrypt compatibility).
// The "-sumo" build is the same WASM module compiled with the full
// libsodium symbol set, including the low-level stream cipher we need
// for byte-perfect interop. (+~1 MB on disk; one-time cost on a
// backend container, unimportant in practice.)
import _sodium from 'libsodium-wrappers-sumo';
import {
  RS5,
  RS16,
  RS24,
  RS32,
  RS64,
} from './picocryptReedSolomon';

// --------------------------------------------------------------------
// Public surface
// --------------------------------------------------------------------

export interface EncryptOptions {
  /** Plaintext file to encrypt. Read once, sequentially. */
  inputPath: string;
  /** Where the .pcv-formatted ciphertext will be written. */
  outputPath: string;
  /** UTF-8 password (any length the caller chooses to accept). */
  password: string;
}

/** ~5–10 seconds on a typical server CPU. The caller should warn the user. */
export async function encryptFileToPicocrypt(
  opts: EncryptOptions,
): Promise<void> {
  await _sodium.ready;
  const sodium = _sodium;

  // ----------------------------------------------------------------
  // 1. Random material
  // ----------------------------------------------------------------
  const argonSalt = randomBytes(16);
  const hkdfSalt = randomBytes(32);
  const serpentIV = randomBytes(16); // unused in non-paranoid mode
  const xchachaNonce = randomBytes(24);

  // ----------------------------------------------------------------
  // 2. Master key via Argon2id (Picocrypt's hardcoded normal-mode
  //    params: t=4, m=1 GiB, p=4, out=32). This is the slow + RAM-
  //    heavy step.
  // ----------------------------------------------------------------
  const masterKey = await hashRaw(opts.password, {
    salt: argonSalt,
    algorithm: Algorithm.Argon2id,
    memoryCost: 1024 * 1024, // KiB
    timeCost: 4,
    parallelism: 4,
    outputLen: 32,
  });

  // ----------------------------------------------------------------
  // 3. Derived material — keyHash (header) + subkeys (HKDF stream)
  // ----------------------------------------------------------------
  const keyHash = sha3_512(masterKey); // 64 bytes for the header

  // Picocrypt feeds the HKDF stream into TWO subkeys before any body
  // work: the BLAKE2b MAC key (32) and the Serpent key (32). We
  // consume both in this order even when paranoid mode is off, so
  // that the HKDF stream state matches the reference impl byte for
  // byte — important if we later add paranoid + rekey-after-60 GiB.
  const okm = hkdf(sha3_256, masterKey, hkdfSalt, undefined, 64);
  const macSubkey = okm.subarray(0, 32);
  // const serpentKey = okm.subarray(32, 64);   // intentionally unused

  // ----------------------------------------------------------------
  // 4. Build the header buffer (789 bytes), MAC slot left as zeros
  // ----------------------------------------------------------------
  const header = Buffer.alloc(789);

  writeAt(header, 0, RS5.encode(Buffer.from('v1.48', 'ascii')));
  writeAt(header, 15, RS5.encode(Buffer.from('00000', 'ascii')));
  // Flags: 5 binary bytes [paranoid, keyfiles, keyfilesOrdered, rs, padded]
  // All zero for the baseline mode.
  writeAt(header, 30, RS5.encode(new Uint8Array([0, 0, 0, 0, 0])));
  writeAt(header, 45, RS16.encode(argonSalt));
  writeAt(header, 93, RS32.encode(hkdfSalt));
  writeAt(header, 189, RS16.encode(serpentIV));
  writeAt(header, 237, RS24.encode(xchachaNonce));
  writeAt(header, 309, RS64.encode(keyHash));
  // Bytes 501..597 stay as the 96 zero bytes Buffer.alloc gave us:
  // this matches `make([]byte, 96)` in the reference CLI.
  // Bytes 597..789 (MAC) stay zero too — patched after the body.

  // ----------------------------------------------------------------
  // 5. Open the output file and write the placeholder header
  // ----------------------------------------------------------------
  const out = await fsp.open(opts.outputPath, 'w');
  try {
    await out.write(header, 0, header.length, 0);

    // ------------------------------------------------------------
    // 6. Stream the body: read plaintext, XChaCha20 XOR, write
    //    ciphertext to the file, update BLAKE2b over the ciphertext.
    // ------------------------------------------------------------
    const macState = blake2b.create({ key: macSubkey, dkLen: 64 });
    const chunkSize = 1 << 20; // 1 MiB — Picocrypt's chunk size
    const blocksPerChunk = chunkSize / 64; // XChaCha20 block = 64 bytes
    let blockCounter = 0; // libsodium's `ic` argument
    let outOffset = header.length;

    const input = fs.createReadStream(opts.inputPath, {
      highWaterMark: chunkSize,
    });
    for await (const raw of input) {
      const plaintext = raw as Buffer;

      const ciphertext = Buffer.from(
        sodium.crypto_stream_xchacha20_xor_ic(
          plaintext,
          xchachaNonce,
          blockCounter,
          masterKey,
        ),
      );

      // Update MAC over post-XChaCha20 ciphertext (Picocrypt order).
      macState.update(ciphertext);

      await out.write(ciphertext, 0, ciphertext.length, outOffset);
      outOffset += ciphertext.length;

      // Advance the block counter by exactly the number of 64-byte
      // blocks consumed. A partial trailing block still consumes one
      // full counter slot.
      const fullBlocks = Math.floor(ciphertext.length / 64);
      const partialBlock = ciphertext.length % 64 === 0 ? 0 : 1;
      blockCounter += fullBlocks + partialBlock;

      // Tightly bounded: 1 MiB chunks are 16384 blocks each. Even a
      // 4 TB backup stays below libsodium's 64-bit counter ceiling.
      if (blockCounter > Number.MAX_SAFE_INTEGER - blocksPerChunk) {
        throw new Error('Backup too large for a single XChaCha20 stream');
      }
    }

    // ------------------------------------------------------------
    // 7. Finalize MAC, build the 192-byte RS64-encoded tag, patch
    //    the header slot at offset 597.
    // ------------------------------------------------------------
    const macTag = macState.digest(); // 64 bytes
    const macEncoded = RS64.encode(macTag); // 192 bytes
    await out.write(Buffer.from(macEncoded), 0, macEncoded.length, 597);
  } finally {
    await out.close();
  }
}

// --------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------

/** Cryptographically strong randomness via Node's CSPRNG. */
function randomBytes(n: number): Uint8Array {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes: rb } = require('node:crypto') as typeof import('node:crypto');
  return new Uint8Array(rb(n));
}

/** Copies `src` into `dst` at byte offset `at`, refusing to overflow. */
function writeAt(dst: Buffer, at: number, src: Uint8Array): void {
  if (at + src.length > dst.length) {
    throw new Error(
      `Picocrypt header overflow at offset ${at} (+${src.length})`,
    );
  }
  dst.set(src, at);
}

/** Convenience suffix for encrypted Picocrypt files (matches desktop). */
export const PICOCRYPT_EXTENSION = '.pcv';

/**
 * Soft sanity check on a user-supplied password. Picocrypt itself
 * accepts any length, but a near-empty password offers basically zero
 * protection given the format's hardcoded Argon2 params.
 */
export function isAcceptablePassword(pw: unknown): pw is string {
  return typeof pw === 'string' && pw.length >= 8 && pw.length <= 1024;
}
