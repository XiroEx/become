import { useEffect, useRef } from "react";
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

export function useAppLock(options: UseAppLockOptions): null {
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

  useEffect(() => {
    const unsubscribe = depsRef.current.subscribeToAppState((status) => {
      const current = depsRef.current;
      if (status === "background" || status === "inactive") {
        if (backgroundedAtRef.current === null) {
          backgroundedAtRef.current = current.now();
        }
        return;
      }
      if (status !== "active") return;
      const backgroundedAt = backgroundedAtRef.current;
      backgroundedAtRef.current = null;
      if (backgroundedAt === null) return;
      if (current.now() - backgroundedAt < current.gracePeriodMs) return;
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      void (async () => {
        try {
          const optedIn = await createBiometricsOptInStore(
            current.optInStore,
          ).isOptedIn();
          if (!optedIn) return;
          const result = await coldOpenFlow({
            tokenStore: current.tokenStore,
            optInStore: current.optInStore,
            biometrics: current.biometrics,
          });
          if (result.kind === "login" && result.reason !== "no-jwt") {
            current.onLocked?.();
          }
        } finally {
          inFlightRef.current = false;
        }
      })();
    });
    return unsubscribe;
  }, []);

  return null;
}
