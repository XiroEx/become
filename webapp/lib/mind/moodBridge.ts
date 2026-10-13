/**
 * The bridge from the dashboard's 1–5 mood to the Mind session.
 *
 * The mood tile and the Mind check-in were two separate worlds: you could tap
 * "Bad" on the home screen and then be asked, cold, "how are you feeling?" the
 * moment a session opened. These helpers let the session READ that mood — to
 * open with it, to order the check-in grid around it, and to seed the AI
 * composer — without pretending a 1–5 number is one of the four Mind states.
 */

import type { MindState } from '@/lib/mindContent'

export type MoodLevel = 1 | 2 | 3 | 4 | 5

export const MOOD_LABELS: Record<MoodLevel, string> = {
  1: 'Bad',
  2: 'Not great',
  3: 'Okay',
  4: 'Pretty good',
  5: 'Great',
}

/** How long a dashboard mood stays relevant to a session opener. */
export const MOOD_RELEVANT_MS = 12 * 60 * 60 * 1000

export interface TodayMood {
  value: MoodLevel
  label: string
  /** When it was logged (ms). */
  at: number
}

export function isMoodLevel(n: unknown): n is MoodLevel {
  return n === 1 || n === 2 || n === 3 || n === 4 || n === 5
}

/**
 * The Mind state a mood most plausibly maps to, for SEEDING only (the live
 * check-in overrides it). Low moods seed the gentle low-energy register rather
 * than "stressed" — the acknowledge/soften moves suit both, and guessing
 * "stressed" at someone who is merely flat reads wrong. Okay seeds nothing.
 */
export function seedStateForMood(mood: MoodLevel): MindState | null {
  if (mood <= 2) return 'low_energy'
  if (mood >= 4) return 'locked_in'
  return null
}

/**
 * Order for the 20-feeling check-in grid given a mood: the bucket that matches
 * comes first so the likely answers are under the thumb. Returns state buckets
 * in display order.
 */
export function feelingOrderForMood(mood: MoodLevel | null): MindState[] {
  const base: MindState[] = ['locked_in', 'low_energy', 'distracted', 'stressed']
  if (mood == null || mood === 3) return base
  if (mood <= 2) return ['low_energy', 'stressed', 'distracted', 'locked_in']
  return base
}

/** One line for the session opener / AI grounding. */
export function moodOpenerLine(mood: TodayMood, now = Date.now()): string {
  const hours = Math.max(0, Math.round((now - mood.at) / 3_600_000))
  const when = hours < 1 ? 'just now' : hours === 1 ? 'an hour ago' : `${hours} hours ago`
  return `You checked in feeling ${mood.label.toLowerCase()} ${when}.`
}

/**
 * The gateway copy shown right after a mood is picked on the dashboard — the
 * nudge that links the mood to a Mind session.
 */
export function moodGateway(mood: MoodLevel): { headline: string; body: string; cta: string } {
  switch (mood) {
    case 1:
      return {
        headline: 'Rough one.',
        body: 'You do not have to fix it right now. A short Mind session takes the edge off first.',
        cta: 'Take five in Mindset',
      }
    case 2:
      return {
        headline: 'Not your best. Noted.',
        body: 'Flat days are data, not destiny. A few minutes in Mindset usually shifts it.',
        cta: 'Reset in Mindset',
      }
    case 3:
      return {
        headline: 'Steady.',
        body: 'Okay is a fine place to work from. A session can sharpen it into something.',
        cta: 'Open Mindset',
      }
    case 4:
      return {
        headline: 'Good energy.',
        body: 'Point it somewhere. Today\'s session builds on a day that is already going well.',
        cta: 'Open Mindset',
      }
    case 5:
    default:
      return {
        headline: 'Great.',
        body: 'This is the state to protect. Spend a few minutes aiming it on purpose.',
        cta: 'Open Mindset',
      }
  }
}
