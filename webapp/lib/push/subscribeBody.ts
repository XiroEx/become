// The shape check for POST /api/notifications/subscribe (NP-063).
//
// Pure, so every refusal is unit tested without a database. Three platforms:
// a web push subscription (endpoint URL + keys), an iPhone (the raw APNs
// device token) and an Android phone (the raw FCM registration token). An Expo
// push token is refused outright: the server never talks to Expo's service.

import { isExpoPushToken } from './nativeMessage'

export type SubscribePlatform = 'web' | 'ios' | 'android'

export type SubscribeBody =
  | {
      ok: true
      platform: SubscribePlatform
      endpoint: string
      keys?: { p256dh: string; auth: string }
      apnsEnvironment?: 'production' | 'sandbox'
      reenable: boolean
    }
  | { ok: false; error: string }

const PLATFORMS: ReadonlySet<string> = new Set(['web', 'ios', 'android'])

/** APNs tokens are 32 bytes today (64 hex chars); Apple says not to assume a length. */
const APNS_TOKEN = /^[0-9a-f]{64,200}$/
/** FCM tokens are opaque: letters, digits and `:_-.`, ~150-4096 chars in practice. */
const FCM_TOKEN = /^[A-Za-z0-9:_\-.]{20,4096}$/

export function parseSubscribeBody(body: unknown): SubscribeBody {
  if (!body || typeof body !== 'object') return { ok: false, error: 'endpoint is required' }
  const b = body as Record<string, unknown>
  const platform = b.platform === undefined ? 'web' : b.platform
  if (typeof platform !== 'string' || !PLATFORMS.has(platform)) {
    return { ok: false, error: 'platform must be web, ios or android' }
  }
  const rawEndpoint = typeof b.endpoint === 'string' ? b.endpoint.trim() : ''
  if (!rawEndpoint) return { ok: false, error: 'endpoint is required' }
  const reenable = b.reenable === true

  if (platform === 'web') {
    const keys = b.keys as { p256dh?: unknown; auth?: unknown } | undefined
    if (typeof keys?.p256dh !== 'string' || !keys.p256dh || typeof keys?.auth !== 'string' || !keys.auth) {
      return { ok: false, error: 'keys.p256dh and keys.auth required for web subscriptions' }
    }
    return { ok: true, platform, endpoint: rawEndpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, reenable }
  }

  if (isExpoPushToken(rawEndpoint)) {
    return { ok: false, error: 'expo_push_token_not_supported' }
  }

  if (platform === 'ios') {
    const token = rawEndpoint.toLowerCase()
    if (!APNS_TOKEN.test(token)) return { ok: false, error: 'invalid_device_token' }
    const env = b.apnsEnvironment
    if (env !== undefined && env !== 'production' && env !== 'sandbox') {
      return { ok: false, error: 'apnsEnvironment must be production or sandbox' }
    }
    return {
      ok: true,
      platform,
      endpoint: token,
      reenable,
      ...(env ? { apnsEnvironment: env } : {}),
    }
  }

  if (!FCM_TOKEN.test(rawEndpoint)) return { ok: false, error: 'invalid_device_token' }
  return { ok: true, platform: 'android', endpoint: rawEndpoint, reenable }
}
