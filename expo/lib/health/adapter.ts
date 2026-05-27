import { Platform } from "react-native";
import { createIosAdapter, type IosClientImpl } from "./ios";
import {
  createAndroidAdapter,
  type AndroidClientImpl,
} from "./android";
import type { HealthClient } from "./types";

export type HealthPlatform = "ios" | "android" | "web";

export interface CreateHealthAdapterInput {
  platform?: HealthPlatform;
  ios?: IosClientImpl;
  android?: AndroidClientImpl;
}

/**
 * Dispatches to the right per-platform adapter. The native impls are injected
 * (so jest can fake them; the dev build wires the real react-native-health /
 * react-native-health-connect modules).
 *
 * Returns null on platforms without a health integration (web, unspecified).
 */
export function createHealthAdapter(
  input: CreateHealthAdapterInput = {},
): HealthClient | null {
  const platform = input.platform ?? (Platform.OS as HealthPlatform);
  if (platform === "ios") {
    if (!input.ios) {
      throw new Error("createHealthAdapter: iOS platform requires `ios` impl");
    }
    return createIosAdapter(input.ios);
  }
  if (platform === "android") {
    if (!input.android) {
      throw new Error(
        "createHealthAdapter: Android platform requires `android` impl",
      );
    }
    return createAndroidAdapter(input.android);
  }
  return null;
}
