/**
 * SHA-256 AND base64url, IN PLAIN TYPESCRIPT.
 *
 * The native sign-in hand-back (NP-126) needs exactly one hash: the CHALLENGE
 * the app sends when it starts a Google sign-in is the SHA-256 of a verifier it
 * keeps, and the server compares it against the SHA-256 of the verifier the app
 * presents at the exchange (webapp/models/AppAuthCode.ts#hashAppAuthVerifier,
 * which uses Node's crypto). The two halves have to agree byte for byte.
 *
 * WHY NOT A NATIVE DIGEST. `expo-crypto`'s `digestStringAsync` would do it, and
 * it is asynchronous and unavailable under Jest without a mock — so the one
 * value the whole flow's security rests on would be the one thing no test could
 * compute. This is 100 lines, it is deterministic on a phone and on a CI runner
 * alike, and `__tests__/sha256.test.ts` drives it against the published NIST
 * vectors AND against Node's own crypto on every padding boundary. Randomness is
 * a different matter and is NOT done here: a verifier comes from `expo-crypto`'s
 * CSPRNG (lib/auth/googleSignIn.ts), because there is no way to write one of
 * those in plain TypeScript.
 *
 * No `TextEncoder` either: Hermes does not ship one, and Expo's winter runtime
 * installs a TextDecoder but not its counterpart.
 */

/** The 64 round constants — the first 32 bits of the fractional parts of the
 *  cube roots of the first 64 primes (FIPS 180-4, §4.2.2). */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/**
 * A typed-array read as the number it always is.
 *
 * `noUncheckedIndexedAccess` (expo/tsconfig.json) types every index access as
 * possibly `undefined`, which is the right default and wrong for a hash: every
 * index in this file is a loop bound that cannot leave the array. One narrow
 * accessor says that once, instead of a `?? 0` on every read — and a `?? 0`
 * would hide a real out-of-range read behind a silently wrong digest.
 */
function u32(array: Uint32Array, index: number): number {
  return array[index] as number;
}

function u8(array: Uint8Array, index: number): number {
  return array[index] as number;
}

function rotr(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/**
 * UTF-8 bytes for a string, surrogate pairs included. A verifier is base64url
 * (pure ASCII) so only the first branch is ever exercised in this flow, but a
 * hash function that quietly mangles non-ASCII is a trap for the next caller.
 */
export function utf8Bytes(input: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    let code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = (code - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000;
        i += 1;
      }
    }
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(out);
}

/** The 32-byte SHA-256 digest of a string's UTF-8 bytes. */
export function sha256Bytes(message: string): Uint8Array {
  const bytes = utf8Bytes(message);
  const bitLength = bytes.length * 8;
  // One 0x80 byte, then zeros, then the length in the last 8 bytes of the last
  // 64-byte block (FIPS 180-4, §5.1.1).
  const blocks = Math.floor((bytes.length + 8) / 64) + 1;
  const padded = new Uint8Array(blocks * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);

  // The eight state words, as scalars: the whole state is read and written
  // every block, so an array would only add eight index accesses.
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let t = 0; t < 16; t += 1) w[t] = view.getUint32(offset + t * 4);
    for (let t = 16; t < 64; t += 1) {
      const a15 = u32(w, t - 15);
      const a2 = u32(w, t - 2);
      const s0 = rotr(a15, 7) ^ rotr(a15, 18) ^ (a15 >>> 3);
      const s1 = rotr(a2, 17) ^ rotr(a2, 19) ^ (a2 >>> 10);
      w[t] = (u32(w, t - 16) + s0 + u32(w, t - 7) + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let t = 0; t < 64; t += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choose + u32(K, t) + u32(w, t)) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const digest = new Uint8Array(32);
  const out = new DataView(digest.buffer);
  out.setUint32(0, h0);
  out.setUint32(4, h1);
  out.setUint32(8, h2);
  out.setUint32(12, h3);
  out.setUint32(16, h4);
  out.setUint32(20, h5);
  out.setUint32(24, h6);
  out.setUint32(28, h7);
  return digest;
}

const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * base64url, unpadded — the alphabet Node's `digest('base64url')` and
 * `randomBytes().toString('base64url')` produce, so both halves of the
 * challenge/verifier pair are written the same way.
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = u8(bytes, i);
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const b1 = has1 ? u8(bytes, i + 1) : 0;
    const b2 = has2 ? u8(bytes, i + 2) : 0;
    out += BASE64URL_ALPHABET.charAt(b0 >> 2);
    out += BASE64URL_ALPHABET.charAt(((b0 & 0x03) << 4) | (b1 >> 4));
    if (!has1) break;
    out += BASE64URL_ALPHABET.charAt(((b1 & 0x0f) << 2) | (b2 >> 6));
    if (!has2) break;
    out += BASE64URL_ALPHABET.charAt(b2 & 0x3f);
  }
  return out;
}

/** Lowercase hex, for the test vectors and for nothing else in this app. */
export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += u8(bytes, i).toString(16).padStart(2, "0");
  }
  return out;
}

/** SHA-256 of a string, base64url — the exact transform the server applies. */
export function sha256Base64Url(message: string): string {
  return bytesToBase64Url(sha256Bytes(message));
}
