/**
 * THE ONE PLACE the app gets a real `HealthClient` from.
 *
 * `createHealthAdapter` (lib/health/adapter.ts) takes injected platform impls so
 * jest can drive it with fakes; this file is the other end of that — it builds
 * the impls from whatever native module the phone actually has, once per
 * process, and answers null when there is none (iOS until NP-185, Expo Go,
 * web, and a phone with no Health Connect).
 */
import { Platform } from "react-native";
import { createHealthAdapter } from "./adapter";
import { isHealthSyncEnabled } from "./enabled";
import {
  createHealthConnectImpl,
  loadHealthConnectModule,
} from "./healthConnect";
import type { HealthClient } from "./types";

let cached: HealthClient | null | undefined;

/**
 * The platform health client, or null when this build cannot talk to one.
 *
 * Memoised because building it loads a native module and asks the OS a
 * question; a null answer is cached too — a phone without Health Connect will
 * not grow one mid-session.
 */
export function getHealthClient(): HealthClient | null {
  if (cached !== undefined) return cached;
  cached = buildHealthClient();
  return cached;
}

function buildHealthClient(): HealthClient | null {
  if (!isHealthSyncEnabled()) return null;
  if (Platform.OS === "android") {
    const module = loadHealthConnectModule();
    if (!module) return null;
    return createHealthAdapter({
      platform: "android",
      android: createHealthConnectImpl(module),
    });
  }
  // iOS lands with NP-185 / NP-186: install `react-native-health`, build its
  // impl here, flip `HEALTH_SYNC_ENABLED_IOS`.
  return null;
}

/** @internal Tests only — the memo would otherwise leak between cases. */
export function __resetHealthClient(): void {
  cached = undefined;
}
