/**
 * The OS family a WEB push subscription's browser runs on, classified from
 * the subscribe request's User-Agent (NP-205).
 *
 * Stored as PushSubscription.webOS at subscribe time so POST
 * /api/notifications/subscribe can later mute a web row when a native token
 * registers for the SAME os — without re-parsing a User-Agent that may no
 * longer be the one the row actually holds (a browser can change UA on a
 * resync; the muting decision is made once, at native-registration time,
 * against whatever this field held then).
 */

import { classifyDeviceOS, type DeviceOS } from '@/lib/deviceOS'

export function webDeviceOSFromUserAgent(userAgent: string | null | undefined): DeviceOS {
  return classifyDeviceOS(userAgent)
}
