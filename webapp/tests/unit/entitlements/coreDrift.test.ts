// Run with: npm run test:file tests/unit/entitlements/coreDrift.test.ts
//
// THE GATE COPY LIVES ONCE, AND THIS IS WHAT HOLDS THE TWO TREES TO IT.
//
// Decision NP-017: the entitlement model, the free-tier limits, the gate copy
// and the 403 parser live in `@become/core` and both apps import them.
// `lib/entitlementsClient.ts` is a re-export of `@become/core/entitlements` and
// carries no logic of its own; `expo/lib/entitlements` re-exports the same
// module through Metro's `file:` link (NP-049).
//
// But the two do not resolve the SAME BYTES. The webapp consumes `@become/core`
// as a PUBLISHED package from https://registry.redbtn.io/ (it must: RedRun
// builds `webapp/` alone with the build context set to `webapp/`, so an import
// of `../shared/*` from app code passes CI and breaks every production build —
// which is exactly what happened for four and a half hours on 2026-09-30).
// Native bundles `shared/core/src` off disk. So until redsync publishes on
// merge, a change to `shared/core/src/entitlements.ts` that has not been
// published and pinned means the phone and the browser are running different
// copy — and NOTHING would say so:
//
//   • `tests/unit/entitlements/uiSurfaces.test.tsx` pins the strings the WEB
//     renders, i.e. the published package;
//   • `shared/core/tests/entitlements.test.ts` pins the strings the SOURCE
//     produces, i.e. what the phone renders.
//
// Both are green while the two disagree. This file is the one that reads them
// side by side: it imports the webapp's module (the published package) and the
// shared SOURCE the native app bundles, and fails when they differ in behaviour.
//
// Importing `../shared` from a TEST is allowed and is the house pattern — see
// tests/unit/contract/sharedApiTypes.test.ts, which does the same for
// shared/api-client. App code may never do it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// What the WEB renders: `@become/core/entitlements` out of node_modules.
import * as web from '../../../lib/entitlementsClient'
// What the PHONE renders: the source Metro bundles and shared/core publishes.
import * as native from '../../../../shared/core/src/entitlements'

const ROOT = path.join(__dirname, '../../..')
const readWeb = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8')

// ─── No second copy ──────────────────────────────────────────────────────────

test('lib/entitlementsClient.ts is a re-export of @become/core and nothing else', () => {
  const client = readWeb('lib/entitlementsClient.ts')
  assert.match(
    client,
    /export\s+\*\s+from\s+['"]@become\/core\/entitlements['"]/,
    'the webapp module must re-export @become/core/entitlements',
  )
  // Comments stripped: prose about the copy is not the copy.
  const code = client
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  assert.doesNotMatch(
    code,
    /export\s+(const|function|class|interface|type|enum)\s/,
    'a declaration here is a SECOND source of truth for what a member is told at a cap',
  )
  assert.doesNotMatch(code, /\.\.\/shared/, 'webapp app code may never reach into ../shared')
})

test('@become/core is a declared dependency, resolved from the registry', () => {
  const pkg = JSON.parse(readWeb('package.json')) as {
    dependencies?: Record<string, string>
  }
  const pinned = pkg.dependencies?.['@become/core']
  assert.ok(pinned, 'webapp must depend on @become/core')
  assert.doesNotMatch(
    pinned,
    /^(file:|link:|\.\.?\/)/,
    'the webapp build context is webapp/ — a file: link here breaks the production image',
  )
})

// ─── The same exports ────────────────────────────────────────────────────────

/** The value exports of a module namespace, however it was interop-wrapped. */
const exportNames = (mod: object): string[] =>
  Object.keys(mod)
    .filter((name) => name !== 'default' && name !== '__esModule')
    .sort()

test('the published package and the shared source export the same names', () => {
  assert.deepEqual(
    exportNames(web),
    exportNames(native),
    'the entitlements module has drifted: publish shared/core and pin the new version in webapp/package.json',
  )
})

// ─── The same tables ─────────────────────────────────────────────────────────

test('the tier model, the free limits and the labels are identical', () => {
  assert.deepEqual(web.TIERS, native.TIERS)
  assert.deepEqual(web.TIER_RANK, native.TIER_RANK)
  assert.equal(web.DEFAULT_TIER, native.DEFAULT_TIER)
  assert.deepEqual(web.FEATURE_MIN_TIER, native.FEATURE_MIN_TIER)
  assert.deepEqual([...web.FEATURES].sort(), [...native.FEATURES].sort())
  assert.deepEqual(web.FREE_LIMITS, native.FREE_LIMITS)
  assert.deepEqual(web.FEATURE_LABELS, native.FEATURE_LABELS)
  assert.deepEqual(web.FEATURE_NOUN, native.FEATURE_NOUN)
  assert.deepEqual(web.PLUS_BENEFITS, native.PLUS_BENEFITS)
  assert.deepEqual([...web.MANAGEABLE_STATUSES], [...native.MANAGEABLE_STATUSES])
})

// ─── The same behaviour ──────────────────────────────────────────────────────
//
// Every pure function, over the inputs that actually reach it: a gate body the
// server sends, every capped and uncapped feature, both windows, and the
// refusals that must NOT be gates.

const FEATURES = [...native.FEATURES]

test('gateFrom parses (and refuses) identically', () => {
  const bodies: [number, unknown][] = [
    [403, { error: "You've saved all 3 of your free custom exercises.", requiresTier: 'plus',
            feature: 'custom-exercises', limit: 3, remaining: 0, resetsAt: null, window: 'lifetime' }],
    [403, { error: 'Vision is a Plus feature.', feature: 'vision', requiresTier: 'plus' }],
    [403, { error: 'Not your program' }],
    [403, { error: 'Nope', requiresTier: 'plus' }],
    [403, { error: 'Nope', feature: 'vision' }],
    [403, { error: '', feature: 'vision', requiresTier: 'plus' }],
    [403, null],
    [403, 'nope'],
    [401, { error: 'Unauthorized' }],
    [429, { error: 'Slow down', reason: 'rate_limit' }],
    [200, { error: 'x', feature: 'vision', requiresTier: 'plus' }],
  ]
  for (const [status, body] of bodies) {
    assert.deepEqual(
      web.gateFrom(status, body),
      native.gateFrom(status, body),
      `gateFrom(${status}, ${JSON.stringify(body)}) differs`,
    )
  }
})

test('every headline, synthetic gate and allowance line is the same string', () => {
  for (const feature of FEATURES) {
    assert.equal(
      web.featureHeadline(feature, 'plus'),
      native.featureHeadline(feature, 'plus'),
      `featureHeadline(${feature}) differs`,
    )
    assert.deepEqual(
      web.syntheticGate(feature),
      native.syntheticGate(feature),
      `syntheticGate(${feature}) differs`,
    )
    const limit = native.FREE_LIMITS[feature].limit
    const window = native.FREE_LIMITS[feature].window
    for (const remaining of [0, 1, limit]) {
      const gate = {
        error: 'x',
        requiresTier: 'plus' as const,
        feature,
        limit,
        remaining,
        resetsAt: '2026-10-05T04:00:00.000Z',
        window,
      }
      assert.equal(
        web.allowanceLine(gate),
        native.allowanceLine(gate),
        `allowanceLine(${feature}, ${remaining}/${limit}) differs`,
      )
      assert.deepEqual(
        web.syntheticGate(feature, 'plus', {
          limit,
          remaining,
          resetsAt: gate.resetsAt,
          window,
        }),
        native.syntheticGate(feature, 'plus', {
          limit,
          remaining,
          resetsAt: gate.resetsAt,
          window,
        }),
        `syntheticGate(${feature}) with an allowance differs`,
      )
    }
  }
  // …and the sheet that names no feature at all.
  assert.equal(web.featureHeadline(undefined, 'plus'), native.featureHeadline(undefined, 'plus'))
  assert.deepEqual(web.planGate('Everything, no limits.'), native.planGate('Everything, no limits.'))
  assert.equal(web.allowanceLine({ error: 'x', requiresTier: 'plus' }), null)
  assert.equal(native.allowanceLine({ error: 'x', requiresTier: 'plus' }), null)
})

test('a reset is phrased from the window, identically', () => {
  const stamps = ['2026-10-01T04:00:00.000Z', '2026-10-05T04:00:00.000Z', 'not a date', null]
  const windows = ['day', 'week', 'lifetime', undefined] as const
  for (const stamp of stamps) {
    for (const window of windows) {
      assert.equal(
        web.formatResetsAt(stamp, window),
        native.formatResetsAt(stamp, window),
        `formatResetsAt(${stamp}, ${window}) differs`,
      )
    }
  }
})

test('tierLabel and hasManageableBilling agree', () => {
  for (const tier of ['free', 'plus', 'trainer']) {
    assert.equal(web.tierLabel(tier), native.tierLabel(tier))
  }
  const now = new Date('2026-09-30T12:00:00.000Z')
  const subscriptions = [
    null,
    { status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false },
    { status: 'past_due', currentPeriodEnd: null, cancelAtPeriodEnd: false },
    { status: 'none', currentPeriodEnd: null, cancelAtPeriodEnd: false },
    { status: 'canceled', currentPeriodEnd: '2026-10-30T12:00:00.000Z', cancelAtPeriodEnd: true },
    { status: 'canceled', currentPeriodEnd: '2026-08-30T12:00:00.000Z', cancelAtPeriodEnd: true },
    { status: 'canceled', currentPeriodEnd: null, cancelAtPeriodEnd: true },
  ]
  for (const subscription of subscriptions) {
    assert.equal(
      web.hasManageableBilling(subscription, now),
      native.hasManageableBilling(subscription, now),
      `hasManageableBilling(${JSON.stringify(subscription)}) differs`,
    )
  }
})

test('the comparison would actually notice a drift', () => {
  // Without this, a table that silently stopped being compared would read as
  // parity. A one-word copy change, and one changed limit, both have to fail.
  const driftedHeadline = (): string => 'Unlimited custom exercises are a Pro feature'
  assert.throws(
    () => assert.equal(web.featureHeadline('custom-exercises', 'plus'), driftedHeadline()),
    /AssertionError/,
  )
  const driftedLimits = {
    ...native.FREE_LIMITS,
    vision: { limit: 1, kind: 'inventory', window: 'lifetime' },
  }
  assert.throws(
    () => assert.deepEqual(web.FREE_LIMITS, driftedLimits),
    /AssertionError/,
  )
})
