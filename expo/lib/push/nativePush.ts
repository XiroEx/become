/**
 * The native push registration seam (NP-065).
 *
 * DECISION (George, 2026-09-30): no Expo-hosted services, ever — no EAS
 * Build, EAS Submit, EAS Update, Expo Push Service, or expo.dev project.
 * Expo *libraries* and the CLI are fine. So this module registers the RAW
 * device token (`getDevicePushTokenAsync()` — an APNs device token on iOS, an
 * FCM registration token on Android), never an Expo push token and never with
 * an EAS project id. `expo-notifications` is used for permission and local
 * notifications only.
 *
 * Everything that touches the native module lives behind the `PushDeps`
 * interface so unit tests never import `expo-notifications` (which needs a
 * device). The production deps (`defaultPushDeps`) are the thin wrappers at
 * the bottom.
 *
 * RULES THAT TRAVEL (from the web):
 * - Nothing in the app requires notifications; every failure here is caught
 *   and logged, never a crash, never a block.
 * - Turning notifications off in Settings is account-wide (the server drops
 *   every device and flips the master switch). Background registration never
 *   re-enables: it posts WITHOUT `reenable`, so a 409 (`notifications_disabled`)
 *   is the expected answer and is swallowed, not retried as an opt-in.
 * - `reenable: true` is sent ONLY from an explicit "Turn on" action.
 * - Turning notifications off in the OS removes the token: when the
 *   foreground check finds the OS permission revoked, this endpoint is
 *   unsubscribed (the Privacy Policy says so).
 */

import { Platform } from "react-native";
import { WEBAPP_BASE_URL } from "@/lib/config";
import {
  getStoredPushToken,
  setStoredPushToken,
  clearStoredPushToken,
} from "./pushTokenStore";

export type NativePlatform = "ios" | "android";

/** The OS platform this registration is filed under. */
export function nativePushPlatform(os: string = Platform.OS): NativePlatform {
  return os === "android" ? "android" : "ios";
}

/** What `expo-notifications` reports about the OS permission. */
export type PushPermissionState = "granted" | "denied" | "undetermined";

export interface PushPermissionStatus {
  granted: boolean;
  /** True when the OS will never show the prompt again (user said no). */
  canAskAgain: boolean;
  status: PushPermissionState;
}

export interface RawDeviceToken {
  /** `ios` | `android` — the transport the token belongs to. */
  type: string;
  /** The raw token bytes as a string (APNs hex / FCM registration token). */
  data: string;
}

export interface PushDeps {
  getPermission: () => Promise<PushPermissionStatus>;
  requestPermission: () => Promise<PushPermissionStatus>;
  /** Raw device token. Throws on a simulator / unconfigured transport. */
  getDeviceToken: () => Promise<RawDeviceToken>;
  getStoredToken: () => Promise<string | null>;
  setStoredToken: (token: string) => Promise<void>;
  clearStoredToken: () => Promise<void>;
  postSubscribe: (
    endpoint: string,
    platform: NativePlatform,
    reenable: boolean,
  ) => Promise<{ status: number; ok: boolean }>;
  postUnsubscribe: (endpoint: string) => Promise<{ status: number; ok: boolean }>;
  getJwt: () => Promise<string | null>;
  log: (message: string, ...args: unknown[]) => void;
}

export interface PushDepsInput {
  jwt: string | null;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  log?: (message: string, ...args: unknown[]) => void;
}

function httpDeps(input: PushDepsInput): Pick<
  PushDeps,
  "postSubscribe" | "postUnsubscribe" | "getJwt" | "log"
> {
  const baseUrl = (input.baseUrl ?? WEBAPP_BASE_URL).replace(/\/$/, "");
  const send = input.fetchImpl ?? fetch;
  const log = input.log ?? ((message: string) => console.warn(message));
  return {
    async postSubscribe(endpoint, platform, reenable) {
      const body: Record<string, unknown> = { endpoint, platform };
      if (reenable) body.reenable = true;
      const res = await send(`${baseUrl}/api/notifications/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(input.jwt ? { Authorization: `Bearer ${input.jwt}` } : {}),
        },
        body: JSON.stringify(body),
      });
      return { status: res.status, ok: res.ok };
    },
    async postUnsubscribe(endpoint) {
      const res = await send(`${baseUrl}/api/notifications/unsubscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(input.jwt ? { Authorization: `Bearer ${input.jwt}` } : {}),
        },
        body: JSON.stringify({ endpoint }),
      });
      return { status: res.status, ok: res.ok };
    },
    async getJwt() {
      return input.jwt;
    },
    log,
  };
}

/**
 * Production deps: the only place `expo-notifications` is imported.
 * Required lazily so Jest (no native module) can import this file freely —
 * tests inject their own `PushDeps` and never touch these.
 */
export function defaultPushDeps(input: PushDepsInput): PushDeps {
  const http = httpDeps(input);
  return {
    ...http,
    async getPermission() {
      const Notifications = await import("expo-notifications");
      const res = await Notifications.getPermissionsAsync();
      return toPermissionState(res.granted, res.canAskAgain);
    },
    async requestPermission() {
      const Notifications = await import("expo-notifications");
      const res = await Notifications.requestPermissionsAsync();
      return toPermissionState(res.granted, res.canAskAgain);
    },
    async getDeviceToken() {
      const Notifications = await import("expo-notifications");
      const token = await Notifications.getDevicePushTokenAsync();
      return { type: token.type, data: String(token.data) };
    },
    getStoredToken: getStoredPushToken,
    setStoredToken: setStoredPushToken,
    clearStoredToken: clearStoredPushToken,
  };
}

export function toPermissionState(
  granted: boolean,
  canAskAgain?: boolean,
): PushPermissionStatus {
  if (granted) return { granted: true, canAskAgain: true, status: "granted" };
  return {
    granted: false,
    canAskAgain: canAskAgain ?? true,
    status: canAskAgain === false ? "denied" : "undetermined",
  };
}

export type EnsurePushResult =
  | { kind: "registered"; endpoint: string }
  | { kind: "already-registered"; endpoint: string }
  | { kind: "no-permission" }
  | { kind: "no-token" }
  | { kind: "disabled-409" }
  | { kind: "failed"; reason: string };

/**
 * Register (or re-confirm) this device's raw token with the server.
 *
 * - No JWT → `no-token` (a subscription with no user is useless).
 * - OS permission not granted → `no-permission`, no network call.
 * - Token fetch throws (simulator, push unconfigured) → caught, `failed`.
 * - 409 (`notifications_disabled`) → `disabled-409`: the member turned
 *   notifications off on the web, and background registration must NOT
 *   re-enable them. Never retried with `reenable`.
 * - Success → the endpoint is stored locally so sign-out and the revoked
 *   check know which row is this device's.
 *
 * `reenable` must be true ONLY when the member explicitly tapped "Turn on".
 */
export async function ensurePushRegistration(
  deps: PushDeps,
  options: { platform?: NativePlatform; reenable?: boolean } = {},
): Promise<EnsurePushResult> {
  const jwt = await deps.getJwt();
  if (!jwt) return { kind: "no-token" };
  let permission: PushPermissionStatus;
  try {
    permission = await deps.getPermission();
  } catch (error) {
    deps.log("[push] permission check failed", error);
    return { kind: "failed", reason: "permission-check" };
  }
  if (!permission.granted) return { kind: "no-permission" };
  let raw: RawDeviceToken;
  try {
    raw = await deps.getDeviceToken();
  } catch (error) {
    // Simulator, missing google-services / APNs key, push unconfigured —
    // an ordinary state of the world, never a crash.
    deps.log("[push] device token unavailable", error);
    return { kind: "failed", reason: "token-unavailable" };
  }
  const endpoint = raw.data;
  if (!endpoint) return { kind: "failed", reason: "token-empty" };
  const platform = options.platform ?? nativePushPlatform();
  const reenable = options.reenable === true;
  let res: { status: number; ok: boolean };
  try {
    res = await deps.postSubscribe(endpoint, platform, reenable);
  } catch (error) {
    deps.log("[push] subscribe failed", error);
    return { kind: "failed", reason: "network" };
  }
  if (res.ok) {
    try {
      await deps.setStoredToken(endpoint);
    } catch {
      /* the row exists server-side; local bookkeeping is best-effort */
    }
    return { kind: "registered", endpoint };
  }
  if (res.status === 409 && !reenable) {
    // The member turned notifications off (web Settings or account-wide
    // toggle). Background registration stops here — sending `reenable`
    // would silently undo their opt-out.
    return { kind: "disabled-409" };
  }
  deps.log(`[push] subscribe answered ${res.status}`);
  return { kind: "failed", reason: `http-${res.status}` };
}

export type ForegroundPushResult =
  | { kind: "registered"; endpoint: string }
  | { kind: "already-registered"; endpoint: string }
  | { kind: "no-permission" }
  | { kind: "no-token" }
  | { kind: "disabled-409" }
  | { kind: "revoked-unsubscribed" }
  | { kind: "failed"; reason: string };

/**
 * The foreground check: re-register each time the app returns to the
 * foreground, since tokens rotate.
 *
 * When the OS permission is revoked (the member turned Become off in iOS
 * Settings / Android settings), the stored endpoint is unsubscribed — the
 * Privacy Policy says turning notifications off in the OS removes the token —
 * and the local copy is dropped. Background registration never re-enables.
 */
export async function checkPushOnForeground(
  deps: PushDeps,
  options: { platform?: NativePlatform } = {},
): Promise<ForegroundPushResult> {
  const jwt = await deps.getJwt();
  if (!jwt) return { kind: "no-token" };
  let permission: PushPermissionStatus;
  try {
    permission = await deps.getPermission();
  } catch (error) {
    deps.log("[push] permission check failed", error);
    return { kind: "failed", reason: "permission-check" };
  }
  if (!permission.granted) {
    let stored: string | null = null;
    try {
      stored = await deps.getStoredToken();
    } catch {
      stored = null;
    }
    if (stored) {
      try {
        await deps.postUnsubscribe(stored);
      } catch (error) {
        deps.log("[push] revoked unsubscribe failed", error);
        return { kind: "failed", reason: "unsubscribe-network" };
      }
      try {
        await deps.clearStoredToken();
      } catch {
        /* best-effort */
      }
      return { kind: "revoked-unsubscribed" };
    }
    return { kind: "no-permission" };
  }
  const result = await ensurePushRegistration(deps, {
    platform: options.platform,
    reenable: false,
  });
  return result;
}

/**
 * Explicit "Turn on" from Settings or the Home card: request the OS
 * permission when still undetermined, then register WITH `reenable: true` —
 * the only path allowed to flip the master switch back on.
 */
export async function enablePushFromExplicitAction(
  deps: PushDeps,
  options: { platform?: NativePlatform } = {},
): Promise<EnsurePushResult> {
  const jwt = await deps.getJwt();
  if (!jwt) return { kind: "no-token" };
  let permission: PushPermissionStatus;
  try {
    permission = await deps.getPermission();
  } catch (error) {
    deps.log("[push] permission check failed", error);
    return { kind: "failed", reason: "permission-check" };
  }
  if (!permission.granted) {
    if (!permission.canAskAgain) return { kind: "no-permission" };
    try {
      permission = await deps.requestPermission();
    } catch (error) {
      deps.log("[push] permission request failed", error);
      return { kind: "failed", reason: "permission-request" };
    }
    if (!permission.granted) return { kind: "no-permission" };
  }
  return ensurePushRegistration(deps, {
    platform: options.platform,
    reenable: true,
  });
}

/**
 * Sign-out clean-up: unsubscribe THIS endpoint only, then drop the local
 * copy. No endpoint → nothing to remove server-side, but the local copy is
 * still cleared so the next account never inherits it.
 */
export async function unsubscribeThisDevice(
  deps: Pick<PushDeps, "getStoredToken" | "clearStoredToken" | "postUnsubscribe" | "log">,
): Promise<{ kind: "unsubscribed" | "nothing-stored" | "failed"; endpoint?: string }> {
  let stored: string | null = null;
  try {
    stored = await deps.getStoredToken();
  } catch {
    stored = null;
  }
  if (!stored) return { kind: "nothing-stored" };
  try {
    await deps.postUnsubscribe(stored);
  } catch (error) {
    deps.log("[push] sign-out unsubscribe failed", error);
    return { kind: "failed", endpoint: stored };
  }
  try {
    await deps.clearStoredToken();
  } catch {
    /* best-effort */
  }
  return { kind: "unsubscribed", endpoint: stored };
}
