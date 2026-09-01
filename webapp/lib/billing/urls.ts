/**
 * Where Stripe sends a member back to. Pure string building, and that is the
 * point.
 *
 * `{CHECKOUT_SESSION_ID}` is a Stripe TEMPLATE token, not a value. Building
 * these with URLSearchParams or encodeURIComponent percent-encodes the braces
 * to %7B...%7D, Stripe then finds nothing to substitute, and the success page
 * receives the literal placeholder text as its session id — a bug that only
 * shows up after a real payment. billingUrls.test.ts pins the literal braces.
 */

export const BILLING_RETURN_PATH = '/dashboard/settings'

/** No trailing slash, ever — the caller always concatenates a rooted path. */
export function appBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || '').trim()
  const base = raw || 'https://become.redbtn.io'
  return base.replace(/\/+$/, '')
}

export function checkoutSuccessUrl(): string {
  return `${appBaseUrl()}${BILLING_RETURN_PATH}?checkout=success&session_id={CHECKOUT_SESSION_ID}`
}

export function checkoutCancelUrl(): string {
  return `${appBaseUrl()}${BILLING_RETURN_PATH}?checkout=cancelled`
}

export function portalReturnUrl(): string {
  return `${appBaseUrl()}${BILLING_RETURN_PATH}?portal=return`
}
