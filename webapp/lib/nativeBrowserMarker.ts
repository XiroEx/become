/**
 * "This browser tab is the native app's in-app browser" — a short-lived,
 * non-secret cookie (NP-205).
 *
 * Tier-3 web surfaces (the program editor, the recipe editor, admin screens)
 * open in a plain in-app browser, not a webview the native app controls: it
 * cannot inject a header or a global on every navigation inside it. The one
 * lever the app actually has is the URL it opens, and the one URL path that
 * is EXCLUSIVELY reached by the native app opening a member signed in is
 * `GET /auth/handoff` (webapp/app/auth/handoff/route.ts) — ordinary mobile
 * Safari never lands there. So that route is where this cookie originates;
 * nothing else may set it, which is what keeps a magic query string from
 * forging "I am the app" from ordinary mobile web.
 *
 * Read by:
 *  - webapp/app/layout.tsx (server component) to omit the `apple-itunes-app`
 *    meta tag — Safari's own smart-banner trigger — inside the app.
 *  - webapp/components/GetAppBanner.tsx (client) to never render the
 *    Android "Get the app" banner inside the app.
 *
 * NOT HttpOnly: it carries no session and nothing secret, and GetAppBanner
 * needs to read it from `document.cookie` directly.
 */

export const NATIVE_BROWSER_COOKIE = 'become_native_browser'

/** One Tier-3 browsing session is minutes, not days — long enough to cover
 * it, short enough that a shared-cookie-jar leak into ordinary mobile Safari
 * (iOS shares Safari's store with SFSafariViewController) self-heals fast. */
export const NATIVE_BROWSER_COOKIE_MAX_AGE_SECONDS = 60 * 60

/** Build the Set-Cookie header value. */
export function nativeBrowserCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? 'Secure;' : ''
  return `${NATIVE_BROWSER_COOKIE}=1; Path=/; Max-Age=${NATIVE_BROWSER_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax; ${secure}`
}

/** True when the raw `Cookie` request header carries the marker. */
export function isNativeBrowserCookieHeader(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false
  return cookieHeader.split(';').some((part) => {
    const eq = part.indexOf('=')
    if (eq === -1) return false
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    return key === NATIVE_BROWSER_COOKIE && value === '1'
  })
}
