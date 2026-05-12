"use client"

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import PageTransition from '@/components/PageTransition'
import DateNav from '@/components/nutrition/DateNav'
import CalorieRing from '@/components/nutrition/CalorieRing'
import TagSection, { type MealLogLite } from '@/components/nutrition/TagSection'
import WaterTracker from '@/components/nutrition/WaterTracker'
import FoodSearchModal from '@/components/nutrition/FoodSearchModal'
import QuickAddModal from '@/components/nutrition/QuickAddModal'
import EditFoodModal from '@/components/nutrition/EditFoodModal'
import ScheduleMealsDrawer from '@/components/nutrition/ScheduleMealsDrawer'
import { Plus, BookOpen, Target, UtensilsCrossed, Zap, Trash2, Search, ScanBarcode, AlertCircle, Tag as TagIcon, Clock, ChefHat, CalendarDays } from 'lucide-react'
import type { IFoodEntry } from '@/models/NutritionLog'
import type { IMealItem } from '@/models/Meal'
import FeatureGuard from '@/components/FeatureGuard'
import { Card, EmptyState } from '@/components/ui'
import { isFutureLocalDate } from '@/lib/mealPlanDates'
import type { MealPlan } from '@/app/dashboard/timeline/planning'
import { fetchPlansInRange } from '@/app/dashboard/timeline/planning'

// ── Types ──────────────────────────────────────────────────────────────────────

interface QuickAddRow {
  id: string
  calories: number
  protein: number
  carbs: number
  fats: number
  note?: string
}

interface NutritionGoals {
  calories: number
  protein: number
  carbs: number
  fats: number
  waterGoal: number
}

const DEFAULT_TAGS = ['breakfast', 'lunch', 'dinner', 'snack']

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDateParam(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDefaultTagForNow(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 11) return 'breakfast'
  if (h >= 11 && h < 14) return 'lunch'
  if (h >= 17 && h < 21) return 'dinner'
  return 'snack'
}

// ── Defaults ───────────────────────────────────────────────────────────────────

const defaultGoals: NutritionGoals = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fats: 65,
  waterGoal: 96,
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function NutritionPage() {
  return (
    <Suspense fallback={null}>
      <NutritionPageInner />
    </Suspense>
  )
}

function parseDateParam(s: string | null | undefined): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date()
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function NutritionPageInner() {
  const searchParams = useSearchParams()
  const initialDate = useMemo(() => parseDateParam(searchParams?.get('date')), [searchParams])
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate)
  const [logs, setLogs] = useState<MealLogLite[]>([])
  const [dailyTotals, setDailyTotals] = useState({ calories: 0, protein: 0, carbs: 0, fats: 0 })
  const [water, setWater] = useState({ current: 0, goal: 96 })
  const [quickAdds, setQuickAdds] = useState<QuickAddRow[]>([])
  const [goals, setGoals] = useState<NutritionGoals>(defaultGoals)
  const [tagsResp, setTagsResp] = useState<{ defaults: string[]; userTags: string[] }>({
    defaults: DEFAULT_TAGS, userTags: [],
  })
  // Tags added via the "+ Add tag" button this session (empty until food gets added).
  const [sessionTags, setSessionTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // Modal state
  const [foodSearchOpen, setFoodSearchOpen] = useState(false)
  // Plan mode state — when set, the food search modal opens with mode='plan'
  // and uses planForDate as its viewedDate (which the picker forwards to the
  // create-plan call).
  const [planForDate, setPlanForDate] = useState<Date | null>(null)
  const [planDatePickerTag, setPlanDatePickerTag] = useState<string | null>(null)
  const [planDateInput, setPlanDateInput] = useState<string>('')
  const [foodSearchTag, setFoodSearchTag] = useState<string>('snack')
  const [foodSearchAutoScan, setFoodSearchAutoScan] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<{ logId: string; item: IMealItem & { _id?: string } } | null>(null)
  const [errorToast, setErrorToast] = useState<string | null>(null)
  // "+ Add tag" inline input state
  const [showAddTagInput, setShowAddTagInput] = useState(false)
  const [newTagInput, setNewTagInput] = useState('')
  // Plans for the visible date — fetched only when viewingFuture (today/past
  // days don't render plans).
  const [plans, setPlans] = useState<MealPlan[]>([])
  // Schedule-meals drawer — opens on "Schedule meals" CTA when viewingFuture.
  const [scheduleDrawerOpen, setScheduleDrawerOpen] = useState(false)

  const dateParam = formatDateParam(selectedDate)
  // True when the user has scrolled to a future calendar day. Drives the
  // copy on "Add food" → "Schedule food" CTAs and routes new picker opens
  // through plan mode (see openFoodSearch).
  const viewingFuture = isFutureLocalDate(selectedDate)

  // ── Auth helper ────────────────────────────────────────────────────────────

  const getHeaders = useCallback((): HeadersInit => {
    const token = localStorage.getItem('token')
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }, [])

  // ── Fetchers ───────────────────────────────────────────────────────────────

  const fetchMealLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/meal-logs?date=${dateParam}`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setLogs((data.logs || []).map((l: MealLogLite) => ({ ...l, _id: String(l._id) })))
        setDailyTotals({
          calories: Math.round(data.dailyTotals?.calories ?? 0),
          protein: Math.round(data.dailyTotals?.protein ?? 0),
          carbs: Math.round(data.dailyTotals?.carbs ?? 0),
          fats: Math.round(data.dailyTotals?.fats ?? 0),
        })
      } else {
        setLogs([])
        setDailyTotals({ calories: 0, protein: 0, carbs: 0, fats: 0 })
      }
    } catch (err) {
      console.error('Failed to fetch meal logs:', err)
      setLogs([])
      setDailyTotals({ calories: 0, protein: 0, carbs: 0, fats: 0 })
    }
  }, [dateParam, getHeaders])

  // Water + quickAdds still live on the legacy NutritionLog. We hit the legacy
  // endpoint just to read those side-tables (its meal/dailyTotals fields are
  // ignored — we use /api/meal-logs for those).
  const fetchSideTables = useCallback(async () => {
    try {
      const res = await fetch(`/api/nutrition/log?date=${dateParam}`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setWater({
          current: data.water?.current ?? 0,
          goal: data.water?.goal ?? 96,
        })
        setQuickAdds(Array.isArray(data.quickAdds) ? data.quickAdds : [])
      } else {
        setWater({ current: 0, goal: goals.waterGoal })
        setQuickAdds([])
      }
    } catch (err) {
      console.error('Failed to fetch side tables:', err)
    }
  }, [dateParam, getHeaders, goals.waterGoal])

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

  // Fetch plans for the visible date. Only meaningful when viewingFuture, but
  // we always fetch so that switching between today→future doesn't introduce
  // a flash of stale state. The view filters on viewingFuture downstream.
  const fetchPlans = useCallback(async () => {
    try {
      const resp = await fetchPlansInRange(dateParam, dateParam, getHeaders())
      setPlans((resp.plans ?? []).filter(p => p.status === 'active'))
    } catch (err) {
      console.error('Failed to fetch plans:', err)
      setPlans([])
    }
  }, [dateParam, getHeaders])

  // ── Init ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      setLoading(true)
      await Promise.all([fetchMealLogs(), fetchSideTables(), fetchGoals(), fetchTags(), fetchPlans()])
      setLoading(false)
    }
    init()
  }, [fetchMealLogs, fetchSideTables, fetchGoals, fetchTags, fetchPlans])

  // ── Visible tags ──────────────────────────────────────────────────────────────
  // Only show tags that have content today, plus any session-added empty tags.
  // Empty default sections (breakfast/lunch/etc with no entries) are hidden so
  // the page isn't dominated by stub headers — the empty-state CTA invites the
  // first log instead.

  const visibleTags = useMemo<string[]>(() => {
    const defaultsWithContent: string[] = []
    const customTagsToday = new Set<string>()
    const addTag = (t: string) => {
      if (DEFAULT_TAGS.includes(t)) {
        if (!defaultsWithContent.includes(t)) defaultsWithContent.push(t)
      } else {
        customTagsToday.add(t)
      }
    }
    for (const log of logs) {
      const tags = (log.tags ?? []).map(t => String(t).toLowerCase())
      const effective = tags.length === 0 ? ['snack'] : tags
      for (const t of effective) addTag(t)
    }
    // When viewing a future date, plans drive section visibility too — a tag
    // with only plans (no logs) still gets a row so the user sees what's
    // scheduled.
    if (viewingFuture) {
      for (const p of plans) addTag(String(p.tag).toLowerCase())
    }
    // Defaults preserved in canonical order, then custom-with-content sorted, then session-added.
    const out: string[] = DEFAULT_TAGS.filter(t => defaultsWithContent.includes(t))
    const customSorted = Array.from(customTagsToday).sort()
    for (const t of customSorted) if (!out.includes(t)) out.push(t)
    for (const t of sessionTags) if (!out.includes(t)) out.push(t)
    return out
  }, [logs, sessionTags, viewingFuture, plans])

  // Map tag -> logs that include this tag.
  const logsByTag = useMemo<Record<string, MealLogLite[]>>(() => {
    const map: Record<string, MealLogLite[]> = {}
    for (const t of visibleTags) map[t] = []
    for (const log of logs) {
      const tags = (log.tags || []).map(t => String(t).toLowerCase())
      // If the log has no tags at all, treat it as a "snack" so it stays visible.
      const effective = tags.length === 0 ? ['snack'] : tags
      for (const t of effective) {
        if (!map[t]) map[t] = []
        map[t].push(log)
      }
    }
    return map
  }, [visibleTags, logs])

  // Map tag -> plans that target this tag. Empty when not viewing future.
  const plansByTag = useMemo<Record<string, MealPlan[]>>(() => {
    const map: Record<string, MealPlan[]> = {}
    if (!viewingFuture) return map
    for (const t of visibleTags) map[t] = []
    for (const p of plans) {
      const key = String(p.tag).toLowerCase()
      if (!map[key]) map[key] = []
      map[key].push(p)
    }
    return map
  }, [viewingFuture, plans, visibleTags])

  // ── Date navigation ───────────────────────────────────────────────────────

  // ── Event handlers ────────────────────────────────────────────────────────

  const showErrorToast = (msg: string) => {
    setErrorToast(msg)
    setTimeout(() => setErrorToast(null), 4000)
  }

  // Find an existing MealLog today whose primary tag === tag.
  // "Primary tag" = first matching default tag in the log's tags array, else the
  // first tag, else "snack".
  const findLogForTag = useCallback((tag: string): MealLogLite | undefined => {
    const norm = tag.toLowerCase()
    return logs.find(log => {
      const tags = (log.tags || []).map(t => String(t).toLowerCase())
      if (tags.length === 0) return norm === 'snack'
      // If the chosen tag is in the log's tags, count it as a candidate.
      if (!tags.includes(norm)) return false
      // Determine the log's primary tag.
      const primary = tags.find(t => DEFAULT_TAGS.includes(t)) ?? tags[0]
      return primary === norm
    })
  }, [logs])

  const handleAddFood = async (food: IFoodEntry, tag?: string, loggedAtOverride?: string) => {
    const useTag = (tag || foodSearchTag || 'snack').toLowerCase()
    try {
      // Build a MealItemInput from the legacy IFoodEntry shape. The
      // FoodSearchModal extends IFoodEntry with the new logged* fields (PR 4
      // picker rework); pass them through when the modal supplied them so the
      // log row knows the user's actual unit + bridges for future re-edits.
      const extra = food as IFoodEntry & {
        loggedQuantity?: number
        loggedUnit?: string
        loggedGramsPerServing?: number
        loggedMlPerServing?: number
      }
      const itemPayload = {
        foodId: food.foodId,
        variantId: food.variantId,
        variantName: food.variantName,
        name: food.name,
        brand: food.brand,
        servingSize: food.servingSize,
        servingUnit: food.servingUnit,
        servings: food.servings,
        nutrition: food.nutrition,
        loggedQuantity: extra.loggedQuantity,
        loggedUnit: extra.loggedUnit,
        loggedGramsPerServing: extra.loggedGramsPerServing,
        loggedMlPerServing: extra.loggedMlPerServing,
      }

      // When the user explicitly picked a custom time we ALWAYS create a new
      // MealLog (so their intent — a separate entry at that exact time — is
      // preserved). Otherwise we fall back to the smart "append to existing
      // log of this tag" behavior.
      const existing = loggedAtOverride ? undefined : findLogForTag(useTag)
      let res: Response
      if (existing) {
        res = await fetch(`/api/meal-logs/${existing._id}/items`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(itemPayload),
        })
      } else {
        // Pin loggedAt: prefer the user's explicit time, otherwise the current
        // moment for today, or noon UTC for non-today dates.
        let loggedAt: string
        if (loggedAtOverride) {
          loggedAt = loggedAtOverride
        } else {
          const now = new Date()
          const isToday = formatDateParam(now) === dateParam
          loggedAt = isToday ? now.toISOString() : `${dateParam}T12:00:00.000Z`
        }
        res = await fetch(`/api/meal-logs`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            items: [itemPayload],
            tags: [useTag],
            loggedAt,
          }),
        })
      }

      if (res.ok) {
        await Promise.all([fetchMealLogs(), fetchTags()])
        setFoodSearchOpen(false)
        setFoodSearchAutoScan(false)
        // Once a session-added tag has content, it'll appear via logsByTag — drop it.
        setSessionTags(prev => prev.filter(t => t !== useTag))
      } else {
        const data = await res.json().catch(() => null)
        const serverMessage = data && typeof data.error === 'string' ? data.error : null
        showErrorToast(serverMessage ? `Failed to add food: ${serverMessage}` : 'Failed to add food. Please try again.')
        console.error('[nutrition] add food failed', { status: res.status, error: serverMessage, payload: itemPayload })
      }
    } catch (err) {
      console.error('Failed to add food:', err)
      showErrorToast('Failed to add food. Check your connection.')
    }
  }

  // Optimistically remove a plan; on failure, refetch.
  const handleRemovePlan = async (planId: string) => {
    const prev = plans
    setPlans(p => p.filter(x => x._id !== planId))
    try {
      const res = await fetch(`/api/meal-plans/${planId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      if (!res.ok) throw new Error('delete_failed')
    } catch {
      setPlans(prev)
      showErrorToast('Failed to remove plan.')
    }
  }

  const handleRemoveEntry = async (logId: string, itemId: string) => {
    try {
      const res = await fetch(`/api/meal-logs/${logId}/items/${itemId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      if (res.ok) {
        await fetchMealLogs()
      } else {
        showErrorToast('Failed to delete entry.')
      }
    } catch (err) {
      console.error('Failed to delete entry:', err)
    }
  }

  const handleAddWater = async (amount: number) => {
    try {
      const res = await fetch('/api/nutrition/water', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ amount, date: dateParam }),
      })
      if (res.ok) {
        await fetchSideTables()
      }
    } catch (err) {
      console.error('Failed to add water:', err)
    }
  }

  const handleQuickAdd = async (data: { calories: number; protein: number; carbs: number; fats: number; note?: string }) => {
    try {
      const res = await fetch('/api/nutrition/quick-add', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ ...data, date: dateParam }),
      })
      if (res.ok) {
        await fetchSideTables()
      }
    } catch (err) {
      console.error('Failed to quick add:', err)
    }
    setQuickAddOpen(false)
  }

  const handleDeleteQuickAdd = async (quickAddId: string) => {
    try {
      const res = await fetch('/api/nutrition/quick-add', {
        method: 'DELETE',
        headers: getHeaders(),
        body: JSON.stringify({ quickAddId, date: dateParam }),
      })
      if (res.ok) {
        await fetchSideTables()
      }
    } catch (err) {
      console.error('Failed to delete quick add:', err)
    }
  }

  const openFoodSearch = (tag: string, autoScan = false) => {
    setFoodSearchTag(tag.toLowerCase())
    setFoodSearchAutoScan(autoScan)
    // When the user is viewing a future date, "Add food" becomes "Schedule
    // food" — automatically route through plan mode against the visible
    // date. Logs on a future date don't make semantic sense; planning does.
    setPlanForDate(isFutureLocalDate(selectedDate) ? selectedDate : null)
    setFoodSearchOpen(true)
  }

  // Plan flow: tap "Plan…" on the TagSection kebab → opens a small date
  // picker → user picks a future date → food picker opens in plan mode.
  const openPlanDatePicker = (tag: string) => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setPlanDateInput(formatDateParam(tomorrow))
    setPlanDatePickerTag(tag.toLowerCase())
  }

  const confirmPlanDate = () => {
    if (!planDatePickerTag || !planDateInput) return
    const [y, m, d] = planDateInput.split('-').map(Number)
    if (!y || !m || !d) return
    const picked = new Date(y, m - 1, d)
    setPlanForDate(picked)
    setFoodSearchTag(planDatePickerTag)
    setFoodSearchAutoScan(false)
    setFoodSearchOpen(true)
    setPlanDatePickerTag(null)
  }

  const handleAddSessionTag = () => {
    const norm = newTagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!norm) return
    if (!visibleTags.includes(norm)) {
      setSessionTags(prev => [...prev, norm])
    }
    setNewTagInput('')
    setShowAddTagInput(false)
  }

  const handleRemoveSessionTag = (tag: string) => {
    setSessionTags(prev => prev.filter(t => t !== tag))
  }

  // Quick-add total calories
  const quickAddCalories = quickAdds.reduce((s, qa) => s + (qa.calories || 0), 0)
  // Planned totals for the visible date — only meaningful when viewingFuture
  // (when not, plans is empty / filtered upstream).
  const plannedTotals = useMemo(() => {
    if (!viewingFuture) return { calories: 0, protein: 0, carbs: 0, fats: 0 }
    let c = 0, p = 0, cb = 0, f = 0
    for (const plan of plans) {
      const n = plan.expectedNutrition
      c += n?.calories ?? 0
      p += n?.protein ?? 0
      cb += n?.carbs ?? 0
      f += n?.fats ?? 0
    }
    return { calories: Math.round(c), protein: Math.round(p), carbs: Math.round(cb), fats: Math.round(f) }
  }, [viewingFuture, plans])

  // The CalorieRing shows MealLog daily totals + quick-add calories on today/
  // past dates. On future dates the ring previews PLANNED totals — there are
  // no logs to display.
  const totalConsumedCalories = viewingFuture
    ? plannedTotals.calories
    : dailyTotals.calories + quickAddCalories
  const totalProtein = viewingFuture
    ? plannedTotals.protein
    : dailyTotals.protein + quickAdds.reduce((s, qa) => s + (qa.protein || 0), 0)
  const totalCarbs = viewingFuture
    ? plannedTotals.carbs
    : dailyTotals.carbs + quickAdds.reduce((s, qa) => s + (qa.carbs || 0), 0)
  const totalFats = viewingFuture
    ? plannedTotals.fats
    : dailyTotals.fats + quickAdds.reduce((s, qa) => s + (qa.fats || 0), 0)

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageTransition className="space-y-4 pb-6 sm:space-y-6">
        <header className="mb-2 sm:mb-4">
          <div className="h-8 w-32 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="mt-2 h-4 w-56 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        </header>

        {/* Date nav skeleton */}
        <div className="flex items-center justify-center gap-4">
          <div className="h-10 w-10 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-6 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-10 w-10 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
        </div>

        {/* Ring skeleton */}
        <div className="flex flex-col items-center gap-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="h-40 w-40 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
          <div className="flex w-full gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-8 flex-1 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            ))}
          </div>
        </div>

        {/* Tag sections skeleton */}
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        ))}
      </PageTransition>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <FeatureGuard
      feature="Nutrition"
      description="Precision nutrition tracking and meal planning, built around your goals. Launching soon."
      icon={<UtensilsCrossed className="h-10 w-10" />}
    >
      <PageTransition className="space-y-4 pb-6 sm:space-y-6">
        {/* Header */}
        <header className="mb-2 flex items-start justify-between gap-3 sm:mb-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">Nutrition</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 sm:text-base">
              Track your food, macros, and hydration
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/meals"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700"
              aria-label="Saved recipes & favorites"
              title="Recipes & favorites"
            >
              <ChefHat className="h-5 w-5" />
            </Link>
            <Link
              href={`/dashboard/timeline?date=${dateParam}`}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700"
              aria-label="Switch to timeline view"
              title="Timeline view"
            >
              <Clock className="h-5 w-5" />
            </Link>
          </div>
        </header>

        {/* Global search bar */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => openFoodSearch(getDefaultTagForNow())}
            className="flex flex-1 items-center gap-2.5 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/60 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <Search className="h-4 w-4 shrink-0 text-zinc-400" />
            <span className="text-sm text-zinc-400 dark:text-zinc-500">Search foods…</span>
          </button>
          <button
            onClick={() => openFoodSearch(getDefaultTagForNow(), true)}
            aria-label="Scan barcode"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700"
          >
            <ScanBarcode className="h-5 w-5" />
          </button>
        </div>

        {/* Date Navigation */}
        <DateNav
          date={selectedDate}
          onDateChange={setSelectedDate}
        />

        {/* Calorie Ring + Macro Summary */}
        <CalorieRing
          consumed={totalConsumedCalories}
          goal={goals.calories}
          protein={{ current: totalProtein, goal: goals.protein }}
          carbs={{ current: totalCarbs, goal: goals.carbs }}
          fats={{ current: totalFats, goal: goals.fats }}
        />

        {/* Empty state — nothing logged today yet (or nothing planned, on a future day) */}
        {visibleTags.length === 0 && quickAdds.length === 0 && (
          <EmptyState
            icon={<UtensilsCrossed className="h-6 w-6" />}
            title={viewingFuture ? 'Nothing planned yet' : 'Nothing logged yet'}
            description={viewingFuture
              ? "Plan ahead — schedule meals for this day so they're ready when it arrives."
              : 'Add your first food of the day to start tracking.'}
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                {viewingFuture ? (
                  <button
                    onClick={() => setScheduleDrawerOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  >
                    <CalendarDays className="h-4 w-4" />
                    Schedule meals
                  </button>
                ) : (
                  <button
                    onClick={() => openFoodSearch('breakfast', false)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  >
                    <Plus className="h-4 w-4" />
                    Add food
                  </button>
                )}
                <Link
                  href="/dashboard/meals"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <ChefHat className="h-4 w-4" />
                  Browse recipes
                </Link>
              </div>
            }
          />
        )}

        {/* When the user IS viewing a future date and already has plans, surface
            the Schedule-meals CTA prominently above the tag sections so it's
            never more than one tap away from richer planning. */}
        {viewingFuture && visibleTags.length > 0 && (
          <button
            type="button"
            onClick={() => setScheduleDrawerOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <CalendarDays className="h-4 w-4" />
            Schedule meals
          </button>
        )}

        {/* Tag Sections */}
        {visibleTags.map(tag => (
          <TagSection
            key={tag}
            tag={tag}
            logs={logsByTag[tag] || []}
            plans={plansByTag[tag] || []}
            onAddFood={(t) => openFoodSearch(t, false)}
            onEditEntry={(logId, item) => setEditEntry({ logId, item })}
            onRemoveEntry={handleRemoveEntry}
            onRemovePlan={handleRemovePlan}
            onRemoveTag={handleRemoveSessionTag}
            removable={
              sessionTags.includes(tag)
              && (logsByTag[tag] || []).length === 0
              && (plansByTag[tag] || []).length === 0
            }
            onPlan={(t) => openPlanDatePicker(t)}
            futureDate={viewingFuture}
          />
        ))}

        {/* + Add tag */}
        {showAddTagInput ? (
          <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <TagIcon className="h-4 w-4 text-zinc-400" />
            <input
              type="text"
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSessionTag() } }}
              placeholder="e.g. brunch"
              autoFocus
              className="flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
            />
            <button
              onClick={handleAddSessionTag}
              disabled={!newTagInput.trim()}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Add
            </button>
            <button
              onClick={() => { setShowAddTagInput(false); setNewTagInput('') }}
              className="rounded-md px-2 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddTagInput(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 bg-transparent px-4 py-3 text-sm font-medium text-zinc-500 transition-colors hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
          >
            <Plus className="h-4 w-4" />
            Add tag
          </button>
        )}

        {/* Quick Adds (visible entries with delete) */}
        {quickAdds.length > 0 && (
          <Card className="!p-0">
            <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800 sm:px-4">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <Zap className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-sm font-semibold text-zinc-900 dark:text-white">Quick Adds</span>
              <span className="ml-auto text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                {quickAddCalories} cal
              </span>
            </div>
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {quickAdds.map((qa) => (
                <div key={qa.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    {qa.note && (
                      <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{qa.note}</p>
                    )}
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                      {qa.calories} cal
                      {(qa.protein > 0 || qa.carbs > 0 || qa.fats > 0) && (
                        <span className="ml-1.5">
                          · P {qa.protein}g · C {qa.carbs}g · F {qa.fats}g
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteQuickAdd(qa.id)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                    aria-label="Delete quick add"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Water Tracker */}
        <WaterTracker
          current={water.current}
          goal={goals.waterGoal}
          onAddWater={handleAddWater}
        />

        {/* Quick Actions — visually identical tiles, accent only varies on the icon badge */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Card
            as="button"
            type="button"
            onClick={() => { if (!viewingFuture) setQuickAddOpen(true) }}
            disabled={viewingFuture}
            variant="compact"
            title={viewingFuture ? 'Quick Add is for logging — use Add food (Schedule food) to plan ahead' : undefined}
            className={`flex flex-col items-center gap-2 transition-colors ${viewingFuture
              ? 'opacity-50 cursor-not-allowed'
              : 'cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-700'}`}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <Plus className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Quick Add</span>
          </Card>

          <Card
            as={Link}
            href="/dashboard/meals"
            variant="compact"
            className="flex flex-col items-center gap-2 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <BookOpen className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Recipes</span>
          </Card>

          <Card
            as={Link}
            href="/dashboard/nutrition/goals"
            variant="compact"
            className="flex flex-col items-center gap-2 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Target className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Goals</span>
          </Card>
        </div>
      </PageTransition>

      {/* Food Search Modal — log mode (default) and plan mode (when planForDate set). */}
      <FoodSearchModal
        isOpen={foodSearchOpen}
        currentTag={foodSearchTag}
        availableTags={tagsResp}
        viewedDate={planForDate ?? selectedDate}
        mode={planForDate ? 'plan' : 'log'}
        autoScan={foodSearchAutoScan}
        onClose={() => { setFoodSearchOpen(false); setFoodSearchAutoScan(false); setPlanForDate(null) }}
        onSelectFood={(entry, tag, loggedAt) => {
          if (planForDate) {
            // Submit to /api/meal-plans inline since the nutrition page's
            // handleAddFood targets the log endpoint by default.
            const planned = `${planForDate.getFullYear()}-${String(planForDate.getMonth() + 1).padStart(2, '0')}-${String(planForDate.getDate()).padStart(2, '0')}`
            const useTag = (tag ?? foodSearchTag ?? 'snack').toLowerCase()
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
              loggedQuantity: (entry as { loggedQuantity?: number }).loggedQuantity,
              loggedUnit: (entry as { loggedUnit?: string }).loggedUnit,
              loggedGramsPerServing: (entry as { loggedGramsPerServing?: number }).loggedGramsPerServing,
              loggedMlPerServing: (entry as { loggedMlPerServing?: number }).loggedMlPerServing,
            }
            const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
            const headers: HeadersInit = { 'Content-Type': 'application/json' }
            if (token) headers['Authorization'] = `Bearer ${token}`
            fetch('/api/meal-plans', {
              method: 'POST',
              headers,
              body: JSON.stringify({ plannedDate: planned, tag: useTag, items: [item] }),
            }).then(r => {
              if (!r.ok) {
                showErrorToast('Failed to plan food.')
                return
              }
              setFoodSearchOpen(false)
              setPlanForDate(null)
            }).catch(() => {
              showErrorToast('Failed to plan food. Check your connection.')
            })
            return
          }
          handleAddFood(entry, tag, loggedAt)
        }}
      />

      {/* Plan-date picker dialog — opens when the user taps "Plan for a future day…" */}
      {planDatePickerTag && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => setPlanDatePickerTag(null)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white p-5 dark:bg-zinc-900 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              Plan {planDatePickerTag}
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Pick a future date to plan a meal for.
            </p>
            <input
              type="date"
              value={planDateInput}
              min={(() => {
                const d = new Date()
                d.setDate(d.getDate() + 1)
                return formatDateParam(d)
              })()}
              onChange={(e) => setPlanDateInput(e.target.value)}
              className="mt-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setPlanDatePickerTag(null)}
                className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={confirmPlanDate}
                disabled={!planDateInput}
                className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-black"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Modal */}
      <QuickAddModal
        isOpen={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onSubmit={handleQuickAdd}
      />

      {/* Edit Food Modal */}
      <EditFoodModal
        isOpen={editEntry !== null}
        item={editEntry?.item ?? null}
        logId={editEntry?.logId ?? ''}
        onClose={() => setEditEntry(null)}
        onSaved={fetchMealLogs}
      />

      {/* Schedule-meals drawer — opens from the future-date empty-state CTA
          or the persistent "Schedule meals" button above the tag list. */}
      <ScheduleMealsDrawer
        isOpen={scheduleDrawerOpen}
        defaultDate={selectedDate}
        availableTags={tagsResp}
        onClose={() => setScheduleDrawerOpen(false)}
        onMutated={() => { fetchPlans(); fetchTags() }}
      />

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
