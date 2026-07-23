import webpush from 'web-push'
import dbConnect from './mongodb'
import PushSubscription from '@/models/PushSubscription'
import { getRuntimeConfig, requireRuntimeSecret } from './runtimeConfig'

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
  badge?: string
  url?: string            // notificationclick navigates here
  tag?: string            // replaces existing notification with same tag
}

export interface PushSendResult {
  attempted: number
  delivered: number
  pruned: number
  failed: number
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<PushSendResult> {
  const result: PushSendResult = { attempted: 0, delivered: 0, pruned: 0, failed: 0 }
  await ensureVapid()
  await dbConnect()

  const subs = await PushSubscription.find({ userId }).lean()
  if (subs.length === 0) return result

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? '/icons/icon-192x192.png',
    badge: payload.badge ?? '/icons/icon-96x96.png',
    url: payload.url ?? '/dashboard',
    tag: payload.tag,
  })

  const staleIds: string[] = []

  await Promise.allSettled(
    subs.map(async (sub) => {
      if (sub.platform === 'web' && sub.keys) {
        result.attempted++
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
            data,
          )
          result.delivered++
        } catch (err: unknown) {
          const status = err && typeof err === 'object' && 'statusCode' in err
            ? (err as { statusCode: number }).statusCode
            : null
          // 404/410 = subscription dead/expired; prune it so it stops rotting.
          if (status === 404 || status === 410) {
            staleIds.push(String(sub._id))
            result.pruned++
          } else {
            // Anything else (403 VAPID mismatch, 401, network) must be VISIBLE —
            // silent swallowing is how notifications die quietly for weeks.
            result.failed++
            console.error(`[push] send failed user=${userId} status=${status ?? 'n/a'} endpoint=${(() => { try { return new URL(sub.endpoint).host } catch { return 'bad-endpoint' } })()}`)
          }
        }
      }
      // ios/android branch: add expo-server-sdk here when native app ships
    })
  )

  if (staleIds.length > 0) {
    await PushSubscription.deleteMany({ _id: { $in: staleIds } })
  }
  return result
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  await Promise.allSettled(userIds.map((id) => sendPushToUser(id, payload)))
}
