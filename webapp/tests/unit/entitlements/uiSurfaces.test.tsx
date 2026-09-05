// Run with: npx tsx --test tests/unit/entitlements/uiSurfaces.test.tsx
//
// The launch-day contract, asserted where it can actually be broken.
//
// Everything tier-aware must render NOTHING while ENTITLEMENTS_ENFORCED is off.
// That is what lets the whole monetization epic ship dark, and it is a one-line
// mistake away at all times: drop the `enforced` check from a component and the
// dashboard grows a plan card, the Vision page grows a lock, and the first
// anybody hears about it is a member.
//
// Rendered with renderToStaticMarkup (the house pattern for component tests —
// see collapsibleSection.test.tsx), plus source scans where the property is
// structural rather than visual.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import UpgradeSheet, {
  CheckoutAction,
  checkoutRefusalState,
  dismissLabel,
} from '../../../components/UpgradeSheet'
import {
  allowanceLine,
  featureHeadline,
  formatResetsAt,
  gateFrom,
  planGate,
  syntheticGate,
  tierLabel,
  type GatePayload,
} from '../../../lib/entitlementsClient'

const ROOT = path.join(__dirname, '../../..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

// ─── The 403 → gate parser ───────────────────────────────────────────────────

test('gateFrom accepts a real gate payload', () => {
  const gate = gateFrom(403, {
    error: "You've saved all 3 of your free custom exercises.",
    requiresTier: 'plus',
    feature: 'custom-exercises',
    limit: 3,
    remaining: 0,
    resetsAt: null,
    window: 'lifetime',
  })
  assert.ok(gate)
  assert.equal(gate.feature, 'custom-exercises')
  assert.equal(gate.requiresTier, 'plus')
  assert.equal(gate.limit, 3)
  assert.equal(gate.resetsAt, null)
})

test('gateFrom rejects anything that is not a gate', () => {
  // A 403 from an OWNERSHIP or ROLE check must keep falling through to the
  // caller's ordinary error banner. Raising an upgrade sheet for something
  // money cannot buy is worse than the plain error.
  assert.equal(gateFrom(403, { error: 'Forbidden' }), null, 'no feature/requiresTier')
  assert.equal(gateFrom(403, { error: 'Not your program', feature: 'x' }), null)
  assert.equal(gateFrom(401, { error: 'Unauthorized' }), null, 'not a 403')
  assert.equal(
    gateFrom(200, { error: 'x', feature: 'vision', requiresTier: 'plus' }),
    null,
    'a 200 is never a gate',
  )
  assert.equal(gateFrom(403, null), null)
  assert.equal(gateFrom(403, 'nope'), null)
})

test('gateFrom keeps optional allowance fields off when absent', () => {
  const gate = gateFrom(403, { error: 'Vision is a Plus feature.', feature: 'vision', requiresTier: 'plus' })
  assert.ok(gate)
  assert.equal('limit' in gate, false)
  assert.equal('remaining' in gate, false)
})

// ─── Copy ────────────────────────────────────────────────────────────────────

test('the headline is derived from requiresTier, not hard-coded', () => {
  // A later tier must not need a copy edit in ten components.
  assert.match(featureHeadline('vision', 'plus'), /Vision is a Plus feature/)
  assert.equal(tierLabel('free'), 'Free')
  assert.equal(tierLabel('plus'), 'Plus')
})

test('an inventory headline does not contradict the body under it', () => {
  // "Saved meals are a Plus feature" over "You've saved all 3 of your free
  // meals" is false on its face: the member plainly HAS saved meals. What Plus
  // sells is the removal of the cap, so every capped noun says so.
  for (const f of ['custom-meals', 'custom-exercises', 'custom-programs', 'custom-foods',
                   'custom-sessions'] as const) {
    assert.match(featureHeadline(f, 'plus'), /^Unlimited /, `${f} must headline the cap, not the feature`)
  }
  assert.match(featureHeadline('custom-exercises', 'plus'), /Unlimited custom exercises are a Plus feature/)
})

test('a gate that names no feature headlines the tier, not a random feature', () => {
  // The plan card and the profile Plan row refuse nothing. They used to pass
  // `custom-programs` purely to obtain a sheet, so "See Plus" was headlined
  // "Custom programs are a Plus feature".
  const gate = planGate('Everything in Become, with no limits.')
  assert.equal(gate.feature, undefined)
  assert.equal(featureHeadline(gate.feature, gate.requiresTier), 'What Plus unlocks')
})

test('synthetic copy agrees with itself about number', () => {
  // "Custom exercises is included with Plus." shipped because the pluralisation
  // flag and the label lived in two different maps.
  for (const f of ['custom-meals', 'custom-exercises', 'custom-programs', 'custom-foods',
                   'custom-sessions', 'ai-food-estimate'] as const) {
    assert.match(syntheticGate(f).error, / are included with Plus\.$/, f)
  }
  for (const f of ['workout-generation', 'mind-sessions', 'vision'] as const) {
    assert.match(syntheticGate(f).error, / is included with Plus\.$/, f)
  }
})

test('the allowance line matches the window it describes', () => {
  const lifetime: GatePayload = {
    error: 'x', feature: 'custom-meals', requiresTier: 'plus',
    limit: 3, remaining: 0, resetsAt: null, window: 'lifetime',
  }
  assert.match(allowanceLine(lifetime)!, /Delete one to free a slot/)

  const daily: GatePayload = {
    error: 'x', feature: 'ai-food-estimate', requiresTier: 'plus',
    limit: 1, remaining: 0, resetsAt: '2026-09-02T04:00:00.000Z', window: 'day',
  }
  assert.match(allowanceLine(daily)!, /0 of 1 left\./)
  assert.match(allowanceLine(daily)!, /Resets at midnight\./)

  // Binary features (vision) carry no allowance, so they get no line at all.
  assert.equal(allowanceLine(syntheticGate('vision')), null)
})

test('the way back out of a cap is the one that actually exists', () => {
  // All three are `window: 'lifetime'`, and the window alone cannot tell them
  // apart. Telling a member to delete a session they cannot delete — or to
  // delete their way out of a milestone that never lifts — is worse than
  // saying nothing.
  const at = (feature: GatePayload['feature'], limit: number): GatePayload => ({
    error: 'x', feature, requiresTier: 'plus', limit, remaining: 0, resetsAt: null, window: 'lifetime',
  })
  assert.match(allowanceLine(at('custom-meals', 3))!, /Delete one to free a slot/)
  assert.match(allowanceLine(at('custom-sessions', 3))!, /Unstar one to free a slot/)
  assert.doesNotMatch(allowanceLine(at('custom-sessions', 3))!, /Delete one/)

  const mind = allowanceLine(at('mind-sessions', 10))!
  assert.match(mind, /all 10 of your free sessions/)
  assert.doesNotMatch(mind, /free a slot|Delete one|Unstar one/)
})

test('a proactive lock still shows the cap and the way out', () => {
  // The locked button is the path MOST free members meet — no request was made,
  // so no 403 supplied limit/remaining. Without them allowanceLine() is null
  // and the member is refused with no number and no way back.
  const gate = syntheticGate('custom-exercises', 'plus', {
    limit: 3, remaining: 0, resetsAt: null, window: 'lifetime',
  })
  assert.equal(gate.limit, 3)
  assert.match(allowanceLine(gate)!, /all 3 of your free slots/)
  assert.match(allowanceLine(gate)!, /Delete one to free a slot/)

  // Nothing passed in still means nothing claimed.
  assert.equal(allowanceLine(syntheticGate('custom-exercises')), null)
})

test('resets are phrased from the window, never as a raw timestamp', () => {
  assert.equal(formatResetsAt('2026-09-02T04:00:00.000Z', 'day'), 'at midnight')
  assert.equal(formatResetsAt('2026-09-07T04:00:00.000Z', 'week'), 'on Monday')
  assert.equal(formatResetsAt(null, 'day'), null)
  assert.equal(formatResetsAt('not-a-date', 'day'), null)
})

// ─── UpgradeSheet ────────────────────────────────────────────────────────────

test('UpgradeSheet renders the server wording verbatim', () => {
  // The server owns the refusal copy so the number a member reads can never
  // disagree with the rule that produced it.
  const gate: GatePayload = {
    error: "You've used your free AI food scan for today.",
    feature: 'ai-food-estimate',
    requiresTier: 'plus',
    limit: 1,
    remaining: 0,
    resetsAt: '2026-09-02T04:00:00.000Z',
    window: 'day',
  }
  const html = renderToStaticMarkup(<UpgradeSheet open gate={gate} onClose={() => {}} />)
  assert.ok(html.includes("You&#x27;ve used your free AI food scan for today."))
  assert.match(html, /Unlimited AI food scans is a Plus feature|Unlimited AI food scans are a Plus feature/)

  // ...and NOT a live CTA. Billing has not answered yet in this render, and an
  // "Upgrade to Plus" button that 503s is worse than no button: it is the one
  // thing on the screen a capped member is told to press. It used to render in
  // every state -- including 'unavailable' -- and only swapped AFTER the tap.
  assert.doesNotMatch(html, /Upgrade to Plus/)
  assert.match(html, /Checking availability/)
})

test('UpgradeSheet renders nothing without a gate', () => {
  assert.equal(renderToStaticMarkup(<UpgradeSheet open gate={null} onClose={() => {}} />), '')
})

test('UpgradeSheet issues no request and shows no dead link before billing exists', () => {
  // Billing may simply not be configured -- that is the state Become ships in.
  // The CTA must never render until checkout is known to work.
  const src = readSource('components/UpgradeSheet.tsx')
  assert.match(src, /\/api\/billing\/status/, 'must probe status before offering checkout')
  assert.match(src, /if \(!res\.ok\) \{[\s\S]{0,200}setCheckout\('unavailable'\)/,
    'a 404/503 from the status route must read as not-configured')
  assert.match(src, /checkout !== 'ready'/, 'the CTA must not POST unless status said configured')
  assert.match(
    src,
    /checkoutAvailable === false\) \{\s*\n\s*setCheckout\('unavailable'\)/,
    'a snapshot that already said no must skip the probe entirely',
  )
  assert.match(
    src,
    /state === 'ready' \|\| state === 'starting'/,
    'the CTA renders for a live checkout and nothing else',
  )
  assert.match(src, /Upgrades aren&apos;t open yet/, 'the coming-soon copy must exist')
  // Nothing captures an email anywhere in the app, so nothing may offer one.
  assert.doesNotMatch(src, /email you/i, 'never promise a mail we cannot send')
  // The alert() that used to stand in for this is gone for good.
  assert.doesNotMatch(src, /alert\(/)
})

// ─── A refused checkout is not an absent one ─────────────────────────────────
//
// POST /api/billing/checkout answers with six distinct refusals. The sheet used
// to collapse every one of them — plus a dropped connection — into
// setCheckout('unavailable'), which renders "Upgrades aren't open yet." So a
// member whose CARD FAILED, and a member who hit a one-second Stripe blip, were
// both told the product is not for sale. Nothing re-probes after a refusal, so
// that impression is the last one the sheet ever gives.
//
// Rendered per branch rather than driven through the component: the repo has no
// DOM test environment, and a state only reachable through an effect and a fetch
// is a state no test can see. That is why this shipped.

const COMING_SOON = /Upgrades aren&#x27;t open yet/
const BUY_CTA = /Upgrade to Plus/

const action = (state: ReturnType<typeof checkoutRefusalState>, portalState: 'idle' | 'opening' | 'failed' = 'idle') =>
  renderToStaticMarkup(
    <CheckoutAction
      state={state}
      tierName="Plus"
      portalState={portalState}
      onStart={() => {}}
      onOpenPortal={() => {}}
    />,
  )

test('every refusal the checkout route can answer maps to its own state', () => {
  // 503 / 404 are the ONLY "there is nothing to buy yet" answers.
  assert.equal(checkoutRefusalState(503, { error: 'billing_not_configured' }), 'unavailable')
  assert.equal(checkoutRefusalState(503, null), 'unavailable', 'a 503 with no body still reads')
  assert.equal(checkoutRefusalState(404, null), 'unavailable', 'the route may not exist yet')

  assert.equal(
    checkoutRefusalState(409, { error: 'fix_payment_method', status: 'past_due', portal: '/api/billing/portal' }),
    'fix-payment',
  )
  assert.equal(checkoutRefusalState(409, { error: 'already_subscribed' }), 'already-plus')
  assert.equal(checkoutRefusalState(409, { error: 'already_plus', reason: 'grandfathered' }), 'already-plus')

  // Everything else is transient. None of these may read as "not for sale".
  assert.equal(checkoutRefusalState(502, { error: 'checkout_failed' }), 'error')
  assert.equal(checkoutRefusalState(500, null), 'error', 'a proxy 500 with no JSON')
  assert.equal(checkoutRefusalState(400, { error: 'invalid_plan' }), 'error')
  assert.equal(checkoutRefusalState(401, { error: 'Unauthorized' }), 'error')
  assert.equal(checkoutRefusalState(409, { error: 'something_new' }), 'error', 'unknown 409')
})

test('a failed card is not told the product is unavailable', () => {
  // The 409 the route answers when the member is past_due/unpaid/incomplete.
  const html = action(
    checkoutRefusalState(409, { error: 'fix_payment_method', portal: '/api/billing/portal' }),
  )
  assert.doesNotMatch(html, COMING_SOON, 'a broken card is not a closed shop')
  assert.doesNotMatch(html, BUY_CTA, 'a second subscription is exactly what the route refused')
  assert.match(html, /payment method needs updating/i)
  assert.match(html, /Update payment method/, 'the exit is the billing portal')
})

test('a 503 IS the coming-soon note', () => {
  // The state Become ships in. This branch is the one the old code gave to
  // everything, and it is correct for exactly this.
  const html = action(checkoutRefusalState(503, { error: 'billing_not_configured' }))
  assert.match(html, COMING_SOON)
  assert.doesNotMatch(html, BUY_CTA, 'no purchase CTA when checkout cannot work — the P0')
  assert.doesNotMatch(html, /Update payment method/)
})

test('a member who already has Plus is offered the way out, not a second bill', () => {
  const html = action(checkoutRefusalState(409, { error: 'already_plus', reason: 'admin' }))
  assert.match(html, /already have Plus/)
  assert.doesNotMatch(html, BUY_CTA)
  assert.doesNotMatch(html, COMING_SOON)
  // ...and the dismiss button stops saying "Not now", which implies a purchase
  // still to come.
  assert.equal(dismissLabel(checkoutRefusalState(409, { error: 'already_plus' })), 'Close')
})

test('a Stripe blip offers a retry, never a closed shop', () => {
  const html = action(checkoutRefusalState(502, { error: 'checkout_failed' }))
  assert.doesNotMatch(html, COMING_SOON, 'sticky for the life of the sheet — never from a blip')
  assert.match(html, /Try again/, 'a transient failure must be retryable in place')
  assert.match(html, /nothing was charged/i)
})

test('the live CTA and the availability spinner still render only for their own states', () => {
  assert.match(action('ready'), BUY_CTA)
  assert.doesNotMatch(action('ready'), COMING_SOON)
  assert.match(action('checking'), /Checking availability/)
  assert.doesNotMatch(action('checking'), BUY_CTA)
  // 'starting' is the CTA mid-flight: still a button, disabled.
  assert.match(action('starting'), /disabled=""/)
})

test('the dismiss label admits when there is nothing to come back for', () => {
  assert.equal(dismissLabel('ready'), 'Not now')
  assert.equal(dismissLabel('checking'), 'Not now')
  assert.equal(dismissLabel('starting'), 'Not now')
  assert.equal(dismissLabel('unavailable'), 'Close')
  assert.equal(dismissLabel('fix-payment'), 'Close')
  assert.equal(dismissLabel('error'), 'Close')
})

test('the portal button waits on the request and says so when it fails', () => {
  assert.match(action('fix-payment', 'opening'), /disabled=""/)
  assert.match(action('fix-payment', 'failed'), /Billing didn&#x27;t open just now/)
  assert.doesNotMatch(action('fix-payment', 'failed'), COMING_SOON)
})

test('checkout is posted the field the route actually reads', () => {
  // The sheet posted `{ feature, tier }`; the route reads `plan` and nothing
  // else, so it fell through to its monthly default and the annual price could
  // never be bought from the app. The plan is now explicit — and the TODO names
  // the selector that is still missing, because inventing price copy here is
  // forbidden while no prices exist.
  const src = readSource('components/UpgradeSheet.tsx')
  assert.match(src, /JSON\.stringify\(\{ plan: CHECKOUT_PLAN \}\)/, 'must send `plan`')
  assert.doesNotMatch(
    src,
    /body: JSON\.stringify\(\{ feature/,
    'the route reads nothing out of feature/tier',
  )
  assert.match(src, /TODO\(plan-selector\)/, 'the unreachable annual plan must stay named')
  // No amount, discount, trial length or date. The server owns every one of
  // those words; a currency symbol or a "/mo" here is a promise nothing keeps.
  assert.doesNotMatch(src, /\$\d|\d+\s*%\s*off|\/\s*mo\b|free trial|\d+-day/i)
})

test('the fix-payment exit follows the path the route sent', () => {
  const src = readSource('components/UpgradeSheet.tsx')
  assert.match(
    src,
    /setPortalPath\(readString\(body, 'portal'\)/,
    'the 409 carries the portal path; follow it rather than assuming one',
  )
})

test('the client handles the codes the checkout route actually returns', () => {
  // The seam this closes: the route was hardened to answer distinct codes in one
  // PR while the sheet was rewritten to ignore them in another, and neither
  // could see the other. Read both sides here so a rename on either side fails.
  const route = readSource('app/api/billing/checkout/route.ts')
  const sheet = readSource('components/UpgradeSheet.tsx')
  for (const code of [
    'billing_not_configured',
    'fix_payment_method',
    'already_subscribed',
    'already_plus',
  ]) {
    // `billing_not_configured` is answered by the shared billingNotConfigured()
    // helper, so it is asserted against that module instead of the route body.
    const src = code === 'billing_not_configured' ? readSource('lib/billing/config.ts') : route
    assert.match(src, new RegExp(code), `the server must still answer ${code}`)
    assert.match(sheet, new RegExp(code), `the sheet must still distinguish ${code}`)
  }
})

// ─── The kill-switch contract ────────────────────────────────────────────────

test('every tier surface bails out when enforcement is off', () => {
  // Asserted as a source scan rather than a render because these components
  // read the snapshot through a hook. The check is the whole contract; losing
  // it is what a launch-day regression looks like.
  for (const file of [
    'components/dashboard/PlanCard.tsx',
    'components/profile/PlanRow.tsx',
    'components/TierGate.tsx',
  ]) {
    const src = readSource(file)
    assert.match(
      src,
      /data\.enforced === false/,
      `${file} must render nothing while ENTITLEMENTS_ENFORCED is off`,
    )
  }
})

test('PlanCard and PlanRow return null (not a placeholder) when unenforced', () => {
  for (const file of ['components/dashboard/PlanCard.tsx', 'components/profile/PlanRow.tsx']) {
    assert.match(
      readSource(file),
      /if \(!data \|\| data\.enforced === false\) return null/,
      `${file} must return null`,
    )
  }
})

test('locked/teaser copy is hidden behind the switch on every counter surface', () => {
  // The inline "n/3 this week" and "n of 1 scans left today" hints.
  for (const file of ['components/GenerateModal.tsx', 'components/nutrition/SnapPlateModal.tsx']) {
    assert.match(
      readSource(file),
      /entitlements\?\.enforced/,
      `${file} must gate its allowance hint on the switch`,
    )
  }
})

// ─── canCreate, not allowed ──────────────────────────────────────────────────

test('create surfaces read canCreate; they never recompute it', () => {
  // `allowed` is "may they touch this at all" and is TRUE for a capped free
  // member — that is what lets them edit and delete their own data. A create
  // button wired to `allowed` is silently ungated.
  for (const file of [
    'app/dashboard/programs/new/NewProgramClient.tsx',
    'app/dashboard/programs/mine/MyProgramsClient.tsx',
    'app/dashboard/workout/library/ExerciseLibraryClient.tsx',
    'app/dashboard/nutrition/page.tsx',
  ]) {
    const src = readSource(file)
    assert.match(src, /canCreate/, `${file} must gate creation on canCreate`)
    assert.doesNotMatch(
      src,
      /features\?\.\[['"][a-z-]+['"]\]\?\.allowed/,
      `${file} must not read raw .allowed for a create decision`,
    )
  }
})

test('the exercise library keeps delete enabled at the cap', () => {
  // Deleting is the ONLY way back under an inventory cap. A locked delete is a
  // permanent lockout, so the lock is on create and nowhere else.
  const src = readSource('app/dashboard/workout/library/ExerciseLibraryClient.tsx')
  const deleteAt = src.indexOf('handleDelete')
  assert.ok(deleteAt > 0)
  assert.doesNotMatch(src.slice(deleteAt, deleteAt + 1200), /canCreate|setGate\(/)
})

test('nobody fetches /api/me/entitlements outside the shared hook', () => {
  // Three surfaces used to each roll their own fetch and derive their own
  // answer — which is how a client ends up disagreeing with the server.
  // Only a CALL counts — the path written as a string. Prose mentions in doc
  // comments (the route's own header, the allowance contract) are not callers.
  const CALLS = /['"`]\/api\/me\/entitlements/
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry.name) && CALLS.test(fs.readFileSync(full, 'utf8'))) {
        offenders.push(path.relative(ROOT, full))
      }
    }
  }
  for (const dir of ['app', 'components', 'hooks', 'lib']) walk(path.join(ROOT, dir))
  assert.deepEqual(
    offenders.sort(),
    ['hooks/useEntitlements.ts'],
    'only the shared hook may call this endpoint',
  )
})
