/**
 * The foreground push bridge (NP-065).
 *
 * Renders nothing. Mounted inside the signed-in group so it runs on every
 * protected route: each time the app returns to the foreground it re-registers
 * this device's raw token (tokens rotate), and when the foreground check finds
 * the OS permission revoked it unsubscribes this endpoint — the Privacy Policy
 * says turning notifications off in the OS removes the token.
 *
 * Background registration never re-enables: the check posts WITHOUT
 * `reenable`, so a 409 (`notifications_disabled`) is swallowed, not retried
 * as an opt-in.
 */

import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useAuth } from "@/lib/auth/useAuth";
import { checkPushOnForeground, defaultPushDeps } from "@/lib/push/nativePush";
import { ensureAndroidChannels } from "@/lib/android/notificationChannels";

export interface PushSyncBridgeProps {
  /** Subscribe to foreground/background changes (DI for tests). */
  subscribeToAppState?: (
    listener: (status: AppStateStatus) => void,
  ) => () => void;
  /** The foreground check (DI for tests). */
  check?: (token: string) => Promise<unknown>;
  /** Android channel setup (DI for tests). */
  setupChannels?: () => Promise<unknown>;
}

function defaultSubscribe(
  listener: (status: AppStateStatus) => void,
): () => void {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
}

export function PushSyncBridge({
  subscribeToAppState = defaultSubscribe,
  check,
  setupChannels,
}: PushSyncBridgeProps = {}): null {
  const { token } = useAuth();
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  });

  const runCheck = useCallback(async () => {
    const jwt = tokenRef.current;
    if (!jwt) return;
    try {
      if (check) {
        await check(jwt);
      } else {
        await checkPushOnForeground(defaultPushDeps({ jwt }));
      }
    } catch {
      /* a sync may never take the app with it */
    }
  }, [check]);

  const runSetup = useCallback(async () => {
    try {
      if (setupChannels) await setupChannels();
      else await ensureAndroidChannels();
    } catch {
      /* channels are a nicety, never a launch blocker */
    }
  }, [setupChannels]);

  useEffect(() => {
    if (!token) return;
    void runSetup();
    void runCheck();
    const unsubscribe = subscribeToAppState((status) => {
      if (status === "active") void runCheck();
    });
    return unsubscribe;
    // runCheck / runSetup are stable per token via refs; re-run on sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return null;
}
