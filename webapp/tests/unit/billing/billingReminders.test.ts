// Terms §9's notices (legal package, Oct 30 2026): 3 days before EITHER trial
// ends, and an annual renewal reminder 15-45 days before the deadline. The
// sentences are only published because these exist; these tests are the proof.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dueReminder,
  reminderCopy,
  RENEWAL_REMINDER_DAYS,
  RENEWAL_REMINDER_WINDOW,
  TRIAL_NOTICE_DAYS,
} from '../../../lib/billing/reminders'
import { TRIAL_DAYS } from '../../../lib/billing/trial'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-01T15:00:00Z')
const at = (days: number) => new Date(NOW.getTime() + days * DAY)
const PRICES = { monthly: '$14.99', annual: '$119.99' }

test('the numbers the Terms state', () => {
  assert.equal(TRIAL_DAYS, 7)
  assert.equal(TRIAL_NOTICE_DAYS, 3)
  assert.ok(RENEWAL_REMINDER_DAYS <= RENEWAL_REMINDER_WINDOW.maxDays)
  assert.ok(RENEWAL_REMINDER_DAYS >= RENEWAL_REMINDER_WINDOW.minDays)
  assert.deepEqual(RENEWAL_REMINDER_WINDOW, { minDays: 15, maxDays: 45 })
})

test('the no-card trial: told 3 days before it ends, once, and nothing is charged', () => {
  const started = new Date(NOW.getTime() - 5 * DAY) // ends in 2 days
  const sub = { status: 'none', freeTrialStartedAt: started }
  const due = dueReminder(sub, null, NOW)
  assert.equal(due?.kind, 'trial-ending')
  assert.equal(due && due.kind === 'trial-ending' && due.trial, 'free')
  assert.equal(dueReminder(sub, { trialEnding: due!.key }, NOW), null, 'sent once')
  // Not yet: 5 days left.
  assert.equal(dueReminder({ status: 'none', freeTrialStartedAt: new Date(NOW.getTime() - 2 * DAY) }, null, NOW), null)
  const copy = reminderCopy(due!, PRICES, 'Manage billing')
  assert.match(copy.lines.join(' '), /nothing will be charged: your account returns to the free plan/)
})

test('the card trial: told 3 days before the charge, with the price and how to cancel', () => {
  const sub = { status: 'trialing', plan: 'monthly' as const, currentPeriodEnd: at(2.5), mode: 'live' as const }
  const due = dueReminder(sub, null, NOW)
  assert.equal(due && due.kind === 'trial-ending' && due.trial, 'card')
  const copy = reminderCopy(due!, PRICES, 'Manage billing')
  assert.match(copy.lines.join(' '), /\$14\.99 a month/)
  assert.match(copy.lines.join(' '), /Manage billing/)
  assert.match(copy.lines.join(' '), /stops the charge and returns your account to the free plan/)
  assert.equal(dueReminder({ ...sub, currentPeriodEnd: at(4) }, null, NOW), null, 'not yet')
  assert.equal(dueReminder({ ...sub, cancelAtPeriodEnd: true }, null, NOW), null, 'cancelled: no charge coming')
  assert.equal(dueReminder({ ...sub, mode: 'test' as const }, null, NOW), null, 'beta test mode: no money moves')
})

test('the annual renewal: inside 15-45 days, once per period, naming the price and how to cancel', () => {
  const sub = { status: 'active', plan: 'annual' as const, currentPeriodEnd: at(29), mode: 'live' as const }
  const due = dueReminder(sub, null, NOW)
  assert.equal(due?.kind, 'annual-renewal')
  const copy = reminderCopy(due!, PRICES, 'Manage billing')
  assert.match(copy.lines.join(' '), /\$119\.99 will be charged/)
  assert.match(copy.lines.join(' '), /cancel before/)
  assert.equal(dueReminder(sub, { renewal: due!.key }, NOW), null, 'once per period')
  assert.notEqual(
    dueReminder({ ...sub, currentPeriodEnd: at(29 + 365) }, { renewal: due!.key }, new Date(NOW.getTime() + 365 * DAY))?.kind,
    undefined,
    'next year is a new period',
  )
  assert.equal(dueReminder({ ...sub, currentPeriodEnd: at(40) }, null, NOW), null, 'not before 30 days')
  assert.equal(dueReminder({ ...sub, currentPeriodEnd: at(10) }, null, NOW), null, 'never inside the last 15 days')
  assert.equal(dueReminder({ ...sub, plan: 'monthly' as const }, null, NOW), null, 'monthly plans are not in the promise')
})
