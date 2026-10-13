import { z } from 'zod';

/**
 * GET /api/me/entitlements — the one place a client reads plan state from.
 *
 * Mirrors webapp/app/api/me/entitlements/route.ts and the tables in
 * webapp/lib/entitlements.ts. Two questions are answered per feature, and a
 * client must read BOTH rather than recompute either: may I touch this at all
 * (`allowed`), and may I create another one right now (`canCreate`). The
 * enforcement kill-switch and the admin bypass live inside that calculation.
 */

/** The nine gated features, in the order the server lists them. */
export const FEATURES = [
  'custom-meals',
  'custom-exercises',
  'custom-programs',
  'custom-foods',
  'custom-sessions',
  'workout-generation',
  'ai-food-estimate',
  'mind-sessions',
  'vision',
] as const;

export const FeatureSchema = z.enum(FEATURES);

/** Collapsed from free|plus|premium|pro. `/api/me/entitlements` never reports
 *  a legacy value — it reads a row's tier as 'plus' or 'free' and nothing
 *  else. */
export const TierSchema = z.enum(['free', 'plus']);

/** The bucket an allowance counts inside. */
export const AllowanceWindowSchema = z.enum(['day', 'week', 'lifetime']);

/** One feature's state. `limit`/`remaining` are null when access is UNCAPPED,
 *  which is not the same as a limit of zero. */
export const FeatureEntitlementSchema = z
  .object({
    allowed: z.boolean(),
    canCreate: z.boolean(),
    /** The tier at which this feature becomes uncapped. */
    requiresTier: z.string().optional(),
    limit: z.number().nullish(),
    used: z.number().optional(),
    remaining: z.number().nullish(),
    /** ISO. Set for 'day'/'week' windows, null for inventory and milestones. */
    resetsAt: z.string().nullish(),
    window: AllowanceWindowSchema.optional(),
  })
  .passthrough();

/** The `subscription` projection this route carries — three fields, not the
 *  billing row. GET /api/billing/status is the fuller read. */
export const EntitlementSubscriptionSchema = z
  .object({
    status: z.string().optional(),
    currentPeriodEnd: z.string().nullish(),
    cancelAtPeriodEnd: z.boolean().optional(),
  })
  .passthrough();

/**
 * The snapshot.
 *
 * `features` is keyed by feature name rather than by the enum above on
 * purpose: a tenth feature must not make the whole snapshot unparseable for a
 * build that shipped before it existed. Use `FeatureSchema` to narrow a key
 * you care about.
 */
export const EntitlementsResponseSchema = z
  .object({
    /** 'user' | 'trainer' | 'admin'. */
    role: z.string().optional(),
    tier: TierSchema.optional(),
    /** Is the kill-switch on? When false every `allowed`/`canCreate` is true
     *  and used/remaining stay real, for shadow-mode telemetry. */
    enforced: z.boolean().optional(),
    /** The REASON this member holds Plus, never a grant on its own. */
    grandfathered: z.boolean().optional(),
    subscription: EntitlementSubscriptionSchema.nullish(),
    /** Can a checkout actually be started (a key AND at least one price)?
     *  False renders the upgrade CTA's "coming soon" state. */
    checkoutAvailable: z.boolean().optional(),
    features: z.record(z.string(), FeatureEntitlementSchema).default({}),
  })
  .passthrough();

export type Feature = z.infer<typeof FeatureSchema>;
export type Tier = z.infer<typeof TierSchema>;
export type AllowanceWindow = z.infer<typeof AllowanceWindowSchema>;
export type FeatureEntitlement = z.infer<typeof FeatureEntitlementSchema>;
export type EntitlementSubscription = z.infer<typeof EntitlementSubscriptionSchema>;
export type EntitlementsResponse = z.infer<typeof EntitlementsResponseSchema>;
