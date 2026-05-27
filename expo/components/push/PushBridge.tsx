import { useEffect } from "react";
import {
  handleNotificationTap,
  type PermissionFetcher,
} from "@/lib/push/handlers";
import type { NotificationPayload } from "@/lib/push/deepLinkRouter";

export interface PushBridgeProps {
  /** Provide a way to subscribe to tap events (DI for tests). */
  subscribeToTap: (
    listener: (payload: NotificationPayload) => void,
  ) => () => void;
  navigate: (route: string) => void;
  /** Optional: drive permission probe + token registration externally. */
  permissionFetcher?: PermissionFetcher;
}

/**
 * Mount-once bridge that wires Expo's notification listeners to the app
 * router. Subscriptions live for the lifetime of the bridge; the listener
 * receives raw payloads and forwards them through the tap handler.
 */
export function PushBridge({
  subscribeToTap,
  navigate,
}: PushBridgeProps): null {
  useEffect(() => {
    const unsubscribe = subscribeToTap((payload) => {
      handleNotificationTap(payload, navigate);
    });
    return unsubscribe;
  }, [subscribeToTap, navigate]);
  return null;
}
