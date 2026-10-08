// Run with: npm run test:file tests/unit/billing/trialOfferCard.test.tsx
//
// TrialOfferCard is the pure half of components/onboarding/TrialOfferModal.tsx
// — the stateful wrapper around it does the entitlements read and the fetch,
// neither of which this repo can exercise without a DOM (see CheckoutAction /
// manageBilling.test.tsx for the same split, for the same reason). Rendered
// with renderToStaticMarkup, the house pattern.
//
// What actually matters, per the card:
//   • the member ACTIVATES Plus — there is a tick to make and a button to
//     press, never an automatic grant;
//   • the offer explains what upgrading gets them;
//   • the billing period (monthly/annual) is picked BEFORE the trial starts;
//   • the agreement names the 10-day trial, the post-trial charge and the
//     refund window, and links to the Terms;
//   • "Continue free" is drawn in every state, including the refusal ones.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { TrialOfferCard, type TrialOfferCardProps } from '../../../components/onboarding/TrialOfferModal'
import { TRIAL_DAYS } from '../../../lib/billing/trial'
import {
  CONTINUE_FREE_LABEL,
  TRIAL_AGREEMENT_TEXT,
  TRIAL_CTA_LABEL,
} from '../../../lib/trialOfferCopy'
import { PLAN_PRICING } from '../../../lib/planCopy'
import { PLUS_BENEFITS } from '../../../lib/entitlementsClient'
import type { CheckoutState } from '../../../components/UpgradeSheet'

/** React escapes text nodes; an expectation with an apostrophe has to match. */
const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')

const baseProps = (over: Partial<TrialOfferCardProps> = {}): TrialOfferCardProps => ({
  plan: 'monthly',
  onPlanChange: () => {},
  agreed: false,
  onAgreedChange: () => {},
  checkout: 'ready',
  portalState: 'idle',
  onStart: () => {},
  onOpenPortal: () => {},
  onContinueFree: () => {},
  ...over,
})

test('names the trial length and what upgrading gets a member', () => {
  const html = renderToStaticMarkup(<TrialOfferCard {...baseProps()} />)
  assert.ok(html.includes(String(TRIAL_DAYS)), 'the trial length is stated')
  for (const benefit of PLUS_BENEFITS) {
    assert.ok(html.includes(esc(benefit)), `${benefit} is missing`)
  }
})

test('both prices are offered, and picked before the trial starts', () => {
  const html = renderToStaticMarkup(<TrialOfferCard {...baseProps()} />)
  assert.ok(html.includes(esc(PLAN_PRICING.monthly.display)))
  assert.ok(html.includes(esc(PLAN_PRICING.annual.display)))
  assert.match(html, /radiogroup/)
})

test('the start button is disabled until the agreement is ticked — activation is a choice, not a default', () => {
  const unagreed = renderToStaticMarkup(<TrialOfferCard {...baseProps({ agreed: false })} />)
  const agreed = renderToStaticMarkup(<TrialOfferCard {...baseProps({ agreed: true })} />)
  assert.match(unagreed, /<button[^>]*disabled=""[^>]*>[\s\S]*?Start my/)
  assert.doesNotMatch(agreed, /<button[^>]*disabled=""[^>]*>[\s\S]*?Start my/)
  assert.ok(unagreed.includes(esc(TRIAL_CTA_LABEL)))
})

test('the agreement names the trial, the automatic charge and the refund window', () => {
  const html = renderToStaticMarkup(<TrialOfferCard {...baseProps()} />)
  assert.ok(html.includes(esc(TRIAL_AGREEMENT_TEXT)))
  assert.match(html, /\/terms#cancelling/)
})

test('a running checkout disables the button and shows a spinner state, not a second click target', () => {
  const html = renderToStaticMarkup(<TrialOfferCard {...baseProps({ agreed: true, checkout: 'starting' })} />)
  assert.match(html, /<button[^>]*disabled=""[^>]*>[\s\S]*?Start my/)
})

test('continue free is drawn in every reachable state, including mid-attempt refusals', () => {
  const states: CheckoutState[] = ['ready', 'starting', 'error', 'fix-payment', 'already-plus']
  for (const checkout of states) {
    const html = renderToStaticMarkup(<TrialOfferCard {...baseProps({ checkout })} />)
    assert.ok(html.includes(esc(CONTINUE_FREE_LABEL)), `continue free missing for ${checkout}`)
  }
})

test('a refusal from a live attempt renders through the shared CheckoutAction, not a second copy of its wording', () => {
  // components/UpgradeSheet.tsx#CheckoutAction owns the "didn't start" /
  // "update payment method" / "already have Plus" copy. This card must not
  // restate any of it — same rule PlanPricing follows for the plan page.
  const html = renderToStaticMarkup(<TrialOfferCard {...baseProps({ checkout: 'error' })} />)
  assert.ok(html.includes(esc("Checkout didn't start")))
  // ...and the trial-specific controls (period picker, agreement) are gone —
  // there is nothing to agree to while there is nothing to buy.
  assert.doesNotMatch(html, /radiogroup/)
})
