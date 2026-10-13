/**
 * Reading a JWT WITHOUT talking to the server.
 *
 * The web checks the stored token's `exp` locally before it trusts it
 * (`webapp/components/AuthGuard.tsx:44-52`) and only then rolls the sliding
 * session in the background. Native has to do the same, because the local
 * check is the ONLY one that works in airplane mode: a session that can only
 * be confirmed by `GET /api/auth/me` is a session that dies the moment the
 * phone is on a train.
 *
 * No `atob`, no `Buffer`, no `TextDecoder`: none of the three is guaranteed on
 * Hermes across the SDK versions this app supports, and a missing global here
 * would throw inside the launch path — the single worst place for a surprise.
 * Base64 is decoded by hand and the bytes are turned into text through
 * `decodeURIComponent`, which is plain ECMAScript.
 */

const B64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** base64 (already un-url-ified) → bytes. `null` when the input is not base64. */
function base64ToBytes(input: string): Uint8Array | null {
  const clean = input.replace(/[\s=]/g, "");
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const value = B64_ALPHABET.indexOf(ch);
    if (value < 0) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/** UTF-8 bytes → string. `null` when the bytes are not valid UTF-8. */
function utf8Decode(bytes: Uint8Array): string | null {
  let percent = "";
  for (const byte of bytes) {
    percent += `%${byte.toString(16).padStart(2, "0")}`;
  }
  try {
    return decodeURIComponent(percent);
  } catch {
    return null;
  }
}

/**
 * The claims of a JWT, or `null` for anything that is not a readable JWT.
 * Never throws: a malformed token is a fact to act on, not an exception.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const b64 = (parts[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
  const bytes = base64ToBytes(b64);
  if (bytes === null) return null;
  const json = utf8Decode(bytes);
  if (json === null) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** `exp` in MILLISECONDS (the claim is seconds), or `null` when absent. */
export function jwtExpiresAtMs(token: string): number | null {
  const exp = decodeJwtPayload(token)?.["exp"];
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  return exp * 1000;
}

/**
 * Is this token past its `exp`?
 *
 * A token we cannot read, or one carrying no `exp`, counts as expired — the
 * same verdict the web reaches (`(payload.exp ?? 0) * 1000` is 0, which is
 * always in the past, and a decode throw drops the token).
 */
export function isJwtExpired(token: string, nowMs: number = Date.now()): boolean {
  const expiresAt = jwtExpiresAtMs(token);
  if (expiresAt === null) return true;
  return nowMs >= expiresAt;
}
