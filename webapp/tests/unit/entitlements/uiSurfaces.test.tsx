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
import UpgradeSheet from '../../../components/UpgradeSheet'
import {
  allowanceLine,
  featureHeadline,
  formatResetsAt,
  gateFrom,
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
  assert.match(featureHeadline('custom-exercises', 'plus'), /Custom exercises are a Plus feature/)
  assert.equal(tierLabel('free'), 'Free')
  assert.equal(tierLabel('plus'), 'Plus')
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
  assert.match(html, /Upgrade to Plus/)
  assert.match(html, /Unlimited AI food scans is a Plus feature|Unlimited AI food scans are a Plus feature/)
})

test('UpgradeSheet renders nothing without a gate', () => {
  assert.equal(renderToStaticMarkup(<UpgradeSheet open gate={null} onClose={() => {}} />), '')
})

test('UpgradeSheet issues no request and shows no dead link before billing exists', () => {
  // Stage 5 owns /api/billing/*. Until then the CTA must degrade to a
  // coming-soon state rather than navigating somewhere that 404s.
  const src = readSource('components/UpgradeSheet.tsx')
  assert.match(src, /\/api\/billing\/status/, 'must probe status before offering checkout')
  assert.match(src, /if \(!res\.ok\) \{[\s\S]{0,200}setCheckout\('unavailable'\)/,
    'a 404/503 from the status route must read as not-configured')
  assert.match(src, /checkout !== 'ready'/, 'the CTA must not POST unless status said configured')
  assert.match(src, /Upgrades go live shortly/, 'the coming-soon copy must exist')
  // The alert() that used to stand in for this is gone for good.
  assert.doesNotMatch(src, /alert\(/)
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
