/**
 * Loading a PER-MEMBER image natively (NP-059).
 *
 * `GET /api/blob/<key>` is the one way either client reads an uploaded object,
 * and since the bucket grew per-member keys it is no longer public: `scans/`,
 * `food-flags/` and `chat/` need a session, and a caller who is not the owner
 * gets **404** — not 403, so the status cannot confirm the object exists
 * (`webapp/app/api/blob/[...key]/route.ts`, `webapp/lib/blobAccess.ts`).
 *
 * The web gets away with `<img src="/api/blob/…">` because the browser sends
 * the `auth_token` cookie. Native has no cookie and an `<Image>` cannot set a
 * header, so the bytes have to be FETCHED with `Authorization: Bearer …` and
 * handed to the image as a `data:` URL. That is what this module does, and
 * `components/media/AuthedImage.tsx` is the component over it.
 *
 * TWO RULES THIS FILE EXISTS TO KEEP
 *
 *  1. THE TOKEN ONLY EVER GOES TO BECOME. A target is a PATH on the Become web
 *     app, or an absolute URL on that exact origin; anything else is refused
 *     rather than fetched, so a per-member URL that arrived from a payload can
 *     never walk the session token to another host.
 *  2. A MEMBER'S IMAGE IS NEVER CACHED WHERE ANOTHER ACCOUNT COULD READ IT.
 *     Nothing here touches disk — React Native's image disk cache is per app,
 *     not per member, and would outlive the session. The cache below is
 *     in-memory, capped, and keyed by the TOKEN that fetched each entry, so a
 *     second account signing in on the same device cannot read the first one's
 *     bytes; `AuthProvider`'s sign-out empties it outright.
 */

import { createApiClient, type ApiClient } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";

/** How many images stay in memory. Small on purpose: these are photos. */
export const MAX_CACHED_AUTHED_IMAGES = 24;

export type AuthedImageResult =
  | { status: "loaded"; dataUrl: string; fromCache: boolean }
  /** No session on the device — nothing was requested. */
  | { status: "signed-out" }
  /** 401: the session has ended. Reported to the app's one 401 handler. */
  | { status: "unauthorized" }
  /** 404: gone, or never this member's to read. The route says the same thing. */
  | { status: "not-found" }
  /** Not a Become target. The Bearer token was NOT sent anywhere. */
  | { status: "refused" }
  | { status: "failed"; httpStatus?: number };

/** A control character in a URL is not a URL. Char codes, so no escape regex. */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

/**
 * The Become path for `target`, or null when it is not a Become target.
 *
 * Accepts a path (`/api/blob/scans/…`) or an absolute URL on the Become
 * origin, and rejects everything else: another origin, a protocol-relative
 * `//host/path`, a backslash, a control character.
 */
export function becomeApiPath(
  target: string,
  baseUrl: string = WEBAPP_BASE_URL,
): string | null {
  if (typeof target !== "string") return null;
  const trimmed = target.trim();
  if (trimmed.length === 0) return null;
  if (hasControlCharacter(trimmed)) return null;
  if (trimmed.includes("\\")) return null;

  const base = baseUrl.replace(/\/$/, "");
  if (trimmed.startsWith("//")) return null;
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed === base) return "/";
  if (trimmed.startsWith(`${base}/`)) return trimmed.slice(base.length);
  return null;
}

/** The absolute URL an authed image is read from. Also the cache key. */
export function authedImageUrl(
  target: string,
  baseUrl: string = WEBAPP_BASE_URL,
): string | null {
  const path = becomeApiPath(target, baseUrl);
  if (path === null) return null;
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

interface CacheEntry {
  /** The session that was allowed to see these bytes. */
  token: string;
  dataUrl: string;
}

/** In-memory only. Never persisted, never shared between sessions. */
const memoryCache = new Map<string, CacheEntry>();

/** The cached bytes for this url — only for the session that fetched them. */
export function cachedAuthedImage(url: string, token: string): string | null {
  const entry = memoryCache.get(url);
  if (!entry) return null;
  if (entry.token !== token) {
    // A different session asking for the same URL is a different member (or
    // the same member after a re-auth). Drop it rather than serve it.
    memoryCache.delete(url);
    return null;
  }
  return entry.dataUrl;
}

/** Remember one image for this session, evicting the oldest past the cap. */
export function cacheAuthedImage(
  url: string,
  token: string,
  dataUrl: string,
): void {
  for (const [key, entry] of memoryCache) {
    if (entry.token !== token) memoryCache.delete(key);
  }
  memoryCache.delete(url);
  memoryCache.set(url, { token, dataUrl });
  while (memoryCache.size > MAX_CACHED_AUTHED_IMAGES) {
    const oldest = memoryCache.keys().next();
    if (oldest.done) break;
    memoryCache.delete(oldest.value);
  }
}

/**
 * Forget every image. Called by `AuthProvider` on sign-out: the next member on
 * this device starts with nothing of the last one's in memory.
 */
export function clearAuthedImageCache(): void {
  memoryCache.clear();
}

/** Test/diagnostic only. */
export function authedImageCacheSize(): number {
  return memoryCache.size;
}

/**
 * `data:` URL for these bytes, with an image MIME type on it. React Native's
 * `FileReader` labels a typeless blob `application/octet-stream`, which
 * `<Image>` will not render, so the response's own `Content-Type` wins.
 */
export function normaliseImageDataUrl(
  dataUrl: string,
  contentType: string | null,
): string {
  if (dataUrl.startsWith("data:image/")) return dataUrl;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl;
  const type = contentType?.split(";")[0]?.trim();
  const mime = type && type.startsWith("image/") ? type : "image/jpeg";
  return `data:${mime};base64,${dataUrl.slice(comma + 1)}`;
}

/**
 * Blob → `data:` URL.
 *
 * React Native ships a `FileReader`, and `readAsDataURL` is exactly what the
 * web does with the same bytes (`webapp/lib/blobToBase64.ts`), so that is the
 * path a device takes. Jest's environment has no `FileReader` at all, hence the
 * byte-wise fallback below — the same output, slower, and never reached on a
 * phone.
 */
async function readAsDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== "undefined") {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === "string") resolve(result);
        else reject(new Error("Could not read image bytes"));
      };
      reader.onerror = () =>
        reject(reader.error ?? new Error("Could not read image bytes"));
      reader.readAsDataURL(blob);
    });
  }
  if (typeof blob.arrayBuffer !== "function" || typeof btoa !== "function") {
    throw new Error("No way to read image bytes in this environment");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
}

export interface LoadAuthedImageInput {
  /** A Become path (`/api/blob/…`) or an absolute URL on the Become origin. */
  target: string;
  /** The session JWT. `null` short-circuits to `signed-out`. */
  token: string | null;
  baseUrl?: string;
  client?: ApiClient;
  fetchImpl?: typeof fetch;
  /** Injectable for tests; defaults to `FileReader.readAsDataURL`. */
  toDataUrl?: (blob: Blob) => Promise<string>;
  /** Skip the in-memory cache (a re-fetch after an error). */
  skipCache?: boolean;
}

/**
 * Fetch one per-member image as a `data:` URL. Resolves — it never rejects —
 * with what happened, because an image that will not load must never take the
 * screen down with it.
 */
export async function loadAuthedImage(
  input: LoadAuthedImageInput,
): Promise<AuthedImageResult> {
  const baseUrl = input.baseUrl ?? WEBAPP_BASE_URL;
  const path = becomeApiPath(input.target, baseUrl);
  if (path === null) return { status: "refused" };
  if (!input.token) return { status: "signed-out" };
  const token = input.token;
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;

  if (!input.skipCache) {
    const cached = cachedAuthedImage(url, token);
    if (cached) return { status: "loaded", dataUrl: cached, fromCache: true };
  }

  const client =
    input.client ??
    createApiClient({
      baseUrl,
      getToken: () => token,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    });

  let response: Response;
  try {
    response = await client.raw(path, { headers: { Accept: "image/*" } });
  } catch {
    return { status: "failed" };
  }

  if (!response.ok) {
    if (response.status === 401) return { status: "unauthorized" };
    if (response.status === 404) return { status: "not-found" };
    return { status: "failed", httpStatus: response.status };
  }

  try {
    const blob = await response.blob();
    const read = input.toDataUrl ?? readAsDataUrl;
    const raw = await read(blob);
    const dataUrl = normaliseImageDataUrl(
      raw,
      response.headers?.get?.("Content-Type") ?? null,
    );
    cacheAuthedImage(url, token, dataUrl);
    return { status: "loaded", dataUrl, fromCache: false };
  } catch {
    return { status: "failed" };
  }
}
