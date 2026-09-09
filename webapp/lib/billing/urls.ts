/**
 * Where Stripe sends a member back to. Pure string building, and that is the
 * point.
 *
 * `{CHECKOUT_SESSION_ID}` is a Stripe TEMPLATE token, not a value. Building
 * these with URLSearchParams or encodeURIComponent percent-encodes the braces
 * to %7B...%7D, Stripe then finds nothing to substitute, and the success page
 * receives the literal placeholder text as its session id — a bug that only
 * shows up after a real payment. billingUrls.test.ts pins the literal braces.
 *
 * The return path is the PLAN page, not settings. It is the only screen in the
 * app that shows a member which plan they are on, so it is the only honest
 * place to land somebody who has just bought one — `/dashboard/settings` has no
 * billing UI at all, and returning a buyer there showed them nothing about the
 * thing they had just paid for.
 */

export const BILLING_RETURN_PATH = '/dashboard/plan'

/**
 * The origins a member may be RETURNED to after Stripe.
 *
 * The app is served on more than one host. `become.redbtn.io` and
 * `becomeurbest.com` are the SAME deployment behind RedRun `customDomains`, and
 * becomeurbest.com is the public launch domain — but a session does not cross
 * between them, because localStorage and the `auth_token` cookie are both
 * per-host. `NEXT_PUBLIC_APP_URL` names only one of them, so a member who
 * signed up on becomeurbest.com paid, was returned to become.redbtn.io, had no
 * session there, and `middleware.ts` bounced them to /login seconds after their
 * card was charged.
 *
 * It is an ALLOW-LIST, and never "whatever the request said", because these
 * strings are redirect targets. `Origin`, `Referer`, `Host` and
 * `X-Forwarded-Host` are all attacker-supplied; reflecting one unvalidated
 * turns our own checkout into an open redirect performed BY STRIPE, from a page
 * the member has every reason to trust. An origin that is not on this list is
 * not an error — it just falls back to `NEXT_PUBLIC_APP_URL`, which is the
 * behaviour every caller had before.
 *
 * Listing a host that is not currently served costs nothing: an origin is only
 * ever selected when the request genuinely came FROM it.
 */
export const KNOWN_RETURN_ORIGINS: readonly string[] = [
  'https://become.redbtn.io',
  'https://becomeurbest.com',
  'https://www.becomeurbest.com',
  'https://become-beta.redbtn.io',
]

/** The `.get()` surface of a `Headers`. Typed structurally so a test can pass a Map. */
export interface HeaderReader {
  get(name: string): string | null | undefined
}

/** No trailing slash, ever — the caller always concatenates a rooted path. */
export function appBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || '').trim()
  const base = raw || 'https://become.redbtn.io'
  return base.replace(/\/+$/, '')
}

/**
 * Parse to a canonical `scheme://host[:port]`, or undefined.
 *
 * Parsing with `URL` and comparing the resulting `origin` EXACTLY is the whole
 * safety property. String matching would admit `https://become.redbtn.io.evil.com`
 * (a suffix trick) and `https://evil.com\@become.redbtn.io` (WHATWG reads the
 * backslash as a slash, so the host is evil.com and the rest is a path). Both
 * resolve here to an origin that is simply not on the list.
 */
export function normalizeOrigin(value: string | null | undefined): string | undefined {
  if (!value || typeof value !== 'string') return undefined
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return undefined
  }
  // Anything else (javascript:, data:, file:) has no business in a redirect.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
  return url.origin.toLowerCase()
}

/** A comma-joined proxy header carries a chain; only the first hop is ours. */
function firstHop(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const first = value.split(',')[0]?.trim()
  return first || undefined
}

/**
 * Best guess at the host the member is actually looking at.
 *
 * Every source here is attacker-controlled, which is fine — nothing trusts the
 * answer, it is only a CANDIDATE for the allow-list check below. `Origin` is
 * sent by the browser on a same-origin POST, which is what both billing routes
 * are; the forwarded/host headers are the fallback for the edge router.
 */
export function requestOrigin(headers: HeaderReader | null | undefined): string | undefined {
  if (!headers) return undefined

  const origin = normalizeOrigin(headers.get('origin'))
  if (origin) return origin

  const referer = normalizeOrigin(headers.get('referer'))
  if (referer) return referer

  const host = firstHop(headers.get('x-forwarded-host')) ?? firstHop(headers.get('host'))
  if (!host) return undefined
  const proto = firstHop(headers.get('x-forwarded-proto')) ?? 'https'
  return normalizeOrigin(`${proto}://${host}`)
}

/** The allow-list, plus the configured base — which IS the fallback, so it is
 *  trusted by construction and never needs listing per channel. */
function allowedReturnOrigins(): Set<string> {
  const allowed = new Set<string>()
  for (const candidate of KNOWN_RETURN_ORIGINS) {
    const normalized = normalizeOrigin(candidate)
    if (normalized) allowed.add(normalized)
  }
  const base = normalizeOrigin(appBaseUrl())
  if (base) allowed.add(base)
  return allowed
}

/**
 * The origin to send the member back to: theirs if we know it, ours otherwise.
 *
 * Takes the HEADERS rather than an already-extracted origin string on purpose.
 * A caller that could hand in an origin could hand in an unvalidated one, and
 * the validation would then live at every call site instead of here.
 */
export function resolveReturnOrigin(headers?: HeaderReader | null): string {
  const candidate = requestOrigin(headers)
  if (candidate && allowedReturnOrigins().has(candidate)) return candidate
  return appBaseUrl()
}

export function checkoutSuccessUrl(headers?: HeaderReader | null): string {
  return `${resolveReturnOrigin(headers)}${BILLING_RETURN_PATH}?checkout=success&session_id={CHECKOUT_SESSION_ID}`
}

export function checkoutCancelUrl(headers?: HeaderReader | null): string {
  return `${resolveReturnOrigin(headers)}${BILLING_RETURN_PATH}?checkout=cancelled`
}

export function portalReturnUrl(headers?: HeaderReader | null): string {
  return `${resolveReturnOrigin(headers)}${BILLING_RETURN_PATH}?portal=return`
}
