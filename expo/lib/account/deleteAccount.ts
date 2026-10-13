/**
 * Account deletion, from a store build.
 *
 * This is the native half of the same feature the web app ships: it calls the
 * SAME routes (`DELETE /api/me/account`, `POST /api/me/account/restore`) with
 * the same body, so iOS, Android and the web cannot end up with three
 * different ideas of what deletion means. The server drops every push
 * registration this account holds at request time — web endpoints AND the Expo
 * push token this installation registered (webapp/models/PushSubscription.ts
 * holds both) — which is why nothing here has to hunt for the token itself.
 *
 * Apple checks this BY HAND (App Store Review Guideline 5.1.1(v)): a reviewer
 * signs in, opens Settings and expects to find Delete account without leaving
 * the app. Google Play asks the same question from the outside and is answered
 * by the public https://become.redbtn.io/delete-account page.
 *
 * Everything is injectable (fetch, base URL) for the same reason
 * registerPushToken.ts is: these are the two network calls that must be
 * testable without a device.
 */

import { WEBAPP_BASE_URL } from "@/lib/config";
import { isBecomeWebHost } from "@/lib/navigation/webPathToRoute";
import { DELETE_CONFIRMATION as _DC, RESTORE_WINDOW_DAYS as _RWD } from "@become/core";

/**
 * What the server requires in the body before it will schedule a deletion.
 * MUST match `DELETE_CONFIRMATION` in webapp/lib/accountDeletion.ts — the
 * webapp's `tests/unit/account/storeReadiness.test.tsx` fails the build if the
 * two strings drift apart.
 */
export const DELETE_CONFIRMATION = "DELETE";

/** Days a member has to undo the request. Mirrors RESTORE_WINDOW_DAYS in
 *  webapp/lib/accountDeletion.ts; pinned by the same test. */
export const RESTORE_WINDOW_DAYS = 7;

export interface AccountRequestOptions {
  /** The session JWT out of SecureStore. */
  jwt: string;
  /** 'ios' | 'android' — recorded server-side so "was it reachable in the
   *  store build?" is answerable from data. */
  source?: "ios" | "android" | "unknown";
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface AccountActionResult {
  ok: boolean;
  status?: number;
  /** Present on success: when the account is actually removed. */
  restorableUntil?: string | null;
}

function resolveFetch(fetchImpl?: typeof fetch): typeof fetch {
  const impl = fetchImpl ?? (globalThis.fetch as typeof fetch | undefined);
  if (!impl) throw new Error("No fetch implementation available.");
  return impl;
}

function url(baseUrl: string | undefined, path: string): string {
  return `${(baseUrl ?? WEBAPP_BASE_URL).replace(/\/$/, "")}${path}`;
}

/**
 * Ask for the account to be deleted. On success the caller MUST clear the
 * stored JWT: the request has already signed this account out everywhere by
 * dropping its push registrations, and a session left in SecureStore is a
 * signed-in-looking app for an account that is going away.
 */
export async function requestAccountDeletion(
  options: AccountRequestOptions,
): Promise<AccountActionResult> {
  const fetchImpl = resolveFetch(options.fetchImpl);
  let res: Response;
  try {
    res = await fetchImpl(url(options.baseUrl, "/api/me/account"), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.jwt}`,
      },
      body: JSON.stringify({
        confirm: DELETE_CONFIRMATION,
        source: options.source ?? "unknown",
      }),
    });
  } catch {
    return { ok: false };
  }
  if (!res.ok) return { ok: false, status: res.status };

  let restorableUntil: string | null = null;
  try {
    const body = (await res.json()) as {
      deletion?: { restorableUntil?: string | null };
    };
    restorableUntil = body?.deletion?.restorableUntil ?? null;
  } catch {
    // A 2xx with an unreadable body is still a deletion that landed.
  }
  return { ok: true, status: res.status, restorableUntil };
}

export interface DeletionStatus {
  /** True while the request is scheduled and still undoable. */
  pending: boolean;
  /** ISO of the request, or null when nothing is pending. */
  requestedAt?: string | null;
  /** ISO of the purge due date — the last instant the restore link works. */
  restorableUntil?: string | null;
  /** Whole days left, floored at 0. */
  daysLeft?: number;
  /** The window the server promises, in days. */
  restoreWindowDays?: number;
}

export interface AccountStatusOptions {
  /** The session JWT out of SecureStore. */
  jwt: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface AccountStatusResult {
  ok: boolean;
  status?: number;
  deletion: DeletionStatus | null;
}

/**
 * Read GET /api/me/account — the danger zone's read. Answers whether a
 * deletion is pending and until when, so a member who signs back in during
 * the window sees the scheduled date instead of a fresh "Delete account".
 * A failed read reports `{ ok: false }` and the caller keeps the request
 * surface drawn: the server stays the gate, and the surface must never
 * vanish because a fetch blipped.
 */
export async function getAccountDeletionStatus(
  options: AccountStatusOptions,
): Promise<AccountStatusResult> {
  const fetchImpl = resolveFetch(options.fetchImpl);
  let res: Response;
  try {
    res = await fetchImpl(url(options.baseUrl, "/api/me/account"), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${options.jwt}`,
      },
    });
  } catch {
    return { ok: false, deletion: null };
  }
  if (!res.ok) return { ok: false, status: res.status, deletion: null };
  try {
    const body = (await res.json()) as {
      deletion?: DeletionStatus | null;
    };
    const deletion = body?.deletion ?? null;
    if (!deletion || typeof deletion !== "object") {
      return { ok: true, status: res.status, deletion: null };
    }
    return { ok: true, status: res.status, deletion };
  } catch {
    return { ok: false, deletion: null };
  }
}

/** Change of mind, from a session that still works (Settings → Keep my account). */
export async function cancelAccountDeletion(
  options: AccountRequestOptions,
): Promise<AccountActionResult> {
  const fetchImpl = resolveFetch(options.fetchImpl);
  try {
    const res = await fetchImpl(url(options.baseUrl, "/api/me/account"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.jwt}`,
      },
      body: JSON.stringify({ cancel: true }),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false };
  }
}

export interface RestoreOptions {
  /** `u` out of the restore link. */
  userId: string;
  /** `t` out of the restore link — the HMAC that IS the credential. */
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Undo a deletion from the emailed link, with NO session — which is the whole
 * point: requesting deletion signed every device out.
 *
 * The same POST the web page makes, so a link that opens in the app and a link
 * that opens in a browser do exactly the same thing.
 */
export async function restoreAccount(
  options: RestoreOptions,
): Promise<AccountActionResult> {
  const fetchImpl = resolveFetch(options.fetchImpl);
  try {
    const res = await fetchImpl(url(options.baseUrl, "/api/me/account/restore"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ u: options.userId, t: options.token }),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false };
  }
}

export interface RestoreDeepLink {
  userId: string;
  token: string;
}

/**
 * Pure parser for the restore link, in both shapes it can arrive in:
 *   - `https://become.redbtn.io/account/restore?u=…&t=…` (universal / app link)
 *   - `become://account/restore?u=…&t=…` (custom scheme)
 *
 * Returns null for anything else, so a link from another host can never be
 * turned into a request against our API. The host list is the resolver's
 * (`lib/navigation/webPathToRoute.ts`): one answer to "is this one of ours", so
 * a link on the second domain cannot be accepted by one parser and refused by
 * another.
 */
export function parseRestoreDeepLink(rawUrl: string): RestoreDeepLink | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  const scheme = parsed.protocol.replace(":", "");
  if (scheme === "become") {
    // become://account/restore → hostname "account", pathname "/restore".
    const path = `${parsed.hostname}${parsed.pathname}`.replace(/\/$/, "");
    if (path !== "account/restore") return null;
  } else if (scheme === "https") {
    if (!isBecomeWebHost(parsed.hostname)) return null;
    if (parsed.pathname.replace(/\/$/, "") !== "/account/restore") return null;
  } else {
    return null;
  }
  const userId = parsed.searchParams.get("u");
  const token = parsed.searchParams.get("t");
  if (!userId || !token) return null;
  return { userId, token };
}
