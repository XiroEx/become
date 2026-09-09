'use client'

// The plan comparison page — the one place that explains what Plus IS.
//
// UpgradeSheet is REACTIVE: it appears because something was refused, and it
// answers that one refusal. Until this page there was nowhere in the app that
// said what the plan contains or what it costs, so the only way to learn either
// was to be told no first.
//
// Three rules it inherits, and none of them are negotiable:
//
//  1. LAUNCH-DAY CONTRACT. Nothing tier-shaped renders while
//     ENTITLEMENTS_ENFORCED is off — same `data.enforced === false` bail as
//     PlanCard, PlanRow and TierGate, asserted by
//     tests/unit/entitlements/uiSurfaces.test.tsx.
//  2. NO BUTTON THAT CANNOT WORK. Billing is not configured today: checkout
//     answers 503 and `checkoutAvailable` is false. Until that changes the page
//     shows the SAME coming-soon note the sheet shows — literally the same
//     component — and no purchase button at all.
//  3. NOTHING INVENTED. No trial (none is implemented), no discount, no refund
//     policy, no launch date, no testimonial, no user count. The allowances come
//     from FREE_LIMITS via props; the prices come from PLAN_PRICING; the
//     member's own numbers come from the shared entitlements hook.
//
// The checkout state machine is UpgradeSheet's, imported rather than copied —
// `CheckoutState`, `checkoutRefusalState` and `CheckoutAction` — so there is one
// place in the app where "your card failed" stops meaning "not for sale".

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, Check, Loader2, Sparkles } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import { BackButton } from '@/components/ui/BackButton'
import { Card } from '@/components/ui'
import LegalLinks from '@/components/legal/LegalLinks'
import { useEntitlements } from '@/hooks/useEntitlements'
import { getToken } from '@/lib/clientAuth'
// The automatic-renewal wording is NOT written here. New York GBL 527-a wants
// it in visual proximity to the request for consent, and the request for
// consent is the button below — but it also has to be the same words the Terms
// commit to, so both read one array in lib/legal.
import { renewalLine } from '@/lib/legal'
import {
  CheckoutAction,
  checkoutRefusalState,
  type CheckoutActionProps,
  type CheckoutState,
} from '@/components/UpgradeSheet'
import {
  FEATURE_LABELS,
  tierLabel,
  type EntitlementsSnapshot,
  type FeatureEntitlement,
} from '@/lib/entitlementsClient'
import {
  ANNUAL_SAVING_LINE,
  FREE_FOREVER,
  FREE_FOREVER_NOTE,
  PLAN_PRICING,
  freeCell,
  orderRows,
  plusCell,
  type PlanFeatureRow,
} from '@/lib/planCopy'
// Type-only: the plan union, so a rename in the billing layer breaks the build
// here instead of 400ing at runtime. Nothing from lib/billing reaches the
// bundle.
import type { BillingPlan } from '@/lib/billing/mode'

/** The portal state CheckoutAction expects. Taken from its own props type. */
type PortalState = CheckoutActionProps['portalState']

/** Fallback only — a 409 carries the real path and that is what gets followed. */
const PORTAL_PATH = '/api/billing/portal'

function authHeaders(): HeadersInit {
  const token = getToken()
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

/** Which billing periods actually have a price configured. */
export interface PlanAvailability {
  monthly: boolean
  annual: boolean
}

// ─── Comparison ──────────────────────────────────────────────────────────────

/**
 * The member's own usage of one allowance.
 *
 * Reads `canCreate`, NEVER `allowed`. `allowed` is true for a capped free
 * member on purpose — that is what lets them edit and delete their own rows —
 * so it says nothing about whether they are at the cap.
 */
export function usageLine(
  ent: FeatureEntitlement | null | undefined,
  row: PlanFeatureRow,
): { text: string; atLimit: boolean } | null {
  if (!ent || ent.limit === null || ent.limit <= 0) return null
  const used = Math.min(Math.max(ent.used, 0), ent.limit)
  const when = row.window === 'day' ? ' today' : row.window === 'week' ? ' this week' : ''
  return { text: `${used} of ${ent.limit} used${when}`, atLimit: ent.canCreate === false }
}

/** A line under the feature name that the allowance itself cannot say. */
export function rowDetail(row: PlanFeatureRow, mindTotalSessions: number): string | null {
  if (row.kind === 'milestone') return `The Mind path runs ${mindTotalSessions} sessions.`
  return null
}

export interface ComparisonProps {
  rows: PlanFeatureRow[]
  mindTotalSessions: number
  /** Null while the snapshot is unknown — the table still renders, without the
   *  member's own numbers. The comparison is true for everybody. */
  snapshot: EntitlementsSnapshot | null
}

/**
 * Free vs Plus, generated entirely from the rows the server handed down.
 *
 * Exported and pure so the whole table can be rendered in a test without a DOM,
 * a hook or a fetch — the house pattern (see CheckoutAction). Every row in
 * `rows` is drawn; ROW_ORDER only decides the reading order.
 */
export function PlanComparison({ rows, mindTotalSessions, snapshot }: ComparisonProps) {
  const ordered = orderRows(rows)
  const isPlus = snapshot ? snapshot.tier !== 'free' : false

  return (
    <Card>
      <div className="mb-1 grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-end gap-2">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white">What you get</h2>
        <span
          className={`text-center text-[11px] font-semibold uppercase tracking-wide ${
            isPlus ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-700 dark:text-zinc-200'
          }`}
        >
          Free
        </span>
        <span
          className={`text-center text-[11px] font-semibold uppercase tracking-wide ${
            isPlus ? 'text-purple-700 dark:text-purple-300' : 'text-purple-600 dark:text-purple-400'
          }`}
        >
          Plus
        </span>
      </div>

      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {ordered.map((row) => {
          const usage = usageLine(snapshot?.features?.[row.feature], row)
          const detail = rowDetail(row, mindTotalSessions)
          return (
            <li
              key={row.feature}
              className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-2 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {FEATURE_LABELS[row.feature]}
                </p>
                {detail && (
                  <p className="mt-0.5 text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
                    {detail}
                  </p>
                )}
                {usage && (
                  <p
                    className={`mt-0.5 text-[11px] font-medium leading-tight tabular-nums ${
                      usage.atLimit
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    {usage.text}
                  </p>
                )}
              </div>
              <p className="text-center text-[11px] leading-tight text-zinc-600 tabular-nums dark:text-zinc-400">
                {freeCell(row)}
              </p>
              <p className="text-center text-[11px] font-semibold leading-tight text-purple-600 tabular-nums dark:text-purple-400">
                {plusCell(row, mindTotalSessions)}
              </p>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

// ─── Free forever ────────────────────────────────────────────────────────────

/** What a free member keeps with no plan at all. Pure; no member data. */
export function FreeForever() {
  return (
    <Card>
      <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
        Free, with no cap
      </h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{FREE_FOREVER_NOTE}</p>
      <ul className="mt-3 space-y-2.5">
        {FREE_FOREVER.map((item) => (
          <li key={item.label} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
              <Check className="h-3 w-3" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {item.label}
              </span>
              <span className="block text-xs leading-snug text-zinc-500 dark:text-zinc-400">
                {item.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

export interface PlanPricingProps {
  checkout: CheckoutState
  /** Which periods have a Stripe price. A CTA for a period with no price posts
   *  a plan the route answers `billing_not_configured` to — a dead button. */
  available: PlanAvailability
  portalState: PortalState
  onStart: (plan: BillingPlan) => void
  onOpenPortal: () => void
}

const PLAN_CTA_LABEL: Record<BillingPlan, string> = {
  monthly: 'Choose monthly',
  annual: 'Choose annual',
}

/**
 * The two prices, and the CTA — or, today, no CTA at all.
 *
 * A per-plan button is drawn ONLY while checkout is known to work AND that
 * period has a price. In every other state the single shared CheckoutAction
 * below carries the answer, which is the sheet's own component: the coming-soon
 * note, the failed-card exit, the retry, the already-Plus note.
 */
export function PlanPricing({
  checkout,
  available,
  portalState,
  onStart,
  onOpenPortal,
}: PlanPricingProps) {
  const live = checkout === 'ready' || checkout === 'starting'

  const cta = (plan: BillingPlan) => {
    if (!live) return null
    if (!available[plan]) {
      return (
        <p className="mt-3 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Not available yet.
        </p>
      )
    }
    return (
      <>
        <button
          type="button"
          onClick={() => onStart(plan)}
          disabled={checkout === 'starting'}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-3 text-sm font-semibold text-white transition-all hover:from-purple-700 hover:to-indigo-700 disabled:opacity-60"
        >
          {checkout === 'starting' && <Loader2 className="h-4 w-4 animate-spin" />}
          {PLAN_CTA_LABEL[plan]}
        </button>
        {/* Directly under the button, per plan, and never collapsed into one
            shared line at the bottom of the card: "visual proximity to the
            request for consent" is the whole requirement, and the two periods
            renew on different terms. */}
        <p className="mt-2 text-[11px] leading-snug text-zinc-600 dark:text-zinc-300">
          {renewalLine(plan)}{' '}
          <Link href="/terms#plans" className="font-medium underline underline-offset-2">
            Full terms
          </Link>
          .
        </p>
      </>
    )
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Plus</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        One price. Every cap above, removed.
      </p>

      <div className="mt-3 space-y-3">
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-zinc-900 dark:text-white">
              {PLAN_PRICING.monthly.display}
            </span>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              per {PLAN_PRICING.monthly.per}
            </span>
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {PLAN_PRICING.monthly.billed}
          </p>
          {cta('monthly')}
        </div>

        <div className="rounded-xl border border-purple-300 bg-purple-50/60 p-4 dark:border-purple-500/40 dark:bg-purple-500/10">
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-zinc-900 dark:text-white">
                {PLAN_PRICING.annual.display}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                per {PLAN_PRICING.annual.per}
              </span>
            </p>
            <span className="shrink-0 rounded-full bg-purple-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Save {PLAN_PRICING.annual.savesPercentDisplay}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            {PLAN_PRICING.annual.billed} That is{' '}
            {PLAN_PRICING.annual.perMonthDisplay} a {PLAN_PRICING.monthly.per}.
          </p>
          <p className="mt-1 text-xs font-medium text-purple-700 dark:text-purple-300">
            {ANNUAL_SAVING_LINE}
          </p>
          {cta('annual')}
        </div>
      </div>

      {/* Every non-purchasable state, rendered by the sheet's own component so
          the two surfaces can never disagree about what a refusal means. */}
      {!live && (
        <CheckoutAction
          state={checkout}
          tierName="Plus"
          portalState={portalState}
          onStart={() => onStart('monthly')}
          onOpenPortal={onOpenPortal}
        />
      )}

      <p className="mt-3 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
        Prices are in {PLAN_PRICING.currency}. Payment is handled by Stripe, and the total you
        confirm there is the total you pay.
      </p>
    </Card>
  )
}

// ─── Current plan ────────────────────────────────────────────────────────────

/** The member's plan today. Same renew/ends distinction as PlanCard. */
export function CurrentPlan({ snapshot }: { snapshot: EntitlementsSnapshot }) {
  const isPlus = snapshot.tier !== 'free'
  const periodEnd = snapshot.subscription?.currentPeriodEnd
    ? new Date(snapshot.subscription.currentPeriodEnd)
    : null
  // A cancelled subscription keeps Plus until the period end and then STOPS.
  // Calling that "Renews" tells someone who already cancelled they are about to
  // be charged again.
  const endsInstead = snapshot.subscription?.cancelAtPeriodEnd === true
  const dated = periodEnd && !Number.isNaN(periodEnd.getTime())

  return (
    <Card variant="compact" className="flex items-center gap-2.5">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          isPlus ? 'bg-purple-100 dark:bg-purple-900/30' : 'bg-zinc-100 dark:bg-zinc-800'
        }`}
      >
        <Sparkles
          className={`h-5 w-5 ${
            isPlus ? 'text-purple-600 dark:text-purple-400' : 'text-zinc-500 dark:text-zinc-400'
          }`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
          You&apos;re on {tierLabel(snapshot.tier)}
        </h2>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
          {isPlus
            ? snapshot.grandfathered
              ? 'Thanks for being here early'
              : dated
                ? `${endsInstead ? 'Ends' : 'Renews'} ${periodEnd.toLocaleDateString()}`
                : 'No limits on anything'
            : 'Here is exactly what that includes.'}
        </p>
      </div>
    </Card>
  )
}

// ─── Just paid ───────────────────────────────────────────────────────────────

/** Where the member is in the moments after Stripe sends them back. */
export type CheckoutReturnState = 'none' | 'confirming' | 'confirmed'

/**
 * The one thing that acknowledges a payment.
 *
 * It never says "you're on Plus" unless the snapshot actually says so. The
 * webhook may not have landed yet, and telling somebody they have been upgraded
 * a beat before it is true is how a support ticket gets opened about a purchase
 * that was in fact fine.
 */
export function CheckoutConfirmation({
  state,
  isPlus,
}: {
  state: Exclude<CheckoutReturnState, 'none'>
  isPlus: boolean
}) {
  const confirming = state === 'confirming'
  return (
    <Card
      variant="compact"
      className="flex items-center gap-2.5 border-purple-300 bg-purple-50/60 dark:border-purple-500/40 dark:bg-purple-500/10"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
        {confirming ? (
          <Loader2 className="h-5 w-5 animate-spin text-purple-600 dark:text-purple-400" />
        ) : (
          <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
          {confirming ? 'Confirming your payment' : 'Payment received'}
        </h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-300">
          {confirming
            ? 'One moment.'
            : isPlus
              ? 'Thanks. Everything below is unlocked.'
              : 'Thanks. Your plan will update here in a moment.'}
        </p>
      </div>
    </Card>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export interface PlanPageClientProps {
  /** Flattened FREE_LIMITS + FEATURE_MIN_TIER, read on the server. */
  rows: PlanFeatureRow[]
  mindTotalSessions: number
}

export default function PlanPageClient({ rows, mindTotalSessions }: PlanPageClientProps) {
  const { data, refresh } = useEntitlements()
  const searchParams = useSearchParams()
  // Stripe's success_url lands HERE — this page is the only screen that tells a
  // member which plan they are on, which is why the return path points at it
  // rather than at settings.
  const paidReturn = searchParams.get('checkout') === 'success'
  const paidSessionId = searchParams.get('session_id')
  const [checkoutReturn, setCheckoutReturn] = useState<CheckoutReturnState>(
    paidReturn ? 'confirming' : 'none',
  )
  const [checkout, setCheckout] = useState<CheckoutState>('checking')
  const [available, setAvailable] = useState<PlanAvailability>({ monthly: false, annual: false })
  const [portalState, setPortalState] = useState<PortalState>('idle')
  const [portalPath, setPortalPath] = useState<string>(PORTAL_PATH)
  const checkoutAvailable = data?.checkoutAvailable

  // Availability. Unlike the sheet, a `checkoutAvailable: true` snapshot is NOT
  // enough here: that flag is one bit for "monthly OR annual has a price", and
  // this page draws a CTA per period. Rendering an annual button against an
  // unset `stripePricePlusAnnual` posts a plan the route answers
  // `billing_not_configured` to — the exact dead button the sheet's probe
  // exists to prevent. So a `false` short-circuits, and anything else probes.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // undefined = no snapshot yet. Depending on the BOOLEAN rather than the
    // snapshot object also means a refetch that changes nothing cannot reset a
    // checkout that is already in flight.
    if (checkoutAvailable === undefined) return
    let cancelled = false
    setPortalState('idle')

    if (checkoutAvailable === false) {
      setCheckout('unavailable')
      return
    }

    setCheckout('checking')
    ;(async () => {
      try {
        const res = await fetch('/api/billing/status', { headers: authHeaders() })
        if (cancelled) return
        // 404 (route not built) / 503 / anything else → nothing to buy.
        if (!res.ok) {
          setCheckout('unavailable')
          return
        }
        const body: unknown = await res.json().catch(() => null)
        const b = (body ?? {}) as { configured?: unknown; plans?: Record<string, unknown> }
        const plans: PlanAvailability = {
          monthly: b.plans?.monthly === true,
          annual: b.plans?.annual === true,
        }
        setAvailable(plans)
        setCheckout(
          b.configured === true && (plans.monthly || plans.annual) ? 'ready' : 'unavailable',
        )
      } catch {
        if (!cancelled) setCheckout('unavailable')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [checkoutAvailable])
  /* eslint-enable react-hooks/set-state-in-effect */

  // CONSUME THE RETURN. Until this existed nothing in the app read
  // `?checkout=success` at all: `activateFromSession` in the status route had no
  // caller, so activation waited entirely on the webhook, and the entitlements
  // hook went on serving its 60s snapshot — one taken BEFORE the purchase. A
  // member who had just paid could sit on "Free plan" for a full minute, on the
  // very page that exists to tell them what they are on.
  //
  // Two steps, and both are needed. The status call activates from the session
  // (idempotent: it applies the same outcome the webhook would, through the same
  // ordering guard). The refresh is what makes THIS screen show it — a forced
  // read, so it cannot be served from the pre-purchase request still in flight.
  useEffect(() => {
    if (!paidReturn) return
    let cancelled = false

    ;(async () => {
      try {
        if (paidSessionId) {
          await fetch(`/api/billing/status?session_id=${encodeURIComponent(paidSessionId)}`, {
            headers: authHeaders(),
          })
        }
      } catch {
        // Never fatal. The webhook remains the source of truth; this only saves
        // the member the few seconds Stripe takes to call us.
      }
      await refresh()
      if (cancelled) return
      setCheckoutReturn('confirmed')
      // Drop the query so a reload is not a second activation attempt. Next
      // does not observe replaceState, so `paidReturn` stays true and this
      // effect does not re-run.
      window.history.replaceState(null, '', window.location.pathname)
    })()

    return () => {
      cancelled = true
    }
  }, [paidReturn, paidSessionId, refresh])

  const startCheckout = useCallback(
    async (plan: BillingPlan) => {
      // Only reachable from a live CTA or the 'error' branch's retry.
      if (checkout !== 'ready' && checkout !== 'error') return
      setCheckout('starting')
      try {
        const res = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: authHeaders(),
          // `plan` is the only field the route reads.
          body: JSON.stringify({ plan }),
        })
        const body: unknown = await res.json().catch(() => null)
        if (res.ok) {
          const url = readString(body, 'url')
          if (url) {
            window.location.assign(url)
            return
          }
          // 2xx with nowhere to go: billing is live and this one response is
          // wrong. A retry, not a closed shop.
          setCheckout('error')
          return
        }
        const next = checkoutRefusalState(res.status, body)
        if (next === 'fix-payment') setPortalPath(readString(body, 'portal') ?? PORTAL_PATH)
        setCheckout(next)
      } catch {
        // A dropped connection is never "upgrades aren't open yet".
        setCheckout('error')
      }
    },
    [checkout],
  )

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
      setPortalState('failed')
    } catch {
      setPortalState('failed')
    }
  }, [portalPath])

  const header = (
    <header className="flex items-center gap-3">
      <BackButton />
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">Plan</h1>
    </header>
  )

  // Snapshot unknown (cold first paint, or signed-out). Draw a neutral
  // placeholder rather than a comparison nobody has been told applies to them.
  if (!data) {
    return (
      <PageTransition className="space-y-5 pb-10">
        {header}
        <div className="space-y-3" aria-hidden="true">
          <div className="h-16 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
          <div className="h-64 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
        </div>
      </PageTransition>
    )
  }

  // THE KILL-SWITCH. With ENTITLEMENTS_ENFORCED off there are no tiers to
  // compare and nothing is capped, so the page must not name one, price one or
  // draw the table. Same contract as PlanCard, PlanRow and TierGate.
  if (data.enforced === false) {
    return (
      <PageTransition className="space-y-5 pb-10">
        {header}
        <Card>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
            Everything is open on your account
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Nothing in Become is limited for you right now, and there is nothing to buy.
          </p>
          <Link
            href="/dashboard"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400"
          >
            Back to your dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      </PageTransition>
    )
  }

  const isPlus = data.tier !== 'free'

  return (
    <PageTransition className="space-y-4 pb-10">
      {header}

      {checkoutReturn !== 'none' && (
        <CheckoutConfirmation state={checkoutReturn} isPlus={isPlus} />
      )}

      <CurrentPlan snapshot={data} />

      {/* A member who already holds Plus is shown what they have, never a
          second price. Checkout would refuse them anyway (409 already_*). */}
      {!isPlus && (
        <PlanPricing
          checkout={checkout}
          available={available}
          portalState={portalState}
          onStart={startCheckout}
          onOpenPortal={openPortal}
        />
      )}

      <PlanComparison rows={rows} mindTotalSessions={mindTotalSessions} snapshot={data} />

      <FreeForever />

      <LegalLinks className="pt-1" />
    </PageTransition>
  )
}
