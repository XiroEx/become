/**
 * Keep this device's push subscription registered with the server.
 *
 * The bug this exists to fix: both places that could create a subscription —
 * the opt-in card and the Settings "Enable" button — are gated on
 * `Notification.permission === 'default'`. Once a user granted permission, the
 * app could NEVER create a subscription again. So the moment the existing one
 * stopped working, that user went silent forever:
 *
 *   · push services expire and rotate subscriptions on their own schedule
 *   · reinstalling the PWA (or iOS re-registering the service worker) mints a
 *     new subscription and abandons the old one
 *   · sendPushToUser prunes on 404/410, which DELETES the row — and with
 *     permission already 'granted', nothing would ever write another
 *
 * Settings meanwhile reported "Active", because it was reading the browser's
 * permission flag rather than whether we hold a usable subscription. Permission
 * granted and reachable are different facts.
 *
 * So this runs on load for signed-in users and reconciles the two: whatever the
 * browser currently holds becomes what the server has. With permission already
 * granted, `subscribe()` shows no UI, so this is silent.
 */

export type EnsureOutcome =
  /** No service worker / PushManager / VAPID key — nothing to do. */
  | 'unsupported'
  /** Permission is 'default' or 'denied'; the opt-in flow owns those. */
  | 'no-permission'
  /** Signed out — a subscription with no user to attach it to is useless. */
  | 'no-token'
  /** The browser had none and we made one. */
  | 'created'
  /** The browser's subscription was signed with a different VAPID key. */
  | 'refreshed'
  /** Already registered and re-confirmed with the server. */
  | 'synced'
  /** Already registered, confirmed recently — skipped the network call. */
  | 'fresh'
  | 'failed'

const SYNCED_AT_KEY = 'push_subscription_synced_at'

/** How often to re-confirm a subscription that already looks correct. */
export const RESYNC_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * Whether a subscription that already exists and matches our key still needs
 * pushing to the server. Pure so the throttle is testable without a browser.
 *
 * An unparseable / absent timestamp means "never synced", which must sync —
 * treating it as recent is how a device stays invisible to the server.
 */
export function shouldResync(lastSyncedAt: string | null, now: number): boolean {
  if (!lastSyncedAt) return true
  const then = Number(lastSyncedAt)
  if (!Number.isFinite(then) || then <= 0) return true
  // A clock that jumped backwards shouldn't wedge the sync off forever.
  if (then > now) return true
  return now - then >= RESYNC_INTERVAL_MS
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

/**
 * Does an existing subscription belong to the VAPID key we now sign with?
 *
 * A mismatch means every send to it fails with 403 — invisible to the user and
 * indistinguishable from "no notifications" — so it has to be replaced rather
 * than trusted. Comparing raw bytes because the stored value is an ArrayBuffer.
 */
export function keysMatch(
  subscriptionKey: ArrayBuffer | null | undefined,
  vapidPublicKey: Uint8Array,
): boolean {
  if (!subscriptionKey) return false
  const a = new Uint8Array(subscriptionKey)
  if (a.length !== vapidPublicKey.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== vapidPublicKey[i]) return false
  return true
}

function encodeKey(sub: PushSubscription, name: 'p256dh' | 'auth'): string | null {
  const raw = sub.getKey(name)
  if (!raw) return null
  return btoa(String.fromCharCode(...new Uint8Array(raw)))
}

async function postSubscription(sub: PushSubscription, token: string): Promise<boolean> {
  const p256dh = encodeKey(sub, 'p256dh')
  const auth = encodeKey(sub, 'auth')
  // The server rejects a web subscription without both keys, and a row without
  // them can never be sent to — better to fail loudly here than store a dud.
  if (!p256dh || !auth) return false

  const res = await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ platform: 'web', endpoint: sub.endpoint, keys: { p256dh, auth } }),
  })
  return res.ok
}

/**
 * In-flight call, shared by concurrent callers.
 *
 * Two callers racing (the dashboard's reconciler and the Settings page, or
 * React re-mounting the effect) both saw `getSubscription() === null` and both
 * called `subscribe()` — and Chrome minted a DIFFERENT subscription for each,
 * leaving the user with duplicate rows and every notification sent twice.
 * Serialising the whole routine is what actually prevents that; deduping only
 * the network call would not.
 */
let inFlight: Promise<EnsureOutcome> | null = null

export async function ensurePushSubscription(opts: { force?: boolean } = {}): Promise<EnsureOutcome> {
  if (inFlight) return inFlight
  inFlight = ensurePushSubscriptionUncoordinated(opts).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function ensurePushSubscriptionUncoordinated(
  opts: { force?: boolean } = {},
): Promise<EnsureOutcome> {
  if (typeof window === 'undefined') return 'unsupported'

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window) ||
    !vapidPublicKey
  ) {
    return 'unsupported'
  }

  if (Notification.permission !== 'granted') return 'no-permission'

  const token = localStorage.getItem('token')
  if (!token) return 'no-token'

  try {
    const reg = await navigator.serviceWorker.ready
    const keyBytes = urlBase64ToUint8Array(vapidPublicKey)

    let sub = await reg.pushManager.getSubscription()
    let outcome: EnsureOutcome = 'synced'

    if (sub && !keysMatch(sub.options?.applicationServerKey, keyBytes)) {
      // Signed with a key we no longer hold — every send would 403.
      await sub.unsubscribe().catch(() => {})
      sub = null
      outcome = 'refreshed'
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes as unknown as ArrayBuffer,
      })
      if (outcome !== 'refreshed') outcome = 'created'
    } else if (!opts.force && !shouldResync(localStorage.getItem(SYNCED_AT_KEY), Date.now())) {
      return 'fresh'
    }

    const ok = await postSubscription(sub, token)
    if (!ok) return 'failed'

    localStorage.setItem(SYNCED_AT_KEY, String(Date.now()))
    return outcome
  } catch (err) {
    console.warn('[push] subscription sync failed:', err)
    return 'failed'
  }
}
