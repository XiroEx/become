/**
 * "Get the app" mobile-web prompt (NP-205): pure decision, no DOM.
 *
 * iOS gets Safari's OWN smart banner (the `apple-itunes-app` meta tag, see
 * lib/appleAppId.ts and app/layout.tsx) — this module's `show` only ever
 * answers for Android, the platform with no browser-native equivalent, which
 * is why GetAppBanner.tsx is the thing that actually renders.
 *
 * Three ways this says "don't show it", and none of them is a guess:
 *  - inside the native app's in-app browser (lib/nativeBrowserMarker.ts) —
 *    a member who already has the app must never be told to get it;
 *  - dismissed (member said no, remembered client-side);
 *  - no store URL configured for Android yet — a banner with nowhere to
 *    send a tap is worse than none.
 */

import { classifyDeviceOS } from './deviceOS'

export interface AppBannerDecision {
  show: boolean
  platform: 'android' | null
  storeUrl: string | null
}

export interface AppBannerInput {
  userAgent: string | null | undefined
  isNativeAppBrowser: boolean
  dismissed: boolean
  androidStoreUrl: string | null | undefined
}

const REFUSED: AppBannerDecision = { show: false, platform: null, storeUrl: null }

export function decideAppBanner(input: AppBannerInput): AppBannerDecision {
  if (input.isNativeAppBrowser) return REFUSED
  if (input.dismissed) return REFUSED
  if (classifyDeviceOS(input.userAgent) !== 'android') return REFUSED
  if (!input.androidStoreUrl) return REFUSED
  return { show: true, platform: 'android', storeUrl: input.androidStoreUrl }
}
