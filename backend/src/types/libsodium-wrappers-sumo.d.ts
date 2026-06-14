/**
 * Minimal ambient declarations for `libsodium-wrappers-sumo`.
 *
 * Why this file exists:
 *   - The package itself ships NO TypeScript declarations (despite
 *     what the deprecated `@types/libsodium-wrappers-sumo` stub
 *     claims).
 *   - `@types/libsodium-wrappers` does NOT cover the sumo-only
 *     functions we need — chiefly `crypto_stream_xchacha20_xor_ic`,
 *     which is the raw stream cipher (not the Poly1305-tagged AEAD
 *     variant) that Picocrypt v1.48 uses for body encryption.
 *
 * We declare ONLY the surface used by `lib/picocrypt.ts`. If a
 * future feature needs more (e.g. `crypto_secretstream_*`), add it
 * here rather than reaching for `as any`.
 */

declare module 'libsodium-wrappers-sumo' {
  /**
   * Resolves when the libsodium WASM module has finished bootstrapping.
   * Must be awaited once at process start before calling any function.
   */
  const ready: Promise<void>;

  /** Library version string (e.g. "1.0.20"). */
  const SODIUM_VERSION_STRING: string;

  /**
   * Raw XChaCha20 stream cipher (no Poly1305 authentication tag — pair
   * with a separate MAC). Returns `message XOR keystream` where the
   * keystream starts at block `ic` (each block is 64 bytes).
   *
   * For a 1 MiB chunk that is exactly 16384 blocks, advance `ic` by
   * 16384 for the next chunk to keep the stream contiguous.
   *
   *   key   — 32 bytes
   *   nonce — 24 bytes
   *   ic    — initial block counter (0 for the first call)
   */
  function crypto_stream_xchacha20_xor_ic(
    message: Uint8Array,
    nonce: Uint8Array,
    ic: number,
    key: Uint8Array,
  ): Uint8Array;

  /** Constant: 32. Length of the XChaCha20 key in bytes. */
  const crypto_stream_xchacha20_KEYBYTES: number;
  /** Constant: 24. Length of the XChaCha20 nonce in bytes. */
  const crypto_stream_xchacha20_NONCEBYTES: number;

  // Default export shape matches the namespace; consumers do
  // `import _sodium from 'libsodium-wrappers-sumo'`.
  const _default: {
    ready: Promise<void>;
    SODIUM_VERSION_STRING: string;
    crypto_stream_xchacha20_xor_ic: typeof crypto_stream_xchacha20_xor_ic;
    crypto_stream_xchacha20_KEYBYTES: number;
    crypto_stream_xchacha20_NONCEBYTES: number;
  };
  export default _default;
  export {
    ready,
    SODIUM_VERSION_STRING,
    crypto_stream_xchacha20_xor_ic,
    crypto_stream_xchacha20_KEYBYTES,
    crypto_stream_xchacha20_NONCEBYTES,
  };
}
