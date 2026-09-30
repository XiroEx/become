/**
 * The app-icon badge — the one part of a home-screen WIDGET a web app can
 * actually draw.
 *
 * A PWA installed to the home screen gets an icon, not a widget (see
 * AGENTS.md → Home-screen widgets). The Badging API is the single exception:
 * it puts a live number ON that icon, so a member can glance at their home
 * screen and see whether they still owe the day anything without opening
 * anything. The number is `WidgetFeed.badgeCount` — the same feed the native
 * widgets will read — so the icon and the widgets can never disagree.
 *
 * Platform reality, because it decides where this matters:
 *
 *  - **iOS / iPadOS 16.4+**: supported for web apps added to the Home Screen,
 *    and ONLY once the member has granted notification permission. This is the
 *    platform that ignores manifest `shortcuts` entirely, so the badge is the
 *    whole of Become's home-screen presence there.
 *  - **Android (Chromium)**: does NOT implement the Badging API. Android badges
 *    an installed PWA's icon by itself when a notification is unread, so the
 *    daily glance push (lib/widgets/glance.ts) is what lights the icon there.
 *  - **Everywhere else**: absent. Every call below feature-detects and is a
 *    no-op, which is the correct behaviour — a badge is decoration, and nothing
 *    in the app may fail because it could not be drawn.
 *
 * Nothing here ever throws or rejects. `setAppBadge` rejects with
 * `NotAllowedError` when permission has not been granted, which is the ordinary
 * case for a member who uses Become in a browser tab, and an unhandled
 * rejection on every app open would be noise in every error report.
 */

/** Navigator-shaped subset, so this is testable without a DOM. */
export interface BadgeCapableNavigator {
  setAppBadge?: (count?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

export function badgeSupported(nav: BadgeCapableNavigator | undefined | null): boolean {
  return typeof nav?.setAppBadge === 'function' && typeof nav?.clearAppBadge === 'function'
}

/**
 * Draw `count` on the icon, or clear it when there is nothing left to do.
 *
 * Zero is CLEARED rather than set: `setAppBadge(0)` is specified to show a
 * badge with no number (a plain dot), which on a home screen reads as "there is
 * something here" — the exact opposite of what a finished day means.
 *
 * Returns whether a badge call was actually made, for the caller's tests; no
 * caller in the app branches on it.
 */
export async function applyAppBadge(
  count: number,
  nav: BadgeCapableNavigator | undefined | null = typeof navigator === 'undefined' ? null : navigator,
): Promise<boolean> {
  if (!badgeSupported(nav)) return false
  const safe = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  try {
    if (safe > 0) await nav!.setAppBadge!(safe)
    else await nav!.clearAppBadge!()
    return true
  } catch {
    // Permission not granted, or the platform refused. Not an app error.
    return false
  }
}

/**
 * Clear the icon unconditionally. Called on sign-out: the badge is one
 * member's unfinished day and must not survive them handing the phone over,
 * exactly like the cached dashboard data `logout()` wipes next to it.
 */
export async function clearAppBadge(
  nav: BadgeCapableNavigator | undefined | null = typeof navigator === 'undefined' ? null : navigator,
): Promise<boolean> {
  return applyAppBadge(0, nav)
}
