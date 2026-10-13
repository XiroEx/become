// The one-click opt-out link that goes in every engagement email.
//
// CAN-SPAM wants an opt-out that works without signing in and keeps working
// for 30 days after the send. So the link carries the member's id and an HMAC
// of it under the JWT secret: nothing to look up, nothing to expire, and a
// forged id fails the MAC. It is NOT a session — it can flip one boolean and
// nothing else — so leaking it costs a member one preference, not an account.
//
// The pure functions take the secret as an argument so the round trip is
// unit-testable without runtime config; the async wrappers resolve it.

import crypto from 'crypto'
import { getRuntimeConfig } from '@/lib/runtimeConfig'
import { appBaseUrl } from '@/lib/billing/urls'

export const UNSUBSCRIBE_PATH = '/api/email/unsubscribe'

/** 32 hex chars: half a SHA-256, plenty against forgery, short in a URL. */
export function unsubscribeToken(userId: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`unsubscribe:${userId}`).digest('hex').slice(0, 32)
}

export function verifyUnsubscribeToken(userId: string, token: string, secret: string): boolean {
  if (!userId || !token || !/^[0-9a-f]{32}$/i.test(token)) return false
  const expected = Buffer.from(unsubscribeToken(userId, secret), 'hex')
  const given = Buffer.from(token.toLowerCase(), 'hex')
  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}

export function buildUnsubscribeUrl(base: string, userId: string, token: string): string {
  const u = new URL(UNSUBSCRIBE_PATH, base)
  u.searchParams.set('u', userId)
  u.searchParams.set('t', token)
  return u.toString()
}

export async function unsubscribeUrlFor(userId: string): Promise<string> {
  const { auth } = await getRuntimeConfig()
  return buildUnsubscribeUrl(appBaseUrl(), userId, unsubscribeToken(userId, auth.jwtSecret))
}

export async function verifyUnsubscribe(userId: string, token: string): Promise<boolean> {
  const { auth } = await getRuntimeConfig()
  return verifyUnsubscribeToken(userId, token, auth.jwtSecret)
}
