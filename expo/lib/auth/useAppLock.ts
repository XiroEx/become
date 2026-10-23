import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  coldOpenFlow,
  createBiometricsOptInStore,
  type BiometricsCapability,
} from "@/lib/auth/biometrics";
import {
  biometricsOptInSecureStore,
  sessionStore,
  type TokenStore,
} from "@/lib/auth/secureStoreToken";

/**
 * Re-lock the app after it has been in the background.
 *
 * On cold open the root layout already runs the biometric flow; this hook
 * covers the WARM case: the app was backgrounded (home button, switcher, lock
 * screen) and comes back to the foreground after `gracePeriodMs` in the
 * background. When the member opted in to biometric unlock
 * (`become.optin.biometrics`), the hook re-runs the unlock prompt; a failed
 * unlock (biometric AND passcode) drops the JWT and calls `onLocked` so the
 * caller can sign the session out.
 *
 * Opted out, no JWT, no hardware or nothing enrolled → no prompt, no call.
 * The grace period exists so a one-second hop to the switcher does not ask;
 * the default (5 minutes) matches the platform convention for an app lock.
 *
 * `onLocked` fires for any `login` verdict EXCEPT `no-jwt`: the warm case
 * always starts from a live session, so a missing JWT at prompt time means
 * the session ended elsewhere (sign-out on another screen, expiry) and there
 * is nothing to lock. `biometric-fail` is the real case — the flow dropped
 * the JWT after both checks failed. Anything the capability reports as a
 * failure reason (including `no-hardware` from a module that vanished
 * mid-session) is treated the same way: the member asked to be asked, and the
 * ask did not succeed.
 *
 * `locked` (returned below) is what obscures the dashboard while the warm
 * re-verification runs (card "Face ID lock must obscure dashboard during
 * scan"). It flips to `true` SYNCHRONOUSLY, in the AppState listener itself,
 * the instant the app enters `background` — before any async store read. That
 * ordering is the point: the OS takes the app-switcher snapshot and shows the
 * Face ID sheet right after that transition, so an `await` on the stores
 * would be too late. Whether a lock could follow at all is therefore a
 * CACHED answer (`canLockRef`: a session token exists AND biometric unlock is
 * opted in), refreshed on mount and on every `inactive` / `background` /
 * `active` transition.
 *
 * Two rules keep the overlay off screens it has no business covering (the
 * Google sign-in sheet went white because of both):
 *
 *   1. NOTHING IS OBSCURED UNLESS A LOCK COULD FOLLOW. A signed-out member or
 *      one who never opted in has nothing to hide and nothing to re-verify.
 *   2. `inactive` NEVER OBSCURES, only `background` does. `inactive` is also
 *      what ASWebAuthenticationSession, passkey and Apple sign-in sheets, the
 *      share sheet, the image picker and permission alerts cause WITHOUT the
 *      app going anywhere, and the overlay is a native `Modal`: presenting it
 *      while one of those is coming up knocks the sheet away and leaves the
 *      overlay on screen as a white app. iOS takes the app-switcher snapshot
 *      AFTER the app enters `background` (the `inactive` before it is only the
 *      app losing focus), so `background` is early enough for the snapshot
 *      and no suspend/resume pairing around each system sheet is needed.
 *
 * `locked` clears the moment there is nothing left to hide behind it: a quick
 * hop inside the grace period (no re-auth needed), an opt-out (the async
 * check), or a warm re-verification settling — on EITHER verdict, success or
 * failure. A failure already dropped the JWT and calls `onLocked` before the
 * overlay clears, so the caller's sign-out has fired and the member lands on
 * sign-in, not a flashed dashboard.
 */
export const APP_LOCK_GRACE_PERIOD_MS = 5 * 60 * 1000;

export interface UseAppLockOptions {
  /** Where the JWT lives. Defaults to `sessionStore` (`become.session`). */
  tokenStore?: TokenStore;
  /** Where the opt-in lives. Defaults to `biometricsOptInSecureStore`. */
  optInStore?: TokenStore;
  /** The biometrics implementation. Required — no default, no stub. */
  biometrics: BiometricsCapability;
  /** Called after a failed unlock dropped the JWT. */
  onLocked?: () => void;
  /** Background time before a foreground return re-prompts. */
  gracePeriodMs?: number;
  /** Clock injection point for tests. */
  now?: () => number;
  /** Subscribe to foreground/background changes (DI for tests). */
  subscribeToAppState?: (
    listener: (status: AppStateStatus) => void,
  ) => () => void;
}

function defaultSubscribeToAppState(
  listener: (status: AppStateStatus) => void,
): () => void {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
}

interface AppLockDeps {
  tokenStore: TokenStore;
  optInStore: TokenStore;
  biometrics: BiometricsCapability;
  gracePeriodMs: number;
  now: () => number;
  subscribeToAppState: (
    listener: (status: AppStateStatus) => void,
  ) => () => void;
  onLocked: (() => void) | undefined;
}

export interface UseAppLockResult {
  /** True from the instant the app leaves the foreground until a quick-hop
   * clear, an opt-out, or a warm re-verification settles (success OR
   * failure). Drives `AppLockOverlay` at the root. */
  locked: boolean;
}

export function useAppLock(options: UseAppLockOptions): UseAppLockResult {
  const {
    tokenStore = sessionStore,
    optInStore = biometricsOptInSecureStore,
    biometrics,
    onLocked,
    gracePeriodMs = APP_LOCK_GRACE_PERIOD_MS,
    now = Date.now,
    subscribeToAppState = defaultSubscribeToAppState,
  } = options;

  // Latest options, readable from the single subscription below. A ref (not
  // state) because nothing here is rendered; it is synced in an effect — the
  // subscription reads it on EVENT time (an AppState callback, outside React),
  // never during render, so deriving it during render would be wrong and
  // set-state-in-effect does not apply.
  const depsRef = useRef<AppLockDeps>({
    tokenStore,
    optInStore,
    biometrics,
    gracePeriodMs,
    now,
    subscribeToAppState,
    onLocked,
  });
  useEffect(() => {
    depsRef.current = {
      tokenStore,
      optInStore,
      biometrics,
      gracePeriodMs,
      now,
      subscribeToAppState,
      onLocked,
    };
  });

  // backgroundedAt lives in a ref, not state: written and read by the
  // listener, never rendered.
  const backgroundedAtRef = useRef<number | null>(null);
  const inFlightRef = useRef<boolean>(false);

  // `locked` IS rendered (the overlay reads it), so it is state — unlike
  // everything else here, which the listener only ever reads or writes
  // outside React. Set it synchronously in the listener callback itself
  // (never inside the async IIFE) so the obscuring paint happens on the SAME
  // event that backgrounded the app, not a tick later.
  const [locked, setLocked] = useState(false);

  // Cached "could a lock follow?" — read synchronously by the listener, which
  // cannot await a store before the snapshot is taken. Unknown (not yet
  // loaded) counts as no, so nothing is covered on a guess.
  const canLockRef = useRef<boolean>(false);

  useEffect(() => {
    const refreshCanLock = async () => {
      const current = depsRef.current;
      try {
        const [token, optedIn] = await Promise.all([
          current.tokenStore.get(),
          createBiometricsOptInStore(current.optInStore).isOptedIn(),
        ]);
        canLockRef.current = Boolean(token) && optedIn;
      } catch {
        canLockRef.current = false;
      }
    };
    void refreshCanLock();

    const unsubscribe = depsRef.current.subscribeToAppState((status) => {
      const current = depsRef.current;
      if (status === "inactive") {
        // Not leaving the app (see the header): never obscure, never start the
        // background clock. The member may be about to open a system sheet;
        // refresh the cache so a `background` that follows has a fresh answer.
        void refreshCanLock();
        return;
      }
      if (status === "background") {
        // The clock runs regardless of the cache: a stale "no" must not skip
        // the warm re-verification, which re-reads both stores itself.
        if (backgroundedAtRef.current === null) {
          backgroundedAtRef.current = current.now();
        }
        if (canLockRef.current) {
          // Obscure NOW, before any async read — this is what the
          // app-switcher snapshot and the Face ID sheet sit on top of.
          setLocked(true);
        }
        void refreshCanLock();
        return;
      }
      if (status !== "active") return;
      void refreshCanLock();
      const backgroundedAt = backgroundedAtRef.current;
      backgroundedAtRef.current = null;
      if (backgroundedAt === null) {
        setLocked(false);
        return;
      }
      if (current.now() - backgroundedAt < current.gracePeriodMs) {
        // A quick hop to the switcher inside the grace period: no re-auth,
        // so nothing left to hide behind the overlay.
        setLocked(false);
        return;
      }
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      void (async () => {
        try {
          const optedIn = await createBiometricsOptInStore(
            current.optInStore,
          ).isOptedIn();
          if (!optedIn) {
            setLocked(false);
            return;
          }
          const result = await coldOpenFlow({
            tokenStore: current.tokenStore,
            optInStore: current.optInStore,
            biometrics: current.biometrics,
          });
          if (result.kind === "login" && result.reason !== "no-jwt") {
            current.onLocked?.();
          }
          // Settled either way — success reveals the dashboard, failure has
          // already dropped the JWT and called onLocked above, so the
          // sign-out is already under way by the time the overlay clears.
          setLocked(false);
        } catch {
          // The keychain refused a read (the device locked again mid-check).
          // Never strand the overlay over the app: clear it, and the next
          // foreground runs the check again.
          setLocked(false);
        } finally {
          inFlightRef.current = false;
        }
      })();
    });
    return unsubscribe;
  }, []);

  return { locked };
}
