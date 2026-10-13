// Run with: npm run test:file tests/unit/entitlements/planPage.test.tsx
//
// The plan comparison page (app/dashboard/plan) is the only surface in the app
// that makes COMMERCIAL claims: what a free member gets, what Plus removes, and
// what it costs. Every one of those is a promise, and each of the three has its
// own way of going quietly wrong:
//
//   • the allowance table can DRIFT — hard-code "3 custom exercises" and the day
//     FREE_LIMITS changes, the page lies. So the page is handed the real map and
//     this file re-derives every cell from it.
//   • the FREE list can go STALE — "food logging is free" stops being true the
//     moment somebody adds a guard to that route. So each free claim names the
//     route that serves it and this file asserts that route gates on nothing
//     (bar a cap the claim itself names).
//   • the PRICES can disagree with themselves — "$119.99, save $59.89, 33% off"
//     is three numbers derived from two, and hand-editing one of them is a
//     rounding error away at all times. So the arithmetic is recomputed here.
//
// Nothing may be invented: there is no trial implemented anywhere in Become, no
// discount, no refund policy and no launch date, so none of those words may
// appear. That is asserted as a source scan, because a fabricated claim is one
// sentence someone adds in a hurry.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { FEATURES, FREE_LIMITS, FEATURE_MIN_TIER, type Feature } from '../../../lib/entitlements'
import { FEATURE_LABELS } from '../../../lib/entitlementsClient'
import { MAX_CHAPTER, SESSIONS_PER_CHAPTER } from '../../../lib/mindXP'
import {
  ANNUAL_SAVING_LINE,
  FREE_FOREVER,
  PLAN_PRICING,
  ROW_ORDER,
  freeCell,
  orderRows,
  plusCell,
  type PlanFeatureRow,
} from '../../../lib/planCopy'
import {
  FreeForever,
  PlanComparison,
  PlanPricing,
  usageLine,
} from '../../../app/dashboard/plan/PlanPageClient'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

/** React escapes text nodes, so a label with an apostrophe is not itself in the
 *  markup. Escape the expectation rather than avoiding apostrophes in copy. */
const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')

/** Exactly what app/dashboard/plan/page.tsx builds on the server. */
const ROWS: PlanFeatureRow[] = FEATURES.map((feature) => ({
  feature,
  requiresTier: FEATURE_MIN_TIER[feature],
  limit: FREE_LIMITS[feature].limit,
  kind: FREE_LIMITS[feature].kind,
  window: FREE_LIMITS[feature].window,
}))

const MIND_TOTAL = SESSIONS_PER_CHAPTER * MAX_CHAPTER

// ─── Prices ──────────────────────────────────────────────────────────────────

const cents = (n: number) => Math.round(n * 100)
const usd = (c: number) => `$${(c / 100).toFixed(2)}`

test('the prices the page shows are the prices in the constant', () => {
  // One constant, one place to change them — and the rendered strings are that
  // constant, not a second copy of it.
  assert.equal(PLAN_PRICING.monthly.display, usd(cents(PLAN_PRICING.monthly.amount)))
  assert.equal(PLAN_PRICING.annual.display, usd(cents(PLAN_PRICING.annual.amount)))
  assert.equal(PLAN_PRICING.monthly.display, '$14.99')
  assert.equal(PLAN_PRICING.annual.display, '$119.99')
})

test('every derived annual figure is recomputed from the two real prices', () => {
  // "Save $59.89 — 33% off" is arithmetic, not marketing. If someone changes the
  // annual price and not the saving, this is the line that catches it.
  const monthly = cents(PLAN_PRICING.monthly.amount)
  const annual = cents(PLAN_PRICING.annual.amount)
  const yearAtMonthly = monthly * 12

  assert.equal(usd(yearAtMonthly - annual), PLAN_PRICING.annual.savesDisplay, 'annual saving')
  // Rounded DOWN — a percentage claim must never be generous to itself.
  const pct = Math.floor(((yearAtMonthly - annual) / yearAtMonthly) * 100)
  assert.equal(`${pct}%`, PLAN_PRICING.annual.savesPercentDisplay)
  assert.equal(usd(Math.round(annual / 12)), PLAN_PRICING.annual.perMonthDisplay, 'per-month')

  // ...and annual is genuinely cheaper, which is what the badge claims.
  assert.ok(annual < yearAtMonthly)
})

test('the saving sentence quotes the same two figures', () => {
  assert.ok(ANNUAL_SAVING_LINE.includes(PLAN_PRICING.annual.savesDisplay))
  assert.ok(ANNUAL_SAVING_LINE.includes(PLAN_PRICING.annual.savesPercentDisplay))
})

/**
 * Source with comments removed, so a scan for a forbidden CLAIM cannot be
 * tripped by the comment that explains why the claim is forbidden. Only what
 * ships to a member matters here.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

test('nothing on the plan surface invents a trial, a discount or a deadline', () => {
  // None of these exist in Become. There is no trial implemented anywhere, no
  // promotional price in code, no refund policy written down, and no launch
  // date that anybody has committed to. Scanned over the CODE, comments
  // stripped -- prose about a rule is not a breach of it.
  const FORBIDDEN: [RegExp, string][] = [
    [/free trial|\btrial\b/i, 'no trial is implemented'],
    [/\bmoney[- ]?back\b|\brefund/i, 'no refund policy exists'],
    [/\bguarantee/i, 'nothing is guaranteed'],
    [/limited time|ends (soon|today)|act now|while it lasts/i, 'no deadline exists'],
    [/\d+\s*(members|users|athletes|people) (use|trust|joined)/i, 'no user counts'],
    [/lose \d+\s*(lb|kg|pounds)|results in \d+/i, 'no results claims'],
    [/\bcoupon\b|\bpromo code\b/i, 'promo codes are a Stripe dashboard concern'],
  ]
  for (const file of [
    'lib/planCopy.ts',
    'app/dashboard/plan/PlanPageClient.tsx',
    'app/dashboard/plan/page.tsx',
  ]) {
    const src = stripComments(read(file))
    for (const [re, why] of FORBIDDEN) {
      assert.doesNotMatch(src, re, `${file}: ${why}`)
    }
  }
})

test('the upgrade sheet still names no amount', () => {
  // Prices live in exactly one module. The sheet links to the plan page instead,
  // so a price change can never leave a stale number in a bottom sheet.
  const src = read('components/UpgradeSheet.tsx')
  assert.doesNotMatch(src, /\$\d/, 'no amount in the sheet')
  assert.match(src, /\/dashboard\/plan/, 'the sheet must link to the plan page')
  assert.match(src, /See everything in/, 'and say what the link is for')
})

// ─── The comparison table is generated, never typed out ──────────────────────

test('the free column is derived from the real allowance', () => {
  const cell = (f: Feature) => freeCell(ROWS.find((r) => r.feature === f)!)
  assert.equal(cell('ai-food-estimate'), '1 a day')
  assert.equal(cell('workout-generation'), '3 a week')
  for (const f of [
    'custom-programs',
    'custom-sessions',
    'custom-exercises',
    'custom-meals',
    'custom-foods',
  ] as const) {
    assert.equal(cell(f), '3', f)
  }
  assert.equal(cell('mind-sessions'), 'First 10')
  assert.equal(cell('vision'), 'Not included')
})

test('the plus column sells the removal of the cap, not the feature', () => {
  const cell = (f: Feature) => plusCell(ROWS.find((r) => r.feature === f)!, MIND_TOTAL)
  assert.equal(cell('custom-exercises'), 'Unlimited')
  assert.equal(cell('ai-food-estimate'), 'Unlimited')
  // A milestone cannot be "unlimited" — the path has a length.
  assert.equal(cell('mind-sessions'), `All ${MIND_TOTAL}`)
  // Vision has no free allowance at all, so there is no cap to remove.
  assert.equal(cell('vision'), 'Included')
})

test('the Mind row states the whole path, not just the free slice', () => {
  // "First 10" alone reads as a small perk. 10 of 50 is what is on offer, and
  // 50 is derived (5 chapters × 10 sessions), never typed out.
  assert.equal(MIND_TOTAL, 50)
  const html = renderToStaticMarkup(
    <PlanComparison rows={ROWS} mindTotalSessions={MIND_TOTAL} snapshot={null} />,
  )
  assert.match(html, /First 10/)
  assert.match(html, /All 50/)
  assert.match(html, /The Mind path runs 50 sessions\./)
})

test('every gated feature appears in the table, in a defined order', () => {
  // The page renders what the SERVER handed it. A feature added to
  // FEATURE_MIN_TIER shows up automatically; ROW_ORDER only sorts.
  const ordered = orderRows(ROWS)
  assert.equal(ordered.length, FEATURES.length, 'ordering must not drop a row')
  assert.deepEqual(
    ordered.map((r) => r.feature).sort(),
    [...FEATURES].sort(),
    'ordering must not invent a row either',
  )
  assert.deepEqual(
    [...ROW_ORDER].sort(),
    [...FEATURES].sort(),
    'ROW_ORDER is stale — a feature would be appended unsorted at the end',
  )

  const html = renderToStaticMarkup(
    <PlanComparison rows={ROWS} mindTotalSessions={MIND_TOTAL} snapshot={null} />,
  )
  for (const f of FEATURES) {
    assert.ok(html.includes(esc(FEATURE_LABELS[f])), `${f} is missing from the comparison`)
  }
})

test('a row with an unknown feature is appended, never dropped', () => {
  // The failure this prevents is silent: a new gated feature that nobody adds to
  // ROW_ORDER must still be advertised, or the page under-states the plan.
  const extra = { ...ROWS[0], feature: 'brand-new' as Feature }
  const ordered = orderRows([...ROWS, extra])
  assert.equal(ordered.length, ROWS.length + 1)
  assert.equal(ordered[ordered.length - 1].feature, 'brand-new')
})

// ─── The member's own numbers ────────────────────────────────────────────────

const ent = (over: Partial<{ limit: number | null; used: number; canCreate: boolean }>) => ({
  allowed: true,
  canCreate: true,
  requiresTier: 'plus' as const,
  limit: 3 as number | null,
  used: 0,
  remaining: 3 as number | null,
  resetsAt: null,
  window: 'lifetime' as const,
  ...over,
})

test('usage reads canCreate, never allowed', () => {
  // `allowed` is TRUE for a capped free member on purpose — that is what lets
  // them edit and delete their own rows. Reading it here would draw a member at
  // 3/3 as if they had room.
  const row = ROWS.find((r) => r.feature === 'custom-exercises')!
  const capped = usageLine(ent({ used: 3, limit: 3, canCreate: false }), row)
  assert.equal(capped?.text, '3 of 3 used')
  assert.equal(capped?.atLimit, true, 'allowed:true must not read as "room left"')

  const room = usageLine(ent({ used: 2, limit: 3 }), row)
  assert.equal(room?.text, '2 of 3 used')
  assert.equal(room?.atLimit, false)
})

test('a windowed allowance says which window it is counting', () => {
  const daily = ROWS.find((r) => r.feature === 'ai-food-estimate')!
  assert.equal(usageLine(ent({ limit: 1, used: 1 }), daily)?.text, '1 of 1 used today')
  const weekly = ROWS.find((r) => r.feature === 'workout-generation')!
  assert.equal(usageLine(ent({ limit: 3, used: 1 }), weekly)?.text, '1 of 3 used this week')
})

test('an uncapped member and a zero-allowance feature get no counter', () => {
  const row = ROWS.find((r) => r.feature === 'custom-exercises')!
  // Plus: limit comes back null (uncapped) — there is nothing to count.
  assert.equal(usageLine(ent({ limit: null }), row), null)
  // Vision: no free allowance at all, so "0 of 0 used" would be noise.
  assert.equal(usageLine(ent({ limit: 0 }), ROWS.find((r) => r.feature === 'vision')!), null)
  assert.equal(usageLine(null, row), null)
})

test('a count is never drawn above its own limit', () => {
  // used can legitimately exceed limit: a denied claim still increments, which
  // is a deliberate abuse signal. "4 of 3 used" is not something to show.
  const row = ROWS.find((r) => r.feature === 'custom-exercises')!
  assert.equal(usageLine(ent({ used: 7, limit: 3, canCreate: false }), row)?.text, '3 of 3 used')
})

// ─── The CTA is honest ───────────────────────────────────────────────────────

const pricing = (state: Parameters<typeof PlanPricing>[0]['checkout'], available = { monthly: true, annual: true }) =>
  renderToStaticMarkup(
    <PlanPricing
      checkout={state}
      available={available}
      portalState="idle"
      onStart={() => {}}
      onOpenPortal={() => {}}
    />,
  )

const COMING_SOON = /Upgrades aren&#x27;t open yet/
const BUY = /Choose (monthly|annual)/

test('billing not configured — the prices are shown and NO purchase button is', () => {
  // This is the state Become is in today: /api/billing/status answers
  // configured:false, so checkout cannot complete. Showing the price is honest;
  // showing a button that 503s is not.
  const html = pricing('unavailable')
  assert.match(html, /\$14\.99/)
  assert.match(html, /\$119\.99/)
  assert.doesNotMatch(html, BUY, 'no purchase CTA while checkout cannot work')
  assert.match(html, COMING_SOON, 'the sheet-identical coming-soon note')
  assert.match(html, /Everything you&#x27;ve made stays yours/)
})

test('while availability is unknown there is still no button', () => {
  const html = pricing('checking')
  assert.doesNotMatch(html, BUY)
  assert.match(html, /Checking availability/)
})

test('once checkout is live each plan gets its own CTA', () => {
  const html = pricing('ready')
  assert.match(html, /Choose monthly/)
  assert.match(html, /Choose annual/)
  assert.doesNotMatch(html, COMING_SOON)
})

test('a plan with no Stripe price gets no button of its own', () => {
  // priceIdForPlan() resolves per plan. An annual CTA posted against an unset
  // stripePricePlusAnnual comes back 503 billing_not_configured — a dead button
  // on a live checkout, which is the one case the single `checkoutAvailable`
  // bit cannot see.
  const html = pricing('ready', { monthly: true, annual: false })
  assert.match(html, /Choose monthly/)
  assert.doesNotMatch(html, /Choose annual/)
  assert.match(html, /Not available yet\./)
})

test('a refused checkout keeps the sheet meanings, not new ones', () => {
  // Same component, so "your card failed" can never drift into "not for sale"
  // on one surface and not the other.
  assert.match(pricing('fix-payment'), /payment method needs updating/i)
  assert.doesNotMatch(pricing('fix-payment'), COMING_SOON)
  assert.match(pricing('error'), /Try again/)
  assert.doesNotMatch(pricing('error'), COMING_SOON)
  assert.match(pricing('already-plus'), /already have Plus/)
})

test('the page posts the plan the checkout route actually reads', () => {
  const src = read('app/dashboard/plan/PlanPageClient.tsx')
  assert.match(src, /JSON\.stringify\(\{ plan \}\)/, 'the route reads `plan` and nothing else')
  assert.match(src, /onStart\(plan\)/, 'each CTA passes its own plan')
  assert.match(src, /BillingPlan/, 'the plan union is type-checked, not stringly typed')
  // Both periods must be reachable — the annual price being unbuyable from the
  // app is exactly the gap this page closes.
  assert.match(src, /monthly: 'Choose monthly'/)
  assert.match(src, /annual: 'Choose annual'/)
})

// ─── "Free forever" has to still be free ─────────────────────────────────────

const GUARDS = [
  'requireQuota',
  'requireQuotaForUser',
  'requireFeature',
  'peekQuota',
  'requireAiAllowance',
  'requireAiFeature',
]

/** Features this file passes to an entitlement guard. */
function guardedFeatures(src: string): Feature[] {
  return FEATURES.filter((f) =>
    new RegExp(`(?:${GUARDS.join('|')})\\s*\\([\\s\\S]{0,160}?['"]${f}['"]`).test(src),
  )
}

test('everything advertised as free is actually ungated', () => {
  // The mirror of enforcementCoverage.test.ts: that one fails when a feature is
  // ADVERTISED and enforced by nothing; this one fails when a surface is
  // advertised as FREE and has quietly grown a gate.
  assert.ok(FREE_FOREVER.length > 0)
  for (const item of FREE_FOREVER) {
    assert.ok(item.evidence.length > 0, `${item.label} names no route`)
    for (const file of item.evidence) {
      // Throws if the route was moved or deleted — a free claim pointing at
      // nothing is its own kind of stale.
      const src = read(file)
      const gated = guardedFeatures(src)
      const allowed = new Set<Feature>(item.cappedBy ?? [])
      const unexpected = gated.filter((f) => !allowed.has(f))
      assert.deepEqual(
        unexpected,
        [],
        `${file} is advertised as free on the plan page but gates on: ${unexpected.join(', ')}. ` +
          'Either name the cap in FREE_FOREVER[].cappedBy, or stop advertising it as free.',
      )
    }
  }
})

test('a named cap is a real feature, and is in the comparison table', () => {
  // "Logging is free; starring is capped" is only honest if the cap it points at
  // is one the member can go and read about in the table above.
  for (const item of FREE_FOREVER) {
    for (const f of item.cappedBy ?? []) {
      assert.ok(FEATURES.includes(f), `${item.label} names "${f}", which is not a feature`)
    }
  }
})

test('the free list renders, and promises nothing it cannot keep', () => {
  const html = renderToStaticMarkup(<FreeForever />)
  for (const item of FREE_FOREVER) {
    assert.ok(html.includes(esc(item.label)), `${item.label} is missing`)
  }
  // The only commitment in this block is one the app already keeps.
  assert.match(html, /No plan needed/)
  assert.doesNotMatch(html, /trial|forever free|guarantee/i)
})
