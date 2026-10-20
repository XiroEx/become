// NP-205: which OS family a web push subscription almost certainly belongs
// to, classified from the subscribing browser's User-Agent at subscribe time
// (app/api/notifications/subscribe/route.ts). This is what lets a native
// token registering later (app/api/notifications/subscribe/route.ts again,
// the `platform === 'ios' | 'android'` branch) find the web subscriptions it
// is retiring, without touching a desktop browser's — "the web keeps working
// for members who do not install the app" only holds if 'other' (desktop,
// and any device this cannot confidently place, iPad included) is never
// auto-muted.
//
// The classifier itself lives in ../deviceOS.ts because the same algorithm
// runs again client-side (components/GetAppBanner.tsx, off
// navigator.userAgent) to decide whether to show the Android install prompt.

import { classifyUserAgent, type DeviceOS } from '../deviceOS'

export type WebDeviceOS = DeviceOS

export function classifyWebUserAgent(userAgent: string | null | undefined): WebDeviceOS {
  return classifyUserAgent(userAgent)
}
