// The HMAC that makes the "Keep my account" link the member's and nobody
// else's. SERVER ONLY — it imports `crypto`, which is why it is not in
// lib/accountDeletion.ts alongside the constants the client bundles read.
//
// Same shape as lib/emailUnsubscribe.ts, for the same reasons: the link has to
// work in a mail app's in-app browser where nobody is signed in, and it has to
// keep working for the whole undo window. It is NOT a session — it can clear
// one field and nothing else, so leaking it costs a member a pending deletion,
// not an account.
//
// It is bound to `deletion.requestedAt`, so a link verifies for exactly one
// pending deletion: cancel that deletion (or request a new one) and every link
// minted before stops verifying. Nothing to store, nothing to expire by hand.
//
// The functions take the secret as an argument so the round trip is testable
// without runtime config.

import crypto from 'crypto'

/**
 * 32 hex chars: half a SHA-256, plenty against forgery, short in a URL.
 *
 * Milliseconds, because that is exactly what the stored Date round-trips to.
 * Formatting the timestamp any other way would mint a token that cannot be
 * verified against the row it came from — a bug that only appears in an inbox.
 */
export function restoreToken(userId: string, requestedAt: Date, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`account-restore:${userId}:${requestedAt.getTime()}`)
    .digest('hex')
    .slice(0, 32)
}

export function verifyRestoreToken(
  userId: string,
  requestedAt: Date | null | undefined,
  token: string | null | undefined,
  secret: string,
): boolean {
  if (!userId || !requestedAt || !token) return false
  if (!/^[0-9a-f]{32}$/i.test(token)) return false
  const expected = Buffer.from(restoreToken(userId, requestedAt, secret), 'hex')
  const given = Buffer.from(token.toLowerCase(), 'hex')
  // Length-checked first: timingSafeEqual THROWS on a mismatch rather than
  // returning false, and an exception here would 500 instead of refusing.
  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}
