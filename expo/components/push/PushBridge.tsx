import { useEffect } from "react";
import {
  handleNotificationTap,
  type PermissionFetcher,
} from "@/lib/push/handlers";
import type { NotificationPayload } from "@/lib/push/deepLinkRouter";
import { defaultTapDeps, startTapRouter } from "@/lib/push/tapRouter";

export interface PushBridgeProps {
  /** Provide a way to subscribe to tap events (DI for tests). */
  subscribeToTap?: (
    listener: (payload: NotificationPayload) => void,
  ) => () => void;
  navigate: (route: string) => void;
  /** Optional: drive permission probe + token registration externally. */
  permissionFetcher?: PermissionFetcher;
  /** Start the tap router (DI for tests). Defaults to the production wiring. */
  startRouter?: typeof startTapRouter;
}

/**
 * Mount-once bridge that wires notification taps to the app router from every
 * app state (NP-066).
 *
 * The payload's `data.url` is the only routing input — the same url the web's
 * service worker opens (`webapp/public/sw.js`). Cold-start taps are drained
 * with `getLastNotificationResponseAsync`, background taps arrive through the
 * response listener, and foreground reminders present quietly (no banner over
 * the screen the member is on). Chat urls resolve to Home while NP-032's flag
 * keeps chat out; an unknown url opens Home.
 *
 * Production wiring goes through `startTapRouter(defaultTapDeps(...))`, which
 * owns the `expo-notifications` import lazily so Jest never touches the native
 * module. Tests inject `subscribeToTap` (the legacy seam, kept) or
 * `startRouter`.
 */
export function PushBridge({
  subscribeToTap,
  navigate,
  startRouter = startTapRouter,
}: PushBridgeProps): null {
  useEffect(() => {
    if (subscribeToTap) {
      const unsubscribe = subscribeToTap((payload) => {
        handleNotificationTap(payload, navigate);
      });
      return unsubscribe;
    }
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void startRouter(defaultTapDeps({ navigate }))
      .then((stop) => {
        if (cancelled) {
          stop();
          return;
        }
        unsubscribe = stop;
      })
      .catch(() => {
        /* a tap router may never take the app with it */
      });
    return () => {
      cancelled = true;
      try {
        unsubscribe?.();
      } catch {
        /* unsubscribe is best-effort */
      }
    };
    // The tap router is app-lifetime wiring: subscribe once per navigate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribeToTap, navigate]);
  return null;
}
