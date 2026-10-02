import AsyncStorage from '@react-native-async-storage/async-storage'
import type { JourneyPayload } from './types'

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
