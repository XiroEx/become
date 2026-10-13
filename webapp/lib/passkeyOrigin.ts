// NP-161 — which WebAuthn origin a passkey ceremony should be verified
// against. Pulled out of lib/redauth.ts on purpose: this file imports
// NOTHING from `@redbtn/redauth` (a pure-ESM package tsx's CJS test runner
// cannot `require()` — see tests/unit/_guard.ts's "No test reaches
// getRedAuth() ... today"), so the PURE selection logic below is testable
// with no database and no module-resolution workaround, even though
// `getRedAuth()` itself still is not.
//
// Each `@redbtn/redauth` instance checks the assertion's origin against ONE
// configured value (its type says `origin: string`; at runtime a list passes
// straight through to simplewebauthn, see `passkeyExpectedOrigins` below).
// The browser presents `https://become.redbtn.io`; the iOS app presents
// `https://<rpID>` (`https://redbtn.io`); Android's Credential Manager
// presents `android:apk-key-hash:<base64url(sha256(signing cert))>`.
//
// Rather than fork `@redbtn/redauth` (a separately published package, out of
// scope here) `lib/redauth.ts` runs a SECOND instance for Android and picks
// between them per request using the selector below. Same `rpID`, same auth
// DB, same Mongo-backed challenges either instance resolves; only the origin
// check at verify time differs.
export type PasskeyOrigin = 'web' | 'android'

/** Header the native client sets on every passkey call (`android` or `ios`).
 *  Only `android` selects the Android-origin instance; the web never sends it. */
export const PASSKEY_ORIGIN_HEADER = 'x-become-platform'

/** `android` only when the native client's platform header says so; `web`
 *  (the default) for the browser AND for the iOS app, whose `https://<rpID>`
 *  origin is in the web instance's list. */
export function passkeyOriginFromRequest(req: {
  headers: { get(name: string): string | null }
}): PasskeyOrigin {
  return req.headers.get(PASSKEY_ORIGIN_HEADER) === 'android' ? 'android' : 'web'
}

// ─── Which origins each instance accepts ──────────────────────────────────────
//
// `@redbtn/redauth`'s config type says `origin: string`, but at runtime it
// hands the value straight to `@simplewebauthn/server`'s
// `verifyRegistrationResponse` / `verifyAuthenticationResponse` as
// `expectedOrigin`, which takes `string | string[]` (checked in redauth
// 1.4.2 `dist/services/passkey-wallet-methods.js` and simplewebauthn 13).
// So each instance gets a LIST, built here.
//
// WEB INSTANCE (browser and iOS app):
//   - the web origin (`https://become.redbtn.io`, or PASSKEY_ORIGIN);
//   - `https://<rpID>`. iOS native ceremonies report `https://` + the
//     relying party id as the clientDataJSON origin, NOT the app's own
//     associated domain. With rpID = redbtn.io that is `https://redbtn.io`,
//     which the web origin alone never matched, so the iOS app could not
//     verify a passkey before this was added.
//
// ANDROID INSTANCE: `android:apk-key-hash:<base64url(sha256(signing cert))>`
// for every certificate that signs a build we ship. Each one must ALSO be in
// both `public/.well-known/assetlinks.json` here and
// https://redbtn.io/.well-known/assetlinks.json (repo redbtn-io/redbtn.io),
// or Credential Manager refuses to run the ceremony at all.

/** SHA-256 fingerprints (colon hex, as assetlinks.json writes them) of the
 *  certificates that sign Become Android builds. Public values, not secrets.
 *
 *  - FA:C6:17:45:...: the React Native template debug keystore that signs
 *    the test APKs from ~/become-lane/bin/android-build.sh (expo prebuild
 *    wires `release` to `signingConfigs.debug`). This key is PUBLIC (it ships
 *    in every RN template), so it must be removed, here and in both
 *    assetlinks files, once the app is signed with a real key for release.
 *  - Add the Play App Signing certificate here when the app is on Play. */
export const BECOME_ANDROID_CERT_SHA256: readonly string[] = [
  'FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C',
]

/** `android:apk-key-hash:<base64url, no padding>` for a colon-hex SHA-256
 *  certificate fingerprint: the origin Android's Credential Manager puts in
 *  clientDataJSON for an app signed with that certificate. */
export function androidApkKeyHashOrigin(sha256ColonHex: string): string {
  const hex = sha256ColonHex.replace(/:/g, '').trim()
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`not a SHA-256 certificate fingerprint: ${sha256ColonHex}`)
  }
  return `android:apk-key-hash:${Buffer.from(hex, 'hex').toString('base64url')}`
}

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

export interface PasskeyOriginEnv {
  /** NEXT_PUBLIC_APP_URL, or https://become.redbtn.io. */
  baseUrl: string
  /** The relying party id (PASSKEY_RP_ID, default redbtn.io). */
  rpID: string
  /** PASSKEY_ORIGIN: overrides the web origin. Comma-separated list allowed. */
  webOriginEnv?: string
  /** PASSKEY_ANDROID_ORIGIN: comma-separated `android:apk-key-hash:...`
   *  origins. When set it REPLACES the defaults derived from
   *  BECOME_ANDROID_CERT_SHA256 (so ops can drop a key without a deploy of
   *  new code); when unset the defaults apply. */
  androidOriginEnv?: string
}

/** The expected WebAuthn origins for one `@redbtn/redauth` instance. */
export function passkeyExpectedOrigins(passkeyOrigin: PasskeyOrigin, env: PasskeyOriginEnv): string[] {
  if (passkeyOrigin === 'android') {
    const fromEnv = splitList(env.androidOriginEnv)
    return unique(fromEnv.length > 0 ? fromEnv : BECOME_ANDROID_CERT_SHA256.map(androidApkKeyHashOrigin))
  }
  const web = splitList(env.webOriginEnv)
  return unique([...(web.length > 0 ? web : [env.baseUrl]), `https://${env.rpID}`])
}
