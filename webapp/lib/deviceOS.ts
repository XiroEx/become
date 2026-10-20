/**
 * Classify a browser's OS family from its User-Agent string.
 *
 * Shared by two callers that both need the same three-way answer and must
 * never disagree: the "Get the app" store prompt (lib/getAppBanner.ts) picks
 * which store to link to, and the push subscribe route
 * (lib/push/webDeviceOS.ts) stamps PushSubscription.webOS so a native token
 * registering on the same OS can mute the matching web subscription (NP-205).
 *
 * 'other' is a deliberate third answer, not a fallback bug: iPadOS 13+'s
 * Safari sends a desktop-Mac User-Agent by default (no "iPad", no "Mobile"),
 * indistinguishable from an actual Mac here. Guessing "ios" for it would risk
 * auto-muting a browser on a device no phone can replace — see
 * lib/push/webDeviceOS.ts for where that trade-off is applied.
 */

export type DeviceOS = 'ios' | 'android' | 'other'

export function classifyDeviceOS(userAgent: string | null | undefined): DeviceOS {
  const ua = (userAgent || '').toLowerCase()
  if (!ua) return 'other'
  if (/iphone|ipod/.test(ua)) return 'ios'
  if (/android/.test(ua)) return 'android'
  // Explicitly excludes iPad: see the module doc comment above.
  return 'other'
}
