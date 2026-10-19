// Run with: npm run test:file tests/unit/billing/freeTrialUi.test.tsx
//
// The two pure, props-driven surfaces the no-card trial renders through —
// FreeTrialPrompt (the onboarding modal's primary offer) and FreeTrialSection
// (the Plan page's enduring one). Same house pattern as trialOfferCard.test.tsx
// and the rest of this repo's billing UI tests: renderToStaticMarkup, no DOM,
// no network — every reachable state is a prop combination.

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
} from '../../../app/dashboard/plan/PlanPageClient'
import {
  CONTINUE_FREE_LABEL,
  FREE_TRIAL_CTA_LABEL,
  FREE_TRIAL_ENDED_HEADING,
} from '../../../lib/trialOfferCopy'
import { TRIAL_DAYS } from '../../../lib/billing/trial'

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')

// ─── FreeTrialPrompt — the onboarding modal's primary offer ────────────────

const promptProps = (over: Partial<FreeTrialPromptProps> = {}): FreeTrialPromptProps => ({
  cardOptionShown: true,
  starting: false,
  failed: false,
  onStart: () => {},
  onContinueFree: () => {},
  ...over,
})

test('names the no-card CTA and mentions the trial length', () => {
  const html = renderToStaticMarkup(<FreeTrialPrompt {...promptProps()} />)
  assert.ok(html.includes(esc(FREE_TRIAL_CTA_LABEL)))
  assert.ok(html.includes(String(TRIAL_DAYS)))
})

test('the up-front mention of the card option is on screen before the button is pressed', () => {
  // George: "Mention this up front in the prompt so they know they have the
  // option to put the card down immediately and get 7 more days instantly."
  const html = renderToStaticMarkup(<FreeTrialPrompt {...promptProps()} />)
  assert.match(html, /card/i)
  assert.match(html, /instantly/i)
})

test('starting disables the button but keeps it on screen', () => {
  const idle = renderToStaticMarkup(<FreeTrialPrompt {...promptProps({ starting: false })} />)
  const starting = renderToStaticMarkup(<FreeTrialPrompt {...promptProps({ starting: true })} />)
  assert.doesNotMatch(idle, /<button[^>]*disabled=""[^>]*>[\s\S]*?Start my/)
  assert.match(starting, /<button[^>]*disabled=""[^>]*>[\s\S]*?Start my/)
})

test('a failed attempt says so and leaves the button pressable again', () => {
  const html = renderToStaticMarkup(<FreeTrialPrompt {...promptProps({ failed: true })} />)
  assert.match(html, /try again/i)
  assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>[\s\S]*?Start my/)
})

test('draws its own way out ONLY when the card option is not also on screen', () => {
  const alone = renderToStaticMarkup(<FreeTrialPrompt {...promptProps({ cardOptionShown: false })} />)
  const withCard = renderToStaticMarkup(<FreeTrialPrompt {...promptProps({ cardOptionShown: true })} />)
  assert.ok(alone.includes(esc(CONTINUE_FREE_LABEL)), 'the only surface on screen must have a way out')
  assert.ok(
    !withCard.includes(esc(CONTINUE_FREE_LABEL)),
    'TrialOfferCard, rendered alongside it, already draws Continue free',
  )
})

// ─── FreeTrialSection — the Plan page's enduring offer ─────────────────────

const baseTrial: FreeTrialSectionProps['trial'] = {
  offerDue: false,
  active: false,
  ended: false,
  daysRemaining: 0,
  cardAvailable: true,
}

const sectionProps = (
  trial: Partial<FreeTrialSectionProps['trial']>,
  over: Partial<FreeTrialSectionProps> = {},
): FreeTrialSectionProps => ({
  trial: { ...baseTrial, ...trial },
  trialDays: TRIAL_DAYS,
  starting: false,
  startFailed: false,
  checkout: 'ready',
  onStartFreeTrial: () => {},
  onStartCardTrial: () => {},
  ...over,
})

test('renders nothing when there is no honest offer of any kind', () => {
  const html = renderToStaticMarkup(
    <FreeTrialSection {...sectionProps({ cardAvailable: false })} />,
  )
  assert.equal(html, '')
})

test('offerDue: the no-card CTA is on screen, and the card option sits beside it', () => {
  const html = renderToStaticMarkup(<FreeTrialSection {...sectionProps({ offerDue: true })} />)
  assert.ok(html.includes(esc(FREE_TRIAL_CTA_LABEL)))
  assert.match(html, /Monthly/)
  assert.match(html, /Annual/)
})

test('offerDue with checkout unavailable: the no-card CTA stays, the card row does not', () => {
  const html = renderToStaticMarkup(
    <FreeTrialSection {...sectionProps({ offerDue: true }, { checkout: 'unavailable' })} />,
  )
  assert.ok(html.includes(esc(FREE_TRIAL_CTA_LABEL)), 'no Stripe needed for this one')
  assert.doesNotMatch(html, /Monthly/, 'no dead button for the card option')
})

test('active: the days-left line is on screen with the extend-by-card row', () => {
  const html = renderToStaticMarkup(
    <FreeTrialSection {...sectionProps({ active: true, daysRemaining: 3 })} />,
  )
  assert.match(html, /3 days left/)
  assert.match(html, /Monthly/)
})

test('ended with a card still available: the ended heading and the extend row both show', () => {
  const html = renderToStaticMarkup(<FreeTrialSection {...sectionProps({ ended: true })} />)
  assert.ok(html.includes(esc(FREE_TRIAL_ENDED_HEADING)))
  assert.match(html, /Monthly/)
})

test('ended with no card available: nothing renders — there is nothing left to offer', () => {
  const html = renderToStaticMarkup(
    <FreeTrialSection {...sectionProps({ ended: true, cardAvailable: false })} />,
  )
  assert.equal(html, '')
})

test('starting disables the no-card button', () => {
  const html = renderToStaticMarkup(
    <FreeTrialSection {...sectionProps({ offerDue: true }, { starting: true })} />,
  )
  assert.match(html, /<button[^>]*disabled=""[^>]*>[\s\S]*?free days/)
})
