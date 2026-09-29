// The body of GET /api/billing/plans — the plan page's copy, as data.
//
// WHY THIS EXISTS. A native build cannot be re-released because a price moved,
// so no amount may ever be typed into the app: the device renders the strings
// it is handed and computes nothing. Until now the only copy of the prices and
// the Free/Plus table was in the web bundle (lib/planCopy.ts) and
// GET /api/billing/status said no more than whether each plan was CONFIGURED,
// so a client with no bundle had nothing to render at all.
//
// DISPLAY STRINGS ONLY, and every one of them is READ FROM THE SAME CONSTANTS
// THE WEB PAGE READS — PLAN_PRICING, FREE_LIMITS + FEATURE_MIN_TIER through
// freeCell/plusCell, FEATURE_LABELS, FREE_FOREVER, RENEWAL_TERMS and
// renewalLine(). Nothing here is a second copy, so changing PLAN_PRICING
// changes this payload and the web page in the same edit and they cannot
// disagree. tests/unit/billing/planPrices.test.tsx renders the real plan page
// components and asserts every string in this payload appears in that markup.
//
// Built PER CALL, never memoised at module scope: a price edit must be a
// deploy, not a restart, and the mutation test in planPrices.test.tsx proves
// the payload follows the constant rather than a snapshot of it.
//
// What is deliberately NOT here:
//   • numbers. `amount` in PLAN_PRICING is the consistency test's, never
//     rendered, and no client has any business doing arithmetic on a price.
//   • Stripe price ids, keys, or whether checkout is configured — that is
//     GET /api/billing/status, and an id is configuration, not client data.
//   • FREE_FOREVER[].evidence: route paths are an internal audit trail
//     (planPage.test.tsx reads them), not something to hand a device.
//   • the member. This payload is the same for everyone; the tier, the
//     subscription and the enforcement switch come from
//     GET /api/me/entitlements and GET /api/billing/status, and the client
//     bails on `enforced === false` exactly as the web page does.

import { FEATURES, FREE_LIMITS, FEATURE_MIN_TIER } from '@/lib/entitlements'
import { FEATURE_LABELS } from '@/lib/entitlementsClient'
import { MAX_CHAPTER, SESSIONS_PER_CHAPTER } from '@/lib/mindXP'
import { RENEWAL_TERMS, renewalLine } from '@/lib/legal'
import {
  ANNUAL_SAVING_LINE,
  FREE_FOREVER,
  FREE_FOREVER_NOTE,
  PLAN_PRICING,
  freeCell,
  orderRows,
  plusCell,
  type PlanFeatureRow,
} from '@/lib/planCopy'

/** One billing period, as the strings a client renders verbatim. */
export interface PlanPriceCopy {
  /** '$14.99' — the price, already formatted and already in `currency`. */
  display: string
  /** 'month' | 'year' — the period, for "per month". */
  per: string
  /** 'Billed monthly.' */
  billed: string
  /** The automatic-renewal disclosure for THIS period (New York GBL 527-a). */
  renewalLine: string
  /** Annual only: '$10.00', the annual price divided by twelve. */
  perMonthDisplay?: string
  /** Annual only: '$59.89' saved against twelve monthly payments. */
  savesDisplay?: string
  /** Annual only: '33%', rounded DOWN. */
  savesPercentDisplay?: string
  /** Annual only: the one sentence that states the saving. */
  savingLine?: string
}

/** One row of the Free/Plus table: a label and what each column says. */
export interface PlanRowCopy {
  /** The feature key, so a client can key a list — never rendered. */
  feature: string
  label: string
  free: string
  plus: string
}

/** One uncapped, no-plan-needed claim. */
export interface FreeForeverCopy {
  label: string
  detail: string
}

export interface PlansPayload {
  /** 'USD'. Prices are tax-inclusive; see RENEWAL_TERMS. */
  currency: string
  plans: {
    monthly: PlanPriceCopy
    annual: PlanPriceCopy
  }
  /** The Free/Plus table, in reading order. */
  rows: PlanRowCopy[]
  /** What a free member keeps with no plan at all. */
  freeForever: FreeForeverCopy[]
  freeForeverNote: string
  /** The full automatic-renewal disclosure, as the Terms carry it. */
  renewalTerms: string[]
}

/** The whole Mind path, so "First 10" can be shown against what it is part of. */
const mindTotalSessions = () => SESSIONS_PER_CHAPTER * MAX_CHAPTER

/**
 * Exactly what app/dashboard/plan/page.tsx builds on the server: FREE_LIMITS
 * and FEATURE_MIN_TIER flattened into one row per gated feature. Adding a
 * feature to FEATURE_MIN_TIER puts it in this response on the next deploy,
 * with its real allowance, with nothing typed out here.
 */
function planRows(): PlanFeatureRow[] {
  return FEATURES.map((feature) => ({
    feature,
    requiresTier: FEATURE_MIN_TIER[feature],
    limit: FREE_LIMITS[feature].limit,
    kind: FREE_LIMITS[feature].kind,
    window: FREE_LIMITS[feature].window,
  }))
}

export function buildPlansPayload(): PlansPayload {
  const mindTotal = mindTotalSessions()

  return {
    currency: PLAN_PRICING.currency,
    plans: {
      monthly: {
        display: PLAN_PRICING.monthly.display,
        per: PLAN_PRICING.monthly.per,
        billed: PLAN_PRICING.monthly.billed,
        renewalLine: renewalLine('monthly'),
      },
      annual: {
        display: PLAN_PRICING.annual.display,
        per: PLAN_PRICING.annual.per,
        billed: PLAN_PRICING.annual.billed,
        renewalLine: renewalLine('annual'),
        perMonthDisplay: PLAN_PRICING.annual.perMonthDisplay,
        savesDisplay: PLAN_PRICING.annual.savesDisplay,
        savesPercentDisplay: PLAN_PRICING.annual.savesPercentDisplay,
        savingLine: ANNUAL_SAVING_LINE,
      },
    },
    // orderRows only SORTS — a feature missing from ROW_ORDER is appended, never
    // dropped, so a new gated feature cannot silently vanish from the table
    // that advertises the plan.
    rows: orderRows(planRows()).map((row) => ({
      feature: row.feature,
      label: FEATURE_LABELS[row.feature],
      free: freeCell(row),
      plus: plusCell(row, mindTotal),
    })),
    freeForever: FREE_FOREVER.map((item) => ({ label: item.label, detail: item.detail })),
    freeForeverNote: FREE_FOREVER_NOTE,
    renewalTerms: [...RENEWAL_TERMS],
  }
}
