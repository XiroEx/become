/**
 * PURE. The firewall between Stripe's API shape and ours.
 *
 * Two shapes moved in the 2025 API versions and both fail SILENTLY if you code
 * them from memory or from an old doc:
 *
 *   1. `Subscription.current_period_end` NO LONGER EXISTS. The period end lives
 *      on each item: `subscription.items.data[i].current_period_end`.
 *   2. `Invoice.subscription` NO LONGER EXISTS. The reference lives at
 *      `invoice.parent.subscription_details.subscription`, and the metadata
 *      alongside it is a snapshot of the subscription's metadata.
 *
 * Read the old field and you store `undefined` — and because a `canceled`
 * subscription keeps Plus only while `now < currentPeriodEnd`, an undefined
 * period end is an INSTANT downgrade for someone who paid through the month.
 * Every accessor below therefore takes `unknown` and narrows by hand, with the
 * legacy field kept as a fallback so an older-API delivery still resolves.
 */

import type Stripe from 'stripe'
import type { SubscriptionStatus } from '@/models/User'
import { planForPriceId, type BillingConfig } from './config'
import type { BillingPlan, StripeMode } from './mode'

export interface SubscriptionState {
  status: SubscriptionStatus
  plan?: BillingPlan
  currentPeriodEnd?: Date
  cancelAtPeriodEnd: boolean
  stripeSubscriptionId?: string
  stripePriceId?: string
  mode: StripeMode
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined
}

/** Stripe timestamps are seconds. Reject 0, NaN and anything non-finite. */
function dateFromEpochSeconds(value: unknown): Date | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return new Date(value * 1000)
}

/**
 * The MAX period end across items. A multi-item subscription can have items on
 * different cycles; access should end when the LAST paid period does, not the
 * first. Falls back to a legacy top-level `current_period_end`, and returns
 * undefined when neither shape carries one.
 */
export function periodEndFromSubscription(sub: unknown): Date | undefined {
  const record = asRecord(sub)
  if (!record) return undefined

  const items = asRecord(record.items)
  const data = Array.isArray(items?.data) ? items.data : []

  let latest: Date | undefined
  for (const entry of data) {
    const end = dateFromEpochSeconds(asRecord(entry)?.current_period_end)
    if (end && (!latest || end > latest)) latest = end
  }
  if (latest) return latest

  // Pre-2025 payload (or a hand-built fixture). Still honoured.
  return dateFromEpochSeconds(record.current_period_end)
}

/** First recognisable price id on the subscription, expanded object or string. */
export function priceIdFromSubscription(sub: unknown): string | undefined {
  const items = asRecord(asRecord(sub)?.items)
  const data = Array.isArray(items?.data) ? items.data : []
  for (const entry of data) {
    const price = asRecord(entry)?.price
    if (typeof price === 'string' && price) return price
    const id = asRecord(price)?.id
    if (typeof id === 'string' && id) return id
  }
  return undefined
}

/** Unwrap `string | { id }` — Stripe expands references inconsistently. */
export function refId(value: unknown): string | undefined {
  if (typeof value === 'string' && value) return value
  const id = asRecord(value)?.id
  return typeof id === 'string' && id ? id : undefined
}

/**
 * Resolve the subscription an invoice belongs to, plus the userId Stripe
 * snapshotted from the subscription's metadata when the invoice was created.
 * Handles the current `parent.subscription_details` shape and the legacy
 * top-level `subscription` field.
 */
export function subscriptionRefFromInvoice(invoice: unknown): {
  id?: string
  userId?: string
} {
  const record = asRecord(invoice)
  if (!record) return {}

  const details = asRecord(asRecord(record.parent)?.subscription_details)
  const id = refId(details?.subscription) ?? refId(record.subscription)

  const metadata = asRecord(details?.metadata)
  const userId = typeof metadata?.userId === 'string' ? metadata.userId : undefined

  return { id, userId }
}

/**
 * Stripe's status vocabulary is wider than ours ('incomplete_expired',
 * 'paused'), and the type is an open union — a future status arrives as an
 * arbitrary string. Anything we do not recognise maps to 'none', which derives
 * to `free`: fail closed, because granting paid access off a status nobody has
 * read the semantics of is the one mistake that costs money.
 */
export function normalizeStatus(status: unknown): SubscriptionStatus {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'canceled':
    case 'incomplete':
    case 'incomplete_expired':
    case 'unpaid':
    case 'paused':
      return status
    default:
      return 'none'
  }
}

/**
 * Stripe subscription → the shape we persist.
 *
 * `plan` is best-effort and MAY be undefined for a price that is not one of the
 * two configured ones. That is deliberate: status decides tier, the price only
 * decides what we call the plan in the UI.
 */
export function normalizeSubscription(
  sub: Stripe.Subscription,
  cfg: BillingConfig,
): SubscriptionState {
  const priceId = priceIdFromSubscription(sub)
  return {
    status: normalizeStatus(sub.status),
    plan: planForPriceId(cfg, priceId),
    currentPeriodEnd: periodEndFromSubscription(sub),
    cancelAtPeriodEnd: sub.cancel_at_period_end === true,
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    mode: cfg.mode,
  }
}
