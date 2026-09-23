/**
 * Account deletion, from inside the store builds.
 *
 * Apple App Review 5.1.1(v) is checked BY HAND: a reviewer signs in, opens
 * Settings, and looks for a way to delete the account without leaving the app.
 * Google Play asks for the same thing plus a public web URL. This is the client
 * half of both — the server half is the webapp's `DELETE /api/me/account`.
 *
 * THREE THINGS THIS FUNCTION IS RESPONSIBLE FOR, and all three are in the
 * acceptance criteria rather than in the nice-to-haves:
 *
 *   1. It tells the server WHICH platform asked (`source`), so an App Store
 *      reviewer's deletion is traceable in the audit line.
 *   2. It drops the JWT from SecureStore on success. The server cannot revoke a
 *      JWT, so the device forgetting it is what makes "you are signed out"
 *      true here. That happens even if the caller never navigates.
 *   3. It reports how many push registrations the server dropped. Those rows —
 *      this device's Expo token included — live in the same collection as the
 *      web ones and are deleted at REQUEST time, not at purge time, because
 *      "stop notifying me" must not wait out a seven-day window.
 *
 * Written as a plain function with injectable `fetch` and token store rather
 * than a hook, for the same reason lib/push/registerPushToken.ts is: it has to
 * be callable from a confirm dialog and testable without a renderer.
 */

import { WEBAPP_BASE_URL } from "@/lib/config";
import { secureTokenStore, type TokenStore } from "@/lib/auth/secureStoreToken";

export const ACCOUNT_PATH = "/api/me/account";
export const ACCOUNT_RESTORE_PATH = "/api/me/account/restore";

/** Mirrors the webapp's `DeletionSource`. */
export type DeletionSource = "ios" | "android" | "web";

export interface DeletionStatus {
  requestedAt: string;
  scheduledPurgeAt: string;
  daysRemaining: number;
}

export interface RequestDeletionOptions {
  jwt: string;
  /** 'ios' or 'android' — the caller passes Platform.OS. */
  source: DeletionSource;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** DI for tests; defaults to the SecureStore-backed store. */
  tokenStore?: TokenStore;
}

export interface RequestDeletionResult {
  ok: boolean;
  status?: number;
  deletion?: DeletionStatus;
  /** How many push subscriptions the server dropped for this account. */
  pushSubscriptionsDropped?: number;
  restoreEmailSent?: boolean;
  /** True when the local JWT was cleared, i.e. this device is signed out. */
  signedOut: boolean;
  error?: string;
}

function resolveFetch(impl?: typeof fetch): typeof fetch {
  const f = impl ?? (globalThis.fetch as typeof fetch | undefined);
  if (!f) throw new Error("No fetch implementation available.");
  return f;
}

function url(baseUrl: string | undefined, path: string): string {
  return `${(baseUrl ?? WEBAPP_BASE_URL).replace(/\/$/, "")}${path}`;
}

export async function requestAccountDeletion(
  options: RequestDeletionOptions,
): Promise<RequestDeletionResult> {
  const fetchImpl = resolveFetch(options.fetchImpl);
  const store = options.tokenStore ?? secureTokenStore;

  let res: Response;
  try {
    res = await fetchImpl(url(options.baseUrl, ACCOUNT_PATH), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.jwt}`,
      },
      body: JSON.stringify({ source: options.source }),
    });
  } catch {
    // NOT retried. A deletion is not idempotent from the member's point of
    // view — they must see it either happen or fail, never "maybe". The
    // server's own handler IS idempotent, so pressing the button again is safe.
    return { ok: false, signedOut: false, error: "network" };
  }

  const body = (await res.json().catch(() => null)) as
    | {
        deletion?: DeletionStatus;
        pushSubscriptionsDropped?: number;
        restoreEmailSent?: boolean;
        error?: string;
      }
    | null;

  if (!res.ok || !body?.deletion) {
    const failure: RequestDeletionResult = {
      ok: false,
      status: res.status,
      signedOut: false,
    };
    if (body?.error) failure.error = body.error;
    return failure;
  }

  // Sign this device out. Clearing the token is the whole of it: the JWT is
  // the only thing that identifies the session, and nothing can revoke it
  // server-side. Failing to clear it must not be reported as a success.
  let signedOut = true;
  try {
    await store.clear();
  } catch {
    signedOut = false;
  }

  const result: RequestDeletionResult = {
    ok: true,
    status: res.status,
    deletion: body.deletion,
    signedOut,
  };
  if (body.pushSubscriptionsDropped !== undefined) {
    result.pushSubscriptionsDropped = body.pushSubscriptionsDropped;
  }
  if (body.restoreEmailSent !== undefined) {
    result.restoreEmailSent = body.restoreEmailSent;
  }
  return result;
}

export type RestoreOutcome =
  | "restored"
  | "invalid_link"
  | "nothing_pending"
  | "error";

export interface RestoreAccountOptions {
  userId: string;
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Redeem the "Keep my account" link from the deletion email.
 *
 * NO JWT. The link is opened by somebody the app just signed out, often in a
 * mail app, so the HMAC in the URL is the credential and a session is never
 * required. POST, not GET, because mail scanners fetch every URL in a message
 * before a human sees it and a mutating GET would cancel deletions nobody asked
 * to cancel.
 */
export async function restoreAccount(
  options: RestoreAccountOptions,
): Promise<RestoreOutcome> {
  if (!options.userId || !options.token) return "invalid_link";
  const fetchImpl = resolveFetch(options.fetchImpl);
  try {
    const res = await fetchImpl(url(options.baseUrl, ACCOUNT_RESTORE_PATH), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ u: options.userId, t: options.token }),
    });
    const body = (await res.json().catch(() => null)) as
      | { restored?: boolean; reason?: RestoreOutcome }
      | null;
    if (body?.restored) return "restored";
    if (body?.reason === "nothing_pending") return "nothing_pending";
    if (body?.reason === "invalid_link") return "invalid_link";
    return "error";
  } catch {
    return "error";
  }
}
