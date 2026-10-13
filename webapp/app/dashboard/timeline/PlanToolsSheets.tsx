"use client"

// ---------------------------------------------------------------------------
// PlanToolsSheets — bulk planning UI for the month view (Plan §11.7 / §6.8).
//
// Two sheets, both mobile-first bottom sheets that mirror the existing
// FoodLogSheet / MealApplySheet shells. Each closes on submit and bumps the
// month-view reload via the caller's onApplied callback.
//
//   • CopyDayForwardSheet — pick a source date + N forward target dates +
//     dedup mode. Calls POST /api/meal-plans/bulk-from-day.
//   • ApplyMealToDaysSheet — pick a Meal template (search) + target dates
//     (multi-select within the displayed month grid) + tag + optional
//     recurrence. Calls POST /api/meal-plans/bulk-from-meal.
//
// Bulk-op confirm dialog: any op affecting >7 distinct target dates shows
// a confirmation step ("Apply Avocado Toast to 30 days?"). Per plan §11.7
// acceptance "Bulk op with N > 7 surfaces a confirm dialog".
// ---------------------------------------------------------------------------

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Check,
  Loader2,
  Calendar as CalendarIcon,
  CopyPlus,
  ChefHat,
  Search,
  AlertTriangle,
  Repeat,
} from 'lucide-react'
import { useLockScroll } from '@/lib/useLockScroll'
import { toDateKey, getMonthDays, DAY_LABELS, MONTH_NAMES, isSameLocalDay } from '@/lib/calendarDays'

interface MealLite {
  _id: string
  name: string
  imageUrl?: string
  tags?: string[]
  totalNutrition?: { calories?: number }
}

interface CopyDayForwardSheetProps {
  isOpen: boolean
  /** Default source date (typically the user's currently-selected day or yesterday). */
  defaultSourceDate: Date
  /** The month currently shown in MonthView — used to seed the forward range. */
  contextDate: Date
  /** Auth headers for the bulk endpoint. */
  getHeaders: () => HeadersInit
  onClose: () => void
  /** Fires on successful POST. Caller refetches month + day data. */
  onApplied: (summary: { created: number; merged: number; replaced: number }) => void
}

export function CopyDayForwardSheet({
  isOpen,
  defaultSourceDate,
  contextDate,
  getHeaders,
  onClose,
  onApplied,
}: CopyDayForwardSheetProps) {
  useLockScroll(isOpen)

  // Source: the date we're copying FROM. Editable, defaults to the day the
  // user tapped (or yesterday if it's a fresh open).
  const [sourceDateKey, setSourceDateKey] = useState<string>(toDateKey(defaultSourceDate))
  const [sourceType, setSourceType] = useState<'log' | 'plan'>('log')
  // Forward range: N days starting tomorrow relative to source.
  const [forwardDays, setForwardDays] = useState<number>(5)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmNeeded, setConfirmNeeded] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setSourceDateKey(toDateKey(defaultSourceDate))
      setSourceType('log')
      setForwardDays(5)
      setSubmitting(false)
      setError(null)
      setConfirmNeeded(false)
    }
  }, [isOpen, defaultSourceDate])

  // Compute target dates: source + 1 .. source + forwardDays.
  const targetDates = useMemo(() => {
    const [y, m, d] = sourceDateKey.split('-').map(Number)
    if (!y || !m || !d) return []
    const base = new Date(y, m - 1, d)
    const out: string[] = []
    for (let i = 1; i <= forwardDays; i++) {
      const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)
      out.push(toDateKey(next))
    }
    return out
  }, [sourceDateKey, forwardDays])

  const needsConfirm = targetDates.length > 7
  const showingPastSource = useMemo(() => {
    const [y, m, d] = sourceDateKey.split('-').map(Number)
    if (!y) return false
    const src = new Date(y, m - 1, d)
    const today = new Date()
    return src < new Date(today.getFullYear(), today.getMonth(), today.getDate())
  }, [sourceDateKey])

  const doSubmit = useCallback(async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/meal-plans/bulk-from-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getHeaders() as Record<string, string>) },
        body: JSON.stringify({
          sourceDate: sourceDateKey,
          sourceType,
          targetDates,
          mode: 'merge',
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error || 'Failed to copy day')
        setSubmitting(false)
        return
      }
      const data = await res.json()
      onApplied({
        created: data?.created ?? 0,
        merged: data?.merged ?? 0,
        replaced: data?.replaced ?? 0,
      })
      setTimeout(() => onClose(), 200)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
      setSubmitting(false)
    }
  }, [sourceDateKey, sourceType, targetDates, getHeaders, onApplied, onClose])

  const handleSubmit = () => {
    if (needsConfirm && !confirmNeeded) {
      setConfirmNeeded(true)
      return
    }
    doSubmit()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
          onClick={() => !submitting && onClose()}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
            className="relative w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-900 sm:max-w-md sm:rounded-2xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div className="flex items-center gap-2 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <CopyPlus className="h-5 w-5 text-blue-500" />
              <h3 className="flex-1 text-base font-bold text-zinc-900 dark:text-white">Copy day forward</h3>
              <button
                onClick={onClose}
                disabled={submitting}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-4 p-5">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Take a day&apos;s meals and plant them on upcoming days as plans.
              </p>

              {/* Source */}
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">From</span>
                <input
                  type="date"
                  value={sourceDateKey}
                  onChange={e => setSourceDateKey(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  max={toDateKey(new Date())}
                />
              </label>

              {/* Source type */}
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Source</span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {(['log', 'plan'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSourceType(t)}
                      aria-pressed={sourceType === t}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                        sourceType === t
                          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-200'
                          : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {t === 'log' ? 'What I ate (logs)' : 'What I planned'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Forward days */}
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Copy forward
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={forwardDays}
                    onChange={e => {
                      const n = Number(e.target.value)
                      if (Number.isFinite(n)) setForwardDays(Math.max(1, Math.min(30, Math.round(n))))
                    }}
                    className="w-16 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-center text-sm font-semibold tabular-nums text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {forwardDays === 1 ? 'day' : 'days'}
                  </span>
                  <span className="ml-auto text-[11px] text-zinc-400">{targetDates.length} target{targetDates.length === 1 ? '' : 's'}</span>
                </div>
              </div>

              {showingPastSource && sourceType === 'plan' && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                  Plans on a past date are usually already promoted to logs. You probably want &quot;What I ate&quot;.
                </p>
              )}

              {/* Confirm step for >7 dates */}
              {needsConfirm && (
                <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${
                  confirmNeeded
                    ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
                    : 'border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50'
                }`}>
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    {confirmNeeded
                      ? `Tap submit again to copy ${targetDates.length} days.`
                      : `That's a lot of days. We'll ask once more before submitting.`}
                  </p>
                </div>
              )}

              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || targetDates.length === 0}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CopyPlus className="h-4 w-4" />}
                {submitting
                  ? 'Copying…'
                  : needsConfirm && !confirmNeeded
                    ? `Copy to ${targetDates.length} days? Tap again`
                    : `Copy to ${targetDates.length} day${targetDates.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------------------
// ApplyMealToDaysSheet — pick a meal template, pick target dates (mini calendar
// grid for the displayed month), pick a tag, optional repeat, submit.
// ---------------------------------------------------------------------------

interface ApplyMealToDaysSheetProps {
  isOpen: boolean
  contextDate: Date
  defaultTag: string
  availableTags?: { defaults: string[]; userTags: string[] }
  getHeaders: () => HeadersInit
  onClose: () => void
  onApplied: (summary: { created: number; merged: number; replaced: number; seriesId?: string }) => void
}

const TAG_OPTIONS_FALLBACK = ['breakfast', 'lunch', 'dinner', 'snack', 'pre-workout', 'post-workout']

function titleCaseTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('-')
}

export function ApplyMealToDaysSheet({
  isOpen,
  contextDate,
  defaultTag,
  availableTags,
  getHeaders,
  onClose,
  onApplied,
}: ApplyMealToDaysSheetProps) {
  useLockScroll(isOpen)

  const [step, setStep] = useState<'pick-meal' | 'pick-dates'>('pick-meal')
  const [query, setQuery] = useState('')
  const [meals, setMeals] = useState<MealLite[]>([])
  const [loadingMeals, setLoadingMeals] = useState(false)
  const [selectedMeal, setSelectedMeal] = useState<MealLite | null>(null)
  const [activeTag, setActiveTag] = useState<string>(defaultTag)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [repeatOpen, setRepeatOpen] = useState(false)
  const [repeatEvery, setRepeatEvery] = useState<'day' | 'week'>('week')
  const [repeatCount, setRepeatCount] = useState<number>(4)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmNeeded, setConfirmNeeded] = useState(false)
  const [monthCursor, setMonthCursor] = useState<Date>(() => new Date(contextDate.getFullYear(), contextDate.getMonth(), 1))

  // Reset whenever the sheet opens.
  useEffect(() => {
    if (isOpen) {
      setStep('pick-meal')
      setQuery('')
      setSelectedMeal(null)
      setActiveTag(defaultTag)
      setSelectedKeys(new Set())
      setRepeatOpen(false)
      setRepeatCount(4)
      setRepeatEvery('week')
      setError(null)
      setConfirmNeeded(false)
      setSubmitting(false)
      setMonthCursor(new Date(contextDate.getFullYear(), contextDate.getMonth(), 1))
    }
  }, [isOpen, defaultTag, contextDate])

  // Fetch meal list on open / query change.
  useEffect(() => {
    if (!isOpen || step !== 'pick-meal') return
    let cancelled = false
    const run = async () => {
      setLoadingMeals(true)
      try {
        const url = query.trim()
          ? `/api/meals?q=${encodeURIComponent(query.trim())}&limit=20`
          : '/api/meals?limit=20'
        const res = await fetch(url, { headers: getHeaders() })
        if (!res.ok) {
          if (!cancelled) setMeals([])
          return
        }
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        const list: MealLite[] = Array.isArray(data?.meals) ? data.meals.map((m: { _id: string; name: string; imageUrl?: string; tags?: string[]; totalNutrition?: { calories?: number } }) => ({
          _id: String(m._id),
          name: String(m.name),
          imageUrl: m.imageUrl,
          tags: m.tags,
          totalNutrition: m.totalNutrition,
        })) : []
        setMeals(list)
      } catch {
        if (!cancelled) setMeals([])
      } finally {
        if (!cancelled) setLoadingMeals(false)
      }
    }
    const t = setTimeout(run, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [isOpen, step, query, getHeaders])

  // Build month grid for date multi-select.
  const monthDays = useMemo(() => {
    return getMonthDays(monthCursor.getFullYear(), monthCursor.getMonth())
  }, [monthCursor])

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const toggleDate = (day: Date) => {
    // Past dates can't be planned — gray out and ignore.
    if (day < today) return
    const key = toDateKey(day)
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const allTagOptions = useMemo<string[]>(() => {
    const defaults = availableTags?.defaults ?? TAG_OPTIONS_FALLBACK
    const userTags = availableTags?.userTags ?? []
    const seen = new Set<string>()
    const out: string[] = []
    for (const t of [...defaults, ...userTags]) {
      const norm = t.trim().toLowerCase()
      if (!norm || seen.has(norm)) continue
      seen.add(norm)
      out.push(norm)
    }
    return out
  }, [availableTags])

  // For confirm gate: when repeat is on, each target expands by repeatCount;
  // total = selectedKeys.size * (repeat ? repeatCount : 1).
  const totalTargets = useMemo(() => {
    const base = selectedKeys.size
    if (!repeatOpen || repeatCount <= 1) return base
    return base * repeatCount
  }, [selectedKeys.size, repeatOpen, repeatCount])

  const needsConfirm = totalTargets > 7

  const doSubmit = useCallback(async () => {
    if (!selectedMeal) return
    setSubmitting(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        mealId: selectedMeal._id,
        tag: activeTag,
        targetDates: Array.from(selectedKeys),
        mode: 'merge',
      }
      if (repeatOpen && repeatCount > 1) {
        body.repeat = { every: repeatEvery, count: repeatCount }
      }
      const res = await fetch('/api/meal-plans/bulk-from-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getHeaders() as Record<string, string>) },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error || 'Failed to apply meal')
        setSubmitting(false)
        return
      }
      const data = await res.json()
      onApplied({
        created: data?.created ?? 0,
        merged: data?.merged ?? 0,
        replaced: data?.replaced ?? 0,
        seriesId: data?.seriesId,
      })
      setTimeout(() => onClose(), 200)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
      setSubmitting(false)
    }
  }, [selectedMeal, activeTag, selectedKeys, repeatOpen, repeatCount, repeatEvery, getHeaders, onApplied, onClose])

  const handleSubmit = () => {
    if (needsConfirm && !confirmNeeded) {
      setConfirmNeeded(true)
      return
    }
    doSubmit()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex flex-col bg-black/60 sm:items-center sm:justify-center sm:p-4"
          onClick={() => !submitting && onClose()}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
            className="relative flex h-full w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-900 sm:h-[80vh] sm:max-h-[640px] sm:max-w-md sm:rounded-2xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div className="flex items-center gap-2 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <ChefHat className="h-5 w-5 text-orange-500" />
              <h3 className="flex-1 text-base font-bold text-zinc-900 dark:text-white">Apply meal to days</h3>
              <button
                onClick={onClose}
                disabled={submitting}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {step === 'pick-meal' ? (
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Pick a saved meal to apply across one or more days.
                </p>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search meals…"
                    className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                </div>

                {loadingMeals ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                  </div>
                ) : meals.length === 0 ? (
                  <p className="py-6 text-center text-sm text-zinc-400">No meals found.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {meals.map(m => (
                      <li key={m._id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMeal(m)
                            if (m.tags && m.tags.length > 0) {
                              setActiveTag(String(m.tags[0]).toLowerCase())
                            }
                            setStep('pick-dates')
                          }}
                          className="flex w-full items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-orange-100 dark:bg-orange-900/30">
                            <ChefHat className="h-4 w-4 text-orange-600 dark:text-orange-300" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{m.name}</p>
                            <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                              {m.totalNutrition?.calories ? `${Math.round(m.totalNutrition.calories)} cal` : 'No nutrition data'}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {selectedMeal && (
                  <div className="flex items-center gap-2 rounded-lg bg-orange-50 px-3 py-2 dark:bg-orange-900/20">
                    <ChefHat className="h-4 w-4 text-orange-600 dark:text-orange-300" />
                    <span className="flex-1 truncate text-sm font-semibold text-zinc-900 dark:text-white">{selectedMeal.name}</span>
                    <button
                      type="button"
                      onClick={() => setStep('pick-meal')}
                      className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Change
                    </button>
                  </div>
                )}

                {/* Tag */}
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Tag</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {allTagOptions.map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setActiveTag(t)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          activeTag === t
                            ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                            : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {titleCaseTag(t)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mini-calendar */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
                      className="rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      aria-label="Previous month"
                    >
                      ‹
                    </button>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                      {MONTH_NAMES[monthCursor.getMonth()]} {monthCursor.getFullYear()}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
                      className="rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      aria-label="Next month"
                    >
                      ›
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    {DAY_LABELS.map(d => <div key={d}>{d.charAt(0)}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5 mt-1">
                    {monthDays.map(day => {
                      const key = toDateKey(day)
                      const inMonth = day.getMonth() === monthCursor.getMonth()
                      const isPast = day < today
                      const isTodayCell = isSameLocalDay(day, new Date())
                      const isSelected = selectedKeys.has(key)
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleDate(day)}
                          disabled={isPast}
                          aria-pressed={isSelected}
                          className={`flex h-9 items-center justify-center rounded-md text-xs tabular-nums transition-colors ${
                            isSelected
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : isPast
                                ? 'text-zinc-300 dark:text-zinc-700'
                                : isTodayCell
                                  ? 'border border-zinc-300 text-zinc-900 hover:bg-zinc-100 dark:border-zinc-600 dark:text-white dark:hover:bg-zinc-800'
                                  : !inMonth
                                    ? 'text-zinc-400 hover:bg-zinc-50 dark:text-zinc-600 dark:hover:bg-zinc-800/40'
                                    : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                          }`}
                        >
                          {day.getDate()}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Recurrence */}
                <div>
                  {!repeatOpen ? (
                    <button
                      type="button"
                      onClick={() => setRepeatOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      <Repeat className="h-3 w-3" />
                      Repeat…
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 dark:border-blue-900/40 dark:bg-blue-900/20">
                      <Repeat className="h-3.5 w-3.5 text-blue-700 dark:text-blue-300" />
                      <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">Every</span>
                      <select
                        value={repeatEvery}
                        onChange={e => setRepeatEvery(e.target.value === 'day' ? 'day' : 'week')}
                        className="rounded-md border border-blue-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-blue-900/60 dark:bg-zinc-900 dark:text-blue-200"
                        aria-label="Recurrence interval"
                      >
                        <option value="day">day</option>
                        <option value="week">week</option>
                      </select>
                      <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">for</span>
                      <input
                        type="number"
                        min={1}
                        max={repeatEvery === 'day' ? 30 : 52}
                        value={repeatCount}
                        onChange={e => {
                          const n = Number(e.target.value)
                          const max = repeatEvery === 'day' ? 30 : 52
                          if (Number.isFinite(n)) setRepeatCount(Math.max(1, Math.min(max, Math.round(n))))
                        }}
                        className="w-12 rounded-md border border-blue-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-blue-900/60 dark:bg-zinc-900 dark:text-blue-200"
                      />
                      <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                        {repeatEvery === 'day' ? (repeatCount === 1 ? 'day' : 'days') : (repeatCount === 1 ? 'week' : 'weeks')}
                      </span>
                      <button
                        type="button"
                        onClick={() => { setRepeatOpen(false); setRepeatCount(4) }}
                        className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full text-blue-700 hover:bg-blue-200/60 dark:text-blue-200 dark:hover:bg-blue-900/40"
                        aria-label="Close recurrence"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50">
                  <CalendarIcon className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="text-[11px] text-zinc-600 dark:text-zinc-400">
                    {selectedKeys.size === 0
                      ? 'Select dates above'
                      : `${selectedKeys.size} date${selectedKeys.size === 1 ? '' : 's'} selected${
                          repeatOpen && repeatCount > 1 ? ` × ${repeatCount} = ${totalTargets} plans` : ''
                        }`}
                  </span>
                </div>

                {needsConfirm && (
                  <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${
                    confirmNeeded
                      ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
                      : 'border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50'
                  }`}>
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      {confirmNeeded
                        ? `Tap submit again to apply to ${totalTargets} days.`
                        : `That's a lot of days. We'll ask once more before submitting.`}
                    </p>
                  </div>
                )}

                {error && (
                  <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
                    {error}
                  </div>
                )}
              </div>
            )}

            {step === 'pick-dates' && (
              <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || selectedKeys.size === 0 || !selectedMeal}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {submitting
                    ? 'Applying…'
                    : needsConfirm && !confirmNeeded
                      ? `Apply to ${totalTargets} days? Tap again`
                      : selectedKeys.size === 0
                        ? 'Select dates'
                        : `Apply to ${totalTargets} plan${totalTargets === 1 ? '' : 's'}`}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
