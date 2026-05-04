"use client"

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  UtensilsCrossed,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  ChevronDown,
  Tag as TagIcon,
} from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import CalorieRing from '@/components/nutrition/CalorieRing'
import EditFoodModal from '@/components/nutrition/EditFoodModal'
import FeatureGuard from '@/components/FeatureGuard'
import type { IMealItem, IMealNutrition } from '@/models/Meal'

// ── Types ──────────────────────────────────────────────────────────────────────

interface MealLog {
  _id: string
  loggedAt: string
  items: (IMealItem & { _id?: string })[]
  tags: string[]
  totalNutrition?: IMealNutrition
  mealId?: string
  mealName?: string
  notes?: string
}

interface DayBucket {
  date: string  // YYYY-MM-DD (UTC)
  logs: MealLog[]
  dailyTotals: IMealNutrition
}

interface NutritionGoals {
  calories: number
  protein: number
  carbs: number
  fats: number
  waterGoal: number
}

type ViewMode = 'day' | 'week'

const DEFAULT_TAGS = ['breakfast', 'lunch', 'dinner', 'snack']

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDateParam(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateParam(s: string): Date {
  // Build at local midnight to keep navigation stable.
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function formatLongDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatRangeLabel(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = sameMonth
    ? end.toLocaleDateString('en-US', { day: 'numeric' })
    : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${startStr} – ${endStr}`
}

function logTotals(log: MealLog): { calories: number; protein: number; carbs: number; fats: number } {
  if (log.totalNutrition) {
    return {
      calories: Math.round(log.totalNutrition.calories || 0),
      protein: Math.round(log.totalNutrition.protein || 0),
      carbs: Math.round(log.totalNutrition.carbs || 0),
      fats: Math.round(log.totalNutrition.fats || 0),
    }
  }
  // Fallback: sum from items.
  let c = 0, p = 0, cb = 0, f = 0
  for (const item of log.items) {
    const s = item.servings ?? 1
    c += (item.nutrition?.calories ?? 0) * s
    p += (item.nutrition?.protein ?? 0) * s
    cb += (item.nutrition?.carbs ?? 0) * s
    f += (item.nutrition?.fats ?? 0) * s
  }
  return {
    calories: Math.round(c),
    protein: Math.round(p),
    carbs: Math.round(cb),
    fats: Math.round(f),
  }
}

function titleCaseTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-')
}

// Variant names that are essentially "no preparation" — don't display them.
const HIDDEN_VARIANT_NAMES = new Set(['default', 'raw'])

function shouldShowVariantName(name: string | undefined): name is string {
  if (!name) return false
  return !HIDDEN_VARIANT_NAMES.has(name.trim().toLowerCase())
}

const tagAccent: Record<string, string> = {
  breakfast: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  lunch: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  dinner: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  snack: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'pre-workout': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'post-workout': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  brunch: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  dessert: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  'late-night': 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
}

function tagClass(tag: string): string {
  return tagAccent[tag.toLowerCase()] ?? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
}

// ── Defaults ───────────────────────────────────────────────────────────────────

const defaultGoals: NutritionGoals = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fats: 65,
  waterGoal: 96,
}

// ── Page wrapper (Suspense for useSearchParams) ────────────────────────────────

export default function TimelinePage() {
  return (
    <Suspense fallback={null}>
      <TimelineClient />
    </Suspense>
  )
}

// ── Client ─────────────────────────────────────────────────────────────────────

function TimelineClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialDate = useMemo(() => {
    const dParam = searchParams?.get('date')
    if (dParam && /^\d{4}-\d{2}-\d{2}$/.test(dParam)) {
      return parseDateParam(dParam)
    }
    return new Date()
  }, [searchParams])

  const initialView = useMemo<ViewMode>(() => {
    const v = searchParams?.get('view')
    return v === 'week' ? 'week' : 'day'
  }, [searchParams])

  const [viewMode, setViewMode] = useState<ViewMode>(initialView)
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate)
  const [days, setDays] = useState<DayBucket[]>([])
  const [goals, setGoals] = useState<NutritionGoals>(defaultGoals)
  const [tagsResp, setTagsResp] = useState<{ defaults: string[]; userTags: string[] }>({
    defaults: DEFAULT_TAGS, userTags: [],
  })
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [errorToast, setErrorToast] = useState<string | null>(null)
  const [editEntry, setEditEntry] = useState<{ logId: string; item: IMealItem & { _id?: string } } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ logId: string; mealName?: string } | null>(null)
  const [filterChipsOpen, setFilterChipsOpen] = useState(false)

  // ── Auth helper ──────────────────────────────────────────────────────────

  const getHeaders = useCallback((): HeadersInit => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
  }, [])

  // ── Range derivation ─────────────────────────────────────────────────────

  const range = useMemo(() => {
    if (viewMode === 'day') {
      return { from: selectedDate, to: selectedDate }
    }
    // Week view: 7 days ending at selectedDate (inclusive).
    const to = selectedDate
    const from = new Date(selectedDate)
    from.setDate(from.getDate() - 6)
    return { from, to }
  }, [viewMode, selectedDate])

  // ── Fetchers ─────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const fromStr = formatDateParam(range.from)
      const toStr = formatDateParam(range.to)
      const url = viewMode === 'day'
        ? `/api/meal-logs?date=${fromStr}`
        : `/api/meal-logs?from=${fromStr}&to=${toStr}`

      const res = await fetch(url, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        if (viewMode === 'day') {
          const logs: MealLog[] = (data.logs || []).map((l: MealLog) => ({ ...l, _id: String(l._id) }))
          setDays([{
            date: fromStr,
            logs,
            dailyTotals: data.dailyTotals || { calories: 0, protein: 0, carbs: 0, fats: 0 },
          }])
        } else {
          const incoming: DayBucket[] = (data.days || []).map((d: DayBucket) => ({
            date: d.date,
            logs: (d.logs || []).map((l: MealLog) => ({ ...l, _id: String(l._id) })),
            dailyTotals: d.dailyTotals || { calories: 0, protein: 0, carbs: 0, fats: 0 },
          }))
          setDays(incoming)
        }
      } else {
        setDays([])
      }
    } catch (err) {
      console.error('Failed to fetch timeline data:', err)
      setDays([])
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to, viewMode, getHeaders])

  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch('/api/nutrition/goals', { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setGoals(data)
      }
    } catch (err) {
      console.error('Failed to fetch nutrition goals:', err)
    }
  }, [getHeaders])

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/tags', { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setTagsResp({
          defaults: Array.isArray(data.defaults) ? data.defaults : DEFAULT_TAGS,
          userTags: Array.isArray(data.userTags) ? data.userTags : [],
        })
      }
    } catch (err) {
      console.error('Failed to fetch tags:', err)
    }
  }, [getHeaders])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchGoals(); fetchTags() }, [fetchGoals, fetchTags])

  // ── Filtering ────────────────────────────────────────────────────────────

  const matchesFilter = useCallback((log: MealLog): boolean => {
    if (activeFilters.size === 0) return true
    const tags = (log.tags || []).map(t => String(t).toLowerCase())
    for (const t of tags) if (activeFilters.has(t)) return true
    return false
  }, [activeFilters])

  // For each day, filter logs and recompute totals against the filtered set.
  const filteredDays = useMemo<DayBucket[]>(() => {
    if (activeFilters.size === 0) return days
    return days.map(d => {
      const filteredLogs = d.logs.filter(matchesFilter)
      const totals: IMealNutrition = { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0, sodium: 0, saturatedFat: 0 }
      for (const log of filteredLogs) {
        const n = log.totalNutrition
        if (n) {
          totals.calories += n.calories || 0
          totals.protein  += n.protein  || 0
          totals.carbs    += n.carbs    || 0
          totals.fats     += n.fats     || 0
        }
      }
      totals.calories = Math.round(totals.calories)
      totals.protein = Math.round(totals.protein)
      totals.carbs = Math.round(totals.carbs)
      totals.fats = Math.round(totals.fats)
      return { ...d, logs: filteredLogs, dailyTotals: totals }
    })
  }, [days, activeFilters, matchesFilter])

  // ── Navigation ──────────────────────────────────────────────────────────

  const navigate = (deltaDays: number) => {
    const next = new Date(selectedDate)
    next.setDate(next.getDate() + deltaDays)
    setSelectedDate(next)
  }

  const goPrev = () => navigate(viewMode === 'day' ? -1 : -7)
  const goNext = () => navigate(viewMode === 'day' ? 1 : 7)
  const goToday = () => setSelectedDate(new Date())

  const setView = (v: ViewMode) => {
    setViewMode(v)
    // Reflect in URL so it persists on reload / shares.
    const params = new URLSearchParams(searchParams?.toString() || '')
    params.set('view', v)
    params.set('date', formatDateParam(selectedDate))
    router.replace(`/dashboard/timeline?${params.toString()}`, { scroll: false })
  }

  // ── Available tags (defaults + user tags) ────────────────────────────────

  const allFilterTags = useMemo<string[]>(() => {
    const out: string[] = [...(tagsResp.defaults?.length ? tagsResp.defaults : DEFAULT_TAGS)]
    for (const t of tagsResp.userTags || []) {
      const norm = String(t).toLowerCase()
      if (!out.includes(norm)) out.push(norm)
    }
    return out
  }, [tagsResp])

  const toggleFilter = (tag: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev)
      const norm = tag.toLowerCase()
      if (next.has(norm)) next.delete(norm)
      else next.add(norm)
      return next
    })
  }

  const clearFilters = () => setActiveFilters(new Set())

  // ── Mutations ────────────────────────────────────────────────────────────

  const showErrorToast = (msg: string) => {
    setErrorToast(msg)
    setTimeout(() => setErrorToast(null), 4000)
  }

  const handleDeleteLog = async (logId: string) => {
    try {
      const res = await fetch(`/api/meal-logs/${logId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      if (res.ok) {
        await fetchData()
      } else {
        showErrorToast('Failed to delete entry.')
      }
    } catch (err) {
      console.error('Failed to delete meal log:', err)
      showErrorToast('Failed to delete entry. Check your connection.')
    } finally {
      setConfirmDelete(null)
    }
  }

  // ── Day-mode totals (for CalorieRing) ────────────────────────────────────

  const dayTotals = useMemo(() => {
    const d = filteredDays[0]
    if (!d) return { calories: 0, protein: 0, carbs: 0, fats: 0 }
    return {
      calories: Math.round(d.dailyTotals.calories || 0),
      protein: Math.round(d.dailyTotals.protein || 0),
      carbs: Math.round(d.dailyTotals.carbs || 0),
      fats: Math.round(d.dailyTotals.fats || 0),
    }
  }, [filteredDays])

  // ── Week-mode summary ───────────────────────────────────────────────────

  const weekSummary = useMemo(() => {
    const totalCals = filteredDays.reduce((s, d) => s + (d.dailyTotals.calories || 0), 0)
    const daysWithFood = filteredDays.filter(d => (d.logs?.length ?? 0) > 0).length
    const avg = daysWithFood > 0 ? totalCals / daysWithFood : 0
    const maxCals = Math.max(0, ...filteredDays.map(d => d.dailyTotals.calories || 0))
    return {
      total: Math.round(totalCals),
      avg: Math.round(avg),
      max: Math.round(maxCals),
      daysLogged: daysWithFood,
    }
  }, [filteredDays])

  // ── Loading skeleton ─────────────────────────────────────────────────────

  if (loading && days.length === 0) {
    return (
      <PageTransition className="space-y-4 pb-6 sm:space-y-6">
        <header className="mb-2 sm:mb-4">
          <div className="h-8 w-32 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="mt-2 h-4 w-56 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        </header>
        <div className="h-10 w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-12 w-full animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        ))}
      </PageTransition>
    )
  }

  return (
    <FeatureGuard
      feature="Nutrition"
      description="Precision nutrition tracking and meal planning, built around your goals. Launching soon."
      icon={<UtensilsCrossed className="h-10 w-10" />}
    >
      <PageTransition className="space-y-4 pb-6 sm:space-y-6">
        {/* Header */}
        <header className="mb-2 sm:mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">Timeline</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 sm:text-base">
                Your eating history, in chronological order
              </p>
            </div>
            <Link
              href={`/dashboard/nutrition?date=${formatDateParam(selectedDate)}`}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700"
              aria-label="Switch to sections view"
              title="Sections view"
            >
              <UtensilsCrossed className="h-5 w-5" />
            </Link>
          </div>
        </header>

        {/* View-mode toggle */}
        <div className="inline-flex w-full rounded-xl border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            onClick={() => setView('day')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors sm:text-sm ${
              viewMode === 'day'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Day
          </button>
          <button
            onClick={() => setView('week')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors sm:text-sm ${
              viewMode === 'week'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            Week
          </button>
        </div>

        {/* Date navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={goPrev}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
            aria-label={viewMode === 'day' ? 'Previous day' : 'Previous week'}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <button
            onClick={goToday}
            className="flex flex-col items-center gap-0.5"
          >
            <span className="text-sm font-semibold text-zinc-900 dark:text-white">
              {viewMode === 'day'
                ? formatShortDate(selectedDate)
                : formatRangeLabel(range.from, range.to)
              }
            </span>
            {viewMode === 'day' && isSameLocalDay(selectedDate, new Date()) && (
              <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Today
              </span>
            )}
          </button>

          <button
            onClick={goNext}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
            aria-label={viewMode === 'day' ? 'Next day' : 'Next week'}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Tag filter chips */}
        <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            onClick={() => setFilterChipsOpen(o => !o)}
            className="flex w-full items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <TagIcon className="h-4 w-4 shrink-0 text-zinc-400" />
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Filter by tag
              </span>
              {activeFilters.size > 0 && (
                <span className="rounded-full bg-zinc-900 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white dark:bg-white dark:text-black">
                  {activeFilters.size}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {activeFilters.size > 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); clearFilters() }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); clearFilters() } }}
                  className="text-[11px] font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 cursor-pointer"
                >
                  Clear
                </span>
              )}
              <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform ${filterChipsOpen ? '' : '-rotate-90'}`} />
            </div>
          </button>

          <AnimatePresence initial={false}>
            {filterChipsOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {allFilterTags.map(tag => {
                    const active = activeFilters.has(tag.toLowerCase())
                    return (
                      <button
                        key={tag}
                        onClick={() => toggleFilter(tag)}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                          active
                            ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                            : `${tagClass(tag)} hover:opacity-80`
                        }`}
                      >
                        {titleCaseTag(tag)}
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Body */}
        {viewMode === 'day' ? (
          <DayView
            date={selectedDate}
            day={filteredDays[0]}
            goals={goals}
            dayTotals={dayTotals}
            onEditItem={(logId, item) => setEditEntry({ logId, item })}
            onDeleteLog={(logId, mealName) => setConfirmDelete({ logId, mealName })}
            isFilterActive={activeFilters.size > 0}
          />
        ) : (
          <WeekView
            days={filteredDays}
            summary={weekSummary}
            onEditItem={(logId, item) => setEditEntry({ logId, item })}
            onDeleteLog={(logId, mealName) => setConfirmDelete({ logId, mealName })}
            isFilterActive={activeFilters.size > 0}
          />
        )}
      </PageTransition>

      {/* Edit Food Modal */}
      <EditFoodModal
        isOpen={editEntry !== null}
        item={editEntry?.item ?? null}
        logId={editEntry?.logId ?? ''}
        onClose={() => setEditEntry(null)}
        onSaved={fetchData}
      />

      {/* Delete confirmation */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900 sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                  <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-zinc-900 dark:text-white">Delete entry?</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {confirmDelete.mealName ?? 'This meal log will be removed.'}
                  </p>
                </div>
              </div>
              <p className="mb-5 text-sm text-zinc-600 dark:text-zinc-400">
                This will remove the entire entry and all of its items. This can&apos;t be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 rounded-xl border-2 border-zinc-200 py-3 font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteLog(confirmDelete.logId)}
                  className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white transition-colors hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error toast */}
      {errorToast && (
        <div className="fixed bottom-24 left-1/2 z-[100] -translate-x-1/2 flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-medium text-white shadow-lg">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorToast}
        </div>
      )}
    </FeatureGuard>
  )
}

// ── Day view ───────────────────────────────────────────────────────────────────

interface DayViewProps {
  date: Date
  day?: DayBucket
  goals: NutritionGoals
  dayTotals: { calories: number; protein: number; carbs: number; fats: number }
  onEditItem: (logId: string, item: IMealItem & { _id?: string }) => void
  onDeleteLog: (logId: string, mealName?: string) => void
  isFilterActive: boolean
}

function DayView({ date, day, goals, dayTotals, onEditItem, onDeleteLog, isFilterActive }: DayViewProps) {
  const dateStr = formatDateParam(date)
  const logs = day?.logs ?? []

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Day header */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {isSameLocalDay(date, new Date()) ? 'Today' : 'Day'}
        </p>
        <h2 className="mt-0.5 text-lg font-bold text-zinc-900 dark:text-white">
          {formatLongDate(date)}
        </h2>
      </div>

      {/* Calorie ring + macros */}
      <CalorieRing
        consumed={dayTotals.calories}
        goal={goals.calories}
        protein={{ current: dayTotals.protein, goal: goals.protein }}
        carbs={{ current: dayTotals.carbs, goal: goals.carbs }}
        fats={{ current: dayTotals.fats, goal: goals.fats }}
      />

      {/* Timeline */}
      {logs.length === 0 ? (
        <EmptyState
          dateStr={dateStr}
          message={isFilterActive
            ? 'No entries match the active tag filter.'
            : 'No food logged for this day.'
          }
        />
      ) : (
        <div className="relative">
          {/* Vertical rail */}
          <div className="absolute left-[52px] top-2 bottom-2 w-px bg-zinc-200 dark:bg-zinc-800 sm:left-[60px]" aria-hidden />
          <ol className="space-y-3">
            {logs.map((log) => (
              <TimelineLogCard
                key={log._id}
                log={log}
                onEditItem={onEditItem}
                onDeleteLog={onDeleteLog}
              />
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

// ── Week view ──────────────────────────────────────────────────────────────────

interface WeekViewProps {
  days: DayBucket[]
  summary: { total: number; avg: number; max: number; daysLogged: number }
  onEditItem: (logId: string, item: IMealItem & { _id?: string }) => void
  onDeleteLog: (logId: string, mealName?: string) => void
  isFilterActive: boolean
}

function WeekView({ days, summary, onEditItem, onDeleteLog, isFilterActive }: WeekViewProps) {
  // Order newest-first so the most recent days are at the top.
  const ordered = useMemo(() => [...days].sort((a, b) => b.date.localeCompare(a.date)), [days])
  const allEmpty = days.every(d => d.logs.length === 0)

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Summary panel */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid grid-cols-3 gap-3 border-b border-zinc-100 pb-3 dark:border-zinc-800">
          <SummaryStat label="Total" value={summary.total.toLocaleString()} unit="cal" />
          <SummaryStat label="Daily avg" value={summary.avg.toLocaleString()} unit="cal" />
          <SummaryStat label="Days logged" value={`${summary.daysLogged}`} unit="of 7" />
        </div>

        {/* Lightweight CSS bar chart — 7 bars, oldest -> newest left -> right */}
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Calories per day
          </p>
          <div className="flex h-24 items-end gap-1.5 sm:gap-2">
            {[...days].sort((a, b) => a.date.localeCompare(b.date)).map(d => {
              const cal = d.dailyTotals.calories || 0
              const pct = summary.max > 0 ? (cal / summary.max) * 100 : 0
              const dt = parseDateParam(d.date)
              const isToday = isSameLocalDay(dt, new Date())
              const dayLabel = dt.toLocaleDateString('en-US', { weekday: 'narrow' })
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-full w-full items-end">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max(pct, cal > 0 ? 4 : 0)}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className={`w-full rounded-t-md ${
                        isToday
                          ? 'bg-emerald-500 dark:bg-emerald-500'
                          : 'bg-zinc-300 dark:bg-zinc-700'
                      }`}
                      title={`${cal} cal`}
                    />
                  </div>
                  <span className={`text-[10px] font-semibold uppercase tabular-nums ${
                    isToday
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-zinc-500 dark:text-zinc-400'
                  }`}>
                    {dayLabel}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Day groups */}
      {allEmpty ? (
        <EmptyState
          dateStr={formatDateParam(new Date())}
          message={isFilterActive
            ? 'No entries match the active tag filter for this week.'
            : 'No food logged for this week.'
          }
        />
      ) : (
        <div className="space-y-3">
          {ordered.map(d => (
            <WeekDayGroup
              key={d.date}
              day={d}
              onEditItem={onEditItem}
              onDeleteLog={onDeleteLog}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="text-center">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-zinc-900 dark:text-white">{value}</p>
      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{unit}</p>
    </div>
  )
}

// ── Week day group (collapsible, compact) ─────────────────────────────────────

interface WeekDayGroupProps {
  day: DayBucket
  onEditItem: (logId: string, item: IMealItem & { _id?: string }) => void
  onDeleteLog: (logId: string, mealName?: string) => void
}

function WeekDayGroup({ day, onEditItem, onDeleteLog }: WeekDayGroupProps) {
  const dt = parseDateParam(day.date)
  const isToday = isSameLocalDay(dt, new Date())
  const calories = Math.round(day.dailyTotals.calories || 0)
  const [expanded, setExpanded] = useState<boolean>(isToday || day.logs.length > 0)

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex w-full items-center gap-3 p-3 sm:p-4"
      >
        <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {dt.toLocaleDateString('en-US', { weekday: 'short' })}
          </span>
          <span className="text-base font-bold leading-none text-zinc-900 dark:text-white">
            {dt.getDate()}
          </span>
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">
            {dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {isToday && (
              <span className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                Today
              </span>
            )}
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {day.logs.length === 0
              ? 'No entries'
              : `${day.logs.length} ${day.logs.length === 1 ? 'entry' : 'entries'}`
            }
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-base font-bold tabular-nums text-zinc-900 dark:text-white">
            {calories.toLocaleString()}
          </p>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">cal</p>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-zinc-400 transition-transform ${expanded ? '' : '-rotate-90'}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-100 px-3 py-3 dark:border-zinc-800 sm:px-4">
              {day.logs.length === 0 ? (
                <Link
                  href={`/dashboard/nutrition?date=${day.date}`}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 py-2.5 text-xs font-medium text-zinc-500 transition-colors hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-200"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add food
                </Link>
              ) : (
                <ul className="space-y-2">
                  {day.logs.map(log => (
                    <CompactLogRow
                      key={log._id}
                      log={log}
                      onEditItem={onEditItem}
                      onDeleteLog={onDeleteLog}
                    />
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Compact log row (used in week view) ────────────────────────────────────────

interface CompactLogRowProps {
  log: MealLog
  onEditItem: (logId: string, item: IMealItem & { _id?: string }) => void
  onDeleteLog: (logId: string, mealName?: string) => void
}

function CompactLogRow({ log, onEditItem, onDeleteLog }: CompactLogRowProps) {
  const [expanded, setExpanded] = useState(false)
  const totals = logTotals(log)
  const time = formatTime(log.loggedAt)

  return (
    <li className="overflow-hidden rounded-lg bg-zinc-50 dark:bg-zinc-800/40">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
      >
        <span className="w-14 shrink-0 text-[11px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
          {time}
        </span>
        <div className="flex-1 min-w-0">
          <p className="truncate text-xs font-medium text-zinc-900 dark:text-white">
            {log.mealName ?? log.items[0]?.name ?? 'Food entry'}
            {!log.mealName && log.items.length > 1 && (
              <span className="ml-1 text-zinc-500 dark:text-zinc-400">
                +{log.items.length - 1}
              </span>
            )}
          </p>
          {log.tags.length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-1">
              {log.tags.slice(0, 3).map(t => (
                <span
                  key={t}
                  className={`rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wider ${tagClass(t)}`}
                >
                  {titleCaseTag(t)}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
          {totals.calories}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${expanded ? '' : '-rotate-90'}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-200 px-3 py-2 dark:border-zinc-700">
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-700/60">
                {log.items.map((item, i) => (
                  <CompactItemRow
                    key={`${log._id}-${item._id ?? i}`}
                    logId={log._id}
                    item={item}
                    onEdit={() => onEditItem(log._id, item)}
                  />
                ))}
              </ul>
              <div className="mt-2 flex items-center justify-between border-t border-zinc-200 pt-2 dark:border-zinc-700">
                <div className="flex gap-2 text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                  <span>P {totals.protein}g</span>
                  <span>C {totals.carbs}g</span>
                  <span>F {totals.fats}g</span>
                </div>
                <button
                  onClick={() => onDeleteLog(log._id, log.mealName)}
                  className="flex items-center gap-1 rounded text-[11px] font-semibold text-red-500 transition-colors hover:text-red-600 dark:text-red-400"
                  aria-label="Delete log"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

function CompactItemRow({ item, onEdit }: { logId: string; item: IMealItem & { _id?: string }; onEdit: () => void }) {
  const cal = Math.round((item.nutrition?.calories ?? 0) * (item.servings ?? 1))
  const showVariant = shouldShowVariantName(item.variantName)
  return (
    <li className="flex items-center gap-2 py-1.5">
      <div className="flex-1 min-w-0">
        <p className="truncate text-[11px] font-medium text-zinc-900 dark:text-white">
          {item.name}
          {showVariant && (
            <span className="font-normal text-zinc-500 dark:text-zinc-400"> &middot; {item.variantName}</span>
          )}
        </p>
        <p className="truncate text-[10px] text-zinc-500 dark:text-zinc-400 tabular-nums">
          {item.servings}× {item.servingSize}{item.servingUnit}
        </p>
      </div>
      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
        {cal} cal
      </span>
      <button
        onClick={onEdit}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
        aria-label="Edit item"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </li>
  )
}

// ── Day-mode timeline log card ─────────────────────────────────────────────────

interface TimelineLogCardProps {
  log: MealLog
  onEditItem: (logId: string, item: IMealItem & { _id?: string }) => void
  onDeleteLog: (logId: string, mealName?: string) => void
}

function TimelineLogCard({ log, onEditItem, onDeleteLog }: TimelineLogCardProps) {
  const totals = logTotals(log)
  const time = formatTime(log.loggedAt)

  return (
    <li className="relative pl-[68px] sm:pl-[78px]">
      {/* Time gutter */}
      <div className="absolute left-0 top-2 w-[52px] sm:w-[60px] text-right">
        <p className="text-xs font-semibold tabular-nums text-zinc-900 dark:text-white">
          {time}
        </p>
      </div>
      {/* Rail dot */}
      <div className="absolute left-[48px] top-4 h-2 w-2 rounded-full bg-zinc-400 ring-4 ring-zinc-50 dark:bg-zinc-500 dark:ring-zinc-950 sm:left-[56px]" aria-hidden />

      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25 }}
        className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
          <div className="flex-1 min-w-0">
            {log.mealName && (
              <div className="mb-1 inline-flex items-center gap-1 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                <span>From: {log.mealName}</span>
              </div>
            )}
            {log.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {log.tags.map(t => (
                  <span
                    key={t}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tagClass(t)}`}
                  >
                    {titleCaseTag(t)}
                  </span>
                ))}
              </div>
            )}
            {log.notes && (
              <p className="mt-1 text-xs italic text-zinc-500 dark:text-zinc-400">{log.notes}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-base font-bold tabular-nums text-zinc-900 dark:text-white">
              {totals.calories}
            </p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">cal</p>
          </div>
        </div>

        {/* Items */}
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {log.items.map((item, i) => (
            <FullItemRow
              key={`${log._id}-${item._id ?? i}`}
              item={item}
              onEdit={() => onEditItem(log._id, item)}
            />
          ))}
        </ul>

        {/* Footer macros + delete */}
        <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
          <div className="flex gap-3 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
            <span>P: {totals.protein}g</span>
            <span>C: {totals.carbs}g</span>
            <span>F: {totals.fats}g</span>
          </div>
          <button
            onClick={() => onDeleteLog(log._id, log.mealName)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            aria-label="Delete entire log"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        </div>
      </motion.div>
    </li>
  )
}

function FullItemRow({ item, onEdit }: { item: IMealItem & { _id?: string }; onEdit: () => void }) {
  const cal = Math.round((item.nutrition?.calories ?? 0) * (item.servings ?? 1))
  const showVariant = shouldShowVariantName(item.variantName)
  const servingDisplay = `${item.servings !== 1 ? `${item.servings} servings` : '1 serving'}`
  const sizeDisplay = `${item.servingSize} ${item.servingUnit}`

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
          {item.name}
          {showVariant && (
            <span className="font-normal text-zinc-500 dark:text-zinc-400">
              {' '}&middot; {item.variantName}
            </span>
          )}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
          {item.brand && (
            <span className="text-zinc-400 dark:text-zinc-500">{item.brand} &middot; </span>
          )}
          {servingDisplay} &middot; {sizeDisplay}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
        {cal}
      </span>
      <button
        onClick={onEdit}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        aria-label="Edit item"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ dateStr, message }: { dateStr: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <UtensilsCrossed className="h-5 w-5 text-zinc-400" />
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
      <Link
        href={`/dashboard/nutrition?date=${dateStr}`}
        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        <Plus className="h-3.5 w-3.5" />
        Add food
      </Link>
    </div>
  )
}
