import { z } from 'zod';

/**
 * Billing: GET /api/billing/status, POST /api/billing/checkout and
 * POST /api/billing/portal.
 *
 * Mirrors webapp/app/api/billing/{status,checkout,portal}/route.ts. No key, no
 * price id, no customer id and no subscription id ever crosses this wire —
 * the client has no use for any of them.
 *
 * MODE MATTERS. Every state here is scoped to the Stripe mode that wrote it:
 * a live customer id is useless to a test-mode key, so beta rehearses the flow
 * in 'test' against the same database.
 */

/** Which Stripe account this state belongs to. */
export const BillingModeSchema = z.enum(['test', 'live']);

/** The two prices a checkout can be started for. */
export const BillingPlanSchema = z.enum(['monthly', 'annual']);

/**
 * The subscription block of GET /api/billing/status.
 *
 * `status` is a string, not an enum: it is Stripe's own vocabulary plus 'none'
 * for "never subscribed", and Stripe adds statuses. What the client renders
 * from it is copy, never access — `tier` is what decides access.
 */
export const BillingSubscriptionSchema = z
  .object({
    /** 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' |
     *  'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused'. */
    status: z.string().optional(),
    /** Which configured price this maps to. Cosmetic — may be null. */
    plan: z.string().nullish(),
    currentPeriodEnd: z.string().nullish(),
    cancelAtPeriodEnd: z.boolean().optional(),
    /** The founding-members promise — the reason this member holds Plus. */
    grandfathered: z.boolean().optional(),
    /** Is there anything IN THIS MODE for the portal to open? False means the
     *  Manage-billing button would 409, so it is not offered. */
    managed: z.boolean().optional(),
  })
  .passthrough();

/**
 * GET /api/billing/status. ALWAYS 200 when authenticated, including when
 * billing is switched off — `configured: false` is "not yet", and a 503 there
 * would be indistinguishable from an outage.
 *
 * `tier` is the RAW stored value, so a legacy row can still answer 'premium'
 * or 'pro'; treat anything that is not 'plus' as free, exactly as the server
 * does.
 */
export const BillingStatusResponseSchema = z
  .object({
    configured: z.boolean(),
    mode: BillingModeSchema.optional(),
    tier: z.string().optional(),
    role: z.string().optional(),
    /** Presence flags only — a price id is configuration, not client data. */
    plans: z
      .object({
        monthly: z.boolean().optional(),
        annual: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    subscription: BillingSubscriptionSchema.optional(),
  })
  .passthrough();

/**
 * ─── GET /api/billing/plans ──────────────────────────────────────────────────
 *
 * The prices and the Free/Plus table, as DISPLAY STRINGS. Mirrors
 * webapp/lib/billing/plans.ts, which builds them from the same constants the
 * web plan page renders (PLAN_PRICING, FREE_LIMITS, FEATURE_LABELS,
 * FREE_FOREVER, RENEWAL_TERMS).
 *
 * THE CLIENT RENDERS THESE VERBATIM AND COMPUTES NO AMOUNT. There is no number
 * in this response on purpose: a price change must reach the app without a
 * store release, and anything a device recomputes is a second source of truth
 * that can disagree with what Stripe actually charges.
 */

/** One billing period. The four required fields are what every plan has; the
 *  derived annual figures are optional because the monthly plan has none. */
export const PlanPriceCopySchema = z
  .object({
    /** '$14.99' — formatted, and already in `currency`. */
    display: z.string(),
    /** 'month' | 'year', for "per month". */
    per: z.string(),
    /** 'Billed monthly.' */
    billed: z.string(),
    /** The automatic-renewal disclosure for this period (New York GBL 527-a),
     *  shown in visual proximity to the buy button. */
    renewalLine: z.string(),
    /** Annual only: '$10.00' a month. */
    perMonthDisplay: z.string().optional(),
    /** Annual only: '$59.89'. */
    savesDisplay: z.string().optional(),
    /** Annual only: '33%', rounded DOWN. */
    savesPercentDisplay: z.string().optional(),
    /** Annual only: the sentence that states the saving. */
    savingLine: z.string().optional(),
  })
  .passthrough();

/** One row of the Free/Plus table. `feature` keys the list; the three strings
 *  are rendered. */
export const PlanRowCopySchema = z
  .object({
    feature: z.string(),
    label: z.string(),
    free: z.string(),
    plus: z.string(),
  })
  .passthrough();

/** One "free, with no cap" claim. */
export const FreeForeverCopySchema = z
  .object({
    label: z.string(),
    detail: z.string(),
  })
  .passthrough();

/** GET /api/billing/plans 200. The same body for every member — what the plan
 *  costs and contains, never what this member holds (that is /status). */
export const BillingPlansResponseSchema = z
  .object({
    currency: z.string(),
    plans: z
      .object({
        monthly: PlanPriceCopySchema,
        annual: PlanPriceCopySchema,
      })
      .passthrough(),
    rows: z.array(PlanRowCopySchema),
    freeForever: z.array(FreeForeverCopySchema),
    freeForeverNote: z.string(),
    renewalTerms: z.array(z.string()),
  })
  .passthrough();

/** POST /api/billing/checkout body. `plan` is OPTIONAL and defaults to monthly
 *  server-side; an explicitly wrong value is a 400 'invalid_plan'. */
export const CheckoutRequestSchema = z.object({
  plan: BillingPlanSchema.optional(),
});

/** POST /api/billing/checkout 200 — open `url`, which is Stripe's. */
export const CheckoutResponseSchema = z
  .object({
    url: z.string(),
    sessionId: z.string().optional(),
    mode: BillingModeSchema.optional(),
  })
  .passthrough();

/** POST /api/billing/portal 200 — a one-time link into Stripe's hosted portal,
 *  which is where a card is updated and where a subscription is cancelled. */
export const PortalResponseSchema = z
  .object({
    url: z.string(),
  })
  .passthrough();

/**
 * Every refusal these three routes can answer with, as a code:
 *
 *   invalid_plan                   400  checkout, an unknown `plan`
 *   billing_not_configured         503  checkout/portal, no key or no price
 *   already_subscribed             409  checkout, active/trialing in this mode
 *   fix_payment_method             409  checkout, mid-dunning — carries
 *                                       `status` and `portal`; the way out of
 *                                       a failed payment is a working card
 *   already_plus                   409  checkout, live mode only — carries
 *                                       `reason: 'admin' | 'grandfathered'`
 *   checkout_failed                502  checkout, Stripe said no
 *   no_customer                    409  portal, nothing to manage in this mode
 *   billing_portal_not_configured  503  portal, no configuration saved in the
 *                                       Stripe dashboard
 *   portal_failed                  502  portal, Stripe said no
 */
export const BILLING_REFUSAL_CODES = [
  'invalid_plan',
  'billing_not_configured',
  'already_subscribed',
  'fix_payment_method',
  'already_plus',
  'checkout_failed',
  'no_customer',
  'billing_portal_not_configured',
  'portal_failed',
] as const;

export const BillingRefusalCodeSchema = z.enum(BILLING_REFUSAL_CODES);

/** Is this the refusal code a client has a branch for? */
export function isBillingRefusalCode(value: unknown): value is BillingRefusalCode {
  return BillingRefusalCodeSchema.safeParse(value).success;
}

/**
 * A refusal body. `error` stays a plain string — a client must not fail to
 * READ a refusal it has no branch for — and `BillingRefusalCodeSchema` is how
 * a known one is narrowed.
 */
export const BillingRefusalSchema = z
  .object({
    error: z.string(),
    /** 'fix_payment_method' only: the subscription status that blocked it. */
    status: z.string().optional(),
    /** 'fix_payment_method' only: where to send the member instead. */
    portal: z.string().optional(),
    /** 'already_plus' only: 'admin' | 'grandfathered'. */
    reason: z.string().optional(),
  })
  .passthrough();

export type BillingMode = z.infer<typeof BillingModeSchema>;
export type BillingPlan = z.infer<typeof BillingPlanSchema>;
export type BillingSubscription = z.infer<typeof BillingSubscriptionSchema>;
export type BillingStatusResponse = z.infer<typeof BillingStatusResponseSchema>;
export type PlanPriceCopy = z.infer<typeof PlanPriceCopySchema>;
export type PlanRowCopy = z.infer<typeof PlanRowCopySchema>;
export type FreeForeverCopy = z.infer<typeof FreeForeverCopySchema>;
export type BillingPlansResponse = z.infer<typeof BillingPlansResponseSchema>;
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;
export type PortalResponse = z.infer<typeof PortalResponseSchema>;
export type BillingRefusalCode = z.infer<typeof BillingRefusalCodeSchema>;
export type BillingRefusal = z.infer<typeof BillingRefusalSchema>;
