import { Platform, Linking } from "react-native";
import Constants from "expo-constants";
import type { AppConfigResponse } from "@become/api-client";
import { AppConfigResponseSchema } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { deviceStorage } from "@/lib/offline/storage";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import { compareVersions } from "./compareVersions";

export const DISMISSED_VERSION_KEY = "become.dismissed_update_version";

export interface VersionGateDeps {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  platform?: "ios" | "android" | string;
  installedVersion?: string;
  storage?: AsyncStorageLike;
  openUrl?: (url: string) => Promise<unknown>;
}

export interface VersionGateState {
  isBlocked: boolean;
  hasUpdate: boolean;
  minVersion?: string;
  latestVersion?: string;
  storeUrl?: string;
}

export function getInstalledVersion(deps?: VersionGateDeps): string {
  if (deps?.installedVersion) return deps.installedVersion;
  return (
    Constants.expoConfig?.version ??
    (Constants as unknown as { nativeAppVersion?: string }).nativeAppVersion ??
    "0.1.0"
  );
}

export function getPlatform(deps?: VersionGateDeps): "ios" | "android" {
  if (deps?.platform) {
    return deps.platform === "android" ? "android" : "ios";
  }
  return Platform.OS === "android" ? "android" : "ios";
}

export async function fetchAppConfig(
  deps?: VersionGateDeps,
): Promise<AppConfigResponse | null> {
  const baseUrl = deps?.baseUrl ?? WEBAPP_BASE_URL;
  const fetchImpl = deps?.fetchImpl ?? globalThis.fetch;

  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/api/app/config`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      // Non-200: fail open
      return null;
    }

    const data: unknown = await res.json();
    const parsed = AppConfigResponseSchema.safeParse(data);
    if (!parsed.success) {
      // Invalid schema: fail open
      return null;
    }

    return parsed.data;
  } catch {
    // Network error or abort: fail open, do nothing
    return null;
  }
}

export async function evaluateVersionGate(
  config: AppConfigResponse | null,
  deps?: VersionGateDeps,
): Promise<VersionGateState> {
  // If config is unset or failed to fetch (network off / error): fail open
  if (!config) {
    return { isBlocked: false, hasUpdate: false };
  }

  const platform = getPlatform(deps);
  const pConfig = config[platform] ?? {};
  const installed = getInstalledVersion(deps);
  const storage = deps?.storage ?? deviceStorage;

  const minVersion = pConfig.minVersion?.trim();
  const latestVersion = pConfig.latestVersion?.trim();
  const storeUrl = pConfig.storeUrl?.trim();

  // 1. Below minVersion: full-screen block
  if (minVersion && compareVersions(installed, minVersion) < 0) {
    return {
      isBlocked: true,
      hasUpdate: false,
      minVersion,
      latestVersion,
      storeUrl,
    };
  }

  // 2. Below latestVersion: dismissible banner once per version
  if (latestVersion && compareVersions(installed, latestVersion) < 0) {
    try {
      const dismissed = await storage.getItem(DISMISSED_VERSION_KEY);
      if (dismissed !== latestVersion) {
        return {
          isBlocked: false,
          hasUpdate: true,
          minVersion,
          latestVersion,
          storeUrl,
        };
      }
    } catch {
      // Storage error: fail open
    }
  }

  return {
    isBlocked: false,
    hasUpdate: false,
    minVersion,
    latestVersion,
    storeUrl,
  };
}

export async function dismissUpdateBanner(
  version: string,
  deps?: VersionGateDeps,
): Promise<void> {
  const storage = deps?.storage ?? deviceStorage;
  try {
    await storage.setItem(DISMISSED_VERSION_KEY, version);
  } catch {
    // Ignore storage write failures
  }
}

export async function openStore(
  storeUrl?: string,
  deps?: VersionGateDeps,
): Promise<void> {
  if (!storeUrl) return;
  const openUrl = deps?.openUrl ?? Linking.openURL;
  try {
    await openUrl(storeUrl);
  } catch (error) {
    console.error("Failed to open store URL:", error);
  }
}
