// Run with: npm run test:file tests/unit/billing/freeTrialUi.test.tsx
//
// Pure, props-driven render tests for the two no-card-trial surfaces, same
// house pattern as trialOfferCard.test.tsx: the repo has no DOM test
// environment, so each component is rendered on its own with
// renderToStaticMarkup, and every reachable state is reached through props
// rather than an effect or a fetch.
//
// What actually matters, per the card:
//   • the up-front mention of the card option (9d6d2f72) appears in the
//     no-card prompt BEFORE anyone decides;
//   • the Plan page's section is reachable regardless of whether the member
//     declined the onboarding prompt (9d6d2f71) — it renders off the SAME
//     `freeTrialOfferDue` the server computes, with no extra "did I already
//     see this" state of its own;
//   • the card-backed "+7 more days" CTA is drawn even while the free trial
//     is active (9d6d2f73/9d6d2f74), which `FreeTrialSection`'s own gating
//     (never `!isPlus`) is what this file pins.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  FreeTrialPrompt,
  type FreeTrialPromptProps,
} from '../../../components/onboarding/TrialOfferModal'
import {
  FreeTrialSection,
  type FreeTrialSectionProps,
  type TrialStatus,
} from '../../../app/dashboard/plan/PlanPageClient'
import { TRIAL_DAYS } from '../../../lib/billing/trial'
import {
  CARD_TRIAL_CTA_LABEL,
  FREE_TRIAL_CARD_UPSELL,
  FREE_TRIAL_CTA_LABEL,
} from '../../../lib/trialOfferCopy'

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')

// ─── FreeTrialPrompt (onboarding) ────────────────────────────────────────────

const promptProps = (over: Partial<FreeTrialPromptProps> = {}): FreeTrialPromptProps => ({
  cardOptionAvailable: true,
  starting: false,
  onStart: () => {},
  ...over,
})

test('states the trial length and that no card is needed', () => {
  const html = renderToStaticMarkup(<FreeTrialPrompt {...promptProps()} />)
  assert.ok(html.includes(String(TRIAL_DAYS)))
  assert.match(html, /no card/i)
})

test('the up-front card mention is drawn when a card would actually do something', () => {
  const html = renderToStaticMarkup(<FreeTrialPrompt {...promptProps({ cardOptionAvailable: true })} />)
  assert.ok(html.includes(esc(FREE_TRIAL_CARD_UPSELL)))
})

test('the card mention is withheld when checkout could not start anything — no button that cannot work', () => {
  const html = renderToStaticMarkup(<FreeTrialPrompt {...promptProps({ cardOptionAvailable: false })} />)
  assert.ok(!html.includes(esc(FREE_TRIAL_CARD_UPSELL)))
})

test('starting disables the button rather than offering a second click', () => {
  const idle = renderToStaticMarkup(<FreeTrialPrompt {...promptProps({ starting: false })} />)
  const starting = renderToStaticMarkup(<FreeTrialPrompt {...promptProps({ starting: true })} />)
  assert.doesNotMatch(idle, /<button[^>]*disabled=""/)
  assert.match(starting, /<button[^>]*disabled=""/)
  assert.ok(idle.includes(esc(FREE_TRIAL_CTA_LABEL)))
})

// ─── FreeTrialSection (Plan page) ────────────────────────────────────────────

const baseStatus = (over: Partial<TrialStatus> = {}): TrialStatus => ({
  checkoutAvailable: true,
  trialDays: TRIAL_DAYS,
  hasStartedFreeTrial: false,
  freeTrialActive: false,
  freeTrialOfferDue: true,
  freeTrialEndsAt: null,
  freeTrialDaysRemaining: 0,
  cardTrialAvailable: true,
  ...over,
})

const sectionProps = (over: Partial<FreeTrialSectionProps> = {}): FreeTrialSectionProps => ({
  status: baseStatus(),
  freeTrialStarting: false,
  onStartFreeTrial: () => {},
  cardTrialPlan: 'monthly',
  onCardTrialPlanChange: () => {},
  cardTrialCheckout: 'ready',
  portalState: 'idle',
  onStartCardTrial: () => {},
  onOpenPortal: () => {},
  ...over,
})

test('renders nothing while the status is unknown — never guesses', () => {
  const html = renderToStaticMarkup(<FreeTrialSection {...sectionProps({ status: null })} />)
  assert.equal(html, '')
})

test('renders nothing once both offers are spent', () => {
  const spent = baseStatus({
    hasStartedFreeTrial: true,
    freeTrialOfferDue: false,
    freeTrialActive: false,
    cardTrialAvailable: false,
  })
  const html = renderToStaticMarkup(<FreeTrialSection {...sectionProps({ status: spent })} />)
  assert.equal(html, '')
})

test('a member who never started the trial sees the offer — reachable after a decline (9d6d2f71)', () => {
  // This is EXACTLY the state after someone declines the onboarding prompt:
  // nothing was written, so freeTrialOfferDue is still true.
  const html = renderToStaticMarkup(<FreeTrialSection {...sectionProps()} />)
  assert.ok(html.includes(String(TRIAL_DAYS)))
  assert.match(html, /no card/i)
})

test('the up-front card-option mention appears on the plan page offer too (9d6d2f72)', () => {
  const html = renderToStaticMarkup(
    <FreeTrialSection {...sectionProps({ status: baseStatus({ cardTrialAvailable: true }) })} />,
  )
  assert.ok(html.includes(esc(FREE_TRIAL_CARD_UPSELL)))
})

test('an active free trial shows the days remaining, not the starting offer', () => {
  const active = baseStatus({
    hasStartedFreeTrial: true,
    freeTrialActive: true,
    freeTrialOfferDue: false,
    freeTrialDaysRemaining: 4,
  })
  const html = renderToStaticMarkup(<FreeTrialSection {...sectionProps({ status: active })} />)
  assert.match(html, /4 days left/)
  assert.ok(!html.includes(esc(FREE_TRIAL_CTA_LABEL)), 'the start button is gone once it is running')
})

test('the card CTA is drawn DURING an active free trial — the extension the card asks for (9d6d2f73)', () => {
  const active = baseStatus({
    hasStartedFreeTrial: true,
    freeTrialActive: true,
    freeTrialOfferDue: false,
    freeTrialDaysRemaining: 2,
    cardTrialAvailable: true,
  })
  const html = renderToStaticMarkup(<FreeTrialSection {...sectionProps({ status: active })} />)
  assert.ok(html.includes(esc(CARD_TRIAL_CTA_LABEL)))
  assert.match(html, /radiogroup/, 'the plan is picked before the card trial starts')
})

test('the card CTA is still drawn once the free trial has lapsed with no card', () => {
  const lapsed = baseStatus({
    hasStartedFreeTrial: true,
    freeTrialActive: false,
    freeTrialOfferDue: false,
    cardTrialAvailable: true,
  })
  const html = renderToStaticMarkup(<FreeTrialSection {...sectionProps({ status: lapsed })} />)
  assert.ok(html.includes(esc(CARD_TRIAL_CTA_LABEL)))
  assert.ok(!html.includes(esc(FREE_TRIAL_CTA_LABEL)), 'the already-spent free trial is not re-offered')
})

test('the card CTA disappears once there is truly nothing left to sell', () => {
  const html = renderToStaticMarkup(
    <FreeTrialSection
      {...sectionProps({
        status: baseStatus({
          hasStartedFreeTrial: true,
          freeTrialOfferDue: false,
          freeTrialActive: false,
          cardTrialAvailable: false,
        }),
      })}
    />,
  )
  assert.ok(!html.includes(esc(CARD_TRIAL_CTA_LABEL)))
})

test('starting the free trial disables its own button, not the card one', () => {
  const html = renderToStaticMarkup(
    <FreeTrialSection {...sectionProps({ freeTrialStarting: true })} />,
  )
  assert.match(html, /<button[^>]*disabled=""/)
})
