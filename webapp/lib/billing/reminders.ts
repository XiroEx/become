// The billing notices Terms §9 promises (legal package, Oct 29-30 2026, Jon's
// approved wording). The Terms may only say what the product does, so these
// exist BEFORE the sentences that describe them are published:
//
//   • "We will tell you 3 days before the trial ends" — for BOTH trials: the
//     7-day no-card trial (`subscription.freeTrialStartedAt`, lib/billing/trial.ts)
//     and the 7-day card trial (Stripe `trialing`; `currentPeriodEnd` is the
//     trial's end).
//   • "a renewal reminder at least 15 days and no more than 45 days before the
//     cancellation deadline" for an annual plan, naming the price and how to
//     cancel. Sent at RENEWAL_REMINDER_DAYS (30), inside that window, so a cron
//     run that is late by days still lands inside it.
//
// Delivered by email, the way every member signed up. One reminder per trial
// and one per renewal period: the KEY stamped on `User.billingReminders` names
// the trial or the period, so a second sweep finds it already sent, and the next
// year's renewal (a new period end) is a new key.
//
// Test-mode subscriptions (`subscription.mode === 'test'`, the beta channel's
// Stripe test account) get nothing: no money moves, and beta shares
// production's database.
import { freeTrialActive, freeTrialEndsAt, TRIAL_DAYS } from './trial'

export const TRIAL_NOTICE_DAYS = 3
export const RENEWAL_REMINDER_DAYS = 30
/** Terms §9's window. RENEWAL_REMINDER_DAYS must sit inside it. */
export const RENEWAL_REMINDER_WINDOW = { minDays: 15, maxDays: 45 } as const

const DAY_MS = 24 * 60 * 60 * 1000

export interface ReminderSubscription {
  status?: string | null
  plan?: 'monthly' | 'annual' | null
  currentPeriodEnd?: Date | string | null
  cancelAtPeriodEnd?: boolean | null
  freeTrialStartedAt?: Date | string | null
  mode?: 'test' | 'live' | null
}

export interface ReminderStamps {
  trialEnding?: string | null
  renewal?: string | null
}

export type DueReminder =
  | { kind: 'trial-ending'; trial: 'free' | 'card'; endsAt: Date; plan: 'monthly' | 'annual' | null; key: string }
  | { kind: 'annual-renewal'; renewsAt: Date; key: string }

function asDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Which notice, if any, this member is owed right now. */
export function dueReminder(
  sub: ReminderSubscription | null | undefined,
  sent: ReminderStamps | null | undefined,
  now: Date = new Date(),
): DueReminder | null {
  if (!sub) return null

  // The no-card trial (status 'none' / absent while it runs).
  if (freeTrialActive(sub, now)) {
    const endsAt = freeTrialEndsAt(sub)
    const started = asDate(sub.freeTrialStartedAt)
    if (endsAt && started && endsAt.getTime() - now.getTime() <= TRIAL_NOTICE_DAYS * DAY_MS) {
      const key = `free:${started.toISOString()}`
      return sent?.trialEnding === key
        ? null
        : { kind: 'trial-ending', trial: 'free', endsAt, plan: null, key }
    }
    return null
  }

  if (sub.mode === 'test') return null
  const end = asDate(sub.currentPeriodEnd)
  if (!end || sub.cancelAtPeriodEnd) return null
  const msLeft = end.getTime() - now.getTime()
  if (msLeft <= 0) return null

  // The card trial: the charge lands at its end.
  if (sub.status === 'trialing') {
    if (msLeft > TRIAL_NOTICE_DAYS * DAY_MS) return null
    const key = `card:${end.toISOString()}`
    return sent?.trialEnding === key
      ? null
      : { kind: 'trial-ending', trial: 'card', endsAt: end, plan: sub.plan ?? null, key }
  }

  // An annual plan approaching renewal.
  if (sub.status === 'active' && sub.plan === 'annual') {
    const daysLeft = msLeft / DAY_MS
    if (daysLeft > RENEWAL_REMINDER_DAYS || daysLeft < RENEWAL_REMINDER_WINDOW.minDays) return null
    const key = `renewal:${end.toISOString()}`
    return sent?.renewal === key ? null : { kind: 'annual-renewal', renewsAt: end, key }
  }
  return null
}

/** "November 4, 2026", in New York time (Become LLC's home; no time is shown). */
export function reminderDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  })
}

export interface ReminderCopy {
  subject: string
  heading: string
  lines: string[]
  cta: { label: string; path: string }
}

/** The words, separate from the HTML so tests read exactly what is sent. */
export function reminderCopy(
  r: DueReminder,
  prices: { monthly: string; annual: string },
  manageBillingLabel: string,
): ReminderCopy {
  if (r.kind === 'annual-renewal') {
    const date = reminderDate(r.renewsAt)
    return {
      subject: `Your annual Become Plus plan renews on ${date}`,
      heading: `Your annual plan renews on ${date}`,
      lines: [
        `Your Become Plus annual plan renews automatically on ${date}, and ${prices.annual} will be charged to the payment method on file. The price is not changing.`,
        `If you do not want it to renew, cancel before ${date}: open the Plan page in the app, choose ${manageBillingLabel}, and cancel in the billing portal that opens. You keep Plus until the end of the year you have paid for.`,
      ],
      cta: { label: manageBillingLabel, path: '/dashboard/plan' },
    }
  }
  const date = reminderDate(r.endsAt)
  if (r.trial === 'free') {
    return {
      subject: `Your free week of Become Plus ends on ${date}`,
      heading: `Your free trial ends on ${date}`,
      lines: [
        `Your ${TRIAL_DAYS}-day free trial of Plus ends on ${date}. No payment method is on file, so nothing will be charged: your account returns to the free plan.`,
        `Want to keep Plus? Add a payment method and choose a monthly or annual plan on the Plan page to get another ${TRIAL_DAYS} days free before the first charge.`,
      ],
      cta: { label: 'See your plan', path: '/dashboard/plan' },
    }
  }
  const price = r.plan === 'annual' ? `${prices.annual} a year` : `${prices.monthly} a month`
  return {
    subject: `Your Become Plus trial ends on ${date}`,
    heading: `Your trial ends on ${date}`,
    lines: [
      `Your ${TRIAL_DAYS}-day Plus trial ends on ${date}. Unless you cancel before then, your plan will be charged (${price}) when the trial ends and will then renew automatically.`,
      `To cancel, open the Plan page in the app and choose ${manageBillingLabel}. Cancelling during the trial stops the charge and returns your account to the free plan. The 14-day first-payment refund still applies to the first charge.`,
    ],
    cta: { label: manageBillingLabel, path: '/dashboard/plan' },
  }
}
