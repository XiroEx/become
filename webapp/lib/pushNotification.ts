import webpush from 'web-push'
import dbConnect from './mongodb'
import PushSubscription from '@/models/PushSubscription'

let vapidConfigured = false

function ensureVapid() {
  if (vapidConfigured) return
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const email = process.env.VAPID_EMAIL || 'mailto:admin@become.redbtn.io'
  if (!publicKey || !privateKey) {
    throw new Error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars required')
  }
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
  ensureVapid()
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
