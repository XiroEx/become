// SERVER-ONLY. Firebase Cloud Messaging HTTP v1, sent directly (NP-064).
//
// OAuth 2.0 with the service account: an RS256 JWT-bearer grant exchanged for
// an access token, cached until shortly before it expires. Hand-rolled with
// `node:crypto` and `fetch`, so there is no dependency.

import crypto from 'node:crypto'
import type { FcmConfig } from './nativeConfig'
import { androidChannelFor, type NativePushMessage } from './nativeMessage'

export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
/** Refresh this long before Google says the token expires. */
const ACCESS_TOKEN_SKEW_MS = 5 * 60 * 1000
/** A 429/503 Retry-After is honoured up to this long, once. */
export const FCM_MAX_RETRY_WAIT_MS = 5_000

export type FetchLike = (url: string, init: {
  method: string
  headers: Record<string, string>
  body: string
}) => Promise<{
  status: number
  headers: { get(name: string): string | null }
  text(): Promise<string>
}>

export interface FcmDeps {
  fetch: FetchLike
  sleep: (ms: number) => Promise<void>
  now: () => number
}

export const defaultFcmDeps: FcmDeps = {
  fetch: (url, init) => fetch(url, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
}

interface CachedAccessToken {
  clientEmail: string
  token: string
  expiresAt: number
}

let cachedAccessToken: CachedAccessToken | null = null

export function resetFcmAccessToken(): void {
  cachedAccessToken = null
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

export function fcmAssertion(config: FcmConfig, now: number): string {
  const iat = Math.floor(now / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(JSON.stringify({
    iss: config.clientEmail,
    scope: FCM_SCOPE,
    aud: config.tokenUri,
    iat,
    exp: iat + 3600,
  }))
  const signingInput = `${header}.${claims}`
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), config.privateKey)
  return `${signingInput}.${base64url(signature)}`
}

export async function fcmAccessToken(config: FcmConfig, deps: FcmDeps = defaultFcmDeps): Promise<string> {
  const now = deps.now()
  if (
    cachedAccessToken
    && cachedAccessToken.clientEmail === config.clientEmail
    && now < cachedAccessToken.expiresAt - ACCESS_TOKEN_SKEW_MS
  ) {
    return cachedAccessToken.token
  }
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: fcmAssertion(config, now),
  }).toString()
  const res = await deps.fetch(config.tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await res.text()
  if (res.status !== 200) {
    // Google's error body names the problem (invalid_grant etc.), never the key.
    throw new Error(`FCM OAuth token request failed: ${res.status} ${text.slice(0, 200)}`)
  }
  const parsed = JSON.parse(text) as { access_token?: string; expires_in?: number }
  if (!parsed.access_token) throw new Error('FCM OAuth token response had no access_token')
  cachedAccessToken = {
    clientEmail: config.clientEmail,
    token: parsed.access_token,
    expiresAt: now + (parsed.expires_in ?? 3600) * 1000,
  }
  return parsed.access_token
}

export function buildFcmMessage(deviceToken: string, message: NativePushMessage): Record<string, unknown> {
  const data: Record<string, string> = { url: message.url }
  if (message.tag) data.tag = message.tag
  if (typeof message.badgeCount === 'number') data.badgeCount = String(message.badgeCount)

  const notification: Record<string, unknown> = { sound: 'default' }
  const channelId = androidChannelFor(message.tag)
  if (channelId) notification.channel_id = channelId
  if (message.tag) notification.tag = message.tag
  // The launcher badge. 0 means nothing to Android, so it is only sent when > 0.
  if (typeof message.badgeCount === 'number' && message.badgeCount > 0) {
    notification.notification_count = message.badgeCount
  }

  return {
    message: {
      token: deviceToken,
      notification: { title: message.title, body: message.body },
      data,
      android: { priority: 'HIGH', notification },
    },
  }
}

export type FcmOutcome =
  | { kind: 'delivered' }
  | { kind: 'unregistered'; status: number; code: string }
  | { kind: 'failed'; status: number; code: string }

interface FcmErrorBody {
  error?: {
    status?: string
    message?: string
    details?: Array<{ '@type'?: string; errorCode?: string }>
  }
}

export function classifyFcmError(status: number, text: string): FcmOutcome {
  let body: FcmErrorBody = {}
  try {
    body = JSON.parse(text) as FcmErrorBody
  } catch {
    body = {}
  }
  const fcmCode = body.error?.details?.find((d) => d.errorCode)?.errorCode
  const code = fcmCode ?? body.error?.status ?? String(status)
  const message = body.error?.message ?? ''
  if (status === 404 || fcmCode === 'UNREGISTERED') {
    return { kind: 'unregistered', status, code: fcmCode ?? 'NOT_FOUND' }
  }
  // A malformed token comes back as INVALID_ARGUMENT naming the token. Any other
  // INVALID_ARGUMENT is our payload's fault and must not delete a device.
  if (
    status === 400
    && (fcmCode === 'INVALID_ARGUMENT' || body.error?.status === 'INVALID_ARGUMENT')
    && /registration token/i.test(message)
  ) {
    return { kind: 'unregistered', status, code: 'INVALID_ARGUMENT' }
  }
  return { kind: 'failed', status, code }
}

function retryAfterMs(header: string | null): number {
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, FCM_MAX_RETRY_WAIT_MS)
  return 1_000
}

export async function sendFcm(
  config: FcmConfig,
  deviceToken: string,
  message: NativePushMessage,
  deps: FcmDeps = defaultFcmDeps,
): Promise<FcmOutcome> {
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`
  const body = JSON.stringify(buildFcmMessage(deviceToken, message))
  let retriedThrottle = false
  let retriedAuth = false

  for (;;) {
    const accessToken = await fcmAccessToken(config, deps)
    const res = await deps.fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body,
    })
    if (res.status === 200) return { kind: 'delivered' }
    const text = await res.text()

    // A revoked or rotated key: mint a fresh access token once.
    if (res.status === 401 && !retriedAuth) {
      retriedAuth = true
      resetFcmAccessToken()
      continue
    }
    // Quota or a busy backend: back off once, bounded.
    if ((res.status === 429 || res.status === 503) && !retriedThrottle) {
      retriedThrottle = true
      await deps.sleep(retryAfterMs(res.headers.get('retry-after')))
      continue
    }
    return classifyFcmError(res.status, text)
  }
}
