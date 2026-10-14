import { localDateKey, localDayWindowForKey, dateKey } from '@/lib/dayWindow'

export interface MeditationSessionSummary {
  completedAt: Date | string
  durationMinutes: number
}

export interface MeditationStats {
  totalMinutes: number
  totalSessions: number
  thisWeek: number
  streakDays: number
  meditatedToday: boolean
}

/**
 * Computes meditation statistics in a single pass over the member's session history.
 *
 * Preserves the strict streak rule (no session today => streak 0), Monday week start,
 * and exact local-day key bucketing matching `dateKey(completedAt, tz)`.
 */
export function computeMeditationStats(
  sessions: MeditationSessionSummary[],
  tz: number,
  nowOrTodayKey?: Date | string,
): MeditationStats {
  const todayKey =
    typeof nowOrTodayKey === 'string'
      ? nowOrTodayKey
      : localDateKey(null, tz, nowOrTodayKey instanceof Date ? nowOrTodayKey : undefined)

  // This week (Mon–Sun) — derive Monday from user's local today
  // todayKey is YYYY-MM-DD; compute day-of-week from it
  const [ty, tm, td] = todayKey.split('-').map(Number)
  const todayDow = new Date(Date.UTC(ty, tm - 1, td)).getUTCDay() // 0=Sun
  const daysFromMon = todayDow === 0 ? 6 : todayDow - 1 // Mon=0
  const mondayKey = (() => {
    const d = new Date(Date.UTC(ty, tm - 1, td - daysFromMon))
    const y = d.getUTCFullYear()
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dy = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${mo}-${dy}`
  })()
  const { start: weekStart } = localDayWindowForKey(mondayKey, tz)

  let totalMinutes = 0
  let thisWeek = 0
  const dateSet = new Set<string>()

  // Single pass over the session history
  for (const session of sessions) {
    totalMinutes += session.durationMinutes || 0
    const completed = new Date(session.completedAt)
    if (completed >= weekStart) {
      thisWeek++
    }
    dateSet.add(dateKey(completed, tz))
  }

  const totalSessions = sessions.length
  const uniqueDates = Array.from(dateSet).sort((a, b) => b.localeCompare(a)) // descending

  let streakDays = 0
  // Walk backwards from today
  let cursorKey = todayKey
  for (const ds of uniqueDates) {
    if (ds === cursorKey) {
      streakDays++
      // Move cursor back one day
      const [cy, cm, cd] = cursorKey.split('-').map(Number)
      const prev = new Date(Date.UTC(cy, cm - 1, cd - 1))
      cursorKey = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-${String(prev.getUTCDate()).padStart(2, '0')}`
    } else if (ds < cursorKey) {
      break
    }
  }

  // Check if already meditated today
  const meditatedToday = dateSet.has(todayKey)

  return {
    totalMinutes,
    totalSessions,
    thisWeek,
    streakDays,
    meditatedToday,
  }
}
