/**
 * ONE place that turns "the server said 401" into "sign the member out".
 *
 * Every request the app makes goes through `apiFetch`, and a 401 from any of
 * them means the same thing: the JWT this device is holding is no longer a
 * session. Handling that per screen is how you get three screens each running
 * their own teardown — or, worse, none of them running it and the member
 * staring at empty lists. So the request layer REPORTS the failure here and
 * the one `AuthProvider` decides what to do about it.
 *
 * 401 ONLY. A 403 is not a session problem on this backend — it is a plan gate
 * or an AI-consent refusal (see NP-010), and signing someone out because they
 * tapped a Plus feature would be a bug of its own. A 5xx or a network error is
 * not a session problem either: the member stays signed in.
 *
 * This is a native addition. The web has no global 401 handling because it can
 * fall back to its `auth_token` cookie; native has nothing to fall back to.
 */
import { ApiError } from "@become/api-client";

export type UnauthorizedReason = "unauthorized";

export type UnauthorizedHandler = (reason: UnauthorizedReason) => void;

let handler: UnauthorizedHandler | null = null;

/**
 * Register the app's reaction to a 401. Returns an unsubscribe that only
 * clears the handler if it is still the one it registered, so a remount that
 * registers before the old one tears down cannot leave the app deaf.
 */
export function setUnauthorizedHandler(
  next: UnauthorizedHandler | null,
): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

/** True when this failure is the server rejecting the session itself. */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/**
 * Report a failed request. Anything that is not a 401 is ignored, so callers
 * can hand over every error they catch without classifying it themselves.
 */
export function reportRequestError(error: unknown): void {
  if (!isUnauthorized(error)) return;
  handler?.("unauthorized");
}

/**
 * Wrap a request promise so its failures are reported before they propagate.
 * The error is re-thrown untouched — this observes, it never swallows.
 */
export function watchUnauthorized<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((error: unknown) => {
    reportRequestError(error);
    throw error;
  });
}
