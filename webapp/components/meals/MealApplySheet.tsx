"use client"

import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, ChevronDown, Tag as TagIcon, CalendarDays, ChefHat, Loader2, Clock } from 'lucide-react'
import { useLockScroll } from '@/lib/useLockScroll'
import DateOnlyPicker, { formatDatePillLabel } from '@/components/ui/DateOnlyPicker'
import { buildLoggedAt } from '@/lib/mealPlanDates'
import { useMealSchedule } from '@/hooks/useMealSchedule'
import { anchorMinutesForTag, formatHHMM, formatClockLabel, parseHHMM, minutesOfDay, windowForTag } from '@/lib/nutrition/mealSchedule'

interface MealApplyMeal {
  _id: string
  name: string
  imageUrl?: string
  totalNutrition?: {
    calories: number
    protein: number
    carbs: number
    fats: number
  }
  recipe?: {
    servings?: number
  }
  tags?: string[]
}

interface MealApplySheetProps {
  isOpen: boolean
  meal: MealApplyMeal | null
  // Default tag suggested by caller (typically based on time of day).
  defaultTag: string
  availableTags?: { defaults: string[]; userTags: string[] }
  // Date the user is viewing (sets the day in the time picker). Defaults to today.
  viewedDate?: Date
  // 'log' (default) — POST /api/meals/[id]/log
  // 'plan' — POST /api/meal-plans with mealId. Time picker hidden; the sheet
  // uses viewedDate as the plannedDate. Submit CTA reads "Plan".
  mode?: 'log' | 'plan'
  onClose: () => void
  // Called after a successful POST. Caller refetches state.
  onApplied?: () => void
}

interface PortionPill {
  label: string
  value: number  // fractional value to use as portion (when no recipe.servings)
  servingsLabel?: string  // alternate label when recipe.servings is set
}

// Common portion fractions/integers shown as pills in the picker.
// `value` is what we'd send as `portion` if there's no recipe.servings.
// When recipe.servings IS set, we treat the same value as "servings selected"
// and divide by recipe.servings for the actual portion sent.
const PORTION_PILLS: PortionPill[] = [
  { label: '1/4', value: 0.25 },
  { label: '1/3', value: 1 / 3 },
  { label: '1/2', value: 0.5 },
  { label: '2/3', value: 2 / 3 },
  { label: '3/4', value: 0.75 },
  { label: '1', value: 1 },
  { label: '1.5', value: 1.5 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
]

function titleCaseTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-')
}

// Format a Date as a local YYYY-MM-DD key. Used to seed the DateOnlyPicker
// from `viewedDate` and to compare against "today".
function dateToKey(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

export default function MealApplySheet({
  isOpen,
  meal,
  defaultTag,
  availableTags,
  viewedDate,
  mode = 'log',
  onClose,
  onApplied,
}: MealApplySheetProps) {
  const isPlanMode = mode === 'plan'
  const [activeTag, setActiveTag] = useState<string>(defaultTag)
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const [customTagInput, setCustomTagInput] = useState('')

  // Selected pill index, or null when "custom" mode is active.
  const [selectedPillIdx, setSelectedPillIdx] = useState<number>(5) // default to "1"
  const [customMode, setCustomMode] = useState(false)
  const [customValue, setCustomValue] = useState<string>('1')

  // User-picked log date as YYYY-MM-DD — null = "Now" (today @ current
  // wall-clock time). Submission grafts the wall-clock time onto the picked
  // date via combineDateWithNowTime().
  const [customDate, setCustomDate] = useState<string | null>(null)
  // Same three-way model as the food picker: now / a typed time / no time.
  //
  // Meals had NO time control at all — every meal landed at the current minute,
  // which on a time-ordered day view meant a breakfast logged at 9pm sorted to
  // the end of the day. Foods gained this and meals were left behind.
  const [timeMode, setTimeMode] = useState<'now' | 'custom' | 'none'>('none')
  const [customTime, setCustomTime] = useState<string | null>(null)
  const { windows: scheduleWindows } = useMealSchedule()
  const [dateEditOpen, setDateEditOpen] = useState(false)

  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const customInputRef = useRef<HTMLInputElement>(null)

  useLockScroll(isOpen)

  // Reset when opening for a new meal.
  useEffect(() => {
    if (isOpen) {
      setActiveTag(defaultTag)
      setSelectedPillIdx(5) // "1"
      setCustomMode(false)
      setCustomValue('1')
      setCustomDate(null)
      // A time belongs to the entry it was chosen for, not the next one.
      setCustomTime(null)
      setTimeMode('none')
      setDateEditOpen(false)
      setApplied(false)
      setError(null)
      setTagDropdownOpen(false)
      setCustomTagInput('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, meal?._id])

  const recipeServings = meal?.recipe?.servings && meal.recipe.servings > 0 ? meal.recipe.servings : null

  // The numeric value the user has selected (either from a pill or custom input).
  const selectedValue = useMemo<number>(() => {
    if (customMode) {
      const n = Number(customValue)
      return Number.isFinite(n) && n > 0 ? n : 0
    }
    return PORTION_PILLS[selectedPillIdx]?.value ?? 1
  }, [customMode, customValue, selectedPillIdx])

  // Effective portion sent to the server.
  // Recipe-aware: when meal.recipe.servings is set, "1" means "1 of N servings",
  // so the actual portion is selectedValue / recipeServings.
  const effectivePortion = useMemo<number>(() => {
    if (recipeServings) return selectedValue / recipeServings
    return selectedValue
  }, [selectedValue, recipeServings])

  // Live nutrition preview for the chosen portion.
  const previewNutrition = useMemo(() => {
    const n = meal?.totalNutrition
    if (!n) return { calories: 0, protein: 0, carbs: 0, fats: 0 }
    return {
      calories: Math.round((n.calories ?? 0) * effectivePortion),
      protein: Math.round((n.protein ?? 0) * effectivePortion * 10) / 10,
      carbs: Math.round((n.carbs ?? 0) * effectivePortion * 10) / 10,
      fats: Math.round((n.fats ?? 0) * effectivePortion * 10) / 10,
    }
  }, [meal, effectivePortion])

  const allTagOptions = useMemo<string[]>(() => {
    const defaults = availableTags?.defaults ?? ['breakfast', 'lunch', 'dinner', 'snack', 'pre-workout', 'post-workout']
    const userTags = availableTags?.userTags ?? []
    const seen = new Set<string>()
    const out: string[] = []
    for (const t of [...defaults, ...userTags]) {
      const norm = String(t).toLowerCase()
      if (norm && !seen.has(norm)) {
        seen.add(norm)
        out.push(norm)
      }
    }
    return out
  }, [availableTags])

  const handleAddCustomTag = () => {
    const norm = customTagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!norm) return
    setActiveTag(norm)
    setCustomTagInput('')
    setTagDropdownOpen(false)
  }

  const handleApply = async () => {
    if (!meal || applying) return
    if (!Number.isFinite(effectivePortion) || effectivePortion <= 0) {
      setError('Pick a valid portion.')
      return
    }
    setApplying(true)
    setError(null)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      let res: Response
      if (isPlanMode) {
        // Plan flow: snapshot the meal as a MealPlan at viewedDate.
        // The server snapshots items[] from the meal at plan-create time.
        const base = viewedDate ?? new Date()
        const y = base.getFullYear()
        const m = String(base.getMonth() + 1).padStart(2, '0')
        const d = String(base.getDate()).padStart(2, '0')
        const plannedDate = `${y}-${m}-${d}`
        res = await fetch('/api/meal-plans', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            plannedDate,
            tag: activeTag,
            mealId: meal._id,
          }),
        })
      } else {
        // An untimed meal still gets a loggedAt, stamped at its tag's ANCHOR so
        // anything reading only the timestamp still orders it sensibly; the
        // `untimed` flag is what makes the day view ignore the clock.
        const loggedAt = buildLoggedAt(
          customDate,
          timeMode === 'none'
            ? formatHHMM(anchorMinutesForTag(scheduleWindows, activeTag))
            : timeMode === 'custom' ? customTime : null,
          viewedDate,
        )
        res = await fetch(`/api/meals/${meal._id}/log`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            portion: effectivePortion,
            tags: [activeTag],
            loggedAt,
            untimed: timeMode === 'none',
          }),
        })
      }
      if (res.ok) {
        setApplied(true)
        onApplied?.()
        // Auto-close after a brief beat so the user sees the success state.
        setTimeout(() => {
          onClose()
        }, 600)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data?.error || 'Failed to log meal.')
      }
    } catch {
      setError('Network error.')
    } finally {
      setApplying(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && meal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
          onClick={() => !applying && onClose()}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-900 sm:max-w-md sm:rounded-2xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800 sm:px-6">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                {meal.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={meal.imageUrl} alt={meal.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-400 dark:text-zinc-600">
                    <ChefHat className="h-5 w-5" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-bold text-zinc-900 dark:text-white">
                  {meal.name}
                </h3>
                {recipeServings != null && (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Recipe yields {recipeServings} {recipeServings === 1 ? 'serving' : 'servings'}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                disabled={applying}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-5 sm:p-6">
              {/* Tag picker */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setTagDropdownOpen(v => !v)}
                  className="flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                >
                  <TagIcon className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Adding to</span>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                    {titleCaseTag(activeTag)}
                  </span>
                  <ChevronDown className={`ml-auto h-4 w-4 text-zinc-400 transition-transform ${tagDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {tagDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
                    >
                      <div className="grid grid-cols-2 gap-1">
                        {allTagOptions.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => { setActiveTag(t); setTagDropdownOpen(false) }}
                            className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                              activeTag === t
                                ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                                : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600'
                            }`}
                          >
                            <span className="truncate">{titleCaseTag(t)}</span>
                            {activeTag === t && <Check className="h-3 w-3 shrink-0" />}
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                        <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          New tag
                        </p>
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={customTagInput}
                            onChange={(e) => setCustomTagInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomTag() } }}
                            placeholder="e.g. brunch"
                            className="flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400/30 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:placeholder-zinc-500"
                          />
                          <button
                            type="button"
                            onClick={handleAddCustomTag}
                            disabled={!customTagInput.trim()}
                            className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-semibold text-white transition-colors hover:bg-black disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Portion picker */}
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Portion
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PORTION_PILLS.map((p, idx) => {
                    const active = !customMode && selectedPillIdx === idx
                    const oneLabel = recipeServings ? `1 of ${recipeServings}` : '1 portion'
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setCustomMode(false)
                          setSelectedPillIdx(idx)
                        }}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                          active
                            ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                            : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {p.value === 1 ? oneLabel : p.label}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setCustomMode(true)
                      setTimeout(() => customInputRef.current?.focus(), 50)
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      customMode
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                        : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {customMode && (
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      {recipeServings ? `Servings (of ${recipeServings})` : 'Portions'}
                    </label>
                    <input
                      ref={customInputRef}
                      type="number"
                      min="0.05"
                      max="20"
                      step="0.05"
                      value={customValue}
                      onChange={(e) => setCustomValue(e.target.value)}
                      className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-center text-sm font-medium text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                    />
                  </div>
                )}
              </div>

              {/* Date-only picker — defaults to "Now" (today @ current wall-clock).
                  Tap to backdate. Hidden in plan mode — plans carry the
                  page-supplied plannedDate. */}
              {!isPlanMode && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDateEditOpen(v => !v)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        customDate
                          ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60'
                          : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600'
                      }`}
                      aria-expanded={dateEditOpen}
                      aria-label={customDate ? `Logging for ${formatDatePillLabel(customDate)}, tap to change date` : 'Log date: now, tap to choose a past date'}
                    >
                      <CalendarDays className="h-3 w-3" />
                      <span className="tabular-nums">{formatDatePillLabel(customDate)}</span>
                    </button>
                    {customDate && (
                      <button
                        type="button"
                        onClick={() => { setCustomDate(null); setDateEditOpen(false) }}
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                        aria-label="Clear date"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                    {timeMode === 'custom' && customTime && (
                      <button
                        type="button"
                        onClick={() => setDateEditOpen(v => !v)}
                        data-testid="meal-time-pill"
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                        aria-label={`Logging at ${formatClockLabel(parseHHMM(customTime) ?? 0)}, tap to change`}
                      >
                        <Clock className="h-3 w-3" />
                        <span className="tabular-nums">{formatClockLabel(parseHHMM(customTime) ?? 0)}</span>
                      </button>
                    )}
                    {timeMode === 'none' && (
                      <button
                        type="button"
                        onClick={() => setDateEditOpen(v => !v)}
                        data-testid="meal-no-time-pill"
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-zinc-200 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                        aria-label="No time set, tap to change"
                      >
                        No time
                      </button>
                    )}
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                      {timeMode === 'none'
                        ? 'Placed by meal order'
                        : timeMode === 'custom'
                          ? 'Logged at chosen time'
                          : customDate ? 'Logged on chosen day' : 'Logged now'}
                    </span>
                  </div>
                  <AnimatePresence initial={false}>
                    {dateEditOpen && (
                      <motion.div
                        key="dateonly-disclosure"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <DateOnlyPicker
                          value={customDate ?? dateToKey(viewedDate ?? new Date())}
                          maxDate={dateToKey(new Date())}
                          showTodayChip
                          onClear={() => { setCustomDate(null); setCustomTime(null); setTimeMode('none'); setDateEditOpen(false) }}
                          onChange={(next) => {
                            const todayKey = dateToKey(new Date())
                            setCustomDate(next === todayKey ? null : next)
                            // Backdating is where a time starts mattering: without
                            // one every entry filed to that day lands on the current
                            // minute and the day reads in entry order.
                            if (next !== todayKey && timeMode === 'now') {
                              const w = windowForTag(scheduleWindows, activeTag)
                              setCustomTime(formatHHMM(w ? w.startMinutes : minutesOfDay(new Date())))
                              setTimeMode('custom')
                            }
                          }}
                        />
                        {/* Time row — same three controls as the food picker, so
                            logging a meal and logging a food behave alike. */}
                        <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/60">
                          <div className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                            <span className="shrink-0 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">Time</span>
                            <input
                              type="time"
                              value={timeMode === 'custom' && customTime ? customTime : formatHHMM(minutesOfDay(new Date()))}
                              onChange={(ev) => {
                                const v = ev.target.value
                                if (!v) { setCustomTime(null); setTimeMode('none'); return }
                                setCustomTime(v); setTimeMode('custom')
                              }}
                              disabled={timeMode === 'none'}
                              data-testid="meal-time-input"
                              aria-label="Time this was eaten"
                              className="ml-auto rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs tabular-nums text-zinc-900 disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-white"
                            />
                            <button
                              type="button"
                              onClick={() => { setCustomTime(null); setTimeMode('now') }}
                              data-testid="meal-time-now"
                              aria-label="Use the current time"
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                                timeMode === 'now'
                                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                                  : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300'
                              }`}
                            >
                              Now
                            </button>
                            <button
                              type="button"
                              onClick={() => { setCustomTime(null); setTimeMode('none') }}
                              data-testid="meal-time-clear"
                              aria-label="Clear the time and log for the day only"
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${
                                timeMode === 'none'
                                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                                  : 'text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                              }`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          <p className="mt-1.5 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                            {timeMode === 'none'
                              ? 'No time. This sits in your meal order rather than at a clock position.'
                              : 'Tap the X to log for the day with no time at all.'}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Live nutrition preview */}
              <div className="grid grid-cols-4 gap-2 rounded-lg bg-zinc-50 p-2.5 text-center dark:bg-zinc-800/50">
                <div>
                  <p className="text-base font-bold tabular-nums text-zinc-900 dark:text-white">
                    {previewNutrition.calories}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Cal</p>
                </div>
                <div>
                  <p className="text-base font-bold tabular-nums text-blue-600 dark:text-blue-400">
                    {previewNutrition.protein}g
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Protein</p>
                </div>
                <div>
                  <p className="text-base font-bold tabular-nums text-green-600 dark:text-green-400">
                    {previewNutrition.carbs}g
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Carbs</p>
                </div>
                <div>
                  <p className="text-base font-bold tabular-nums text-amber-600 dark:text-amber-400">
                    {previewNutrition.fats}g
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Fats</p>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
                  {error}
                </div>
              )}

              {/* Apply button */}
              <button
                onClick={handleApply}
                disabled={applying || applied || effectivePortion <= 0}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {applying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isPlanMode ? 'Planning…' : 'Logging…'}
                  </>
                ) : applied ? (
                  <>
                    <Check className="h-4 w-4" />
                    {isPlanMode ? 'Planned!' : 'Logged!'}
                  </>
                ) : (
                  isPlanMode
                    ? `Plan ${titleCaseTag(activeTag)}`
                    : `Apply to ${titleCaseTag(activeTag)}`
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
