// NP-205: how a page knows it was opened by the native app's in-app browser
// (Tier-3 "edit in web" deep links, expo/lib/web/openWebSignedIn.ts), so it
// never shows the "Get the app" prompt to a member who already has the app —
// that is the one hard rule the acceptance criteria name explicitly.
//
// The app appends `?app=1` to every URL it opens. That survives the first
// request but not a redirect chain (the sign-in hand-off goes through
// /auth/handoff then /auth/finish before landing on the real target), so
// middleware.ts turns a request carrying it into a short-lived cookie, which
// *does* ride along the rest of the chain automatically. Not httpOnly: it is
// a UI hint, not a security control, and components/GetAppBanner.tsx reads it
// client-side.

/** Query param the native app appends to every webapp URL it opens. */
export const NATIVE_BROWSER_QUERY_PARAM = 'app'

/** The cookie middleware.ts turns that query param into. */
export const NATIVE_BROWSER_COOKIE = 'become_native_browser'

/**
 * Generous enough to outlive the two-redirect sign-in hand-off chain and a
 * normal Tier-3 editing session; short enough that returning to ordinary
 * mobile Safari/Chrome later shows the prompt again.
 */
export const NATIVE_BROWSER_COOKIE_MAX_AGE_SECONDS = 30 * 60
