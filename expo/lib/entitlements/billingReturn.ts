import { AppState, type AppStateStatus } from "react-native";
import { useEffect, useRef } from "react";

/**
 * ─── THE BILLING-RETURN MEMORY (NP-054) ──────────────────────────────────────
 *
 * Checkout and the billing portal both leave the app for the device browser
 * (Safari / Chrome — `Linking.openURL`, never an in-app browser). When the
 * member comes back, the app has to re-read plan state: the webhook usually
 * lands first, but the return itself is the signal that SOMETHING may have
 * changed — a new subscription, a fixed card, a cancellation.
 *
 * Two halves, because there are two ways back:
 *
 *   1. A LINK — `become://?billing=success&session_id=…` (or the universal-link
 *      equivalent) — lands on the plan page through the resolver, which reads
 *      the outcome off its own params. Nothing is remembered for that case.
 *   2. A FOREGROUND — the member switches back manually, with no link at all.
 *      The plan screen (and the sheet that starts the handover) records that a
 *      checkout or portal URL was opened; when the app next becomes active,
 *      the plan page re-reads status and entitlements, retrying for a few
 *      seconds until the tier changes.
 *
 * Module state, not React state: the writer (the sheet / the plan screen's
 * `onStart` / `onOpenPortal`) and the reader (the plan screen's foreground
 * listener) are different mounts, and may not even be mounted at the same
 * time. Persisted nowhere — a relaunch re-reads entitlements anyway, and a
 * stale "checkout happened" flag would re-poll on every foreground forever.
 */

export type BillingReturnKind = "checkout" | "portal";

/** What was opened, and when (Date.now()). Null when nothing is pending. */
interface PendingBillingReturn {
  kind: BillingReturnKind;
  openedAt: number;
}

/** How long a remembered handover stays interesting. */
export const BILLING_RETURN_TTL_MS = 10 * 60 * 1000;

let pending: PendingBillingReturn | null = null;

/** Remember that a checkout or portal URL was just opened. */
export function markBillingReturnOpened(
  kind: BillingReturnKind = "checkout",
  now: number = Date.now(),
): void {
  pending = { kind, openedAt: now };
}

/** Forget a remembered handover — after it has been consumed, or on sign-out. */
export function clearBillingReturn(): void {
  pending = null;
}

/**
 * The pending handover, or null when there is none or it has expired.
 * Reading does NOT clear: the foreground poll clears on success, and an
 * expiry clears itself here.
 */
export function takeBillingReturn(
  now: number = Date.now(),
): PendingBillingReturn | null {
  if (!pending) return null;
  if (now - pending.openedAt > BILLING_RETURN_TTL_MS) {
    pending = null;
    return null;
  }
  return pending;
}

/** Test seam: reset the module without waiting for the TTL. */
export function resetBillingReturnForTests(): void {
  pending = null;
}

// ─── The foreground re-read ──────────────────────────────────────────────────

function defaultSubscribeToAppState(
  listener: (status: AppStateStatus) => void,
): () => void {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
}

export interface BillingForegroundOptions {
  /** Subscribe to AppState changes (DI for tests). */
  subscribeToAppState?: (
    listener: (status: AppStateStatus) => void,
  ) => () => void;
  /** Clock (DI for tests). */
  now?: () => number;
  /** Timer injection (DI for tests). Defaults to the globals. */
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
  /**
   * How long to keep retrying after the first foreground re-read.
   * Defaults to 8s — long enough for the webhook to land, short enough to
   * stop polling a member who only opened the portal to look.
   */
  retryWindowMs?: number;
  /** Delay between retries. Defaults to 2s. */
  retryDelayMs?: number;
}

/**
 * Re-read billing status + entitlements when the app comes back to the
 * foreground after a remembered checkout/portal handover (NP-054).
 *
 * `readOnce` does one full pass — status (with the session hint when there is
 * one) then a forced entitlements refresh — and reports whether the tier is
 * now Plus. The first pass runs immediately; while it still says free, it
 * retries until `retryWindowMs` elapses.
 *
 * Only fires when `takeBillingReturn()` has something to say; otherwise the
 * foreground is just a foreground. Never throws — a failed pass is a retry,
 * and an exhausted window simply clears the memory.
 */
export function useBillingForegroundRefresh(
  readOnce: (sessionId?: string | null) => Promise<{ tierIsPlus: boolean }>,
  options: BillingForegroundOptions & { sessionId?: string | null } = {},
): void {
  const callbackRef = useRef(readOnce);
  // The callback is an external read (status + entitlements), not a render
  // derivation — keeping the latest without resubscribing.
  useEffect(() => {
    callbackRef.current = readOnce;
  });

  const {
    subscribeToAppState = defaultSubscribeToAppState,
    now = () => Date.now(),
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
    retryWindowMs = 8_000,
    retryDelayMs = 2_000,
    sessionId = null,
  } = options;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async (deadline: number): Promise<void> => {
      if (cancelled) return;
      let plus = false;
      try {
        const result = await callbackRef.current(sessionId);
        plus = result.tierIsPlus === true;
      } catch {
        plus = false;
      }
      if (cancelled || plus) {
        if (plus) clearBillingReturn();
        return;
      }
      if (now() >= deadline) {
        clearBillingReturn();
        return;
      }
      timer = setTimeoutImpl(() => {
        void poll(deadline);
      }, retryDelayMs);
    };

    const unsubscribe = subscribeToAppState((status) => {
      if (status !== "active") return;
      if (!takeBillingReturn(now())) return;
      if (cancelled) return;
      void poll(now() + retryWindowMs);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeoutImpl(timer);
      unsubscribe();
    };
    // The session hint is read per-mount: a return URL remounts the screen
    // with new params, which is a new subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribeToAppState, retryWindowMs, retryDelayMs, sessionId]);
}

/**
 * The one-pass poll body the plan screen hands to
 * `useBillingForegroundRefresh`: status first (activating from the session
 * hint when there is one — the server checks it against the signed-in
 * member), then a forced entitlements refresh, reporting whether the tier is
 * now Plus. Pure-ish: all IO arrives through the arguments, so a test needs
 * no device and no store.
 */
export async function billingForegroundPass(args: {
  sessionId?: string | null;
  fetchStatus: (
    sessionId?: string | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<{ tier?: string } | null | any>;
  refreshEntitlements: () => Promise<unknown>;
  readTierIsPlus: () => boolean;
}): Promise<{ tierIsPlus: boolean }> {
  try {
    await args.fetchStatus(args.sessionId ?? null);
  } catch {
    // Never fatal: the webhook remains the source of truth.
  }
  try {
    await args.refreshEntitlements();
  } catch {
    // A failed refresh is a retry, not a lock.
  }
  return { tierIsPlus: args.readTierIsPlus() };
}
