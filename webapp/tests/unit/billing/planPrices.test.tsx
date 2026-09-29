// Run with: npm run test:file tests/unit/billing/planPrices.test.tsx
//
// GET /api/billing/plans is the ONLY way a native build learns what Plus costs.
// It cannot read lib/planCopy.ts, and a shipped binary cannot be re-released
// because a price moved — so two things have to be true forever, and neither is
// visible in a diff:
//
//   1. THE API SAYS WHAT THE WEB PAGE SAYS. Two renderings of one plan that
//      disagree is a member charged an amount they did not read. So this file
//      renders the REAL plan page components and asserts that every string the
//      route serves appears in that markup — not a fixture, the page.
//   2. THE API FOLLOWS THE CONSTANT, not a copy of it. Editing PLAN_PRICING has
//      to change the response with no other edit anywhere, so the payload is
//      built per call and the test below mutates the constant and watches the
//      body move. A snapshot taken at module load would pass every other
//      assertion here and still ship a stale price.
//
// The arithmetic itself ($59.89, 33%, $10.00 a month, recomputed from the two
// real prices) belongs to tests/unit/entitlements/planPage.test.tsx and is not
// repeated here; this file is about the wire.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { renderToStaticMarkup } from 'react-dom/server'
import { GET } from '../../../app/api/billing/plans/route'
import { buildPlansPayload, type PlansPayload } from '../../../lib/billing/plans'
import { signToken } from '../../../lib/auth'
import { FEATURES, FREE_LIMITS, FEATURE_MIN_TIER } from '../../../lib/entitlements'
import { FEATURE_LABELS } from '../../../lib/entitlementsClient'
import { MAX_CHAPTER, SESSIONS_PER_CHAPTER } from '../../../lib/mindXP'
import { RENEWAL_TERMS, renewalLine } from '../../../lib/legal'
import {
  ANNUAL_SAVING_LINE,
  FREE_FOREVER,
  FREE_FOREVER_NOTE,
  PLAN_PRICING,
  freeCell,
  orderRows,
  plusCell,
  type PlanFeatureRow,
} from '../../../lib/planCopy'
import {
  FreeForever,
  PlanComparison,
  PlanPricing,
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

async function fetchPlans(withToken: boolean): Promise<Response> {
  const headers = new Headers()
  if (withToken) {
    const token = await signToken({ userId: '65f0000000000000000000ab', email: 'plans@example.com' })
    headers.set('Authorization', `Bearer ${token}`)
  }
  return GET(new NextRequest('http://localhost/api/billing/plans', { headers }))
}

const body = async (): Promise<PlansPayload> => (await (await fetchPlans(true)).json()) as PlansPayload

// ─── The wire ────────────────────────────────────────────────────────────────

test('the route answers 200 with the payload the constants build', async () => {
  const res = await fetchPlans(true)
  assert.equal(res.status, 200)
  // Nothing is reshaped on the way out — the route is the builder plus auth.
  assert.deepEqual(await res.json(), JSON.parse(JSON.stringify(buildPlansPayload())))
})

test('an unauthenticated call is 401 and carries no copy at all', async () => {
  const res = await fetchPlans(false)
  assert.equal(res.status, 401)
  assert.deepEqual(await res.json(), { error: 'Unauthorized' })
})

// ─── The prices are the constant, not a second copy ──────────────────────────

test('every price string is PLAN_PRICING, field for field', async () => {
  const plans = (await body()).plans
  assert.equal((await body()).currency, PLAN_PRICING.currency)

  assert.equal(plans.monthly.display, PLAN_PRICING.monthly.display)
  assert.equal(plans.monthly.per, PLAN_PRICING.monthly.per)
  assert.equal(plans.monthly.billed, PLAN_PRICING.monthly.billed)

  assert.equal(plans.annual.display, PLAN_PRICING.annual.display)
  assert.equal(plans.annual.per, PLAN_PRICING.annual.per)
  assert.equal(plans.annual.billed, PLAN_PRICING.annual.billed)
  assert.equal(plans.annual.perMonthDisplay, PLAN_PRICING.annual.perMonthDisplay)
  assert.equal(plans.annual.savesDisplay, PLAN_PRICING.annual.savesDisplay)
  assert.equal(plans.annual.savesPercentDisplay, PLAN_PRICING.annual.savesPercentDisplay)
  assert.equal(plans.annual.savingLine, ANNUAL_SAVING_LINE)

  // The monthly plan has no derived figures to state, and must not invent any.
  assert.equal(plans.monthly.perMonthDisplay, undefined)
  assert.equal(plans.monthly.savesDisplay, undefined)
  assert.equal(plans.monthly.savesPercentDisplay, undefined)
  assert.equal(plans.monthly.savingLine, undefined)
})

test('no NUMBER crosses the wire — the device computes nothing', async () => {
  // `amount` exists in PLAN_PRICING for the consistency test and is never
  // rendered. A client handed 14.99 is a client that can format it its own way,
  // round it its own way, and disagree with what Stripe charges.
  const flat = JSON.stringify(await body())
  assert.doesNotMatch(flat, /"amount"/)
  assert.doesNotMatch(flat, /:\s*\d/, 'every value in this payload is a string')
})

test('the renewal disclosure is the one lib/legal owns', async () => {
  const payload = await body()
  // New York GBL 527-a wants this in visual proximity to the request for
  // consent, and the request for consent on a phone is the same button.
  assert.equal(payload.plans.monthly.renewalLine, renewalLine('monthly'))
  assert.equal(payload.plans.annual.renewalLine, renewalLine('annual'))
  // The full set, as the Terms carry it (tests/unit/legal/legalPages.test.tsx
  // pins the Terms page to this same array).
  assert.deepEqual(payload.renewalTerms, [...RENEWAL_TERMS])
  assert.ok(payload.renewalTerms.length > 0)
})

// ─── The table is generated, never typed out ─────────────────────────────────

test('the Free/Plus rows are FREE_LIMITS, in the page’s reading order', async () => {
  const rows = (await body()).rows
  const expected = orderRows(ROWS).map((row) => ({
    feature: row.feature,
    label: FEATURE_LABELS[row.feature],
    free: freeCell(row),
    plus: plusCell(row, MIND_TOTAL),
  }))
  assert.deepEqual(rows, expected)
  assert.ok(rows.length > 0)
  // Every gated feature is advertised: the row set is FEATURE_MIN_TIER's, so a
  // feature added there appears here with its real allowance and no edit.
  assert.deepEqual(rows.map((r) => r.feature).sort(), [...FEATURES].sort())
})

test('the free list travels as label pairs, and its evidence does not', async () => {
  const payload = await body()
  assert.deepEqual(
    payload.freeForever,
    FREE_FOREVER.map((item) => ({ label: item.label, detail: item.detail })),
  )
  assert.equal(payload.freeForeverNote, FREE_FOREVER_NOTE)
  // FREE_FOREVER[].evidence is an internal audit trail — the route files
  // planPage.test.tsx asserts are ungated. A device has no use for them.
  const flat = JSON.stringify(payload)
  assert.doesNotMatch(flat, /evidence/)
  assert.doesNotMatch(flat, /app\/api\//, 'no route path may leak to a client')
})

// ─── The API says what the page says ─────────────────────────────────────────

/**
 * The plan page, rendered exactly as a member sees it with checkout live —
 * which is the only state that draws the renewal line under each CTA.
 */
function planPageMarkup(): string {
  return [
    renderToStaticMarkup(
      <PlanPricing
        checkout="ready"
        available={{ monthly: true, annual: true }}
        portalState="idle"
        onStart={() => {}}
        onOpenPortal={() => {}}
      />,
    ),
    renderToStaticMarkup(
      <PlanComparison rows={ROWS} mindTotalSessions={MIND_TOTAL} snapshot={null} />,
    ),
    renderToStaticMarkup(<FreeForever />),
  ].join('\n')
}

test('every string the API serves is a string the web plan page shows', async () => {
  const payload = await body()
  const html = planPageMarkup()

  const shown = (value: string, what: string) =>
    assert.ok(html.includes(esc(value)), `${what}: the page does not show "${value}"`)

  shown(payload.currency, 'currency')
  for (const [name, plan] of Object.entries(payload.plans)) {
    shown(plan.display, `${name} price`)
    shown(plan.per, `${name} period`)
    shown(plan.billed, `${name} billing note`)
    shown(plan.renewalLine, `${name} renewal line`)
    if (plan.perMonthDisplay) shown(plan.perMonthDisplay, `${name} per-month`)
    if (plan.savesDisplay) shown(plan.savesDisplay, `${name} saving`)
    if (plan.savesPercentDisplay) shown(plan.savesPercentDisplay, `${name} saving percent`)
    if (plan.savingLine) shown(plan.savingLine, `${name} saving line`)
  }
  for (const row of payload.rows) {
    shown(row.label, `row ${row.feature}`)
    shown(row.free, `free cell for ${row.feature}`)
    shown(row.plus, `plus cell for ${row.feature}`)
  }
  for (const item of payload.freeForever) {
    shown(item.label, 'free-forever label')
    shown(item.detail, 'free-forever detail')
  }
  shown(payload.freeForeverNote, 'free-forever note')
})

// ─── A price change is a server change ───────────────────────────────────────

test('changing PLAN_PRICING changes the response, with nothing else edited', async () => {
  // The whole point of the route: a price moves in one constant and every
  // client — web and native — reads the new one on the next request. If the
  // payload were built once at module load this would still be green
  // everywhere above and stale in production.
  const before = await body()
  const monthly = PLAN_PRICING.monthly as unknown as { display: string }
  const original = monthly.display

  try {
    monthly.display = '$17.99'
    const after = await body()
    assert.equal(after.plans.monthly.display, '$17.99')
    assert.notEqual(after.plans.monthly.display, before.plans.monthly.display)
    // …and the derived copy moves with it, because renewalLine() reads the same
    // constant rather than repeating the number.
    assert.equal(after.plans.monthly.renewalLine, renewalLine('monthly'))
    assert.ok(after.plans.monthly.renewalLine.includes('$17.99'))
  } finally {
    monthly.display = original
  }

  assert.deepEqual(await body(), before, 'the constant must be restored')
})

test('no amount is typed into the route or the payload builder', async () => {
  // Both must READ PLAN_PRICING. A literal here is the second copy this whole
  // route exists to delete.
  for (const rel of ['app/api/billing/plans/route.ts', 'lib/billing/plans.ts']) {
    const src = read(rel).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    assert.doesNotMatch(src, /\$\s?\d/, `${rel} names an amount`)
  }
  assert.match(read('lib/billing/plans.ts'), /PLAN_PRICING/)
  assert.match(read('lib/billing/plans.ts'), /FREE_LIMITS/)
})

/** Every source file in the native app, so a price typed there can be found. */
function nativeSources(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!['node_modules', '.expo', 'ios', 'android', 'gap_analysis'].includes(entry.name)) {
        nativeSources(full, out)
      }
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

test('the native app names no amount — prices come from this route or not at all', () => {
  // The other half of "a price change never needs an App Store release": the
  // moment an amount is typed into expo/, a price edit on the server is a lie
  // on every installed device until the next review.
  const EXPO = path.join(ROOT, '../expo')
  const files = nativeSources(EXPO)
  assert.ok(files.length > 20, `expected a real native tree, got ${files.length} files`)

  const offenders = files.filter((file) => /\$\s?\d+[.,]\d{2}/.test(fs.readFileSync(file, 'utf8')))
  assert.deepEqual(
    offenders.map((f) => path.relative(EXPO, f)),
    [],
    'an amount is typed into the native app; it must render GET /api/billing/plans instead',
  )
})
