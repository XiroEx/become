// Run with: npm run test:file tests/unit/billing/trialOfferGate.test.ts
//
// WHEN the post-onboarding trial offer appears, and that it is actually wired
// into the one place the card asks for it.
//
// trialOfferCard.test.tsx covers what the offer SAYS once it is on screen.
// Everything here is about whether a real member ever sees it, which is the
// half that was wrong when this first shipped: the offer bailed on
// `enforced === false`, ENTITLEMENTS_ENFORCED defaults to off and is off in
// production (see the comment on `planScreen` in manageBilling.test.tsx), so
// the activation CTA was on no screen at all on a real deploy. That is the same
// bug the "Manage billing" button shipped with, for the same reason, and
// AGENTS.md states the rule it breaks: a BILLING control is not a tier surface
// and does not bail on the kill-switch.
//
// The wiring half is a source scan, in the style of billingRoutes.test.ts:
// app/onboarding/page.tsx is a 1900-line client page with no DOM test
// environment available here, and what breaks in practice is the mount, not the
// markup.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { trialOfferDue, type TrialOfferSnapshot } from '../../../lib/billing/trial'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const MODAL = 'components/onboarding/TrialOfferModal.tsx'
const ONBOARDING = 'app/onboarding/page.tsx'

/** Source with comments removed, so a rule about what the CODE must not read
 *  is not satisfied or broken by prose explaining the rule. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

/** A brand-new member on an install where Stripe is live: the one state the
 *  offer exists for. */
const newMember = (over: Partial<TrialOfferSnapshot> = {}): TrialOfferSnapshot => ({
  tier: 'free',
  checkoutAvailable: true,
  subscription: null,
  ...over,
})

// ─── trialOfferDue ───────────────────────────────────────────────────────────

test('a brand-new free member on a billing-configured install is offered the trial', () => {
  assert.equal(trialOfferDue(newMember()), true)
})

test('THE KILL-SWITCH DOES NOT SUPPRESS IT — a billing control is not a tier surface', () => {
  // The regression this file exists for. `enforced` is not part of the
  // predicate's input at all, so there is nothing to accidentally branch on:
  // a snapshot that carries it either way answers the same.
  for (const enforced of [true, false, undefined]) {
    assert.equal(
      trialOfferDue({ ...newMember(), ...(enforced === undefined ? {} : { enforced }) } as TrialOfferSnapshot),
      true,
      `enforced=${String(enforced)} must not change the answer`,
    )
  }
  // ...and the surface itself must not have grown the check back.
  assert.doesNotMatch(
    code(MODAL),
    /enforced/,
    `${MODAL} must not read \`enforced\` — ENTITLEMENTS_ENFORCED is off in production, so a bail on it means the activation CTA is on no screen`,
  )
})

test('no offer when checkout cannot work — no button that cannot be pressed', () => {
  // The launch-day state: no Stripe secret or no price in the runtime config.
  assert.equal(trialOfferDue(newMember({ checkoutAvailable: false })), false)
  assert.equal(trialOfferDue(newMember({ checkoutAvailable: undefined })), false)
  assert.equal(trialOfferDue(newMember({ checkoutAvailable: null })), false)
})

test('no offer to a member who already holds Plus', () => {
  // Grandfathered members and admins both derive to `plus`; checkout answers
  // them `already_plus`, so offering is a dead end.
  assert.equal(trialOfferDue(newMember({ tier: 'plus' })), false)
})

test('no offer once the trial is spent — the same rule the route enforces', () => {
  // isTrialEligible() is what the checkout route applies server-side, so a
  // surface that asked anyway would promise 10 free days the route then
  // declines to grant (`trialApplied: false`).
  for (const status of ['trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete']) {
    assert.equal(
      trialOfferDue(newMember({ subscription: { status } })),
      false,
      `${status} has already spent the trial`,
    )
  }
  // 'none' is the row every member gets the moment they open checkout and is
  // NOT a spent trial — otherwise abandoning Stripe once would cost them the
  // offer forever.
  assert.equal(trialOfferDue(newMember({ subscription: { status: 'none' } })), true)
})

test('fails closed on a missing snapshot — a read failure costs an upsell, never the flow', () => {
  assert.equal(trialOfferDue(null), false)
  assert.equal(trialOfferDue(undefined), false)
})

// ─── the modal reads ONE copy of the decision ────────────────────────────────

test('the effect and the render share the predicate instead of restating it', () => {
  const src = read(MODAL)
  // Two hand-written copies of the condition is how a surface ends up
  // dismissing itself and painting at the same time.
  const uses = src.match(/trialOfferDue\(/g) ?? []
  assert.ok(uses.length >= 2, 'both the bail effect and the render must call trialOfferDue')
  assert.match(src, /from ['"]@\/lib\/billing\/trial['"]/)
})

test('onDismiss fires at most once, however often the effect re-runs', () => {
  // onDismiss navigates. The effect is keyed on it, so a parent handing over a
  // fresh closure per render would push /dashboard twice for one decision.
  const src = read(MODAL)
  assert.match(src, /answered\s*=\s*useRef\(false\)/)
  assert.match(src, /if \(answered\.current\) return/)
  assert.match(src, /onContinueFree=\{answer\}/, 'continue free must latch too')
})

// ─── the mount: onboarding → offer → dashboard ───────────────────────────────

test('the offer is mounted by the onboarding page, not by the dashboard', () => {
  // The card: "after the onboarding and before you get to the home dashboard".
  const src = read(ONBOARDING)
  assert.match(src, /import TrialOfferModal from ['"]@\/components\/onboarding\/TrialOfferModal['"]/)
  assert.match(src, /\{showTrialOffer && <TrialOfferModal onDismiss=\{finishOnboarding\} \/>\}/)
})

test('/dashboard is reached ONLY through the offer, never alongside it', () => {
  // The load-bearing bit of wiring, and the one a refactor of handleComplete
  // can silently drop: the profile save must open the offer instead of
  // navigating, or the pop never happens.
  const src = read(ONBOARDING)
  assert.match(src, /setShowTrialOffer\(true\)/)

  const push = 'router.push(\'/dashboard\')'
  const pushes = src.split(push).length - 1
  assert.equal(pushes, 1, 'exactly one push to /dashboard, in the dismiss handler')

  const at = src.indexOf(push)
  const handler = src.slice(src.lastIndexOf('const finishOnboarding', at), at)
  assert.ok(handler.length > 0, 'the one push must live in finishOnboarding')

  // ...and finishOnboarding is stable, so the modal's bail effect cannot fire
  // it twice.
  assert.match(src, /const finishOnboarding = useCallback\(\(\) => \{/)
})
