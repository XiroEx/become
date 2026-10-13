import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useAuth } from "@/lib/auth/useAuth";
import {
  APP_BADGE_MIN_REFRESH_MS,
  refreshAppBadge,
  type RefreshAppBadgeResult,
} from "@/lib/widgets/badge";

export interface AppBadgeSyncProps {
  /** Subscribe to foreground/background changes (DI for tests). */
  subscribeToAppState?: (
    listener: (status: AppStateStatus) => void,
  ) => () => void;
  /** The refresh itself (DI for tests). */
  refresh?: (
    sessionToken: string | null,
  ) => Promise<RefreshAppBadgeResult>;
}

function subscribeToAppStateDefault(
  listener: (status: AppStateStatus) => void,
): () => void {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
}

/**
 * Renders nothing. Keeps the number on the installed app's ICON in step with
 * what the member still owes today (NP-067).
 *
 * The native half of the web's `AppBadgeSync`: at LAUNCH and on each return
 * to the FOREGROUND, throttled to one request a minute, it reads `badgeCount`
 * from the widgets feed and calls `Notifications.setBadgeCountAsync`. Zero
 * clears the icon; a failed read keeps the last value. Sign-out and account
 * deletion clear separately (`AuthProvider.signOut`, `DangerZone.onConfirm`),
 * because there is no session left to read with by then.
 *
 * Why it is at the root and not on a screen: the member this exists for is
 * the one who opens straight into one tab, finishes there and swipes away —
 * a screen-mounted sync would miss every other tab's completions.
 */
export function AppBadgeSync({
  subscribeToAppState = subscribeToAppStateDefault,
  refresh = refreshAppBadge,
}: AppBadgeSyncProps = {}): null {
  const { status, token } = useAuth();
  const lastFetchedAt = useRef(0);
  const inFlight = useRef(false);

  const sync = useCallback(
    async (force = false) => {
      if (inFlight.current) return;
      const now = Date.now();
      if (!force && now - lastFetchedAt.current < APP_BADGE_MIN_REFRESH_MS) {
        return;
      }
      if (status !== "signed-in" || !token) return;
      inFlight.current = true;
      try {
        const result = await refresh(token);
        // Only a landed feed moves the throttle: an offline foreground must
        // retry at the next one, not sit out the minute.
        if (result === "applied" || result === "cleared") {
          lastFetchedAt.current = Date.now();
        }
      } catch {
        // Offline, or signed out mid-flight. The badge keeps its last value,
        // which is a better lie than clearing a day the member still owes.
      } finally {
        inFlight.current = false;
      }
    },
    [refresh, status, token],
  );

  useEffect(() => {
    // Launch: the gate is process memory, so a cold start always syncs.
    void sync(true);
    const unsubscribe = subscribeToAppState((appState) => {
      if (appState === "active") void sync();
    });
    return unsubscribe;
  }, [sync, subscribeToAppState]);

  return null;
}
