/**
 * The daily glance — the LOCK-SCREEN half of the widgets Jon asked for.
 *
 * A web app cannot draw a lock-screen widget: that is a WidgetKit / App Widget
 * surface and only `expo/` can ship one. What a web app CAN put on a lock
 * screen is a notification, so this turns the widget feed into one card a
 * member reads without unlocking anything: streak, today's session, calories
 * left, and whether the Mind session is waiting.
 *
 * It composes from `WidgetFeed` rather than from the database on purpose. Every
 * wording decision already lives in `lib/widgets/feed.ts`, and a glance that
 * re-derived "at risk" or re-formatted a calorie count would eventually
 * disagree with the widget sitting next to it. Nothing here reads a model.
 *
 * It is NOT another nudge. The nine notifications in `app/api/cron/notify`
 * each fire because something is wrong or owed; this one fires because the
 * member asked to see their day — which is why it is the one notification that
 * is OFF until explicitly turned on (see the cron section and
 * `app/api/notifications/preferences`).
 */

import type { BecomeWidget, WidgetFeed, WidgetKey } from '@/lib/widgets/feed'

export interface DailyGlance {
  title: string
  body: string
  /** Mirrors `feed.badgeCount`, so the push can light the app icon too. */
  badgeCount: number
}

function widget(feed: WidgetFeed, key: WidgetKey): BecomeWidget | undefined {
  return feed.widgets.find((w) => w.key === key)
}

/**
 * The headline of the streak widget, when it is worth leading with.
 *
 * `state === 'none'` is "never logged anything", and a zero can also reach here
 * the other way round on the day a streak resets — `feed.ts` formats integers
 * with `toLocaleString`, so that value is exactly `'0'`. Leading a lock screen
 * with "🔥 0 days" is a worse greeting than not mentioning it.
 */
function streakTitle(feed: WidgetFeed): string {
  const streak = widget(feed, 'streak')
  if (!streak || streak.state === 'none' || streak.headline === '0') return 'Today at a glance'
  return `🔥 ${streak.headline}${streak.headlineUnit ? ` ${streak.headlineUnit}` : ''}`
}

/**
 * The three daily commitments, in the order a morning actually runs.
 *
 * Every branch returns a non-empty string except the Mind cooldown, which is
 * genuinely not a thing the member can do today and so is left out rather than
 * printed as a shrug. Nutrition always contributes, so the body can never come
 * out empty — pinned in tests, because a notification with a blank body is a
 * silent bug on a surface nobody is watching.
 */
function parts(feed: WidgetFeed): string[] {
  const out: string[] = []

  const training = widget(feed, 'training')
  if (training) {
    if (training.state === 'done') out.push('Training done')
    else if (training.state === 'todo') out.push(training.headline)
    // 'none' covers both a scheduled rest day and no program at all. On a lock
    // screen those are the same fact — there is nothing to train today.
    else out.push('No session today')
  }

  const nutrition = widget(feed, 'nutrition')
  if (nutrition) {
    if (nutrition.state === 'todo') out.push('No food logged')
    else out.push(`${nutrition.headline}${nutrition.headlineUnit ? ` ${nutrition.headlineUnit}` : ''}`)
  }

  const mind = widget(feed, 'mind')
  if (mind) {
    if (mind.state === 'done') out.push('Mind done')
    else if (mind.state === 'todo') out.push('Mind session ready')
    // 'none' = the between-sessions cooldown is still running. Nothing to say.
  }

  return out
}

export function buildDailyGlance(feed: WidgetFeed): DailyGlance {
  return {
    title: streakTitle(feed),
    body: parts(feed).join(' · '),
    badgeCount: feed.badgeCount,
  }
}
