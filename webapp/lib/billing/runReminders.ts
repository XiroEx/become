// Sends the Terms §9 billing notices (lib/billing/reminders.ts) from the hourly
// notify cron. Production only, like every cron here: beta shares the database.
//
// CLAIM, THEN SEND. The key is stamped with a conditional update first, so two
// overlapping sweeps can never both send; a send that throws un-stamps it so the
// next hour retries.
import User from '@/models/User'
import { sendEmail, billingReminderEmailHtml } from '@/lib/email'
import { MANAGE_BILLING_LABEL } from '@/lib/legal'
import { PLAN_PRICING } from '@/lib/planCopy'
import { dueReminder, reminderCopy, type DueReminder } from './reminders'
import { TRIAL_DAYS } from './trial'

const DAY_MS = 24 * 60 * 60 * 1000

export interface ReminderSendResult {
  sent: number
  failed: number
}

export async function runBillingReminders(
  now: Date = new Date(),
  deps: { send?: typeof sendEmail } = {},
): Promise<ReminderSendResult> {
  const send = deps.send ?? sendEmail
  const result: ReminderSendResult = { sent: 0, failed: 0 }
  const freeTrialFloor = new Date(now.getTime() - TRIAL_DAYS * DAY_MS)
  const candidates = await User.find({
    'deletion.requestedAt': { $exists: false },
    $or: [
      { 'subscription.status': 'trialing' },
      { 'subscription.status': 'active', 'subscription.plan': 'annual' },
      { 'subscription.freeTrialStartedAt': { $gte: freeTrialFloor } },
    ],
  })
    .select('email subscription billingReminders')
    .lean()

  for (const user of candidates) {
    const u = user as unknown as {
      _id: unknown
      email?: string
      subscription?: Parameters<typeof dueReminder>[0]
      billingReminders?: Parameters<typeof dueReminder>[1]
    }
    const due: DueReminder | null = dueReminder(u.subscription, u.billingReminders, now)
    if (!due || !u.email) continue
    const field = due.kind === 'annual-renewal' ? 'billingReminders.renewal' : 'billingReminders.trialEnding'
    const claim = await User.updateOne(
      { _id: u._id, [field]: { $ne: due.key } },
      { $set: { [field]: due.key } },
    )
    if (claim.modifiedCount !== 1) continue
    const copy = reminderCopy(
      due,
      { monthly: PLAN_PRICING.monthly.display, annual: PLAN_PRICING.annual.display },
      MANAGE_BILLING_LABEL,
    )
    try {
      await send({ to: u.email, subject: copy.subject, html: billingReminderEmailHtml(copy) })
      result.sent++
    } catch {
      result.failed++
      await User.updateOne({ _id: u._id, [field]: due.key }, { $set: { [field]: null } }).catch(() => {})
    }
  }
  return result
}
