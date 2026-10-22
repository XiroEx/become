import { Platform } from "react-native";

/**
 * Is the Health sync surface shown to members — and on which platform?
 *
 * It used to be one flag, false everywhere, because no health module was
 * installed at all and the "Sync from Health" toggle synced nothing (it shipped
 * as a switch that only wrote a flag, and for a while that flag landed on the
 * session key and signed the member out).
 *
 * It is per-platform now because the two halves land in different tickets:
 *
 *  - **Android: on.** NP-199 installs `react-native-health-connect`, declares
 *    the four Health Connect permissions in `app.json` and wires read and write
 *    for weight and workouts (`lib/health/healthConnect.ts`, `lib/health/sync.ts`).
 *  - **iOS: on.** NP-185 installs `react-native-health`, adds the HealthKit
 *    entitlement and the `NSHealthShareUsageDescription` /
 *    `NSHealthUpdateUsageDescription` strings, and wires read AND write for
 *    weight (`lib/health/healthKit.ts`, `lib/health/ios.ts`). NP-186 adds
 *    the finished-workout write (`writeWorkout`, with its own `Workout`
 *    permission and a client-kept HealthKit id so retries write once).
 *
 * Everything else about the feature is platform-neutral on purpose: the
 * switches, the launch snapshot, the sync and the server route are shared
 * between both platforms.
 *
 * NP-199: https://board.redbtn.io/b/6a70c4ea2fff468f8e253a89?card=6abb12692379586ae015cb0e
 * NP-185: https://board.redbtn.io/b/6a70c4ea2fff468f8e253a89?card=6abb12672379586ae015cac4
 * NP-186: https://board.redbtn.io/b/6a70c4ea2fff468f8e253a89?card=6abb12682379586ae015cac9
 */
export const HEALTH_SYNC_ENABLED_ANDROID = true;
export const HEALTH_SYNC_ENABLED_IOS = true;

/**
 * `platform` defaults to the device's. It is a parameter so a test can ask
 * about the OTHER platform without mocking `Platform`, which is the only way to
 * assert both halves of a per-platform gate in one jest run.
 */
export function isHealthSyncEnabled(platform: string = Platform.OS): boolean {
  if (platform === "android") return HEALTH_SYNC_ENABLED_ANDROID;
  if (platform === "ios") return HEALTH_SYNC_ENABLED_IOS;
  // Web and anything else: there is no health store to talk to.
  return false;
}
