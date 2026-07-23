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

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  await ensureVapid()
  await dbConnect()

  const subs = await PushSubscription.find({ userId }).lean()
  if (subs.length === 0) return

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
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
            data,
          )
        } catch (err: unknown) {
          // 410 Gone = subscription expired; clean it up
          if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode: number }).statusCode === 410) {
            staleIds.push(String(sub._id))
          }
        }
      }
      // ios/android branch: add expo-server-sdk here when native app ships
    })
  )

  if (staleIds.length > 0) {
    await PushSubscription.deleteMany({ _id: { $in: staleIds } })
  }
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  await Promise.allSettled(userIds.map((id) => sendPushToUser(id, payload)))
}
