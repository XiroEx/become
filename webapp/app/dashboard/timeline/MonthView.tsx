"use client"

import { useCallback, useEffect, useMemo, useRef, useState, KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Settings as SettingsIcon, MoreVertical, CopyPlus, ChefHat } from 'lucide-react'
import {
  DAY_LABELS,
  MONTH_NAMES,
  getMonthDays,
  toDateKey,
  isSameLocalDay,
} from '@/lib/calendarDays'
import type { IMealItem, IMealNutrition } from '@/models/Meal'
import {
  fetchPlansInRange,
  tagDotColors,
  tintForCalories,
  TINT_CLASSES,
  type MealPlan,
} from './planning'

// ---------------------------------------------------------------------------
// Types — kept local to this file. Mirrors the shape /api/meal-logs returns
// for ?from=&to=. The TimelineLogCard type comes from page.tsx but we don't
// need to import it because this view doesn't render log cards directly —
// it delegates day-strip rendering to the parent via a render prop.
// ---------------------------------------------------------------------------

interface MealLogLite {
  _id: string
  loggedAt: string
  tags: string[]
  totalNutrition?: IMealNutrition
  items?: IMealItem[]
}

interface MonthViewProps {
  /** Reference date — month is derived from .getMonth()/.getFullYear(). */
  currentDate: Date
  /** Day clicked in the calendar (or null). */
  selectedDate: Date | null
  onSelectDate: (date: Date | null) => void
  /** Caller controls the displayed month via this delta callback. */
  onChangeMonth: (delta: number) => void
  onJumpToday: () => void
  /** Caller renders the day strip below the grid. We hand back a list of
   *  logs + plans for the selected day; caller wires up TimelineLogCard
   *  + (in PR 3b) TimelinePlanCard. */
  renderDayStrip: (args: {
    date: Date
    logs: MealLogLite[]
    plans: MealPlan[]
  }) => React.ReactNode
  /** User's nutrition goal — for cell tint math. */
  goal: number
  /** Headers for the auth'd fetch calls. */
  getHeaders: () => HeadersInit
  /** Tap on the date pill inside a cell — caller drills in to Day view. */
  onDrillToDay: (date: Date) => void
  /** Bumping this number forces a re-fetch (e.g. after a plan is created). */
  reloadKey?: number
  /** Optional handlers for the "Plan tools" kebab menu (PR 5).
   *  Each fires when the user picks an item; the parent owns the sheet state. */
  onCopyDayForward?: () => void
  onApplyMealToDays?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MonthView({
  currentDate,
  selectedDate,
  onSelectDate,
  onChangeMonth,
  onJumpToday,
  renderDayStrip,
  goal,
  getHeaders,
  onDrillToDay,
  reloadKey,
  onCopyDayForward,
  onApplyMealToDays,
}: MonthViewProps) {
  const [planToolsOpen, setPlanToolsOpen] = useState(false)
  const today = useMemo(() => new Date(), [])

  // Settings (localStorage-only — per plan §5.8).
  const [showCaloriePct, setShowCaloriePct] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    // Default: on for >= 640px (sm: breakpoint), off on mobile.
    const stored = window.localStorage.getItem('timeline.monthView.calorieTint')
    if (stored === '1') return true
    if (stored === '0') return false
    return window.innerWidth >= 640
  })
  const [dimEmptyPast, setDimEmptyPast] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem('timeline.monthView.dimEmptyPast') !== '0'
  })
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('timeline.monthView.calorieTint', showCaloriePct ? '1' : '0')
    }
  }, [showCaloriePct])
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('timeline.monthView.dimEmptyPast', dimEmptyPast ? '1' : '0')
    }
  }, [dimEmptyPast])

  // Build the padded grid for the displayed month.
  const days = useMemo(() => {
    return getMonthDays(currentDate.getFullYear(), currentDate.getMonth())
  }, [currentDate])

  // Data fetch range — extend by the padding rows so cells from the
  // previous/next month show their dots correctly.
  const fetchRange = useMemo(() => {
    if (days.length === 0) return null
    const first = days[0]
    const last = days[days.length - 1]
    return {
      from: toDateKey(first),
      to: toDateKey(last),
    }
  }, [days])

  const [logs, setLogs] = useState<MealLogLite[]>([])
  const [plans, setPlans] = useState<MealPlan[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!fetchRange) return
    setLoading(true)
    try {
      const [logsRes, plansRes] = await Promise.all([
        fetch(`/api/meal-logs?from=${fetchRange.from}&to=${fetchRange.to}`, {
          headers: getHeaders(),
        }).then(r => r.ok ? r.json() : { days: [] }).catch(() => ({ days: [] })),
        fetchPlansInRange(fetchRange.from, fetchRange.to, getHeaders()),
      ])
      const flatLogs: MealLogLite[] = []
      const incomingDays: Array<{ date: string; logs?: MealLogLite[] }> = Array.isArray(logsRes?.days) ? logsRes.days : []
      for (const d of incomingDays) {
        if (Array.isArray(d.logs)) {
          for (const l of d.logs) {
            flatLogs.push({
              _id: String(l._id),
              loggedAt: l.loggedAt,
              tags: Array.isArray(l.tags) ? l.tags : [],
              totalNutrition: l.totalNutrition,
              items: l.items,
            })
          }
        }
      }
      setLogs(flatLogs)
      setPlans(plansRes.plans)
    } finally {
      setLoading(false)
    }
  }, [fetchRange, getHeaders])

  useEffect(() => { reload() }, [reload])
  // External refresh trigger (e.g. after a plan is created elsewhere on the page).
  useEffect(() => {
    if (reloadKey !== undefined) {
      reload()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

  // ── Bucketing ─────────────────────────────────────────────────────────────
  // Plan §8.5: log placement uses LOCAL date of loggedAt (the server returns
  // UTC-bucketed but we rebucket here for the grid).

  const logsByKey = useMemo(() => {
    const m = new Map<string, MealLogLite[]>()
    for (const l of logs) {
      const d = new Date(l.loggedAt)   // parses as UTC instant → local Date
      const key = toDateKey(d)
      const arr = m.get(key)
      if (arr) arr.push(l)
      else m.set(key, [l])
    }
    return m
  }, [logs])

  const plansByKey = useMemo(() => {
    const m = new Map<string, MealPlan[]>()
    for (const p of plans) {
      // Use the server-provided key — already YYYY-MM-DD of the intended local date.
      const key = p.plannedDateKey || p.plannedDate.split('T')[0]
      const arr = m.get(key)
      if (arr) arr.push(p)
      else m.set(key, [p])
    }
    return m
  }, [plans])

  // ── Calorie totals per cell ───────────────────────────────────────────────

  function consumedCalsFor(key: string): number {
    const arr = logsByKey.get(key)
    if (!arr) return 0
    let cals = 0
    for (const l of arr) cals += Math.round(l.totalNutrition?.calories ?? 0)
    return cals
  }

  function plannedCalsFor(key: string): number {
    const arr = plansByKey.get(key)
    if (!arr) return 0
    let cals = 0
    for (const p of arr) {
      if (p.status === 'active') cals += Math.round(p.expectedNutrition?.calories ?? 0)
    }
    return cals
  }

  function effectiveCalsFor(day: Date, key: string): number {
    const consumed = consumedCalsFor(key)
    const planned = plannedCalsFor(key)
    // Per plan §8.1: past → consumed; today → consumed + planned; future → planned.
    if (day < startOfDay(today)) return consumed
    if (isSameLocalDay(day, today)) return consumed + planned
    return planned
  }

  function startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }

  // ── Keyboard nav (roving tabindex, plan §5.9) ─────────────────────────────

  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)

  // Initial focus target: selected date if any, else today if it's visible, else first cell.
  useEffect(() => {
    if (focusedKey) return
    if (selectedDate) {
      setFocusedKey(toDateKey(selectedDate))
      return
    }
    const todayKey = toDateKey(today)
    if (days.some(d => toDateKey(d) === todayKey)) {
      setFocusedKey(todayKey)
      return
    }
    if (days.length > 0) setFocusedKey(toDateKey(days[0]))
  }, [days, today, selectedDate, focusedKey])

  const moveFocus = useCallback((delta: number) => {
    if (!focusedKey) return
    const idx = days.findIndex(d => toDateKey(d) === focusedKey)
    if (idx < 0) return
    const nextIdx = idx + delta
    if (nextIdx < 0) {
      onChangeMonth(-1)
      return
    }
    if (nextIdx >= days.length) {
      onChangeMonth(1)
      return
    }
    setFocusedKey(toDateKey(days[nextIdx]))
    // Focus the corresponding button after render.
    requestAnimationFrame(() => {
      const next = gridRef.current?.querySelector<HTMLButtonElement>(
        `[data-date-key="${toDateKey(days[nextIdx])}"]`,
      )
      next?.focus()
    })
  }, [focusedKey, days, onChangeMonth])

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); moveFocus(-1); break
      case 'ArrowRight': e.preventDefault(); moveFocus(1); break
      case 'ArrowUp': e.preventDefault(); moveFocus(-7); break
      case 'ArrowDown': e.preventDefault(); moveFocus(7); break
      case 'Home': {
        e.preventDefault()
        if (!focusedKey) break
        const idx = days.findIndex(d => toDateKey(d) === focusedKey)
        if (idx >= 0) {
          const startOfWeek = idx - (idx % 7)
          setFocusedKey(toDateKey(days[startOfWeek]))
          requestAnimationFrame(() => {
            const node = gridRef.current?.querySelector<HTMLButtonElement>(`[data-date-key="${toDateKey(days[startOfWeek])}"]`)
            node?.focus()
          })
        }
        break
      }
      case 'End': {
        e.preventDefault()
        if (!focusedKey) break
        const idx = days.findIndex(d => toDateKey(d) === focusedKey)
        if (idx >= 0) {
          const endOfWeek = Math.min(idx - (idx % 7) + 6, days.length - 1)
          setFocusedKey(toDateKey(days[endOfWeek]))
          requestAnimationFrame(() => {
            const node = gridRef.current?.querySelector<HTMLButtonElement>(`[data-date-key="${toDateKey(days[endOfWeek])}"]`)
            node?.focus()
          })
        }
        break
      }
      case 'PageUp': e.preventDefault(); onChangeMonth(-1); break
      case 'PageDown': e.preventDefault(); onChangeMonth(1); break
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const monthLabel = `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`

  // Strip data for selected day.
  const selectedKey = selectedDate ? toDateKey(selectedDate) : null
  const selectedLogs = selectedKey ? logsByKey.get(selectedKey) ?? [] : []
  const selectedPlans = selectedKey ? plansByKey.get(selectedKey) ?? [] : []

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onChangeMonth(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onJumpToday}
            className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Today
          </button>
          <span className="text-sm font-semibold text-zinc-900 dark:text-white">{monthLabel}</span>
          <button
            onClick={() => setSettingsOpen(o => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
            aria-label="Month view settings"
            aria-expanded={settingsOpen}
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
          {(onCopyDayForward || onApplyMealToDays) && (
            <div className="relative">
              <button
                onClick={() => setPlanToolsOpen(o => !o)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                aria-label="Plan tools"
                aria-expanded={planToolsOpen}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              <AnimatePresence>
                {planToolsOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setPlanToolsOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-10 z-40 min-w-[180px] rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      {onCopyDayForward && (
                        <button
                          type="button"
                          onClick={() => { setPlanToolsOpen(false); onCopyDayForward() }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          <CopyPlus className="h-3.5 w-3.5 text-blue-500" />
                          Copy a day forward…
                        </button>
                      )}
                      {onApplyMealToDays && (
                        <button
                          type="button"
                          onClick={() => { setPlanToolsOpen(false); onApplyMealToDays() }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          <ChefHat className="h-3.5 w-3.5 text-orange-500" />
                          Apply meal to days…
                        </button>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
        <button
          onClick={() => onChangeMonth(1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Settings panel */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Show calorie % on cells</span>
              <input
                type="checkbox"
                checked={showCaloriePct}
                onChange={e => setShowCaloriePct(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5">
              <span className="text-sm text-zinc-700 dark:text-zinc-300">Dim empty past days</span>
              <input
                type="checkbox"
                checked={dimEmptyPast}
                onChange={e => setDimEmptyPast(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
            </label>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Calendar grid */}
      {loading && days.length === 0 ? (
        <MonthSkeleton />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800">
            {DAY_LABELS.map(label => (
              <div
                key={label}
                className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 sm:text-xs"
              >
                {label}
              </div>
            ))}
          </div>

          {/* Date cells */}
          <div
            ref={gridRef}
            className="grid grid-cols-7"
            role="grid"
            onKeyDown={handleKeyDown}
            aria-label={`Calendar — ${monthLabel}`}
          >
            {days.map(day => {
              const key = toDateKey(day)
              const isThisMonth = day.getMonth() === currentDate.getMonth()
              const isToday = isSameLocalDay(day, today)
              const isSelected = selectedDate ? isSameLocalDay(day, selectedDate) : false
              const isFocused = focusedKey === key
              const dayLogs = logsByKey.get(key) ?? []
              const dayPlans = plansByKey.get(key) ?? []
              const isPast = startOfDay(day) < startOfDay(today)

              const cals = effectiveCalsFor(day, key)
              const tint = tintForCalories(cals, goal)
              const pct = goal > 0 ? Math.round((cals / goal) * 100) : 0

              const dimmed = dimEmptyPast && isPast && cals === 0
              const ariaLabel = buildAriaLabel(day, cals, goal, dayLogs.length, dayPlans.length, isToday)

              return (
                <button
                  key={key}
                  data-date-key={key}
                  type="button"
                  role="gridcell"
                  tabIndex={isFocused ? 0 : -1}
                  aria-label={ariaLabel}
                  aria-pressed={isSelected}
                  aria-current={isToday ? 'date' : undefined}
                  onClick={() => onSelectDate(isSelected ? null : day)}
                  onFocus={() => setFocusedKey(key)}
                  className={[
                    'relative flex min-h-[52px] flex-col items-center justify-start gap-1 border-b border-r border-zinc-100 p-1 transition-colors dark:border-zinc-800/50 sm:min-h-[64px] sm:p-1.5',
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/20'
                      : TINT_CLASSES[tint] || 'hover:bg-zinc-50 dark:hover:bg-zinc-800/20',
                    !isThisMonth ? 'opacity-40' : '',
                    dimmed ? 'opacity-50' : '',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
                  ].join(' ')}
                >
                  {/* Date pill — drill-in target. */}
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => { e.stopPropagation(); onDrillToDay(day) }}
                    className={[
                      'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium sm:h-7 sm:w-7 sm:text-sm',
                      isToday
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                        : 'text-zinc-700 dark:text-zinc-300',
                    ].join(' ')}
                  >
                    {day.getDate()}
                  </span>

                  {/* Dots row */}
                  <DotsRow logs={dayLogs} plans={dayPlans} />

                  {/* Calorie % micro-label */}
                  {showCaloriePct && cals > 0 && (
                    <span className="text-[9px] font-medium leading-none text-zinc-500 dark:text-zinc-400 sm:text-[10px]">
                      {pct}%
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Selected-day strip */}
      <AnimatePresence>
        {selectedDate && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2 }}
            aria-live="polite"
          >
            {renderDayStrip({
              date: selectedDate,
              logs: selectedLogs,
              plans: selectedPlans,
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function DotsRow({ logs, plans }: { logs: MealLogLite[]; plans: MealPlan[] }) {
  // Determine which tags are present from logs vs plans. If a tag has a log
  // AND a plan, show only the solid (logged) dot — planned was served.
  const loggedTags = new Set<string>()
  for (const l of logs) {
    for (const t of l.tags ?? []) loggedTags.add(t.toLowerCase())
    if ((l.tags ?? []).length === 0) loggedTags.add('snack')
  }
  const plannedTags = new Set<string>()
  for (const p of plans) {
    if (p.status === 'active') plannedTags.add(p.tag.toLowerCase())
  }

  type Dot = { tag: string; planned: boolean }
  const dots: Dot[] = []
  for (const tag of loggedTags) dots.push({ tag, planned: false })
  for (const tag of plannedTags) {
    if (!loggedTags.has(tag)) dots.push({ tag, planned: true })
  }

  if (dots.length === 0) return null

  // Max 3 visible. Rest gets a +N indicator.
  const visible = dots.slice(0, 3)
  const overflow = dots.length - visible.length

  return (
    <div className="flex flex-wrap items-center justify-center gap-0.5" aria-hidden="true">
      {visible.map((d, i) => {
        const c = tagDotColors(d.tag)
        return d.planned ? (
          <span
            key={`p-${d.tag}-${i}`}
            className={`h-1.5 w-1.5 rounded-full border-[1.5px] ${c.ring}`}
          />
        ) : (
          <span
            key={`l-${d.tag}-${i}`}
            className={`h-1.5 w-1.5 rounded-full ${c.solid}`}
          />
        )
      })}
      {overflow > 0 && (
        <span className="text-[8px] font-medium leading-none text-zinc-400">+{overflow}</span>
      )}
    </div>
  )
}

function MonthSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 42 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
        ))}
      </div>
    </div>
  )
}

function buildAriaLabel(
  day: Date,
  cals: number,
  goal: number,
  logsCount: number,
  plansCount: number,
  isToday: boolean,
): string {
  const dateStr = day.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const parts: string[] = [dateStr]
  if (isToday) parts.push('Today')
  if (cals > 0 && goal > 0) {
    parts.push(`${cals} of ${goal} calories`)
  } else if (cals > 0) {
    parts.push(`${cals} calories`)
  } else if (logsCount === 0 && plansCount === 0) {
    parts.push('no entries')
  }
  if (logsCount > 0) parts.push(`${logsCount} logged`)
  if (plansCount > 0) parts.push(`${plansCount} planned`)
  return parts.join(', ')
}

// Re-export the lite log type so the parent page can match the shape passed
// into renderDayStrip without re-deriving it.
export type { MealLogLite }
