// Classifies a User-Agent string into the OS family it almost certainly runs
// on. Used on both sides of NP-205 (native parity — one sign-in, each reminder
// once, a store banner):
//
//   · server-side, reading the request header, in lib/push/webDeviceOS.ts —
//     decides which of a member's existing web push subscriptions a freshly
//     registered native token retires;
//   · client-side, reading navigator.userAgent, in components/GetAppBanner.tsx
//     — decides whether to show the Android "Get the app" prompt (iOS gets
//     Safari's own smart banner instead, driven by app/layout.tsx).
//
// Deliberately approximate, and documented rather than hidden: iPadOS 13+
// Safari sends a desktop ("Macintosh") User-Agent indistinguishable from a
// real Mac, so an iPad always classifies as 'other'. That is the intended
// trade-off, not a bug — see webDeviceOS.ts for why muting is scoped this way.

export type DeviceOS = 'ios' | 'android' | 'other'

export function classifyUserAgent(userAgent: string | null | undefined): DeviceOS {
  const ua = (userAgent ?? '').toLowerCase()
  if (!ua) return 'other'
  if (/iphone|ipod/.test(ua)) return 'ios'
  if (/android/.test(ua)) return 'android'
  return 'other'
}
