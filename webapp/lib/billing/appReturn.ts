/**
 * The way OFF a public billing return page: back into the app, or on the web for
 * a member who has not got the app.
 *
 * Why a custom scheme and not a link to ourselves: iOS keeps a tap on a
 * SAME-DOMAIN link inside Safari. The buyer is standing in Safari on
 * `become.redbtn.io` after Stripe redirected them there, so a link to any path
 * on that host — universal link or not — just loads another page in Safari.
 * `become://` is a different scheme, which iOS hands to the app (Safari asks
 * once, and remembers the answer).
 *
 * The link goes to the app's ROOT with the outcome as query params, not to a
 * `become://billing/...` path, because expo-router has no billing route today
 * (`expo/app/` is index, login, onboarding, verify, account/restore) and an
 * unmatched deep link opens the app on a not-found screen — worse than no link
 * at all for somebody who has just paid. The root always resolves, and the
 * params are there for the app's own status read (NP-054: the app calls
 * `GET /api/billing/status?session_id=` signed in). Nothing on this page
 * activates anything.
 */

import { APP_BILLING_RETURN_PATHS, BILLING_RETURN_PATH } from './urls'

/** The scheme declared by `expo/app.json` (`"scheme": "become"`). */
export const BECOME_APP_SCHEME = 'become://'

/** What happened, in the app's vocabulary as well as the URL's. */
export type AppReturnKind = 'success' | 'cancelled' | 'portal-return'

/**
 * A Stripe Checkout Session id and nothing else.
 *
 * The value arrives on a query string a member (or anybody who can send them a
 * link) can edit, and it is about to be written into an href. Dropping anything
 * that is not shaped like `cs_…` is what stops arbitrary text being reflected
 * into the page. Not a security boundary on its own — the status route still
 * checks the session's `client_reference_id` against the caller — just the one
 * place this page decides whether it has something worth passing on.
 */
export function safeSessionId(value: string | string[] | null | undefined): string | undefined {
  const first = (Array.isArray(value) ? value[0] : value)?.trim()
  if (!first) return undefined
  return /^cs_[A-Za-z0-9_]{4,200}$/.test(first) ? first : undefined
}

/**
 * `become://?billing=…[&session_id=…]`.
 *
 * URLSearchParams is correct HERE, unlike in `urls.ts`: these are real values,
 * not Stripe's `{CHECKOUT_SESSION_ID}` template, so encoding them is the point.
 */
export function becomeAppLink(
  kind: AppReturnKind,
  sessionId?: string | string[] | null,
): string {
  const params = new URLSearchParams({ billing: kind })
  const id = safeSessionId(sessionId)
  if (id) params.set('session_id', id)
  return `${BECOME_APP_SCHEME}?${params.toString()}`
}

/**
 * The fallback for a member without the app: the plan page, reached exactly as
 * a web buyer reaches it. It is behind `middleware.ts`, so signed out it lands
 * on `/login` first — which is the honest outcome on a browser that holds no
 * session, and why it is offered as the second choice rather than the first.
 */
export function webFallbackHref(
  kind: AppReturnKind,
  sessionId?: string | string[] | null,
): string {
  if (kind === 'portal-return') return `${BILLING_RETURN_PATH}?portal=return`
  if (kind === 'cancelled') return `${BILLING_RETURN_PATH}?checkout=cancelled`
  const id = safeSessionId(sessionId)
  return id
    ? `${BILLING_RETURN_PATH}?checkout=success&session_id=${encodeURIComponent(id)}`
    : `${BILLING_RETURN_PATH}?checkout=success`
}

/** The public path each outcome is served on, for the pages' own cross-links. */
export function publicReturnPath(kind: AppReturnKind): string {
  if (kind === 'cancelled') return APP_BILLING_RETURN_PATHS.cancelled
  if (kind === 'portal-return') return APP_BILLING_RETURN_PATHS.portalReturn
  return APP_BILLING_RETURN_PATHS.success
}

/** The label every one of the three pages uses. One string, one meaning. */
export const RETURN_TO_APP_LABEL = 'Return to Become'
