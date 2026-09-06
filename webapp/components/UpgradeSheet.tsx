'use client'

// The ONE upsell surface. Every gate in the app — server 403 or client teaser —
// opens this sheet and nothing else.
//
// Everything it says comes from the gate payload it is handed: the server owns
// the refusal wording (`gate.error`) and the tier being asked for
// (`gate.requiresTier`), so a member can never be shown a number or a plan name
// that disagrees with the rule that actually refused them. No amount, discount,
// trial length or date is ever written here.
//
// Billing may not be configured at all — that is the state Become ships in.
// The CTA is therefore rendered ONLY once checkout is known to be live: the
// snapshot's `checkoutAvailable` answers it for free, and only an unknown
// answer costs a probe of GET /api/billing/status. Anything else (a 404, a
// 503, `configured: false`, a malformed body) is a coming-soon note in the
// CTA's place. It never renders a button that cannot work, and it never
// assumes a route exists.
//
// A REFUSED checkout is a different thing from an ABSENT one, and this sheet
// used to treat them as the same: every non-2xx from POST /api/billing/checkout
// collapsed into "Upgrades aren't open yet." That route answers with six
// distinct refusals and only two of them mean there is nothing to buy. The
// member whose card just failed was told the product was not for sale; so was
// the member who hit a one-second Stripe blip. Both readings are sticky for the
// life of the sheet — nothing re-probes after a refusal — so there is no second
// impression to correct them. checkoutRefusalState() below is that mapping, and
// it is the whole fix.

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, CreditCard, Loader2, Lock, RefreshCw, X } from 'lucide-react'
import { useEntitlements } from '@/hooks/useEntitlements'
import {
  allowanceLine,
  featureHeadline,
  PLUS_BENEFITS,
  tierLabel,
  type SheetGate,
} from '@/lib/entitlementsClient'
// Type-only, so nothing from the billing layer reaches the client bundle. It
// buys the one thing that matters: if the plan union ever changes, the literal
// posted below stops compiling instead of silently 400ing.
import type { BillingPlan } from '@/lib/billing/mode'

export interface UpgradeSheetProps {
  open: boolean
  onClose: () => void
  /** The verbatim 403 body, a syntheticGate for a teaser, or a planGate. */
  gate: SheetGate | null
}

/**
 * What the sheet knows about checkout right now.
 *
 * The first four are the availability probe's answers. The last three are
 * refusals of a checkout that was actually ATTEMPTED, and they are separate
 * states because they need separate exits: a card to fix, a purchase that would
 * be a second one, and a failure worth retrying. Only 'unavailable' means "not
 * for sale yet".
 */
type CheckoutState =
  | 'checking'
  | 'ready'
  | 'starting'
  | 'unavailable'
  | 'fix-payment'
  | 'already-plus'
  | 'error'

/** Where the "update your card" button is while the portal call is in flight. */
type PortalState = 'idle' | 'opening' | 'failed'

/**
 * The plan being bought.
 *
 * Spelled out rather than omitted. The route treats a missing `plan` as monthly,
 * so the two are equivalent on the wire — but this sheet was posting
 * `{ feature, tier }`, a body the route reads NOTHING from, and an implicit
 * default is exactly what made that invisible.
 *
 * TODO(plan-selector): monthly is the only plan reachable from the app. The
 * route accepts 'annual' and priceIdForPlan() will resolve
 * `billing.stripePricePlusAnnual`, so the annual price can be fully configured
 * and still never be bought. The missing piece is a plan selector in this sheet,
 * and it cannot be built yet: no prices exist (both `stripePricePlus*` values
 * are unset today) and every amount a selector would show has to come from the
 * server — this file must never name one. Wire the selector when the prices are
 * live, and pass its choice here.
 */
const CHECKOUT_PLAN: BillingPlan = 'monthly'

/**
 * Fallback only. The 409 that raises 'fix-payment' carries the portal path in
 * its body and THAT is what gets followed; this is what we use if a future
 * response stops sending it, so the button still goes somewhere real.
 */
const PORTAL_PATH = '/api/billing/portal'

function authHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

/** A non-empty string field off an unknown JSON body, or undefined. */
function readString(body: unknown, key: string): string | undefined {
  if (body === null || typeof body !== 'object') return undefined
  const value = (body as Record<string, unknown>)[key]
  return typeof value === 'string' && value ? value : undefined
}

/**
 * Map a refused POST /api/billing/checkout onto the state the sheet shows.
 *
 * The codes are the route's own, not a guess: 400 `invalid_plan`,
 * 503 `billing_not_configured`, 409 `already_subscribed` / `fix_payment_method`
 * / `already_plus`, 502 `checkout_failed`.
 *
 *  • 404 and 503 are the only "there is nothing to buy" answers — a route that
 *    does not exist yet, and a Stripe that is not configured. The STATUS is
 *    checked before the code so a 503 with no body still reads correctly.
 *  • Everything unrecognised — a 401 on an expired token, a 400 from a plan
 *    this build sent wrong, a 502, a 500 from a proxy, a body that is not JSON
 *    — is 'error': transient, retryable, and explicitly NOT "not for sale".
 */
export function checkoutRefusalState(status: number, body: unknown): CheckoutState {
  const code = readString(body, 'error')
  if (status === 404 || status === 503 || code === 'billing_not_configured') return 'unavailable'
  if (code === 'fix_payment_method') return 'fix-payment'
  if (code === 'already_plus' || code === 'already_subscribed') return 'already-plus'
  return 'error'
}

/**
 * The dismiss button's label. "Not now" implies there is something to come back
 * for; in every state where there is not — or where the member already has what
 * this sheet is selling — it is just Close.
 */
export function dismissLabel(state: CheckoutState): string {
  return state === 'ready' || state === 'starting' || state === 'checking' ? 'Not now' : 'Close'
}

export interface CheckoutActionProps {
  state: CheckoutState
  /** The tier as a member reads it, from the gate. Never a literal "Plus". */
  tierName: string
  portalState: PortalState
  onStart: () => void
  onOpenPortal: () => void
}

/**
 * The one slot under the benefit rows: a live CTA, a note, or nothing to press.
 *
 * Exported so each branch can be rendered on its own. The repo has no DOM test
 * environment, so a state that is only reachable through an effect and a fetch
 * is otherwise unreachable from a test — which is how the collapse this fixes
 * shipped in the first place.
 */
export function CheckoutAction({
  state,
  tierName,
  portalState,
  onStart,
  onOpenPortal,
}: CheckoutActionProps) {
  // The purchase CTA exists ONLY when checkout is known to work. A gradient
  // "Upgrade to Plus" that answers 503 is worse than no button at all, and it
  // is what a member saw in every state until the tap that swapped it.
  if (state === 'ready' || state === 'starting') {
    return (
      <button
        type="button"
        onClick={onStart}
        disabled={state === 'starting'}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-3.5 text-sm font-semibold text-white transition-all hover:from-purple-700 hover:to-indigo-700 disabled:opacity-60"
      >
        {state === 'starting' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Lock className="h-4 w-4" />
        )}
        Upgrade to {tierName}
      </button>
    )
  }

  if (state === 'checking') {
    return (
      <div
        aria-live="polite"
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 px-6 py-3.5 text-sm font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking availability&hellip;
      </div>
    )
  }

  // A subscription already exists on this account and could not be charged.
  // Selling a second one is exactly what the route refused: both would bill, and
  // when dunning finally gives up on the first, its terminal event downgrades a
  // member the second one is still charging. The way out is a working card.
  if (state === 'fix-payment') {
    return (
      <div className="mt-5" aria-live="polite">
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
          <p className="font-semibold">Your payment method needs updating.</p>
          <p className="mt-1">
            There&apos;s already a subscription on this account that couldn&apos;t be charged.
            Update the card in billing rather than starting a second one.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenPortal}
          disabled={portalState === 'opening'}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-6 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 dark:bg-white dark:text-zinc-900"
        >
          {portalState === 'opening' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CreditCard className="h-4 w-4" />
          )}
          Update payment method
        </button>
        {portalState === 'failed' && (
          <p className="mt-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Billing didn&apos;t open just now. Try that again in a moment.
          </p>
        )}
      </div>
    )
  }

  // Nothing to sell. `already_subscribed` (paying already), `already_plus`
  // (grandfathered, or an admin) — either way the account HAS what this sheet
  // is selling, and the only honest thing to offer is the way out of it.
  if (state === 'already-plus') {
    return (
      <div
        aria-live="polite"
        className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-3 text-sm text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
      >
        <Check className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          You already have {tierName} on this account — there&apos;s nothing to buy here. If
          something still looks locked, close this and reopen the app.
        </p>
      </div>
    )
  }

  // Something broke on the way to Stripe. This is the branch that must never
  // read as "not for sale": a member who taps once during a blip would carry
  // that impression away, because nothing in this sheet re-probes afterwards.
  if (state === 'error') {
    return (
      <div className="mt-5" aria-live="polite">
        <div className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Checkout didn&apos;t start. That one is on us, and nothing was charged.</p>
        </div>
        <button
          type="button"
          onClick={onStart}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-3.5 text-sm font-semibold text-white transition-all hover:from-purple-700 hover:to-indigo-700"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
      </div>
    )
  }

  // 'unavailable'. No email is captured anywhere, so nothing here may promise
  // one. What IS true is the part a capped member is worried about: their work
  // is not going anywhere.
  return (
    <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
      Upgrades aren&apos;t open yet. Everything you&apos;ve made stays yours.
    </div>
  )
}

export default function UpgradeSheet({ open, onClose, gate }: UpgradeSheetProps) {
  const { data } = useEntitlements()
  const [checkout, setCheckout] = useState<CheckoutState>('checking')
  const [portalState, setPortalState] = useState<PortalState>('idle')
  const [portalPath, setPortalPath] = useState<string>(PORTAL_PATH)

  // Probe billing only while the sheet is actually open — a closed sheet must
  // not cost a request, and the answer can change between openings. The probe
  // IS an external-system read, so its answer cannot be derived during render.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return
    let cancelled = false
    // A failed portal attempt belongs to the opening that produced it.
    setPortalState('idle')

    if (data?.checkoutAvailable === true) {
      setCheckout('ready')
      return
    }
    // The snapshot already said no. Probing would only confirm it, and every
    // millisecond of `checking` in between is a millisecond in which the sheet
    // could show something it will have to take away.
    if (data?.checkoutAvailable === false) {
      setCheckout('unavailable')
      return
    }
    setCheckout('checking')
    ;(async () => {
      try {
        const res = await fetch('/api/billing/status', { headers: authHeaders() })
        if (cancelled) return
        if (!res.ok) {
          // 404 (route not built yet) / 503 (not configured) / anything else.
          setCheckout('unavailable')
          return
        }
        const body: unknown = await res.json().catch(() => null)
        const configured =
          body !== null &&
          typeof body === 'object' &&
          (body as { configured?: unknown }).configured === true
        setCheckout(configured ? 'ready' : 'unavailable')
      } catch {
        if (!cancelled) setCheckout('unavailable')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, data?.checkoutAvailable])
  /* eslint-enable react-hooks/set-state-in-effect */

  const startCheckout = useCallback(async () => {
    if (!gate) return
    // Belt and braces: the CTA is not rendered outside 'ready', so this is only
    // reachable by a race with the probe — or by the retry in the 'error'
    // branch, which is the same attempt a second time.
    if (checkout !== 'ready' && checkout !== 'error') return
    setCheckout('starting')
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: authHeaders(),
        // `plan` is the ONLY field the route reads off this body. It used to be
        // sent `{ feature, tier }` — ignored in full, and the reason the annual
        // price is unreachable from the app. See CHECKOUT_PLAN.
        body: JSON.stringify({ plan: CHECKOUT_PLAN }),
      })
      const body: unknown = await res.json().catch(() => null)
      if (res.ok) {
        const url = readString(body, 'url')
        if (url) {
          window.location.assign(url)
          return
        }
        // 2xx with nowhere to go. Billing is live and something is wrong with
        // this one response, which is a retry, not a closed shop.
        setCheckout('error')
        return
      }
      const next = checkoutRefusalState(res.status, body)
      // The route hands back the path to send them to; follow it rather than
      // assuming one.
      if (next === 'fix-payment') setPortalPath(readString(body, 'portal') ?? PORTAL_PATH)
      setCheckout(next)
    } catch {
      // The request never landed. A dropped connection must never be reported
      // as "upgrades aren't open yet": that answer is sticky for the life of the
      // sheet, and this one is over in a second.
      setCheckout('error')
    }
  }, [gate, checkout])

  const openPortal = useCallback(async () => {
    setPortalState('opening')
    try {
      const res = await fetch(portalPath, { method: 'POST', headers: authHeaders() })
      const body: unknown = res.ok ? await res.json().catch(() => null) : null
      const url = readString(body, 'url')
      if (url) {
        window.location.assign(url)
        return
      }
      // 503 (no portal configuration saved in the Stripe dashboard), 409 (no
      // customer in this mode), 502 — none of them are anything a member can
      // act on beyond trying again.
      setPortalState('failed')
    } catch {
      setPortalState('failed')
    }
  }, [portalPath])

  // Nothing to say without a gate, and nothing to say at all while the
  // kill-switch is off — that is the launch-day zero-change contract. A null
  // snapshot is NOT treated as unenforced: a real 403 got us here.
  if (!gate) return null
  if (data && data.enforced === false) return null

  const line = allowanceLine(gate)
  const tierName = tierLabel(gate.requiresTier)

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="upgrade-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm"
          />

          <motion.div
            key="upgrade-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Upgrade"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="fixed inset-x-0 bottom-0 z-[201] max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white dark:bg-zinc-900"
          >
            <div className="sticky top-0 z-10 bg-white pt-2 dark:bg-zinc-900">
              <div className="mx-auto h-1.5 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-600/10 text-purple-600 dark:text-purple-400">
                    <Lock className="h-4 w-4" />
                  </span>
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{tierName}</h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
              <h3 className="text-xl font-extrabold text-zinc-900 dark:text-white">
                {featureHeadline(gate.feature, gate.requiresTier)}
              </h3>
              {/* The server's own words, verbatim. */}
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{gate.error}</p>
              {line && (
                <p className="mt-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">{line}</p>
              )}

              <div className="mt-5 grid gap-2">
                {PLUS_BENEFITS.map((benefit) => (
                  <div
                    key={benefit}
                    className="flex items-start gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{benefit}</p>
                  </div>
                ))}
              </div>

              <CheckoutAction
                state={checkout}
                tierName={tierName}
                portalState={portalState}
                onStart={startCheckout}
                onOpenPortal={openPortal}
              />

              <button
                type="button"
                onClick={onClose}
                className="mt-3 w-full rounded-2xl px-4 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                {dismissLabel(checkout)}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
