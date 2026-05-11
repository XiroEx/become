"use client"

import { useMemo, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { todayLocalKey, compareDateKeys } from '@/lib/mealPlanDates'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface DateOnlyPickerProps {
  /** Currently-selected date as YYYY-MM-DD, or null for "no selection". */
  value: string | null
  /** Called whenever the user picks a date or clears it. */
  onChange: (value: string | null) => void
  /** Optional earliest date (YYYY-MM-DD inclusive). Default: no limit. */
  minDate?: string
  /** Optional latest date (YYYY-MM-DD inclusive). Default: no limit. */
  maxDate?: string
  /** When true, a "Today" quick-pick chip is shown above the grid. */
  showTodayChip?: boolean
  /** Label for the Clear affordance. */
  clearLabel?: string
  /** When provided, renders a Clear button that calls this. */
  onClear?: () => void
  className?: string
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

const YYYY_MM_DD = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Friendly label for a date pill. `null` → "Now". Today → "Today". Yesterday/
 * tomorrow → relative. Else → "May 8, 2026" via toLocaleDateString.
 * Exported so the various host modals can share a single voice.
 */
export function formatDatePillLabel(key: string | null, now: Date = new Date()): string {
  if (!key) return 'Now'
  const m = YYYY_MM_DD.exec(key)
  if (!m) return 'Now'
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays === 1) return 'Tomorrow'
  return target.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Parse a YYYY-MM-DD string into a local-midnight Date. Returns null on bad input. */
function parseKey(key: string | null | undefined): Date | null {
  if (!key) return null
  const m = YYYY_MM_DD.exec(key)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const date = new Date(y, mo, d)
  if (Number.isNaN(date.getTime())) return null
  return date
}

/** Format a local-midnight Date as YYYY-MM-DD. */
function dateToKey(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

/**
 * Build a 6-row month grid (Sunday-leading) for the given month. Same shape
 * as the workouts CalendarClient — pad with leading days from prev month and
 * trailing days from next month to complete the final week.
 */
function getMonthDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startPad = firstDay.getDay()
  const days: Date[] = []
  for (let i = startPad; i > 0; i--) {
    days.push(new Date(year, month, 1 - i))
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i))
  }
  const remaining = 7 - (days.length % 7)
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i))
    }
  }
  return days
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Compact, date-only month-grid picker. SSR-safe, mobile-first, no time
 * concept. Interface is YYYY-MM-DD-only — no Date objects in or out, which
 * sidesteps the timezone-shift hazards that bite naive `new Date(yyyy-mm-dd)`
 * call sites.
 *
 * Visual language mirrors `app/dashboard/calendar/CalendarClient.tsx` so the
 * app feels coherent (same header chevrons, weekday labels, filled-circle
 * selection treatment).
 */
export default function DateOnlyPicker({
  value,
  onChange,
  minDate,
  maxDate,
  showTodayChip = false,
  clearLabel = 'Clear',
  onClear,
  className,
}: DateOnlyPickerProps) {
  // The currently-displayed month. Starts at the selected month (when set),
  // else "today" — computed lazily so this stays SSR-safe.
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const fromValue = parseKey(value)
    if (fromValue) return new Date(fromValue.getFullYear(), fromValue.getMonth(), 1)
    return getTodayMonthStart()
  })

  const todayKey = useMemo(() => todayLocalKey(), [])
  const selectedKey = value ?? null

  const monthDays = useMemo(
    () => getMonthDays(viewMonth.getFullYear(), viewMonth.getMonth()),
    [viewMonth],
  )

  const goPrevMonth = useCallback(() => {
    setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }, [])

  const goNextMonth = useCallback(() => {
    setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }, [])

  const handlePickToday = useCallback(() => {
    // Move the calendar to the current month and commit "today" as the value.
    setViewMonth(getTodayMonthStart())
    onChange(todayLocalKey())
  }, [onChange])

  const isDisabled = useCallback((key: string): boolean => {
    if (minDate && compareDateKeys(key, minDate) < 0) return true
    if (maxDate && compareDateKeys(key, maxDate) > 0) return true
    return false
  }, [minDate, maxDate])

  // Disable month-nav chevrons when crossing min/max boundaries — keeps the
  // grid from showing months with zero tappable days.
  const prevMonthDisabled = useMemo(() => {
    if (!minDate) return false
    const firstDayOfView = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, '0')}-01`
    return compareDateKeys(firstDayOfView, minDate) <= 0
  }, [minDate, viewMonth])

  const nextMonthDisabled = useMemo(() => {
    if (!maxDate) return false
    const lastDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0)
    const lastKey = dateToKey(lastDay)
    return compareDateKeys(lastKey, maxDate) >= 0
  }, [maxDate, viewMonth])

  return (
    <div
      className={[
        'rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900',
        className ?? '',
      ].filter(Boolean).join(' ')}
    >
      {/* Quick-pick row — Today chip + Clear, when enabled */}
      {(showTodayChip || onClear) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {showTodayChip && (
            <button
              type="button"
              onClick={handlePickToday}
              className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              Today
            </button>
          )}
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              {clearLabel}
            </button>
          )}
        </div>
      )}

      {/* Month nav header */}
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={goPrevMonth}
          disabled={prevMonthDisabled}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-zinc-900 dark:text-white">
          {MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
        </span>
        <button
          type="button"
          onClick={goNextMonth}
          disabled={nextMonthDisabled}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday header row */}
      <div className="mb-1 grid grid-cols-7">
        {DAY_LABELS.map((label, i) => (
          <div
            key={`${label}-${i}`}
            className="py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {monthDays.map((day, idx) => {
          const key = dateToKey(day)
          const inViewMonth = day.getMonth() === viewMonth.getMonth()
          const disabled = isDisabled(key)
          const isSelected = selectedKey === key
          const isToday = key === todayKey
          const dayNum = day.getDate()

          // Visual states — selection wins, then today's ring, then default.
          let stateClasses: string
          if (disabled) {
            stateClasses = 'text-zinc-300 dark:text-zinc-700 cursor-not-allowed'
          } else if (!inViewMonth) {
            stateClasses = 'text-zinc-300 dark:text-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
          } else if (isSelected) {
            stateClasses = 'bg-zinc-900 text-white font-semibold dark:bg-white dark:text-zinc-900'
          } else if (isToday) {
            stateClasses = 'ring-1 ring-zinc-300 dark:ring-zinc-700 text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800'
          } else {
            stateClasses = 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }

          return (
            <button
              key={`${key}-${idx}`}
              type="button"
              disabled={disabled}
              onClick={() => onChange(key)}
              aria-label={`${day.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}${isSelected ? ', selected' : ''}`}
              aria-pressed={isSelected}
              className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full text-[13px] tabular-nums transition-colors ${stateClasses}`}
            >
              {dayNum}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Local-midnight Date at the start of today's month. Extracted so the
 * initialState callback in useState stays terse and SSR-safe.
 */
function getTodayMonthStart(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}
