import AsyncStorage from '@react-native-async-storage/async-storage'
import { AccessibilityInfo } from 'react-native'
import type { JourneyPayload } from './types'
import { introKindFor, weekKeyOfToday, type IntroKind } from './stage'

export function localWeekKey(now = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() - d.getDay())
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function sameWeek(todayKey: string, now = new Date()): boolean {
  if (!todayKey) return false
  const [y, m, dd] = todayKey.split('-').map(Number)
  if (!y || !m || !dd) return false
  const d = new Date(y, m - 1, dd)
  d.setDate(d.getDate() - d.getDay())
  const keyFromToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return keyFromToday === localWeekKey(now)
}

export function cacheKey(userId?: string | null): string {
  return `becoming.journey.${userId || 'anon'}`
}

export async function readBecomingCache(userId?: string | null): Promise<JourneyPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as JourneyPayload
    if (parsed && Array.isArray(parsed.weeks) && parsed.weeks.length > 0 && sameWeek(parsed.todayKey)) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

export async function writeBecomingCache(userId: string | null | undefined, data: JourneyPayload): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(data))
  } catch {
    // Ignore write failure
  }
}

export async function checkBecomingUnread(): Promise<boolean> {
  try {
    const weekKey = localWeekKey()
    const seenThisWeek = await AsyncStorage.getItem(`becoming.seen.${weekKey}`)
    if (seenThisWeek) return false
    const everSeen = await AsyncStorage.getItem('becoming.everSeen')
    if (everSeen) return true
    const keys = await AsyncStorage.getAllKeys()
    return keys.some(k => k.startsWith('becoming.seen.') || k.startsWith('becoming.intro.'))
  } catch {
    return false
  }
}

export async function markBecomingSeen(): Promise<void> {
  try {
    const weekKey = localWeekKey()
    await AsyncStorage.setItem(`becoming.seen.${weekKey}`, '1')
    await AsyncStorage.setItem('becoming.everSeen', '1')
  } catch {
    // Ignore storage failure
  }
}

// ── The stage's opening (NP-204) ────────────────────────────────────────────
//
// The web plays the full opening once per week (`localStorage`
// `becoming.intro.v2.<sunday>`), a short one after that, and none on a second
// open in the same tab (`sessionStorage` `becoming.opened`). Native keeps the
// weekly flag in AsyncStorage under the same key — `checkBecomingUnread`
// already counts `becoming.intro.*` as proof the member has been here — and
// the session flag in module memory, which is what an app launch is.

const INTRO_KEY = 'becoming.intro.v2.'
let openedThisSession = false

/** Reduce Motion, read once, guarded like `useReducedMotion` — the hook's
 *  first paint is `false` and the real answer lands a tick later, which is
 *  one tick too late to decide whether an opening plays at all. */
async function readReduceMotion(): Promise<boolean> {
  try {
    const read = AccessibilityInfo.isReduceMotionEnabled
    if (typeof read !== 'function') return false
    return Boolean(await Promise.resolve(read.call(AccessibilityInfo)))
  } catch {
    return false
  }
}

/** Which opening the stage should play for this launch. */
export async function resolveIntroKind(input: { todayKey: string; initialWeekKey?: string | null; reduced?: boolean }): Promise<IntroKind> {
  const reduced = input.reduced || (await readReduceMotion())
  let seenThisWeek = false
  try {
    seenThisWeek = !!(await AsyncStorage.getItem(INTRO_KEY + weekKeyOfToday(input.todayKey)))
  } catch {
    // Unknown is "not seen": the full opening is the safe default.
  }
  return introKindFor({ reduced, initialWeekKey: input.initialWeekKey ?? null, openedThisSession, seenThisWeek })
}

/** The opening has started: this week's flag, and this session's. */
export async function markIntroShown(todayKey: string): Promise<void> {
  openedThisSession = true
  try {
    await AsyncStorage.setItem(INTRO_KEY + weekKeyOfToday(todayKey), '1')
  } catch {
    // Ignore storage failure
  }
}

/** Tests only: a fresh app session. */
export function resetIntroSession(): void {
  openedThisSession = false
}
