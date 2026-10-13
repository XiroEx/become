// NP-161 — which WebAuthn origin a passkey ceremony should be verified
// against. Pulled out of lib/redauth.ts on purpose: this file imports
// NOTHING from `@redbtn/redauth` (a pure-ESM package tsx's CJS test runner
// cannot `require()` — see tests/unit/_guard.ts's "No test reaches
// getRedAuth() ... today"), so the PURE selection logic below is testable
// with no database and no module-resolution workaround, even though
// `getRedAuth()` itself still is not.
//
// `@redbtn/redauth` (1.4.2, confirmed unchanged through 1.7.0 — see its
// `core/config.d.ts`, `RedAuthPasskeyConfig.origin: string`) accepts exactly
// ONE expected origin per instance; it does not take an array. The web and
// the iOS app both present `clientDataJSON.origin` as the https web origin
// (Apple's platform authenticator reports the ASSOCIATED DOMAIN, not a
// custom scheme, once `webcredentials:become.redbtn.io` is in
// `ios.associatedDomains` — this is exactly what makes "same relying party,
// so a passkey made on the web works in the app" true for iOS with NO
// server change). Android's Credential Manager instead reports
// `android:apk-key-hash:<base64url(sha256(signing cert))>` as the origin — a
// value the single-origin "web" instance will never match.
//
// Rather than fork `@redbtn/redauth` (a separately published package, out of
// scope here) `lib/redauth.ts` runs a SECOND instance pinned to the Android
// origin and picks between them per request using the selector below. Same
// `rpID`, same auth DB, same Mongo-backed challenges either instance
// resolves — only the origin check at verify time differs.
export type PasskeyOrigin = 'web' | 'android'

/** Header the native client sets to ask for the Android-origin instance. Web
 *  and iOS never send it, so the default ('web') is unchanged for them. */
export const PASSKEY_ORIGIN_HEADER = 'x-become-platform'

/** `android` only when the native client's platform header says so; `web`
 *  (the unchanged default) for the browser AND for the iOS app, which never
 *  sends this header because its origin already matches the web's. */
export function passkeyOriginFromRequest(req: {
  headers: { get(name: string): string | null }
}): PasskeyOrigin {
  return req.headers.get(PASSKEY_ORIGIN_HEADER) === 'android' ? 'android' : 'web'
}
