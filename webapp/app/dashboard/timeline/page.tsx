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
  ChefHat,
  Tag as TagIcon,
  Check,
  X,
  Sparkles,
} from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import CalorieRing from '@/components/nutrition/CalorieRing'
import EditFoodModal from '@/components/nutrition/EditFoodModal'
import FoodSearchModal from '@/components/nutrition/FoodSearchModal'
import FeatureGuard from '@/components/FeatureGuard'
import type { IMealItem, IMealNutrition } from '@/models/Meal'
import type { IFoodEntry } from '@/models/NutritionLog'
import { formatQuantity, type Unit } from '@/lib/units'
import MonthView from './MonthView'
import type { MealPlan } from './planning'
import { tagDotColors, fetchPlansInRange } from './planning'
import TimelinePlanCard from './TimelinePlanCard'
import { CopyDayForwardSheet, ApplyMealToDaysSheet } from './PlanToolsSheets'

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

type ViewMode = 'day' | 'week' | 'month'

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

// Per-tag left-border accent. Saturated enough to be readable at a glance
// even on small screens — this is the user's primary chronological cue.
//
// `!important` is required because @redbtn/redstyle/base.css ships an
// unlayered `* { border-color: var(--border) }` reset, which wins over any
// Tailwind utility (utilities live in @layer utilities; unlayered always
// beats layered regardless of specificity).
const tagBorderAccent: Record<string, string> = {
  breakfast: '!border-l-amber-500 dark:!border-l-amber-400',
  lunch: '!border-l-orange-500 dark:!border-l-orange-400',
  dinner: '!border-l-indigo-500 dark:!border-l-indigo-400',
  snack: '!border-l-emerald-500 dark:!border-l-emerald-400',
  'pre-workout': '!border-l-purple-500 dark:!border-l-purple-400',
  'post-workout': '!border-l-rose-500 dark:!border-l-rose-400',
  brunch: '!border-l-yellow-500 dark:!border-l-yellow-400',
  dessert: '!border-l-pink-500 dark:!border-l-pink-400',
  'late-night': '!border-l-slate-500 dark:!border-l-slate-400',
}

// Stable color hash for unrecognized custom tags so users still see a per-tag
// stripe even when they invent their own labels (e.g. "brunch", "midnight").
const fallbackPalette = [
  '!border-l-cyan-500 dark:!border-l-cyan-400',
  '!border-l-teal-500 dark:!border-l-teal-400',
  '!border-l-violet-500 dark:!border-l-violet-400',
  '!border-l-fuchsia-500 dark:!border-l-fuchsia-400',
  '!border-l-lime-500 dark:!border-l-lime-400',
  '!border-l-sky-500 dark:!border-l-sky-400',
]

function hashTag(tag: string): number {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = ((h << 5) - h + tag.charCodeAt(i)) | 0
  return Math.abs(h)
}

function tagBorderClass(tag: string | undefined): string {
  if (!tag) return '!border-l-zinc-300 dark:!border-l-zinc-700'
  const lower = tag.toLowerCase()
  return tagBorderAccent[lower] ?? fallbackPalette[hashTag(lower) % fallbackPalette.length]
}

// Choose a "primary" tag from a log's tags array for color accents.
function primaryTag(tags: string[] | undefined): string | undefined {
  if (!tags || tags.length === 0) return undefined
  const lower = tags.map(t => t.toLowerCase())
  const def = lower.find(t => DEFAULT_TAGS.includes(t))
  return def ?? lower[0]
}

// Format a Date to "HH:mm" in the user's local TZ (matches <input type="time"> shape).
function dateToTimeInputValue(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

// Combine an existing loggedAt's date portion (local) with a new "HH:mm" time
// and return an ISO string. Used when the user re-times a logged entry.
function rebuildIsoWithTime(currentIso: string, timeStr: string): string | null {
  const [hStr, mStr] = timeStr.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  const cur = new Date(currentIso)
  if (Number.isNaN(cur.getTime())) return null
  const next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), h, m, 0, 0)
  return next.toISOString()
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
    if (v === 'week') return 'week'
    if (v === 'month') return 'month'
    return 'day'
  }, [searchParams])

  const [viewMode, setViewMode] = useState<ViewMode>(initialView)
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate)
  // Month view: the inline-expanded day strip. Null = no selection.
  const [monthSelectedDate, setMonthSelectedDate] = useState<Date | null>(null)
  const [days, setDays] = useState<DayBucket[]>([])
  // Active plans within the day/week range. Used by DayView/WeekView to render
  // TimelinePlanCard rows alongside logs.
  const [plans, setPlans] = useState<MealPlan[]>([])
  const [goals, setGoals] = useState<NutritionGoals>(defaultGoals)
  const [tagsResp, setTagsResp] = useState<{ defaults: string[]; userTags: string[] }>({
    defaults: DEFAULT_TAGS, userTags: [],
  })
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [errorToast, setErrorToast] = useState<string | null>(null)
  const [editEntry, setEditEntry] = useState<{ logId: string; item: IMealItem & { _id?: string } } | null>(null)
  // Plan-edit entry — opened when a user taps Edit on a plan item.
  const [editPlanEntry, setEditPlanEntry] = useState<{
    planId: string
    item: IMealItem & { _id?: string }
    planItems: (IMealItem & { _id?: string })[]
  } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ logId: string; mealName?: string } | null>(null)
  const [filterChipsOpen, setFilterChipsOpen] = useState(false)
  // Inline add-food: keeps the user on the timeline page instead of redirecting.
  // viewedDate determines which day the new MealLog gets attached to.
  const [addFoodFor, setAddFoodFor] = useState<{ date: Date; tag: string } | null>(null)
  // Bumps to force MonthView to re-fetch after a plan mutation.
  const [monthReloadKey, setMonthReloadKey] = useState(0)
  // Plan promotion mode — fetched from /api/profile. Default 'manual' until
  // we hear otherwise from the server.
  const [promoteMode, setPromoteMode] = useState<'manual' | 'auto'>('manual')
  // Per-page-load idempotency guard for the auto-promote sweep. Prevents
  // re-firing on a re-render when the user is still viewing today.
  const [autoPromoteFiredFor, setAutoPromoteFiredFor] = useState<string | null>(null)
  // Undo state for the most recent auto-promotion batch.
  const [undoBatch, setUndoBatch] = useState<{
    logIds: string[]
    planIds: string[]
    expiresAt: number
  } | null>(null)
  // Plan-tools sheets (PR 5). Both open from the month-view kebab menu.
  const [copyDayOpen, setCopyDayOpen] = useState(false)
  const [applyMealOpen, setApplyMealOpen] = useState(false)

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
    // Month view fetches its own data inside MonthView; skip the page-level
    // fetch to avoid an unused round-trip.
    if (viewMode === 'month') {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const fromStr = formatDateParam(range.from)
      const toStr = formatDateParam(range.to)
      const url = viewMode === 'day'
        ? `/api/meal-logs?date=${fromStr}`
        : `/api/meal-logs?from=${fromStr}&to=${toStr}`

      // Fetch plans + logs in parallel. Plans are filtered to "active" so
      // promoted/skipped/superseded don't render in day or week strips.
      const [res, plansResp] = await Promise.all([
        fetch(url, { headers: getHeaders() }),
        fetchPlansInRange(fromStr, toStr, getHeaders()),
      ])
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
      setPlans((plansResp.plans ?? []).filter(p => p.status === 'active'))
    } catch (err) {
      console.error('Failed to fetch timeline data:', err)
      setDays([])
      setPlans([])
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

  // Profile fetch — drives the auto-promote behavior on day view mount.
  // `planPromoteMode` reads as 'manual' by default for users created before
  // this feature (the field is optional with no DB migration).
  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/profile', { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        const mode = data?.profile?.planPromoteMode === 'auto' ? 'auto' : 'manual'
        setPromoteMode(mode)
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err)
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
  useEffect(() => { fetchGoals(); fetchTags(); fetchProfile() }, [fetchGoals, fetchTags, fetchProfile])

  // Auto-promote sweep — runs once per page-load when:
  //   • profile.planPromoteMode === 'auto'
  //   • viewMode === 'day'
  //   • selectedDate is today (local)
  //   • plans state has loaded
  //   • there are active plans for today
  // Per §6.4 + §13 Q2 the sweep is GATED to today only. We never silently
  // promote past-day plans (truthfulness over convenience).
  useEffect(() => {
    if (promoteMode !== 'auto') return
    if (viewMode !== 'day') return
    if (!isSameLocalDay(selectedDate, new Date())) return
    if (plans.length === 0) return
    const todayKey = formatDateParam(selectedDate)
    if (autoPromoteFiredFor === todayKey) return  // idempotent across re-renders
    const targets = plans.filter(p =>
      p.status === 'active'
      && (p.plannedDateKey ?? p.plannedDate.split('T')[0]) === todayKey,
    )
    if (targets.length === 0) {
      // Mark as fired so we don't re-evaluate; if a plan appears later
      // (e.g. user just created one), the dep change re-runs but the key
      // matches and we no-op — that's intentional, post-mount plan creation
      // does not auto-promote (user can tap Log it).
      setAutoPromoteFiredFor(todayKey)
      return
    }
    setAutoPromoteFiredFor(todayKey)
    let cancelled = false
    const promoteAll = async () => {
      const results = await Promise.allSettled(targets.map(p => {
        return fetch(`/api/meal-plans/${p._id}/promote`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ loggedAt: new Date().toISOString() }),
        }).then(async r => {
          if (!r.ok) throw new Error('promote_failed')
          const data = await r.json().catch(() => ({}))
          return {
            planId: p._id,
            logId: data?.log?._id ? String(data.log._id) : null,
          }
        })
      }))
      if (cancelled) return
      const successful = results.flatMap(r =>
        r.status === 'fulfilled' && r.value.logId
          ? [{ planId: r.value.planId, logId: r.value.logId }]
          : [],
      )
      if (successful.length === 0) return
      // The undo toast carries the message + button. Don't fire a parallel
      // success toast — they'd stack at the same z-index.
      setUndoBatch({
        logIds: successful.map(s => s.logId),
        planIds: successful.map(s => s.planId),
        expiresAt: Date.now() + 8000,
      })
      setMonthReloadKey(k => k + 1)
      await fetchData()
    }
    promoteAll()
    return () => { cancelled = true }
  }, [promoteMode, viewMode, selectedDate, plans, autoPromoteFiredFor, getHeaders, fetchData])

  // Auto-dismiss the undo toast after its expiry. We don't enforce expiry on
  // the click handler — a late click still works server-side; we just hide
  // the affordance.
  useEffect(() => {
    if (!undoBatch) return
    const remaining = undoBatch.expiresAt - Date.now()
    if (remaining <= 0) {
      setUndoBatch(null)
      return
    }
    const t = setTimeout(() => setUndoBatch(null), remaining)
    return () => clearTimeout(t)
  }, [undoBatch])

  // Undo handler — DELETEs the new logs. The MealLog DELETE handler in
  // /api/meal-logs/[id] auto-flips the source plan back from 'promoted' to
  // 'active' via the `fromPlanId` back-reference (see plan §9.1) so a second
  // explicit plan PATCH is unnecessary.
  const handleUndoAutoPromote = useCallback(async () => {
    if (!undoBatch) return
    const { logIds } = undoBatch
    setUndoBatch(null)
    await Promise.allSettled(
      logIds.map(id => fetch(`/api/meal-logs/${id}`, { method: 'DELETE', headers: getHeaders() })),
    )
    setMonthReloadKey(k => k + 1)
    await fetchData()
  }, [undoBatch, getHeaders, fetchData])

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

  // Default tag derived from the time of day — matches the nutrition page's helper.
  const defaultTagForNow = (): string => {
    const h = new Date().getHours()
    if (h >= 5 && h < 11) return 'breakfast'
    if (h >= 11 && h < 14) return 'lunch'
    if (h >= 17 && h < 21) return 'dinner'
    return 'snack'
  }

  // Pick mode for the food picker based on `addFoodFor.date` — strictly-future
  // dates create plans; today and past dates create logs. Computed via a
  // local-date comparison so a tap on a future cell at 11:59pm still treats
  // it as future even when the system clock straddles UTC midnight.
  const pickerMode: 'log' | 'plan' = useMemo(() => {
    if (!addFoodFor) return 'log'
    const target = addFoodFor.date
    const today = new Date()
    const targetKey = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    return targetKey > todayKey ? 'plan' : 'log'
  }, [addFoodFor])

  // A non-error positive feedback toast — used to confirm plan create/merge.
  const [successToast, setSuccessToast] = useState<string | null>(null)
  const showSuccessToast = (msg: string) => {
    setSuccessToast(msg)
    setTimeout(() => setSuccessToast(null), 3000)
  }

  // Adds a food directly to a specific day's timeline OR creates a plan for
  // a future day. Routes by `pickerMode`.
  const handleAddFood = async (
    entry: IFoodEntry & { foodId?: string; variantId?: string; variantName?: string },
    tag?: string,
    loggedAtIso?: string,
    planOptions?: { repeat?: { every: 'day' | 'week'; count: number } },
  ) => {
    if (!addFoodFor) return
    const useTag = tag || addFoodFor.tag
    const extra = entry as typeof entry & {
      loggedQuantity?: number
      loggedUnit?: string
      loggedGramsPerServing?: number
      loggedMlPerServing?: number
    }
    const item = {
      foodId: entry.foodId,
      variantId: entry.variantId,
      variantName: entry.variantName,
      name: entry.name,
      brand: entry.brand,
      servingSize: entry.servingSize,
      servingUnit: entry.servingUnit,
      servings: entry.servings,
      nutrition: entry.nutrition,
      loggedQuantity: extra.loggedQuantity,
      loggedUnit: extra.loggedUnit,
      loggedGramsPerServing: extra.loggedGramsPerServing,
      loggedMlPerServing: extra.loggedMlPerServing,
    }

    if (pickerMode === 'plan') {
      try {
        const plannedDate = `${addFoodFor.date.getFullYear()}-${String(addFoodFor.date.getMonth() + 1).padStart(2, '0')}-${String(addFoodFor.date.getDate()).padStart(2, '0')}`
        const body: Record<string, unknown> = { plannedDate, tag: useTag, items: [item] }
        if (planOptions?.repeat) body.repeat = planOptions.repeat
        const res = await fetch('/api/meal-plans', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          showErrorToast('Failed to plan food.')
          return
        }
        const data = await res.json().catch(() => ({}))
        setAddFoodFor(null)
        // Recurrence response has shape { seriesId, created, merged, replaced, ... }.
        // One-time response has { plan, merged?, replaced? }.
        if (typeof data?.seriesId === 'string') {
          const total = (data.created ?? 0) + (data.merged ?? 0) + (data.replaced ?? 0)
          const parts: string[] = []
          if (data.created) parts.push(`${data.created} new`)
          if (data.merged) parts.push(`${data.merged} merged`)
          if (data.replaced) parts.push(`${data.replaced} replaced`)
          showSuccessToast(`${total} ${titleCaseTag(useTag)} plans created (${parts.join(', ')})`)
        } else if (data?.merged) showSuccessToast(`Added to existing ${titleCaseTag(useTag)} plan`)
        else if (data?.replaced) showSuccessToast(`Replaced existing ${titleCaseTag(useTag)} plan`)
        else showSuccessToast(`Planned for ${titleCaseTag(useTag)}`)
        // Bump the month-view reload key so the grid re-fetches plans + logs.
        // Also refetch the day/week page-level data for consistency.
        setMonthReloadKey(k => k + 1)
        await fetchData()
      } catch (err) {
        console.error('Failed to create plan:', err)
        showErrorToast('Failed to plan food. Check your connection.')
      }
      return
    }

    // Log mode (default) — preserve the existing log-create flow exactly.
    let iso = loggedAtIso
    if (!iso) {
      const now = new Date()
      const d = new Date(addFoodFor.date.getFullYear(), addFoodFor.date.getMonth(), addFoodFor.date.getDate(), now.getHours(), now.getMinutes(), 0, 0)
      iso = d.toISOString()
    }
    try {
      const res = await fetch('/api/meal-logs', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ items: [item], tags: [useTag], loggedAt: iso }),
      })
      if (!res.ok) {
        showErrorToast('Failed to log food.')
        return
      }
      setAddFoodFor(null)
      await fetchData()
    } catch (err) {
      console.error('Failed to log food:', err)
      showErrorToast('Failed to log food. Check your connection.')
    }
  }

  // Plan delete — OPTIMISTIC per §5.10. The TimelinePlanCard hides itself
  // immediately; we fire DELETE in the background; on error we re-fetch (which
  // brings the card back) and toast.
  // scope: 'series' appends ?series=true so the API drops all sibling active
  // plans sharing the seriesId.
  const handleDeletePlan = useCallback(async (planId: string, scope: 'one' | 'series' = 'one') => {
    try {
      const qs = scope === 'series' ? '?series=true' : ''
      const res = await fetch(`/api/meal-plans/${planId}${qs}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      if (!res.ok) throw new Error('delete_failed')
      if (scope === 'series') {
        // Drop every plan in the series from local state.
        const target = plans.find(p => p._id === planId)
        const seriesId = target?.seriesId
        if (seriesId) setPlans(prev => prev.filter(p => p.seriesId !== seriesId))
        else setPlans(prev => prev.filter(p => p._id !== planId))
      } else {
        setPlans(prev => prev.filter(p => p._id !== planId))
      }
      setMonthReloadKey(k => k + 1)
    } catch (err) {
      console.error('Failed to delete plan:', err)
      showErrorToast('Failed to delete plan.')
      await fetchData()
      throw err
    }
  }, [getHeaders, plans])

  // Plan skip — OPTIMISTIC fade per §5.10.
  const handleSkipPlan = useCallback(async (planId: string) => {
    try {
      const res = await fetch(`/api/meal-plans/${planId}/skip`, {
        method: 'POST',
        headers: getHeaders(),
      })
      if (!res.ok) throw new Error('skip_failed')
      // Locally remove from the active set so it doesn't render in the day
      // view's "active plans" section after the fade animation completes.
      setPlans(prev => prev.filter(p => p._id !== planId))
      setMonthReloadKey(k => k + 1)
    } catch (err) {
      console.error('Failed to skip plan:', err)
      showErrorToast('Failed to skip plan.')
      await fetchData()
      throw err
    }
  }, [getHeaders])

  // Plan promote — POST /api/meal-plans/[id]/promote. Per §6.4 manual mode,
  // the client passes loggedAt=now (the user is acting now); for back-promote
  // the server constructs a default loggedAt from the plannedDate + the
  // tag's default time when body.loggedAt is omitted. We pass it here so the
  // resulting log is unambiguous in the user's local TZ.
  const handlePromotePlan = useCallback(async (planId: string) => {
    try {
      const res = await fetch(`/api/meal-plans/${planId}/promote`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ loggedAt: new Date().toISOString() }),
      })
      if (!res.ok) throw new Error('promote_failed')
      setPlans(prev => prev.filter(p => p._id !== planId))
      setMonthReloadKey(k => k + 1)
      showSuccessToast('Logged from plan')
      await fetchData()
    } catch (err) {
      console.error('Failed to promote plan:', err)
      showErrorToast('Failed to log plan.')
      throw err
    }
  }, [getHeaders])

  // Update a log's loggedAt — used by the inline time editor on each card.
  // Refetches the day so the chronological ordering is correct after the edit.
  const handleUpdateLogTime = async (logId: string, isoString: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/meal-logs/${logId}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ loggedAt: isoString }),
      })
      if (!res.ok) {
        showErrorToast('Failed to update time.')
        return false
      }
      await fetchData()
      return true
    } catch (err) {
      console.error('Failed to update log time:', err)
      showErrorToast('Failed to update time. Check your connection.')
      return false
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
          <button
            onClick={() => setView('month')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors sm:text-sm ${
              viewMode === 'month'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            Month
          </button>
        </div>

        {/* Date navigation — Day/Week only. Month view has its own header. */}
        {viewMode !== 'month' && (
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
        )}

        {/* Tag filter chips */}
        {viewMode !== 'month' && (
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
        )}

        {/* Body */}
        {viewMode === 'day' && (
          <DayView
            date={selectedDate}
            day={filteredDays[0]}
            plans={plans}
            goals={goals}
            dayTotals={dayTotals}
            onEditItem={(logId, item) => setEditEntry({ logId, item })}
            onDeleteLog={(logId, mealName) => setConfirmDelete({ logId, mealName })}
            onUpdateTime={handleUpdateLogTime}
            onToggleFilter={toggleFilter}
            onAddFood={(date) => setAddFoodFor({ date, tag: defaultTagForNow() })}
            onEditPlanItem={(planId, item, planItems) => setEditPlanEntry({ planId, item, planItems })}
            onDeletePlan={handleDeletePlan}
            onSkipPlan={handleSkipPlan}
            onPromotePlan={handlePromotePlan}
            activeFilters={activeFilters}
            isFilterActive={activeFilters.size > 0}
          />
        )}
        {viewMode === 'week' && (
          <WeekView
            days={filteredDays}
            summary={weekSummary}
            onEditItem={(logId, item) => setEditEntry({ logId, item })}
            onDeleteLog={(logId, mealName) => setConfirmDelete({ logId, mealName })}
            onUpdateTime={handleUpdateLogTime}
            onToggleFilter={toggleFilter}
            onAddFood={(date) => setAddFoodFor({ date, tag: defaultTagForNow() })}
            activeFilters={activeFilters}
            isFilterActive={activeFilters.size > 0}
          />
        )}
        {viewMode === 'month' && (
          <MonthView
            currentDate={selectedDate}
            selectedDate={monthSelectedDate}
            onSelectDate={(d) => setMonthSelectedDate(d)}
            onChangeMonth={(delta) => {
              const next = new Date(selectedDate)
              next.setDate(1)
              next.setMonth(next.getMonth() + delta)
              setSelectedDate(next)
              setMonthSelectedDate(null)
            }}
            onJumpToday={() => {
              setSelectedDate(new Date())
              setMonthSelectedDate(new Date())
            }}
            renderDayStrip={({ date, logs, plans }) => (
              <MonthDayStrip
                date={date}
                logs={logs as MealLog[]}
                plans={plans}
                onEditItem={(logId, item) => setEditEntry({ logId, item })}
                onDeleteLog={(logId, mealName) => setConfirmDelete({ logId, mealName })}
                onUpdateTime={handleUpdateLogTime}
                onToggleFilter={toggleFilter}
                onAddFood={(d) => setAddFoodFor({ date: d, tag: defaultTagForNow() })}
                onEditPlanItem={(planId, item, planItems) => setEditPlanEntry({ planId, item, planItems })}
                onDeletePlan={handleDeletePlan}
                onSkipPlan={handleSkipPlan}
                onPromotePlan={handlePromotePlan}
                onOpenDayView={(d) => {
                  setSelectedDate(d)
                  setView('day')
                  setMonthSelectedDate(null)
                }}
                activeFilters={activeFilters}
              />
            )}
            goal={goals.calories}
            getHeaders={getHeaders}
            onDrillToDay={(date) => {
              // Retained for backwards compat with the MonthView API; no
              // longer reachable from the calendar grid itself — drill-in
              // moved into the day-strip header's "Open" link above.
              setSelectedDate(date)
              setView('day')
              setMonthSelectedDate(null)
            }}
            reloadKey={monthReloadKey}
            onCopyDayForward={() => setCopyDayOpen(true)}
            onApplyMealToDays={() => setApplyMealOpen(true)}
          />
        )}
      </PageTransition>

      {/* Floating + Add Food — Day view always, Month view when a day is
          selected in the strip (FAB plans/logs that specific day). Week
          view has per-day buttons. */}
      {(viewMode === 'day' || (viewMode === 'month' && monthSelectedDate)) && (
        <button
          type="button"
          onClick={() => {
            const target = viewMode === 'month' ? (monthSelectedDate ?? selectedDate) : selectedDate
            setAddFoodFor({ date: target, tag: defaultTagForNow() })
          }}
          aria-label="Add food"
          className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg transition-transform hover:scale-105 active:scale-95 dark:bg-white dark:text-black sm:right-6"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* Inline Food Search Modal — pre-filled with the day the user tapped.
          mode flips to 'plan' for strictly-future dates so the picker hides
          the time row and the submit routes to /api/meal-plans. */}
      <FoodSearchModal
        isOpen={addFoodFor !== null}
        currentTag={addFoodFor?.tag ?? 'snack'}
        availableTags={tagsResp}
        showTagPicker={true}
        viewedDate={addFoodFor?.date}
        mode={pickerMode}
        onClose={() => setAddFoodFor(null)}
        onSelectFood={(entry, tag, loggedAt, planOptions) => handleAddFood(entry as Parameters<typeof handleAddFood>[0], tag, loggedAt, planOptions)}
      />

      {/* Edit Food Modal — log mode */}
      <EditFoodModal
        isOpen={editEntry !== null}
        item={editEntry?.item ?? null}
        logId={editEntry?.logId ?? ''}
        onClose={() => setEditEntry(null)}
        onSaved={fetchData}
      />

      {/* Edit Food Modal — plan mode (separate mount so the two surfaces
          don't share state when both are momentarily open during animations) */}
      <EditFoodModal
        isOpen={editPlanEntry !== null}
        item={editPlanEntry?.item ?? null}
        logId=""
        mode="plan"
        planId={editPlanEntry?.planId}
        planItems={editPlanEntry?.planItems}
        onClose={() => setEditPlanEntry(null)}
        onSaved={() => { fetchData(); setMonthReloadKey(k => k + 1) }}
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
              className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:p-6 shadow-2xl dark:bg-zinc-900 sm:rounded-2xl"
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
                  className="flex-1 rounded-xl border border-zinc-200 py-3 font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
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

      {/* Success toast (plan create/merge) */}
      {successToast && !errorToast && (
        <div className="fixed bottom-24 left-1/2 z-[100] -translate-x-1/2 flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lg">
          <Check className="h-4 w-4 shrink-0" />
          {successToast}
        </div>
      )}

      {/* Auto-promote undo toast — appears after a successful sweep. The
          parent's effect fires PROMOTE for every active plan today, then
          presents Undo for ~8s. */}
      {undoBatch && (
        <div className="fixed bottom-24 left-1/2 z-[100] -translate-x-1/2 flex items-center gap-3 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
          <Check className="h-4 w-4 shrink-0" />
          <span>{undoBatch.logIds.length} plan{undoBatch.logIds.length === 1 ? '' : 's'} logged</span>
          <button
            type="button"
            onClick={handleUndoAutoPromote}
            className="rounded-md bg-white/15 px-2 py-1 text-xs font-semibold uppercase tracking-wider hover:bg-white/25 dark:bg-zinc-900/15 dark:hover:bg-zinc-900/25"
          >
            Undo
          </button>
        </div>
      )}

      {/* Plan tools — bulk sheets (PR 5). Both fire onApplied which bumps the
          month-view reload key + refetches day data. */}
      <CopyDayForwardSheet
        isOpen={copyDayOpen}
        defaultSourceDate={monthSelectedDate ?? selectedDate}
        contextDate={selectedDate}
        getHeaders={getHeaders}
        onClose={() => setCopyDayOpen(false)}
        onApplied={summary => {
          const total = summary.created + summary.merged + summary.replaced
          showSuccessToast(`${total} plan${total === 1 ? '' : 's'} created`)
          setMonthReloadKey(k => k + 1)
          fetchData()
        }}
      />
      <ApplyMealToDaysSheet
        isOpen={applyMealOpen}
        contextDate={selectedDate}
        defaultTag={defaultTagForNow()}
        availableTags={tagsResp}
        getHeaders={getHeaders}
        onClose={() => setApplyMealOpen(false)}
        onApplied={summary => {
          const total = summary.created + summary.merged + summary.replaced
          showSuccessToast(`${total} meal plan${total === 1 ? '' : 's'} created`)
          setMonthReloadKey(k => k + 1)
          fetchData()
        }}
      />
    </FeatureGuard>
  )
}

// ── Day view ───────────────────────────────────────────────────────────────────

interface DayViewProps {
  date: Date
  day?: DayBucket
  plans: MealPlan[]
  goals: NutritionGoals
  dayTotals: { calories: number; protein: number; carbs: number; fats: number }
  onEditItem: (logId: string, item: IMealItem & { _id?: string }) => void
  onDeleteLog: (logId: string, mealName?: string) => void
  onUpdateTime: (logId: string, isoString: string) => Promise<boolean>
  onToggleFilter: (tag: string) => void
  onAddFood: (date: Date) => void
  onEditPlanItem: (planId: string, item: IMealItem & { _id?: string }, planItems: (IMealItem & { _id?: string })[]) => void
  onDeletePlan: (planId: string, scope?: 'one' | 'series') => Promise<void>
  onSkipPlan: (planId: string) => Promise<void>
  onPromotePlan: (planId: string) => Promise<void>
  activeFilters: Set<string>
  isFilterActive: boolean
}

function DayView({
  date, day, plans, goals, dayTotals, onEditItem, onDeleteLog,
  onUpdateTime, onToggleFilter, onAddFood,
  onEditPlanItem, onDeletePlan, onSkipPlan, onPromotePlan,
  activeFilters, isFilterActive,
}: DayViewProps) {
  const logs = day?.logs ?? []
  const isToday = isSameLocalDay(date, new Date())
  // Filter the parent's plans to this day's plannedDateKey.
  const dayKey = formatDateParam(date)
  const dayPlans = useMemo(
    () => plans.filter(p => (p.plannedDateKey ?? p.plannedDate.split('T')[0]) === dayKey),
    [plans, dayKey],
  )

  // CalorieRing preview toggle (plan §13 Q3). LocalStorage-backed and OFF by
  // default. When ON, the ring renders `consumed + plannedFromActivePlans`.
  // Only shown when there ARE active plans for this day; otherwise the toggle
  // is hidden because there's nothing to preview.
  const [previewPlanned, setPreviewPlanned] = useState<boolean>(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    setPreviewPlanned(window.localStorage.getItem('timeline.dayView.previewPlanned') === '1')
  }, [])
  const togglePreviewPlanned = useCallback(() => {
    setPreviewPlanned(prev => {
      const next = !prev
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('timeline.dayView.previewPlanned', next ? '1' : '0')
      }
      return next
    })
  }, [])

  const plannedTotals = useMemo(() => {
    let calories = 0, protein = 0, carbs = 0, fats = 0
    for (const p of dayPlans) {
      if (p.status !== 'active') continue
      calories += p.expectedNutrition?.calories ?? 0
      protein += p.expectedNutrition?.protein ?? 0
      carbs += p.expectedNutrition?.carbs ?? 0
      fats += p.expectedNutrition?.fats ?? 0
    }
    return {
      calories: Math.round(calories),
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fats: Math.round(fats),
    }
  }, [dayPlans])
  const showPreview = previewPlanned && plannedTotals.calories > 0
  const ringTotals = showPreview
    ? {
        calories: dayTotals.calories + plannedTotals.calories,
        protein: dayTotals.protein + plannedTotals.protein,
        carbs: dayTotals.carbs + plannedTotals.carbs,
        fats: dayTotals.fats + plannedTotals.fats,
      }
    : dayTotals

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Day header */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {isToday ? 'Today' : 'Day'}
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-zinc-900 dark:text-white">
              {formatLongDate(date)}
            </h2>
          </div>
          {plannedTotals.calories > 0 && (
            <button
              type="button"
              onClick={togglePreviewPlanned}
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                showPreview
                  ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400'
                  : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
              }`}
              aria-pressed={showPreview}
              aria-label={showPreview ? 'Hide planned calories in ring' : 'Preview planned calories in ring'}
            >
              <Sparkles className="h-3 w-3" />
              {showPreview ? `Previewing +${plannedTotals.calories}` : 'Preview planned'}
            </button>
          )}
        </div>
      </div>

      {/* Calorie ring + macros */}
      <CalorieRing
        consumed={ringTotals.calories}
        goal={goals.calories}
        protein={{ current: ringTotals.protein, goal: goals.protein }}
        carbs={{ current: ringTotals.carbs, goal: goals.carbs }}
        fats={{ current: ringTotals.fats, goal: goals.fats }}
      />

      {/* Timeline — chronologically ordered, full-width cards. */}
      {logs.length === 0 && dayPlans.length === 0 ? (
        <EmptyState
          message={isFilterActive
            ? 'No entries match the active tag filter.'
            : 'No food logged for this day.'
          }
          onAddFood={() => onAddFood(date)}
        />
      ) : (
        <motion.ol layout className="space-y-3">
          <AnimatePresence initial={false}>
            {logs.map((log, idx) => (
              <TimelineLogCard
                key={log._id}
                log={log}
                defaultExpanded={idx === 0}
                onEditItem={onEditItem}
                onDeleteLog={onDeleteLog}
                onUpdateTime={onUpdateTime}
                onToggleFilter={onToggleFilter}
                activeFilters={activeFilters}
              />
            ))}
            {dayPlans.map(plan => (
              <TimelinePlanCard
                key={plan._id}
                plan={plan}
                isToday={isToday}
                onEditItem={onEditPlanItem}
                onDeletePlan={onDeletePlan}
                onSkipPlan={onSkipPlan}
                onPromotePlan={onPromotePlan}
              />
            ))}
          </AnimatePresence>
        </motion.ol>
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
  onUpdateTime: (logId: string, isoString: string) => Promise<boolean>
  onToggleFilter: (tag: string) => void
  onAddFood: (date: Date) => void
  activeFilters: Set<string>
  isFilterActive: boolean
}

function WeekView({
  days, summary, onEditItem, onDeleteLog,
  onUpdateTime, onToggleFilter, onAddFood, activeFilters, isFilterActive,
}: WeekViewProps) {
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
          message={isFilterActive
            ? 'No entries match the active tag filter for this week.'
            : 'No food logged for this week.'
          }
          onAddFood={() => onAddFood(new Date())}
        />
      ) : (
        <div className="space-y-3">
          {ordered.map(d => (
            <WeekDayGroup
              key={d.date}
              day={d}
              onEditItem={onEditItem}
              onDeleteLog={onDeleteLog}
              onUpdateTime={onUpdateTime}
              onToggleFilter={onToggleFilter}
              onAddFood={onAddFood}
              activeFilters={activeFilters}
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

// ── Month-view day strip ──────────────────────────────────────────────────────
// Renders the inline expanded day below the calendar grid. Plans render as
// read-only rows in PR 2; PR 3b replaces this placeholder with TimelinePlanCard.

interface MonthDayStripProps {
  date: Date
  logs: MealLog[]
  plans: MealPlan[]
  onEditItem: (logId: string, item: IMealItem & { _id?: string }) => void
  onDeleteLog: (logId: string, mealName?: string) => void
  onUpdateTime: (logId: string, isoString: string) => Promise<boolean>
  onToggleFilter: (tag: string) => void
  onAddFood?: (date: Date) => void
  onEditPlanItem?: (planId: string, item: IMealItem & { _id?: string }, planItems: (IMealItem & { _id?: string })[]) => void
  onDeletePlan?: (planId: string, scope?: 'one' | 'series') => Promise<void>
  onSkipPlan?: (planId: string) => Promise<void>
  onPromotePlan?: (planId: string) => Promise<void>
  /** Drill-in to the full Day view for this date. Renders as a small text
   *  link in the strip header so cell-taps stay non-destructive (preview only). */
  onOpenDayView?: (date: Date) => void
  activeFilters: Set<string>
}

function MonthDayStrip({
  date, logs, plans,
  onEditItem, onDeleteLog, onUpdateTime, onToggleFilter, onAddFood,
  onEditPlanItem, onDeletePlan, onSkipPlan, onPromotePlan,
  onOpenDayView,
  activeFilters,
}: MonthDayStripProps) {
  const empty = logs.length === 0 && plans.length === 0
  const activePlans = plans.filter(p => p.status === 'active')
  // Past-date strips don't get an "Add" CTA — past-day plans are a non-goal
  // (Section 1.2). Today + future days get a contextual CTA whose copy flips
  // by mode (Plan vs Log).
  const todayKey = (() => {
    const t = new Date()
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  })()
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const isFuture = dateKey > todayKey
  const isToday = dateKey === todayKey
  const canAdd = !!onAddFood && (isFuture || isToday)
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
            {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </h3>
          {onOpenDayView && (
            <button
              type="button"
              onClick={() => onOpenDayView(date)}
              className="inline-flex shrink-0 items-center gap-0.5 rounded-md text-xs font-medium text-blue-600 transition-colors hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
            >
              Open
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={() => onAddFood?.(date)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            <Plus className="h-3.5 w-3.5" />
            {isFuture ? 'Plan food' : 'Add food'}
          </button>
        )}
      </div>
      {empty ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {isFuture ? 'No plans yet for this day.' : 'No entries.'}
        </p>
      ) : (
        <div className="space-y-3">
          {logs.map(log => (
            <TimelineLogCard
              key={log._id}
              log={log}
              defaultExpanded={false}
              compact
              onEditItem={onEditItem}
              onDeleteLog={onDeleteLog}
              onUpdateTime={onUpdateTime}
              onToggleFilter={onToggleFilter}
              activeFilters={activeFilters}
            />
          ))}
          {/* TimelinePlanCard delegates the actual network calls to the
              parent via the handlers below. Optimistic-hide / fade lives
              inside the card; on reject, the parent re-fetches. */}
          {onEditPlanItem && onDeletePlan && onSkipPlan && activePlans.length > 0 && (
            <ul className="m-0 space-y-3 list-none p-0">
              <AnimatePresence initial={false}>
                {activePlans.map(plan => (
                  <TimelinePlanCard
                    key={plan._id}
                    plan={plan}
                    compact
                    isToday={isToday}
                    onEditItem={onEditPlanItem}
                    onDeletePlan={onDeletePlan}
                    onSkipPlan={onSkipPlan}
                    onPromotePlan={onPromotePlan}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ── Week day group (collapsible, compact) ─────────────────────────────────────

interface WeekDayGroupProps {
  day: DayBucket
  onEditItem: (logId: string, item: IMealItem & { _id?: string }) => void
  onDeleteLog: (logId: string, mealName?: string) => void
  onUpdateTime: (logId: string, isoString: string) => Promise<boolean>
  onToggleFilter: (tag: string) => void
  onAddFood: (date: Date) => void
  activeFilters: Set<string>
}

function WeekDayGroup({
  day, onEditItem, onDeleteLog,
  onUpdateTime, onToggleFilter, onAddFood, activeFilters,
}: WeekDayGroupProps) {
  const dt = parseDateParam(day.date)
  const isToday = isSameLocalDay(dt, new Date())
  const calories = Math.round(day.dailyTotals.calories || 0)
  const [expanded, setExpanded] = useState<boolean>(isToday || day.logs.length > 0)

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2 p-3 sm:p-4">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {dt.toLocaleDateString('en-US', { weekday: 'short' })}
            </span>
            <span className="text-base font-bold leading-none text-zinc-900 dark:text-white">
              {dt.getDate()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
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
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAddFood(dt) }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          aria-label={`Add food for ${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
          title="Add food to this day"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

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
                <button
                  type="button"
                  onClick={() => onAddFood(dt)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 py-2.5 text-xs font-medium text-zinc-500 transition-colors hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-200"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add food
                </button>
              ) : (
                <motion.ol layout className="space-y-2">
                  <AnimatePresence initial={false}>
                    {day.logs.map((log, idx) => (
                      <TimelineLogCard
                        key={log._id}
                        log={log}
                        defaultExpanded={idx === 0}
                        compact
                        onEditItem={onEditItem}
                        onDeleteLog={onDeleteLog}
                        onUpdateTime={onUpdateTime}
                        onToggleFilter={onToggleFilter}
                        activeFilters={activeFilters}
                      />
                    ))}
                  </AnimatePresence>
                </motion.ol>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Unified timeline log card (used in both Day and Week views) ──────────────
//
// The card carries:
//   • Header row — clock + time pill (left), tag chips (left, after time), and
//     the day-total calorie chip (right). Time and cal never truncate; tags
//     truncate first if there's no horizontal room.
//   • Optional "From: <mealName>" badge below the header row.
//   • Expandable item list. The first card in each list defaults expanded so
//     users see items without an extra tap; subsequent cards stay collapsed.
//   • Footer with macros + Delete.
//   • Inline time editor: tapping the time pill opens an <input type="time">.
//     On save, the parent PATCHes /api/meal-logs/[id] then refetches the day,
//     and Framer Motion's `layout` smoothly animates the card to its new
//     chronological slot.
//   • Tag chips are buttons; tapping toggles them in the parent's filter set.

interface TimelineLogCardProps {
  log: MealLog
  defaultExpanded?: boolean
  // When true, the card uses tighter padding/typography (used inside the week
  // view's per-day group). The visual structure is otherwise identical.
  compact?: boolean
  onEditItem: (logId: string, item: IMealItem & { _id?: string }) => void
  onDeleteLog: (logId: string, mealName?: string) => void
  onUpdateTime: (logId: string, isoString: string) => Promise<boolean>
  onToggleFilter: (tag: string) => void
  activeFilters: Set<string>
}

function TimelineLogCard({
  log,
  defaultExpanded = false,
  compact = false,
  onEditItem,
  onDeleteLog,
  onUpdateTime,
  onToggleFilter,
  activeFilters,
}: TimelineLogCardProps) {
  const totals = logTotals(log)
  const time = formatTime(log.loggedAt)
  const accent = primaryTag(log.tags)

  const [expanded, setExpanded] = useState(defaultExpanded)
  // Inline time editor state. `pendingTime` is a "HH:mm" string while the
  // user is editing; null when the editor is closed.
  const [pendingTime, setPendingTime] = useState<string | null>(null)
  const [savingTime, setSavingTime] = useState(false)

  const editorOpen = pendingTime !== null

  const openEditor = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    setPendingTime(dateToTimeInputValue(new Date(log.loggedAt)))
  }

  const cancelEditor = () => {
    setPendingTime(null)
    setSavingTime(false)
  }

  const saveEditor = async () => {
    if (!pendingTime || savingTime) return
    const iso = rebuildIsoWithTime(log.loggedAt, pendingTime)
    if (!iso) {
      cancelEditor()
      return
    }
    setSavingTime(true)
    const ok = await onUpdateTime(log._id, iso)
    setSavingTime(false)
    if (ok) setPendingTime(null)
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22 }}
      className={`overflow-hidden rounded-xl border-y border-r border-l-[6px] border-t-zinc-200 border-r-zinc-200 border-b-zinc-200 bg-white dark:border-t-zinc-800 dark:border-r-zinc-800 dark:border-b-zinc-800 dark:bg-zinc-900 ${tagBorderClass(accent)}`}
    >
      {/* Header row — clickable to expand/collapse */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className={`flex w-full items-center gap-2 text-left ${compact ? 'px-3 py-2' : 'px-3 py-2.5 sm:px-4 sm:py-3'}`}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse entry' : 'Expand entry'}
      >
        {/* Time pill — first child, never truncates. Tap to edit. */}
        {editorOpen ? (
          <div
            className="flex shrink-0 items-center gap-1 rounded-full bg-blue-100 px-2 py-1 dark:bg-blue-900/40"
            onClick={(e) => e.stopPropagation()}
          >
            <Clock className="h-3 w-3 text-blue-700 dark:text-blue-200" />
            <input
              type="time"
              value={pendingTime ?? ''}
              onChange={(e) => setPendingTime(e.target.value)}
              autoFocus
              disabled={savingTime}
              className="bg-transparent text-[11px] font-semibold text-blue-700 tabular-nums focus:outline-none disabled:opacity-60 dark:text-blue-200"
            />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); saveEditor() }}
              disabled={savingTime || !pendingTime}
              aria-label="Save time"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-blue-700 hover:bg-blue-200/60 disabled:opacity-50 dark:text-blue-200 dark:hover:bg-blue-900/60"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); cancelEditor() }}
              disabled={savingTime}
              aria-label="Cancel time edit"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-blue-700 hover:bg-blue-200/60 disabled:opacity-50 dark:text-blue-200 dark:hover:bg-blue-900/60"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <span
            role="button"
            tabIndex={0}
            onClick={openEditor}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openEditor(e)
              }
            }}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold tabular-nums text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            aria-label={`Logged at ${time}, tap to change time`}
            title="Tap to change time"
          >
            <Clock className="h-3 w-3" />
            {time}
          </span>
        )}

        {/* Tag chips — second-priority. They truncate (the inner div carries
            min-w-0 so flexbox can shrink the chip row instead of the time/cal). */}
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {log.tags.length > 0 && (
            <>
              <span className="shrink-0 text-zinc-300 dark:text-zinc-600">·</span>
              <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden">
                {log.tags.map(t => {
                  const isActive = activeFilters.has(t.toLowerCase())
                  return (
                    <span
                      key={t}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onToggleFilter(t) }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          onToggleFilter(t)
                        }
                      }}
                      className={`shrink truncate rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                          : `${tagClass(t)} hover:opacity-80`
                      }`}
                      aria-pressed={isActive}
                      aria-label={`Filter by ${t}`}
                      title={`Filter by ${titleCaseTag(t)}`}
                    >
                      {titleCaseTag(t)}
                    </span>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Calorie chip — never truncates. */}
        <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold tabular-nums text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
          {totals.calories} cal
        </span>

        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${expanded ? '' : '-rotate-90'}`}
        />
      </button>

      {/* Optional sub-header: meal-template badge + notes */}
      {(log.mealName || log.notes) && (
        <div className={`-mt-1 flex flex-wrap items-center gap-1.5 ${compact ? 'px-3 pb-2' : 'px-3 pb-2 sm:px-4'}`}>
          {log.mealName && (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-orange-100 px-1.5 py-0.5 text-[11px] font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
              title="Logged from a saved recipe"
            >
              <ChefHat className="h-3 w-3" />
              <span className="text-[10px] uppercase tracking-wider opacity-70">Recipe</span>
              <span>·</span>
              <span className="normal-case tracking-normal">{log.mealName}</span>
            </span>
          )}
          {log.notes && (
            <span className="text-[11px] italic text-zinc-500 dark:text-zinc-400 truncate">
              {log.notes}
            </span>
          )}
        </div>
      )}

      {/* Body — items + footer */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <ul className="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
              {log.items.map((item, i) => (
                <ItemRow
                  key={`${log._id}-${item._id ?? i}`}
                  item={item}
                  compact={compact}
                  onEdit={() => onEditItem(log._id, item)}
                />
              ))}
            </ul>
            <div className={`flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 ${compact ? 'px-3 py-2' : 'px-3 py-2.5 sm:px-4'}`}>
              <div className="flex gap-2.5 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400 sm:gap-3">
                <span>P: {totals.protein}g</span>
                <span>C: {totals.carbs}g</span>
                <span>F: {totals.fats}g</span>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDeleteLog(log._id, log.mealName) }}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                aria-label="Delete entire log"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

function ItemRow({
  item,
  compact = false,
  onEdit,
}: {
  item: IMealItem & { _id?: string }
  compact?: boolean
  onEdit: () => void
}) {
  const cal = Math.round((item.nutrition?.calories ?? 0) * (item.servings ?? 1))
  const showVariant = shouldShowVariantName(item.variantName)
  // Prefer the user's actual logged quantity + unit when present (PR 4
  // provenance). Old log rows fall back to the legacy "X servings · servingSize"
  // display since they don't carry the new fields.
  const hasLoggedShape = item.loggedQuantity != null && !!item.loggedUnit
  const detailDisplay = hasLoggedShape
    ? formatQuantity(item.loggedQuantity!, item.loggedUnit as Unit)
    : `${item.servings !== 1 ? `${item.servings} servings` : '1 serving'} · ${item.servingSize} ${item.servingUnit}`

  return (
    <li className={`flex items-center gap-3 ${compact ? 'px-3 py-2' : 'px-3 py-2.5 sm:px-4'}`}>
      <div className="flex-1 min-w-0">
        <p className={`truncate font-medium text-zinc-900 dark:text-white ${compact ? 'text-xs' : 'text-sm'}`}>
          {item.name}
          {showVariant && (
            <span className="font-normal text-zinc-500 dark:text-zinc-400">
              {' '}&middot; {item.variantName}
            </span>
          )}
        </p>
        <p className={`truncate text-zinc-500 dark:text-zinc-400 ${compact ? 'text-[10px]' : 'text-xs'}`}>
          {item.brand && (
            <span className="text-zinc-400 dark:text-zinc-500">{item.brand} &middot; </span>
          )}
          {detailDisplay}
        </p>
      </div>
      <span className={`shrink-0 font-semibold tabular-nums text-zinc-700 dark:text-zinc-300 ${compact ? 'text-[11px]' : 'text-sm'}`}>
        {cal}
      </span>
      <button
        type="button"
        onClick={onEdit}
        className={`flex shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 ${compact ? 'h-6 w-6' : 'h-7 w-7'}`}
        aria-label="Edit item"
      >
        <Pencil className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      </button>
    </li>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ message, onAddFood }: { message: string; onAddFood: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
        <UtensilsCrossed className="h-5 w-5 text-zinc-400" />
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
      <button
        type="button"
        onClick={onAddFood}
        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        <Plus className="h-3.5 w-3.5" />
        Add food
      </button>
    </div>
  )
}
