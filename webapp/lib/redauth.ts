// redAuth singleton for Become.
//
// We use redAuth (@redbtn/redauth) ONLY for the cryptographic auth flows it does
// well — the Google OAuth handshake and WebAuthn (passkey) ceremonies. Become
// keeps its OWN user store as the source of truth: after redAuth verifies an
// identity, lib/authBridge links/​upserts the Become `User` by email and mints
// Become's existing JWT. That keeps every existing magic-link user untouched and
// avoids migrating userId references across all app collections.
//
// redAuth manages its own collections (users, authbindings, passkeycredentials,
// passkeychallenges, oauthstates). Its `User` model registers as collection
// `users` — IDENTICAL to Become's — so it MUST live in a SEPARATE database
// (AUTH_MONGODB_URI), never Become's app DB, or the two `users` collections
// collide. Become's `User` stays the source of truth for app data; the stable
// join key is `User.authId` = the redAuth user id.

import { createRedAuth, type RedAuthInstance } from '@redbtn/redauth'
import { getRuntimeConfig, requireRuntimeSecret } from './runtimeConfig'
import { type PasskeyOrigin, passkeyExpectedOrigins } from './passkeyOrigin'

// Re-exported so existing `import { getRedAuth, passkeyOriginFromRequest } from
// '@/lib/redauth'` call sites (the four passkey routes) need no change — the
// selector itself lives in lib/passkeyOrigin.ts, which this module's own doc
// comment on `getRedAuth` below explains the reason for.
export { type PasskeyOrigin, PASSKEY_ORIGIN_HEADER, passkeyOriginFromRequest } from './passkeyOrigin'

const instances = new Map<PasskeyOrigin, RedAuthInstance>()

export async function getRedAuth(passkeyOrigin: PasskeyOrigin = 'web'): Promise<RedAuthInstance> {
  const cached = instances.get(passkeyOrigin)
  if (cached) return cached

  // Dedicated auth DB — must NOT be Become's app DB (collection-name collision).
  const { auth } = await getRuntimeConfig()
  const mongoUri = requireRuntimeSecret(auth.authMongoUri, 'auth.authMongoUri')
  const jwtSecret = auth.jwtSecret
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://become.redbtn.io'
  const clientId = auth.googleClientId
  const clientSecret = auth.googleClientSecret

  const googleEnabled = Boolean(clientId && clientSecret)

  // Expected WebAuthn origins for this instance (lib/passkeyOrigin.ts):
  // web = the web origin plus `https://<rpID>` (what the iOS app reports);
  // android = `android:apk-key-hash:<fingerprint>` for each signing cert in
  // BECOME_ANDROID_CERT_SHA256, or PASSKEY_ANDROID_ORIGIN (comma-separated)
  // when set. Every Android cert must also be in both assetlinks.json files
  // (become.redbtn.io and redbtn.io).
  const rpID = process.env.PASSKEY_RP_ID || 'redbtn.io'
  const origins = passkeyExpectedOrigins(passkeyOrigin, {
    baseUrl,
    rpID,
    webOriginEnv: process.env.PASSKEY_ORIGIN,
    androidOriginEnv: process.env.PASSKEY_ANDROID_ORIGIN,
  })

  const instance = createRedAuth({
    mongoUri,
    jwtSecret,
    appName: 'become',
    baseUrl,
    // Only register Google when its credentials are present; passkeys need no
    // external provider config (WebAuthn is bound to the domain).
    ...(googleEnabled
      ? { providers: { google: { clientId: clientId!, clientSecret: clientSecret! } } }
      : {}),
    authMethods: { google: googleEnabled, passkey: true },
    passkey: {
      rpName: 'Become',
      // rpID=redbtn.io (the parent domain) so ONE passkey is shared across every
      // redApp — a passkey added on run/app/deck.redbtn.io works here and vice-versa.
      // Previously this was `new URL(baseUrl).hostname` (become.redbtn.io), which
      // browser-siloed Become's passkeys to its own subdomain. Override with
      // PASSKEY_RP_ID to isolate Become to its own domain if that's ever wanted.
      // NB: cross-app sharing ALSO requires AUTH_MONGODB_URI to point at the shared
      // `redauth` DB (the one app/run/deck use), not a Become-only auth DB, and the
      // @redbtn/redauth de-silo fix (>= the version that keys passkeys by
      // credentialId, not appName). Shared across BOTH instances below — the
      // Android one included — so a passkey made anywhere verifies anywhere.
      rpID,
      // A list: redauth's type says `string`, but it passes the value
      // straight to simplewebauthn's `expectedOrigin` (`string | string[]`).
      origin: origins as unknown as string,
    },
  })

  instances.set(passkeyOrigin, instance)
  return instance
}
