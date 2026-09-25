// The link that undoes a deletion request, for a member who has just been
// signed out of every device.
//
// The MAC IS THE CREDENTIAL. There is no session to present — requesting
// deletion signs the device out on purpose — so the link carries the member's
// id and an HMAC of it under the JWT secret, exactly like the CAN-SPAM opt-out
// link (lib/emailUnsubscribe.ts). Nothing to store, nothing to expire on a
// schedule, and a forged id fails the MAC.
//
// IT IS SIGNED OVER `deletion.requestedAt`, which is what makes it expire
// without a TTL and makes it single-use in the only sense that matters:
//   • cancel the deletion and the record is unset, so no link verifies;
//   • request deletion again and a NEW timestamp is stamped, so links minted
//     for the previous request are dead.
// A leaked link therefore costs a member one cancelled deletion — a state they
// can reach again with two taps — and never a session.
//
// The pure functions take the secret as an argument so the round trip is
// unit-testable without runtime config; the async wrappers resolve it.

import crypto from 'crypto'
import { getRuntimeConfig } from '@/lib/runtimeConfig'
import { appBaseUrl } from '@/lib/billing/urls'

/** The PAGE, not the API route. A mail scanner fetches every URL in an email,
 *  so what the link points at must be safe to GET: the page renders a button,
 *  and only the button POSTs. */
export const RESTORE_PATH = '/account/restore'

/** 32 hex chars: half a SHA-256. Plenty against forgery, short in a URL. */
export function restoreToken(userId: string, requestedAt: Date | string, secret: string): string {
  const stamp = requestedAt instanceof Date ? requestedAt.toISOString() : new Date(requestedAt).toISOString()
  return crypto
    .createHmac('sha256', secret)
    .update(`account-restore:${userId}:${stamp}`)
    .digest('hex')
    .slice(0, 32)
}

export function verifyRestoreToken(
  userId: string,
  requestedAt: Date | string | null | undefined,
  token: string,
  secret: string,
): boolean {
  if (!userId || !token || !requestedAt) return false
  if (!/^[0-9a-f]{32}$/i.test(token)) return false
  const stamp = requestedAt instanceof Date ? requestedAt : new Date(requestedAt)
  if (Number.isNaN(stamp.getTime())) return false
  const expected = Buffer.from(restoreToken(userId, stamp, secret), 'hex')
  const given = Buffer.from(token.toLowerCase(), 'hex')
  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}

export function buildRestoreUrl(base: string, userId: string, token: string): string {
  const url = new URL(RESTORE_PATH, base)
  url.searchParams.set('u', userId)
  url.searchParams.set('t', token)
  return url.toString()
}

export async function restoreUrlFor(userId: string, requestedAt: Date): Promise<string> {
  const { auth } = await getRuntimeConfig()
  return buildRestoreUrl(appBaseUrl(), userId, restoreToken(userId, requestedAt, auth.jwtSecret))
}

export async function verifyRestore(
  userId: string,
  requestedAt: Date | string | null | undefined,
  token: string,
): Promise<boolean> {
  const { auth } = await getRuntimeConfig()
  return verifyRestoreToken(userId, requestedAt, token, auth.jwtSecret)
}
