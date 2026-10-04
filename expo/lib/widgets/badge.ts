/**
 * The app-icon badge, natively (NP-067).
 *
 * The web draws this with the Badging API (`webapp/lib/widgets/badge.ts`,
 * `webapp/components/AppBadgeSync.tsx`); native draws it with
 * `Notifications.setBadgeCountAsync` from `expo-notifications`, which sets the
 * number on a real iPhone's icon and on Android launchers that show badges.
 *
 * RULES THAT TRAVEL (from the web):
 *
 *  - The badge equals `WidgetFeed.badgeCount` — the number the widgets and the
 *    daily glance use — read from `GET /api/widgets/summary?tz=` with the
 *    member's SESSION (the web's `AppBadgeSync` reads the same route with the
 *    same credential, so the icon and the web can never disagree). One request,
 *    not a mint plus a read: the widgets token exists for OS surfaces outside
 *    this process, and the badge is drawn by this process.
 *  - Zero CLEARS. On the web `setAppBadge(0)` draws a dot, so zero calls
 *    `clearAppBadge()` instead; here `setBadgeCountAsync(0)` IS the clear, so
 *    zero is still never "a zero on the icon" — a finished day goes clean.
 *  - A failed read keeps the last value. Offline, a refusal, or a body without
 *    a number says nothing about the member's day, and clearing on that
 *    strength would wipe a day they still owe.
 *  - Sign-out clears, and so does account deletion: the badge is one member's
 *    unfinished day and must not outlive their session (`AuthProvider.signOut`
 *    and `DangerZone.onConfirm` both call `clearAppBadge`).
 *
 * Everything here is decoration and never throws. `defaultSetBadgeCount`
 * lazy-imports `expo-notifications` (like `lib/push/nativePush.ts` and
 * `lib/android/notificationChannels.ts`) so unit tests — and Expo Go, which
 * has no native module — never touch it; every function takes an injected
 * setter for the same reason.
 */

import { appendTz, currentTzOffsetMinutes } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";

/**
 * Don't re-ask on every flick between apps. The feed itself is cached ~60s,
 * so anything tighter is a request per foreground for the same number.
 */
export const APP_BADGE_MIN_REFRESH_MS = 60_000;

/** The slice of `expo-notifications` this file uses, and no more. */
export type BadgeCountSetter = (count: number) => Promise<void>;

/**
 * Production setter: the only place `expo-notifications` is imported.
 * Required lazily so Jest (no native module) can import this file freely —
 * tests inject their own setter and never touch this.
 */
async function defaultSetBadgeCount(count: number): Promise<void> {
  try {
    const Notifications = await import("expo-notifications");
    if (typeof Notifications.setBadgeCountAsync === "function") {
      await Notifications.setBadgeCountAsync(count);
    }
  } catch {
    // No native module (Expo Go, Jest), or the OS refused. Decoration only.
  }
}

/**
 * Clamp to what the OS can draw: a finite whole number, floored at 0.
 * Anything else reads as "nothing owed", which clears rather than crashes.
 */
export function sanitizeBadgeCount(count: unknown): number {
  if (typeof count !== "number" || !Number.isFinite(count)) return 0;
  return Math.max(0, Math.floor(count));
}

/**
 * Draw `count` on the icon, or clear it when there is nothing left to do.
 *
 * Returns whether the badge call landed, for the caller's tests; no caller in
 * the app branches on it.
 */
export async function applyAppBadge(
  count: number,
  setBadge: BadgeCountSetter = defaultSetBadgeCount,
): Promise<boolean> {
  const safe = sanitizeBadgeCount(count);
  try {
    // `setBadgeCountAsync(0)` IS the clear on native — there is no separate
    // clear call, and no dot-versus-nothing trap like the web's `setAppBadge`.
    await setBadge(safe);
    return true;
  } catch {
    // Permission refused, or no native module. Not an app error.
    return false;
  }
}

/**
 * Clear the icon unconditionally. Called on sign-out and on account deletion:
 * the badge is one member's unfinished day and must not survive them handing
 * the phone over. Never throws — a sign-out may never fail because the icon
 * could not be cleared.
 */
export async function clearAppBadge(
  setBadge: BadgeCountSetter = defaultSetBadgeCount,
): Promise<void> {
  try {
    await setBadge(0);
  } catch {
    // Same reason as above: decoration must not fail a sign-out.
  }
}

export type RefreshAppBadgeResult =
  /** The feed landed and the badge was drawn from its `badgeCount` (> 0). */
  | "applied"
  /** The feed landed with `badgeCount` 0 (or nonsense): the icon is clean. */
  | "cleared"
  /** No session, so no request. The caller clears separately; the badge here
   *  is untouched. */
  | "skipped"
  /** Offline, a refusal, or a body without a number. The badge keeps its last
   *  value, which is a better lie than clearing a day the member still owes. */
  | "unreachable";

export interface RefreshAppBadgeDeps {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Minutes WEST of UTC. Injectable so a test is not the machine's zone. */
  tzOffsetMinutes?: number;
  /** DI for tests; defaults to the real `setBadgeCountAsync`. */
  setBadge?: BadgeCountSetter;
}

/**
 * Read `badgeCount` from the widgets feed with the session and draw it.
 * Never throws — every caller is a launch or foreground effect, and neither
 * may fail because a badge could not be drawn.
 */
export async function refreshAppBadge(
  sessionToken: string | null,
  deps: RefreshAppBadgeDeps = {},
): Promise<RefreshAppBadgeResult> {
  if (!sessionToken) return "skipped";

  const baseUrl = (deps.baseUrl ?? WEBAPP_BASE_URL).replace(/\/$/, "");
  const send = deps.fetchImpl ?? fetch;
  // Minutes WEST, the one wire format this client uses — the same `tz` the
  // web's `AppBadgeSync` sends, so the day boundary agrees with it.
  const tz =
    deps.tzOffsetMinutes === undefined
      ? currentTzOffsetMinutes()
      : deps.tzOffsetMinutes;
  const path = appendTz("/api/widgets/summary", tz);

  let response: Response;
  try {
    response = await send(`${baseUrl}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
  } catch {
    return "unreachable";
  }
  if (!response.ok) return "unreachable";

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return "unreachable";
  }

  const badgeCount = (body as { badgeCount?: unknown } | null)?.badgeCount;
  if (typeof badgeCount !== "number") return "unreachable";

  const safe = sanitizeBadgeCount(badgeCount);
  await applyAppBadge(safe, deps.setBadge ?? defaultSetBadgeCount);
  return safe > 0 ? "applied" : "cleared";
}
