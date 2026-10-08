'use client'

// The post-onboarding trial offer — the CTA the card asks for, between
// finishing onboarding and the dashboard's first-run tour (TutorialRoot).
//
// WHY A SEPARATE SURFACE FROM UpgradeSheet / the plan page. Both of those are
// described (AGENTS.md) as: the sheet is REACTIVE (something was refused),
// the plan page is PROACTIVE (the whole comparison, prices included). This is
// a THIRD kind — a one-time, unprompted ask at a single moment in the account's
// life — and it is the one place in the app that offers an actual Stripe trial
// rather than an immediate charge. `trial: true` on the checkout request is
// this surface's alone; every other caller still starts a paid period on day
// one. See lib/billing/trial.ts for why that is safe to repeat.
//
// THE POINT, per the card: a member ACTIVATES Plus by choosing it here, with a
// billing period picked up front and an explicit tick — never an automatic
// grant. "Continue free" is exactly as easy to press as the trial button, and
// nothing about the free path is worse than it is today.
//
// BAILS SILENTLY, exactly like every other tier surface in this app, in any
// state where there is nothing honest to offer: ENTITLEMENTS_ENFORCED off (the
// launch-day contract), a member who is already Plus, checkout not known to
// work, or the entitlements read failing outright. "Bail" means render
// nothing AND call onDismiss — this surface has no route of its own, so
// skipping it is what lets the onboarding page move on to /dashboard.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Gift, Loader2, Sparkles } from 'lucide-react'
import { useEntitlements } from '@/hooks/useEntitlements'
import { useLockScroll } from '@/lib/useLockScroll'
import { getToken } from '@/lib/clientAuth'
import { PLUS_BENEFITS } from '@/lib/entitlementsClient'
import { PLAN_PRICING } from '@/lib/planCopy'
import { renewalLine } from '@/lib/legal'
import {
  CheckoutAction,
  checkoutRefusalState,
  type CheckoutActionProps,
  type CheckoutState,
} from '@/components/UpgradeSheet'
import type { BillingPlan } from '@/lib/billing/mode'
import {
  CONTINUE_FREE_LABEL,
  TERMS_REFUND_HREF,
  TRIAL_AGREEMENT_TEXT,
  TRIAL_CTA_LABEL,
  TRIAL_OFFER_DETAIL,
  TRIAL_OFFER_HEADING,
  TRIAL_OFFER_SUBHEADING,
} from '@/lib/trialOfferCopy'

type PortalState = CheckoutActionProps['portalState']

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

export interface TrialOfferCardProps {
  plan: BillingPlan
  onPlanChange: (plan: BillingPlan) => void
  agreed: boolean
  onAgreedChange: (agreed: boolean) => void
  checkout: CheckoutState
  portalState: PortalState
  onStart: () => void
  onOpenPortal: () => void
  onContinueFree: () => void
}

/**
 * The offer itself — pure and props-driven (the house pattern for anything
 * interactive: the repo has no DOM test environment, so a state reachable only
 * through an effect and a fetch is otherwise untestable; see CheckoutAction in
 * components/UpgradeSheet.tsx). Every reachable state renders here with no
 * network call.
 */
export function TrialOfferCard({
  plan,
  onPlanChange,
  agreed,
  onAgreedChange,
  checkout,
  portalState,
  onStart,
  onOpenPortal,
  onContinueFree,
}: TrialOfferCardProps) {
  // Only reachable states once this card is shown at all are 'ready' /
  // 'starting' (the CTA this file owns) and the three refusals a live attempt
  // can come back with — 'error', 'fix-payment', 'already-plus' — which render
  // through the SAME component the sheet and the plan page use, so no surface
  // in the app can disagree about what a refusal means. 'checking' and
  // 'unavailable' never reach this card: TrialOfferModal bails before mounting
  // it rather than show a dead end during onboarding.
  const live = checkout === 'ready' || checkout === 'starting'

  return (
    <div className="px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-5">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600/10 text-purple-600 dark:text-purple-400">
          <Gift className="h-5 w-5" />
        </span>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{TRIAL_OFFER_HEADING}</h2>
      </div>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{TRIAL_OFFER_SUBHEADING}</p>

      <div className="mt-4 grid gap-2">
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

      {live && (
        <>
          {/* Picked BEFORE the trial starts, per the card: the member chooses
              what they will be charged once the 10 days end, not after. */}
          <div
            role="radiogroup"
            aria-label="Billing period"
            className="mt-5 grid grid-cols-2 gap-2"
          >
            <button
              type="button"
              role="radio"
              aria-checked={plan === 'monthly'}
              onClick={() => onPlanChange('monthly')}
              className={`rounded-xl border p-3 text-left transition-colors ${
                plan === 'monthly'
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/10'
                  : 'border-zinc-200 dark:border-zinc-800'
              }`}
            >
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                {PLAN_PRICING.monthly.display}
                <span className="font-normal text-zinc-500 dark:text-zinc-400">
                  {' '}
                  / {PLAN_PRICING.monthly.per}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">after the trial</p>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={plan === 'annual'}
              onClick={() => onPlanChange('annual')}
              className={`rounded-xl border p-3 text-left transition-colors ${
                plan === 'annual'
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/10'
                  : 'border-zinc-200 dark:border-zinc-800'
              }`}
            >
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                {PLAN_PRICING.annual.display}
                <span className="font-normal text-zinc-500 dark:text-zinc-400">
                  {' '}
                  / {PLAN_PRICING.annual.per}
                </span>
              </p>
              <p className="mt-0.5 text-xs font-medium text-purple-700 dark:text-purple-300">
                Save {PLAN_PRICING.annual.savesPercentDisplay}
              </p>
            </button>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            {TRIAL_OFFER_DETAIL}
          </p>
          <p className="mt-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
            {renewalLine(plan)}
          </p>

          <label className="mt-4 flex items-start gap-2.5 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => onAgreedChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 dark:border-zinc-700"
            />
            <span>
              {TRIAL_AGREEMENT_TEXT}{' '}
              <Link href={TERMS_REFUND_HREF} className="font-medium underline underline-offset-2">
                Full terms
              </Link>
              .
            </span>
          </label>

          <button
            type="button"
            onClick={onStart}
            disabled={!agreed || checkout === 'starting'}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-3.5 text-sm font-semibold text-white transition-all hover:from-purple-700 hover:to-indigo-700 disabled:opacity-60"
          >
            {checkout === 'starting' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {TRIAL_CTA_LABEL}
          </button>
        </>
      )}

      {/* Every non-purchasable state a live attempt can come back with,
          rendered by the sheet's own component so no surface in the app can
          disagree about what a refusal means. */}
      {!live && (
        <CheckoutAction
          state={checkout}
          tierName="Plus"
          portalState={portalState}
          onStart={onStart}
          onOpenPortal={onOpenPortal}
        />
      )}

      <button
        type="button"
        onClick={onContinueFree}
        className="mt-3 w-full rounded-2xl px-4 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        {CONTINUE_FREE_LABEL}
      </button>
    </div>
  )
}

export interface TrialOfferModalProps {
  /** Called when the member chooses free, finishes a checkout attempt that
   *  will redirect away, or this surface decides there is nothing honest to
   *  offer. The only thing the onboarding page needs to know is "move on". */
  onDismiss: () => void
}

/**
 * Stateful wrapper. Shown once, mounted by app/onboarding/page.tsx right
 * after the profile save succeeds and before it would otherwise have pushed
 * to /dashboard.
 */
export default function TrialOfferModal({ onDismiss }: TrialOfferModalProps) {
  const { data, loading } = useEntitlements()
  const [plan, setPlan] = useState<BillingPlan>('monthly')
  const [agreed, setAgreed] = useState(false)
  const [checkout, setCheckout] = useState<CheckoutState>('ready')
  const [portalState, setPortalState] = useState<PortalState>('idle')
  const [portalPath, setPortalPath] = useState<string>('/api/billing/portal')
  useLockScroll(true)

  // Nothing honest to offer, in any of these: the kill-switch is off, the
  // member is somehow already Plus, or checkout is not known to work. Same
  // "no button that cannot work" rule as UpgradeSheet / the plan page — this
  // surface just has nowhere else to send the member, so it moves them on
  // instead of showing a dead end during onboarding. Fails OPEN on a read
  // failure too: a network blip must cost a missed upsell, never a stuck
  // onboarding flow.
  //
  // This is an external-system read (the entitlements snapshot), so the
  // decision cannot be derived during render — same shape as UpgradeSheet's
  // own checkout probe.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (loading) return
    const ok =
      data !== null &&
      data.enforced !== false &&
      data.tier !== 'plus' &&
      data.checkoutAvailable === true
    if (!ok) onDismiss()
  }, [loading, data, onDismiss])
  /* eslint-enable react-hooks/set-state-in-effect */

  const startCheckout = useCallback(async () => {
    if (checkout !== 'ready' && checkout !== 'error') return
    setCheckout('starting')
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: authHeaders(),
        // The one caller of `trial: true` in the app. `returnTo` is explicit
        // (not the route's 'web' default) because this surface only ever runs
        // in the webapp onboarding flow.
        body: JSON.stringify({ plan, trial: true, returnTo: 'web' }),
      })
      const body: unknown = await res.json().catch(() => null)
      if (res.ok) {
        const url = readString(body, 'url')
        if (url) {
          window.location.assign(url)
          return
        }
        setCheckout('error')
        return
      }
      const next = checkoutRefusalState(res.status, body)
      if (next === 'fix-payment') setPortalPath(readString(body, 'portal') ?? '/api/billing/portal')
      setCheckout(next)
    } catch {
      setCheckout('error')
    }
  }, [plan, checkout])

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

  if (loading) return null
  const ok =
    data !== null &&
    data.enforced !== false &&
    data.tier !== 'plus' &&
    data.checkoutAvailable === true
  if (!ok) return null

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={TRIAL_OFFER_HEADING}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white dark:bg-zinc-900 sm:max-w-md sm:rounded-2xl"
      >
        <TrialOfferCard
          plan={plan}
          onPlanChange={setPlan}
          agreed={agreed}
          onAgreedChange={setAgreed}
          checkout={checkout}
          portalState={portalState}
          onStart={startCheckout}
          onOpenPortal={openPortal}
          onContinueFree={onDismiss}
        />
      </div>
    </div>
  )
}
