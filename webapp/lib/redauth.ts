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

let instance: RedAuthInstance | null = null

export function getRedAuth(): RedAuthInstance {
  if (instance) return instance

  // Dedicated auth DB — must NOT be Become's app DB (collection-name collision).
  const mongoUri = process.env.AUTH_MONGODB_URI
  const jwtSecret = process.env.JWT_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://become.redbtn.io'
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!mongoUri) throw new Error('[redauth] AUTH_MONGODB_URI is required (separate DB from Become app data)')
  if (!jwtSecret) throw new Error('[redauth] JWT_SECRET is required')

  const googleEnabled = Boolean(clientId && clientSecret)

  instance = createRedAuth({
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
      rpID: new URL(baseUrl).hostname,
      origin: baseUrl,
    },
  })

  return instance
}
