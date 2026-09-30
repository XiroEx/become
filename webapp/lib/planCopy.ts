// Copy for the plan comparison page (app/dashboard/plan).
//
// CLIENT-SAFE BY CONSTRUCTION: type-only imports and nothing else.
// lib/entitlements.ts is the server leaf (mongoose, next/server, the User
// model), so the VALUES a browser bundle needs — the price strings, the
// free-forever list, the two cell renderers — live here, and the numbers that
// must never drift (FREE_LIMITS, FEATURE_MIN_TIER) are read on the server and
// handed to the page as props. See app/dashboard/plan/page.tsx.
//
// Nothing here may invent a discount, a trial, a refund policy or a date. There
// is no trial implemented anywhere in this app; there is no promotional price.
// The only numbers below are the two the client set, and the arithmetic between
// them, and tests/unit/entitlements/planPage.test.tsx recomputes that arithmetic
// so a hand-edit of one figure cannot leave the others lying.

import type { AllowanceKind, AllowanceWindow, Feature, Tier } from '@/lib/entitlementsClient'

// ─── Prices ──────────────────────────────────────────────────────────────────

/**
 * THE prices. One constant, one place to change them.
 *
 * ⚠ THESE STRINGS MUST MATCH THE STRIPE PRICES the app checks out against —
 * `billing.stripePricePlusMonthly` and `billing.stripePricePlusAnnual` in the
 * BECOME_RUNTIME_CONFIG payload (redsecrets). Nothing in the app reads an
 * amount back off Stripe, so a price changed in the dashboard and not here is a
 * number a member reads before being charged a different one. Change both, in
 * the same sitting.
 *
 * Amounts are USD, tax exclusive; Stripe Checkout shows the final total.
 *
 * The annual figures are DERIVED, not invented:
 *   monthly × 12   = 14.99 × 12 = 179.88
 *   saving         = 179.88 − 119.99 = 59.89
 *   percent off    = 59.89 / 179.88 = 33.3% → "33%" (rounded DOWN, never up)
 *   per month      = 119.99 / 12 = 9.9992 → "$10.00"
 */
export const PLAN_PRICING = {
  currency: 'USD',
  monthly: {
    /** Numeric form, for the consistency test. Never rendered. */
    amount: 14.99,
    display: '$14.99',
    per: 'month',
    billed: 'Billed monthly.',
  },
  annual: {
    amount: 119.99,
    display: '$119.99',
    per: 'year',
    billed: 'Billed once a year.',
    /** 119.99 / 12, to the cent. */
    perMonthDisplay: '$10.00',
    /** (14.99 × 12) − 119.99. */
    savesDisplay: '$59.89',
    /** Rounded down from 33.3%. */
    savesPercentDisplay: '33%',
  },
} as const

/** The one sentence that states the annual saving. Kept beside the numbers. */
export const ANNUAL_SAVING_LINE = `Save ${PLAN_PRICING.annual.savesDisplay} a year, ${PLAN_PRICING.annual.savesPercentDisplay} off the monthly price.`

// ─── The comparison rows ─────────────────────────────────────────────────────

/**
 * One gated feature, flattened out of FREE_LIMITS + FEATURE_MIN_TIER on the
 * server. Plain data so it crosses the server → client boundary as props.
 */
export interface PlanFeatureRow {
  feature: Feature
  requiresTier: Tier
  /** The free-tier allowance. 0 means the feature is not available on free. */
  limit: number
  kind: AllowanceKind
  window: AllowanceWindow
}

/**
 * Reading order for the comparison table. Purely presentational: the page
 * renders EVERY row it is handed, and anything missing from this list is
 * appended rather than dropped — a feature added to FEATURE_MIN_TIER must never
 * silently vanish from the page that advertises the plan.
 */
export const ROW_ORDER: Feature[] = [
  'ai-food-estimate',
  'workout-generation',
  'custom-programs',
  'custom-sessions',
  'custom-exercises',
  'custom-meals',
  'custom-foods',
  'mind-sessions',
  'vision',
]

export function orderRows(rows: PlanFeatureRow[]): PlanFeatureRow[] {
  const rank = (f: Feature) => {
    const i = ROW_ORDER.indexOf(f)
    return i === -1 ? ROW_ORDER.length : i
  }
  return [...rows].sort((a, b) => rank(a.feature) - rank(b.feature))
}

/**
 * What the FREE column says for a row — derived from the allowance, never typed
 * out, so changing a limit cannot leave a member reading a number that is no
 * longer true.
 *
 * The milestone row reads "First 10" here and "All 50" in the Plus column, with
 * the length of the whole path spelled out underneath (see rowDetail in
 * PlanPageClient). "First 10" alone reads as a small perk; what is actually on
 * offer is 10 of 50, and 50 is derived (SESSIONS_PER_CHAPTER x MAX_CHAPTER,
 * read from lib/mindXP.ts on the server) rather than typed out.
 */
export function freeCell(row: PlanFeatureRow): string {
  if (row.limit <= 0) return 'Not included'
  if (row.kind === 'milestone') return `First ${row.limit}`
  if (row.kind === 'window') {
    if (row.window === 'day') return `${row.limit} a day`
    if (row.window === 'week') return `${row.limit} a week`
  }
  return String(row.limit)
}

/** What the PLUS column says. A cap removed, or a feature that only exists here. */
export function plusCell(row: PlanFeatureRow, mindTotal: number): string {
  if (row.kind === 'milestone') return `All ${mindTotal}`
  if (row.limit <= 0) return 'Included'
  return 'Unlimited'
}

// ─── Free forever ────────────────────────────────────────────────────────────

/**
 * What a free member keeps, uncapped, with no plan at all.
 *
 * This is the honest half of the story and the strongest one, so it is held to
 * the same standard as the gated half: every entry names the route that serves
 * it, and tests/unit/entitlements/planPage.test.tsx asserts that route calls NO
 * entitlement guard. An advertised-as-free surface that later grows a gate
 * fails the build instead of quietly becoming a lie.
 *
 * `cappedBy` is the escape hatch for a route that is free for the thing being
 * advertised and gated for something else on the same file — POST /api/workouts
 * logs any workout with no guard at all and consults 'custom-sessions' only for
 * the star. Naming it is what keeps the claim precise.
 */
export interface FreeForeverItem {
  label: string
  detail: string
  /** Route files that serve this. Asserted guard-free by the unit test. */
  evidence: string[]
  /** Features the evidence files may legitimately gate on, and no others. */
  cappedBy?: Feature[]
}

export const FREE_FOREVER: FreeForeverItem[] = [
  {
    label: 'Logging your training',
    detail: 'Every workout, set, rep and weight, as many as you train.',
    evidence: ['app/api/workouts/route.ts'],
    // Logging is ungated. Only STARRING a session as a reusable template is
    // counted, and that is the 'custom-sessions' row in the table above.
    cappedBy: ['custom-sessions'],
  },
  {
    label: "Jon's programs",
    detail: 'Every coach-built program, and the schedule that runs it.',
    evidence: [
      'app/api/programs/route.ts',
      'app/api/programs/search/route.ts',
      'app/api/programs/enroll/route.ts',
      'app/api/schedule/route.ts',
    ],
  },
  {
    label: 'Food logging',
    detail: 'Search, barcode scanning, your recent and frequent picks, and saved foods.',
    evidence: [
      'app/api/nutrition/log/route.ts',
      'app/api/nutrition/foods/barcode/route.ts',
      'app/api/nutrition/foods/recent/route.ts',
      'app/api/nutrition/foods/frequent/route.ts',
      'app/api/me/foods/route.ts',
      'app/api/meal-logs/route.ts',
    ],
  },
  {
    label: 'Weight and mood',
    detail: 'Daily check-ins, for as long as you keep them.',
    evidence: ['app/api/weight/route.ts', 'app/api/mood/route.ts'],
  },
  {
    label: 'Streaks and progress',
    detail: 'Your streak, your charts, your weekly volume, your PRs.',
    evidence: ['app/api/streaks/route.ts', 'app/api/progress/route.ts'],
  },
]

/**
 * The plain-language promise under the free list. No trial, no expiry, no date
 * — because none of those exist. The only commitment here is one the app
 * already keeps.
 */
export const FREE_FOREVER_NOTE =
  'No plan needed, no time limit, and nothing you have already made is ever taken away.'
