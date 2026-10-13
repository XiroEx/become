// Opening the Stripe billing portal, from the browser, in one place.
//
// `POST /api/billing/portal` mints a one-time link and answers `{ url }`. Every
// surface that offers a way into billing — the plan page, Settings, and the
// upgrade sheet's fix-your-card exit — does the same three things with it:
// post, follow the url, and say so if it did not open. Written out per surface
// that is three chances to forget the Authorization header, and a member who
// taps "Manage billing" and watches nothing happen has no way to tell a missing
// header from a Stripe outage.
//
// Client-only (it navigates), but NOT marked 'use client': it is a plain module
// with no JSX, imported by client components. The window guard is what makes it
// safe to import from a file that also renders on the server.

import { getToken } from '@/lib/clientAuth'

/**
 * Fallback only. A 409 `fix_payment_method` from checkout carries the portal
 * path in its body and THAT is what gets followed; this is what is used when a
 * response does not name one, so the button still goes somewhere real.
 */
export const BILLING_PORTAL_PATH = '/api/billing/portal'

/** Where a "Manage billing" button is while the portal call is in flight. */
export type PortalState = 'idle' | 'opening' | 'failed'

/** A non-empty string field off an unknown JSON body, or undefined. */
function readString(body: unknown, key: string): string | undefined {
  if (body === null || typeof body !== 'object') return undefined
  const value = (body as Record<string, unknown>)[key]
  return typeof value === 'string' && value ? value : undefined
}

/**
 * Ask for a portal session and navigate to it.
 *
 * Returns FALSE when the member is still here — i.e. when the caller has to
 * show the "didn't open" note. Every failure mode collapses to that on purpose:
 * 503 (no portal configuration saved in the Stripe dashboard), 409 (no customer
 * in this mode), 502, an expired token, a dropped connection. None of them is
 * anything a member can act on beyond trying again, and none of them may be
 * reported as "you have no subscription".
 */
export async function openBillingPortal(path: string = BILLING_PORTAL_PATH): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const token = getToken()
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    const body: unknown = res.ok ? await res.json().catch(() => null) : null
    const url = readString(body, 'url')
    if (!url) return false
    window.location.assign(url)
    return true
  } catch {
    return false
  }
}
