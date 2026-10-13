import webpush from 'web-push'
import dbConnect from './mongodb'
import PushSubscription from '@/models/PushSubscription'
import { getRuntimeConfig, requireRuntimeSecret } from './runtimeConfig'
import { createHttp2ApnsTransport, type ApnsTransport } from './push/apns'
import { defaultFcmDeps } from './push/fcm'
import {
  sendToNativeDevices,
  type NativeSubscriptionRow,
  type PlatformCounts,
} from './push/nativeSend'

let apnsTransport: ApnsTransport | null = null
function getApnsTransport(): ApnsTransport {
  if (!apnsTransport) apnsTransport = createHttp2ApnsTransport()
  return apnsTransport
}

let vapidConfigured = false

async function ensureVapid() {
  if (vapidConfigured) return
  const { push } = await getRuntimeConfig()
  const publicKey = requireRuntimeSecret(push.publicKey, 'push.publicKey')
  const privateKey = requireRuntimeSecret(push.privateKey, 'push.privateKey')
  const email = push.email || 'mailto:admin@become.redbtn.io'
  webpush.setVapidDetails(email, publicKey, privateKey)
  vapidConfigured = true
}

export interface PushPayload {
  title: string
  body: string
  icon?: string
  badge?: string          // the small monochrome NOTIFICATION icon, not a count
  url?: string            // notificationclick navigates here
  tag?: string            // replaces existing notification with same tag
  /**
   * Count to draw on the app ICON when this push lands (Badging API, applied by
   * the service worker). Distinct from `badge` above, which is an image.
   *
   * Only set it on a push whose sender genuinely knows the whole answer — the
   * daily glance, which has the widget feed in hand. A push that omits it
   * leaves the badge untouched, which is right: a nudge about one missing
   * pillar is not a statement about the other two.
   */
  badgeCount?: number
}

export interface PushSendResult {
  attempted: number
  delivered: number
  pruned: number
  failed: number
  /** The same four counts per transport. The totals above are their sums. */
  byPlatform?: { web: PlatformCounts; ios: PlatformCounts; android: PlatformCounts }
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<PushSendResult> {
  const result: PushSendResult = { attempted: 0, delivered: 0, pruned: 0, failed: 0 }
  await dbConnect()

  const subs = await PushSubscription.find({ userId }).lean()
  if (subs.length === 0) return result

  const web: PlatformCounts = { attempted: 0, delivered: 0, pruned: 0, failed: 0 }
  const staleIds: string[] = []

  // ── Web Push ───────────────────────────────────────────────────────────────
  const webSubs = subs.filter((sub) => sub.platform === 'web' && sub.keys)
  if (webSubs.length > 0) {
    let vapidReady = true
    try {
      await ensureVapid()
    } catch (err) {
      // Missing VAPID keys fail the web half only; phones still get theirs.
      vapidReady = false
      web.attempted += webSubs.length
      web.failed += webSubs.length
      console.error(`[push] web push not configured: ${err instanceof Error ? err.message : String(err)}`)
    }

    if (vapidReady) {
      const data = JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon ?? '/icons/icon-192x192.png',
        badge: payload.badge ?? '/icons/icon-96x96.png',
        url: payload.url ?? '/dashboard',
        tag: payload.tag,
        badgeCount: payload.badgeCount,
      })

      await Promise.allSettled(
        webSubs.map(async (sub) => {
          web.attempted++
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
              data,
            )
            web.delivered++
          } catch (err: unknown) {
            const status = err && typeof err === 'object' && 'statusCode' in err
              ? (err as { statusCode: number }).statusCode
              : null
            // 404/410 = subscription dead/expired; prune it so it stops rotting.
            if (status === 404 || status === 410) {
              staleIds.push(String(sub._id))
              web.pruned++
            } else {
              // Anything else (403 VAPID mismatch, 401, network) must be VISIBLE —
              // silent swallowing is how notifications die quietly for weeks.
              web.failed++
              console.error(`[push] send failed user=${userId} status=${status ?? 'n/a'} endpoint=${(() => { try { return new URL(sub.endpoint).host } catch { return 'bad-endpoint' } })()}`)
            }
          }
        })
      )
    }
  }

  // ── Native: APNs (iOS) and FCM v1 (Android), sent directly (NP-064) ──────────
  const nativeRows: NativeSubscriptionRow[] = subs
    .filter((sub) => sub.platform === 'ios' || sub.platform === 'android')
    .map((sub) => ({
      id: String(sub._id),
      platform: sub.platform as 'ios' | 'android',
      endpoint: sub.endpoint,
      apnsEnvironment: sub.apnsEnvironment,
    }))

  const emptyCounts = (): PlatformCounts => ({ attempted: 0, delivered: 0, pruned: 0, failed: 0 })
  let ios = emptyCounts()
  let android = emptyCounts()

  if (nativeRows.length > 0) {
    const { push } = await getRuntimeConfig()
    const report = await sendToNativeDevices(
      nativeRows,
      {
        title: payload.title,
        body: payload.body,
        url: payload.url ?? '/dashboard',
        tag: payload.tag,
        badgeCount: payload.badgeCount,
      },
      { apns: push.apns, fcm: push.fcm, nativeChat: push.nativeChat },
      {
        apns: getApnsTransport(),
        fcm: defaultFcmDeps,
        warn: (message) => console.warn(message),
        error: (message) => console.error(`${message} user=${userId}`),
      },
    )
    ios = report.ios
    android = report.android
    staleIds.push(...report.staleIds)
    if (report.apnsEnvironmentUpdates.length > 0) {
      await PushSubscription.bulkWrite(
        report.apnsEnvironmentUpdates.map((u) => ({
          updateOne: { filter: { _id: u.id }, update: { $set: { apnsEnvironment: u.environment } } },
        })),
      )
    }
  }

  for (const c of [web, ios, android]) {
    result.attempted += c.attempted
    result.delivered += c.delivered
    result.pruned += c.pruned
    result.failed += c.failed
  }
  result.byPlatform = { web, ios, android }

  if (staleIds.length > 0) {
    await PushSubscription.deleteMany({ _id: { $in: staleIds } })
  }
  return result
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  await Promise.allSettled(userIds.map((id) => sendPushToUser(id, payload)))
}
