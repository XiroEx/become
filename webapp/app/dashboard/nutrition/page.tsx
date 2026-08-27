"use client"

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import PageTransition from '@/components/PageTransition'
import { useSwipeNav, slideVariants } from '@/hooks/useSwipeNav'
import { AnimatePresence, motion } from 'framer-motion'
import DateNav from '@/components/nutrition/DateNav'
import NutritionAITeaser from '@/components/nutrition/NutritionAITeaser'
import CalorieRing from '@/components/nutrition/CalorieRing'
import TagSection, { type MealLogLite } from '@/components/nutrition/TagSection'
import WaterTracker from '@/components/nutrition/WaterTracker'
import FoodSearchModal, { type LoggedFoodEntry } from '@/components/nutrition/FoodSearchModal'
import SnapPlateModal from '@/components/nutrition/SnapPlateModal'
import QuickAddModal from '@/components/nutrition/QuickAddModal'
import EditFoodModal from '@/components/nutrition/EditFoodModal'
import EditMealModal from '@/components/nutrition/EditMealModal'
import ScheduleMealsDrawer from '@/components/nutrition/ScheduleMealsDrawer'
import { Plus, BookOpen, UtensilsCrossed, Zap, Trash2, Search, ScanBarcode, Tag as TagIcon, Clock, ChefHat, CalendarDays, CalendarClock, Copy, Camera, ImagePlus, Upload, PencilLine, History, ChevronDown } from 'lucide-react'
import { resizeImageToBlob } from '@/lib/imageResize'
import { blobToDataUrl } from '@/lib/blobToBase64'
import type { IFoodEntry } from '@/lib/nutritionTypes'
import type { IMealItem } from '@/models/Meal'
import { Card, EmptyState, Toast, HeaderPillLink } from '@/components/ui'
import { useToast } from '@/hooks/useToast'
import { isFutureLocalDate, todayLocalKey } from '@/lib/mealPlanDates'
import type { MealPlan } from '@/app/dashboard/timeline/planning'
import { fetchPlansInRange } from '@/app/dashboard/timeline/planning'
import { invalidateMindSession } from '@/lib/mind/sessionCache'
import { buildDayOccurrences } from '@/lib/nutrition/dayOrder'
import { findLogForTag as findLogForTagPure } from '@/lib/nutrition/logTagMatch'
import { createMealTag } from '@/hooks/useMealSchedule'
import { defaultTagAt, minutesOfDay, sortMinutesForTag, type TagWindow } from '@/lib/nutrition/mealSchedule'
import { nutritionGoalLine, type Direction as GoalDirection, type PaceStatus } from '@/lib/nutrition/goalLine'

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
  const [dailyTotals, setDailyTotals] = useState({ calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 })
  const [water, setWater] = useState({ current: 0, goal: 96 })
  const [quickAdds, setQuickAdds] = useState<QuickAddRow[]>([])
  const [goals, setGoals] = useState<NutritionGoals>(defaultGoals)
  // The weight-goal side of things (lib/goals) — just enough to tie the ring
  // to the target: "2,910 cal/day, on track for 205 lb". Fetched once; it
  // doesn't change while paging between days.
  const [goalWeight, setGoalWeight] = useState<{
    weight: number | null; unit: 'lbs' | 'kg'; direction: GoalDirection | null; paceStatus: PaceStatus | null
  } | null>(null)
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
  const [snapPlateOpen, setSnapPlateOpen] = useState(false)
  const [snapPlatePhase, setSnapPlatePhase] = useState<'idle' | 'describe' | 'compose' | 'review'>('idle')
  const [snapInitialImage, setSnapInitialImage] = useState<string | null>(null)
  const [snapImageUrl, setSnapImageUrl] = useState<string | null>(null)
  const [snapDescribeText, setSnapDescribeText] = useState<string | null>(null)
  const [snapReview, setSnapReview] = useState<Array<{
    foodId?: string; name: string; brand?: string; estimatedServing?: string
    servingSize?: number; servingUnit?: string; servings?: number
    nutrition: { calories: number; protein: number; carbs: number; fats: number }
    confidence?: number; matchKind?: 'food' | 'meal' | 'recipe'
  }> | null>(null)
  const [snapScanId, setSnapScanId] = useState<string | null>(null)
  const handledScanRef = useRef<string | null>(null)
  // Hidden inputs so "Snap" (camera) and "Upload" (library) are distinct, direct
  // actions from both the dash and the search hub — each opens the right picker
  // within the user gesture, then drops straight into the plate compose step.
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  // Which dash capture dropdown is open: camera (photo/barcode) or upload (upload/describe).
  const [captureMenu, setCaptureMenu] = useState<null | 'camera' | 'upload'>(null)
  const [navMenuOpen, setNavMenuOpen] = useState(false)

  const openSnapCamera = () => cameraInputRef.current?.click()
  const openSnapUpload = () => galleryInputRef.current?.click()
  const openDescribe = (text?: string) => { setSnapInitialImage(null); setSnapImageUrl(null); setSnapScanId(null); setSnapReview(null); setSnapDescribeText(text ?? null); setSnapPlatePhase('describe'); setSnapPlateOpen(true) }

  const handleCaptureFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    try {
      const resized = await resizeImageToBlob(file, { maxDim: 1024, quality: 0.6 })
      const dataUrl = await blobToDataUrl(resized)
      setSnapInitialImage(dataUrl)
      setSnapImageUrl(null); setSnapScanId(null); setSnapReview(null)
      setSnapPlatePhase('compose')
      setSnapPlateOpen(true)
    } catch (err) {
      console.error('[nutrition] image capture failed', err)
    }
  }, [])
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<{
    logId: string
    item: IMealItem & { _id?: string }
    currentTag: string
    loggedAt: string
    untimed?: boolean
  } | null>(null)
  // Edit a whole logged meal (tag + time) at once, from the meal group
  // card's own edit affordance — separate from editEntry, which edits one
  // food item and (for a multi-item meal) splits it off.
  const [editMeal, setEditMeal] = useState<{
    logId: string
    mealName?: string
    currentTag: string
    loggedAt: string
    untimed?: boolean
  } | null>(null)
  // When set, the food picker appends to THIS specific MealLog (used by "add to
  // this meal" on a logged meal group) rather than the smart tag-append.
  const [addToLogId, setAddToLogId] = useState<string | null>(null)
  const { toast, showToast } = useToast(4000)
  // Saving a reusable meal needs `custom-meals`; multi-add does not. Fetched
  // rather than assumed so a free member sees "Log 3 items" instead of an
  // "Add to meal" that the server would reject.
  const [canSaveMeals, setCanSaveMeals] = useState(false)
  // "+ Add tag" inline input state
  const [showAddTagInput, setShowAddTagInput] = useState(false)
  const [newTagInput, setNewTagInput] = useState('')
  // Plans for the visible date — fetched only when viewingFuture (today/past
  // days don't render plans).
  const [plans, setPlans] = useState<MealPlan[]>([])
  // The member's meal-tag time windows. Empty is the normal state for someone
  // who has never opened the Meal Schedule screen, and everything downstream
  // falls back to the app-wide table in that case.
  const [scheduleWindows, setScheduleWindows] = useState<TagWindow[]>([])
  // Schedule-meals drawer — opens on "Schedule meals" CTA when viewingFuture.
  const [scheduleDrawerOpen, setScheduleDrawerOpen] = useState(false)

  // One-tap "Copy yesterday": re-log everything from yesterday onto the
  // selected day (items are full snapshots, so reposting them is lossless).
  const [copyingYesterday, setCopyingYesterday] = useState(false)
  const copyYesterday = async () => {
    if (copyingYesterday) return
    setCopyingYesterday(true)
    try {
      const yest = new Date(selectedDate)
      yest.setDate(yest.getDate() - 1)
      const tz = new Date().getTimezoneOffset()
      const res = await fetch(`/api/meal-logs?date=${formatDateParam(yest)}&tz=${tz}`, { headers: getHeaders() })
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()
      const logs: Array<{ tags?: string[]; items?: Record<string, unknown>[] }> = data.logs ?? []
      const withItems = logs.filter((l) => (l.items?.length ?? 0) > 0)
      if (withItems.length === 0) {
        showToast('Nothing logged yesterday to copy', 'error')
        return
      }
      // Stamp logs at midday of the selected date, keeping relative order.
      const base = new Date(selectedDate)
      base.setHours(12, 0, 0, 0)
      let i = 0
      for (const log of withItems) {
        await fetch('/api/meal-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getHeaders() },
          body: JSON.stringify({
            items: log.items,
            tags: log.tags ?? [],
            loggedAt: new Date(base.getTime() + i * 60_000).toISOString(),
          }),
        })
        i++
      }
      showToast(`Copied ${withItems.length} meal${withItems.length === 1 ? '' : 's'} from yesterday`, 'success')
      invalidateMindSession()
      fetchMealLogs()
    } catch {
      showToast('Could not copy yesterday', 'error')
    } finally {
      setCopyingYesterday(false)
    }
  }

  // Swipe left/right anywhere on the page to move between days — same gesture
  // as the calendar. Disabled while any modal/drawer is open so in-modal
  // horizontal gestures never page the date underneath.
  // Direction-aware date change so the day content slides like the calendar.
  const [slideDir, setSlideDir] = useState(0)
  const changeDate = (next: Date) => {
    setSlideDir(next.getTime() === selectedDate.getTime() ? 0 : next > selectedDate ? 1 : -1)
    setSelectedDate(next)
  }
  const shiftDay = (delta: number) => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + delta)
    changeDate(d)
  }
  const anyOverlayOpen =
    foodSearchOpen || quickAddOpen || scheduleDrawerOpen || editEntry !== null || editMeal !== null || snapPlateOpen
  const swipe = useSwipeNav({
    onPrev: () => shiftDay(-1),
    onNext: () => shiftDay(1),
    disabled: anyOverlayOpen,
  })

  const dateParam = formatDateParam(selectedDate)
  // True when the user has scrolled to a future calendar day. Drives the
  // copy on "Add food" → "Schedule food" CTAs and routes new picker opens
  // through plan mode (see openFoodSearch).
  const viewingFuture = isFutureLocalDate(selectedDate)
  // Show planned meals on TODAY as well as future days (a plan you made for this
  // morning should appear on today's nutrition page, not only on the plan/timeline
  // page). Past days render logs only.
  const showPlans = dateParam >= todayLocalKey()
  // Exactly today — not future, not past. Drives where "Schedule meals" sits.
  const viewingToday = dateParam === todayLocalKey()

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

  const fetchEntitlements = useCallback(async () => {
    try {
      const res = await fetch('/api/me/entitlements', { headers: getHeaders() })
      if (!res.ok) return
      const data = await res.json()
      setCanSaveMeals(Boolean(data?.features?.['custom-meals']?.allowed))
    } catch {
      // Leave it false: the worst case is multi-add without meal saving, which
      // still logs everything they picked.
    }
  }, [getHeaders])

  const fetchMealLogs = useCallback(async () => {
    try {
      const tz = new Date().getTimezoneOffset()
      const res = await fetch(`/api/meal-logs?date=${dateParam}&tz=${tz}`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setLogs((data.logs || []).map((l: MealLogLite) => ({ ...l, _id: String(l._id) })))
        setDailyTotals({
          calories: Math.round(data.dailyTotals?.calories ?? 0),
          protein: Math.round(data.dailyTotals?.protein ?? 0),
          carbs: Math.round(data.dailyTotals?.carbs ?? 0),
          fats: Math.round(data.dailyTotals?.fats ?? 0),
          // Already computed by the log API; it was simply never carried
          // through to the UI.
          fiber: Math.round(data.dailyTotals?.fiber ?? 0),
        })
      } else {
        setLogs([])
        setDailyTotals({ calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 })
      }
    } catch (err) {
      console.error('Failed to fetch meal logs:', err)
      setLogs([])
      setDailyTotals({ calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 })
    }
  }, [dateParam, getHeaders])

  // Water + quickAdds still live on the legacy NutritionLog. We hit the legacy
  // endpoint just to read those side-tables (its meal/dailyTotals fields are
  // ignored — we use /api/meal-logs for those).
  const fetchSideTables = useCallback(async () => {
    try {
      const res = await fetch(`/api/nutrition/log?date=${dateParam}&tz=${new Date().getTimezoneOffset()}`, { headers: getHeaders() })
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

  // Fetched once per mount: the windows change on a settings screen, not while
  // scrolling days, and a failure here is not worth surfacing — an empty
  // schedule is a valid state that falls back to app-wide defaults.
  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch('/api/nutrition/meal-schedule', { headers: getHeaders() })
      if (!res.ok) return
      const data = await res.json().catch(() => null)
      if (Array.isArray(data?.windows)) setScheduleWindows(data.windows as TagWindow[])
    } catch {
      // Keep the empty default.
    }
  }, [getHeaders])

  // Also fetched once per mount, same reasoning as fetchSchedule — the target
  // weight and pace don't move while paging between days.
  const fetchGoalWeight = useCallback(async () => {
    try {
      const res = await fetch(`/api/goals?tz=${new Date().getTimezoneOffset()}`, { headers: getHeaders() })
      if (!res.ok) return
      const data = await res.json().catch(() => null)
      const n = data?.nutrition
      if (!n) return
      setGoalWeight({
        weight: n.target?.weight ?? null,
        unit: n.unit === 'kg' ? 'kg' : 'lbs',
        direction: n.direction ?? null,
        paceStatus: n.pace?.status ?? null,
      })
    } catch {
      // No goal line — the ring still stands on its own.
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

  // Full-page skeleton only on the FIRST load. On day swipes we refetch in the
  // background and let the date-scoped content slide + update in place (matches
  // the timeline) — gating the whole page on `loading` every date change made
  // the dash flash a skeleton on every swipe.
  const didInitialLoad = useRef(false)
  useEffect(() => {
    async function init() {
      if (!didInitialLoad.current) setLoading(true)
      await Promise.all([fetchMealLogs(), fetchSideTables(), fetchGoals(), fetchTags(), fetchPlans(), fetchEntitlements(), fetchSchedule(), fetchGoalWeight()])
      if (!didInitialLoad.current) { setLoading(false); didInitialLoad.current = true }
    }
    init()
  }, [fetchMealLogs, fetchSideTables, fetchGoals, fetchTags, fetchPlans, fetchEntitlements, fetchSchedule, fetchGoalWeight])

  // Re-open a saved scan to edit (?scan=<id> from the Scan history "Edit"):
  // fetch it and open the plate review pre-loaded with its items.
  useEffect(() => {
    const scanId = searchParams?.get('scan')
    if (!scanId || handledScanRef.current === scanId) return
    handledScanRef.current = scanId
    ;(async () => {
      try {
        const res = await fetch(`/api/nutrition/scans/${scanId}`, { headers: getHeaders() })
        if (!res.ok) return
        const data = await res.json()
        const items = data?.scan?.items
        if (Array.isArray(items) && items.length) {
          setSnapInitialImage(null)
          setSnapDescribeText(null)
          setSnapImageUrl(typeof data.scan.imageUrl === 'string' ? data.scan.imageUrl : null)
          setSnapScanId(scanId)
          setSnapReview(items)
          setSnapPlatePhase('review')
          setSnapPlateOpen(true)
        }
      } catch { /* ignore */ }
    })()
  }, [searchParams, getHeaders])

  // ── The day, in the order it happened ─────────────────────────────────────────
  //
  // The unit here used to be the TAG: one section per tag, defaults in a fixed
  // canonical sequence and custom tags ALPHABETICALLY after them. That produced
  // two wrong readings of the same day:
  //
  //   • breakfast, snack, lunch, snack collapsed into ONE snack section holding
  //     both snacks, rendered below lunch. The day no longer read in order and
  //     the two sittings were pooled as though they were one.
  //   • a "Bed" meal planned for 11pm sorted ABOVE a "Before Work" meal already
  //     eaten at 8pm, purely because "bed" < "before work".
  //
  // The unit is now the OCCURRENCE — one contiguous sitting of one tag — and the
  // whole day sorts by clock time. See lib/nutrition/dayOrder.ts for the rule.
  //
  // Empty tags the member added this session still need somewhere to live, so
  // they are folded in at their scheduled position rather than pinned to the end.
  const occurrences = useMemo(
    () => buildDayOccurrences<MealLogLite, MealPlan>(logs, plans, scheduleWindows, { includePlans: showPlans }),
    [logs, plans, scheduleWindows, showPlans],
  )

  const sections = useMemo(() => {
    const withContent = occurrences.map(o => ({ ...o, empty: false }))
    const used = new Set(withContent.map(o => o.tag))
    const empties = sessionTags
      .map(t => String(t).toLowerCase())
      .filter(t => !used.has(t))
      .map(tag => ({
        key: `empty:${tag}`,
        tag,
        sortMinutes: sortMinutesForTag(scheduleWindows, tag),
        logs: [] as MealLogLite[],
        plans: [] as MealPlan[],
        planned: false,
        untimed: false,
        empty: true,
      }))
    return [...withContent, ...empties].sort((a, b) => {
      if (a.sortMinutes !== b.sortMinutes) return a.sortMinutes - b.sortMinutes
      if (a.planned !== b.planned) return a.planned ? 1 : -1
      return 0
    })
  }, [occurrences, sessionTags, scheduleWindows])

  // ── Date navigation ───────────────────────────────────────────────────────

  // ── Event handlers ────────────────────────────────────────────────────────

  const showErrorToast = (msg: string) => showToast(msg, 'error')

  // Find an existing "loose" MealLog today whose primary tag === tag, skipping
  // named Meal-template logs (see lib/nutrition/logTagMatch).
  const findLogForTag = useCallback(
    (tag: string): MealLogLite | undefined => findLogForTagPure(logs, tag, DEFAULT_TAGS),
    [logs],
  )

  /**
   * Fold items already logged today into one grouped entry, optionally keeping
   * it as a reusable meal.
   *
   * The server does the create-then-strip in one request precisely so this
   * client cannot leave a half-merged day behind on a dropped connection.
   */
  const handleCombine = async (
    picks: { logId: string; itemId: string }[],
    opts: { mealName?: string; saveAsMeal: boolean },
  ) => {
    if (picks.length < 2) return
    try {
      const res = await fetch('/api/meal-logs/combine', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ picks, mealName: opts.mealName, saveAsMeal: opts.saveAsMeal }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showToast(data?.error || 'Could not combine those items.', 'error')
        return
      }
      showToast(
        opts.saveAsMeal && opts.mealName
          ? `Combined ${picks.length} items and saved "${opts.mealName}"`
          : `Combined ${picks.length} items`,
        'success',
      )
      await fetchMealLogs()
    } catch {
      showToast('Could not combine those items.', 'error')
    }
  }

  /**
   * The legacy IFoodEntry shape -> MealItemInput. Shared so the single-add and
   * multi-add paths cannot drift on which provenance fields they forward.
   */
  const toMealItemInput = (food: LoggedFoodEntry) => ({
    foodId: food.foodId,
    variantId: food.variantId,
    variantName: food.variantName,
    name: food.name,
    brand: food.brand,
    servingSize: food.servingSize,
    servingUnit: food.servingUnit,
    servings: food.servings,
    nutrition: food.nutrition,
    servingLabel: food.servingLabel,
    loggedQuantity: food.loggedQuantity,
    loggedUnit: food.loggedUnit,
    loggedGramsPerServing: food.loggedGramsPerServing,
    loggedMlPerServing: food.loggedMlPerServing,
  })

  /**
   * Log a whole basket in one pass, optionally keeping it as a reusable meal.
   *
   * Logging several items together is the point — a burger, its bun and the
   * sauce were three round trips through the search sheet. Saving the MEAL is
   * the extra, and it is what needs `custom-meals`, so a member without the
   * entitlement still gets the multi-add.
   *
   * Order matters: the log is what the member asked for, so it goes first and
   * a failure to save the meal never costs them the log.
   */
  const handleAddMany = async (
    entries: LoggedFoodEntry[],
    opts: { tag?: string; loggedAt?: string; mealName?: string; untimed?: boolean },
  ) => {
    if (entries.length === 0) return
    const useTag = (opts.tag || foodSearchTag || 'snack').toLowerCase()
    const items = entries.map(toMealItemInput)

    try {
      const res = await fetch('/api/meal-logs', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          source: 'manual',
          tags: [useTag],
          items,
          // Name the log even when they are not saving a reusable meal, so the
          // day reads "Turkey sandwich" instead of three loose rows.
          ...(opts.mealName ? { mealName: opts.mealName } : {}),
          ...(opts.loggedAt ? { loggedAt: opts.loggedAt } : {}),
          untimed: opts.untimed === true,
        }),
      })
      if (!res.ok) {
        showToast('Could not log those items.', 'error')
        return
      }

      if (opts.mealName) {
        // Best effort. The items are already logged; failing to keep the meal
        // is worth a quieter message than losing the log would be.
        const mealRes = await fetch('/api/meals', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ name: opts.mealName, items }),
        })
        showToast(
          mealRes.ok
            ? `Logged ${entries.length} items and saved "${opts.mealName}"`
            : `Logged ${entries.length} items. Could not save the meal.`,
          mealRes.ok ? 'success' : 'error',
        )
      } else {
        showToast(`Logged ${entries.length} item${entries.length === 1 ? '' : 's'}`, 'success')
      }

      await fetchMealLogs()
    } catch {
      showToast('Could not log those items.', 'error')
    }
  }

  const handleAddFood = async (food: IFoodEntry, tag?: string, loggedAtOverride?: string, untimed?: boolean) => {
    const useTag = (tag || foodSearchTag || 'snack').toLowerCase()
    try {
      // Build a MealItemInput from the legacy IFoodEntry shape. The
      // FoodSearchModal extends IFoodEntry with the new logged* fields (PR 4
      // picker rework); pass them through when the modal supplied them so the
      // log row knows the user's actual unit + bridges for future re-edits.
      const extra = food as IFoodEntry & {
        servingLabel?: string
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
        servingLabel: extra.servingLabel,
        loggedQuantity: extra.loggedQuantity,
        loggedUnit: extra.loggedUnit,
        loggedGramsPerServing: extra.loggedGramsPerServing,
        loggedMlPerServing: extra.loggedMlPerServing,
      }

      // When the user explicitly picked a custom time we ALWAYS create a new
      // MealLog (so their intent — a separate entry at that exact time — is
      // preserved). Otherwise we fall back to the smart "append to existing
      // log of this tag" behavior.
      // "Add to this meal" targets a specific log; otherwise smart-append to the
      // tag's log (unless the user pinned a custom time → always a new entry).
      // The smart-append target also has to agree on untimed-ness: merging a
      // "Now"-timed item into an existing untimed log (or vice versa) would
      // silently discard the user's choice and mislabel the whole section —
      // this was the "I still incorrectly see 'no time'" report.
      const smartTarget = loggedAtOverride ? undefined : findLogForTag(useTag)
      const existing = addToLogId
        ? logs.find(l => l._id === addToLogId)
        : (smartTarget && Boolean(smartTarget.untimed) === (untimed === true) ? smartTarget : undefined)
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
            // Logged for the day with no clock. The day view places it by the
            // tag's anchor rather than by loggedAt's time-of-day.
            untimed: untimed === true,
          }),
        })
      }

      if (res.ok) {
        invalidateMindSession() // new context → next mind load composes fresh
        await Promise.all([fetchMealLogs(), fetchTags()])
        setFoodSearchOpen(false)
        setFoodSearchAutoScan(false)
        setAddToLogId(null)
        // Once a session-added tag has content it becomes a real occurrence — drop it.
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

  // Log it — promote a plan into a real, explicitly untimed log (today only).
  // The plan names the meal/day but not the moment it was eaten, so stamping
  // the button-press time would invent information the member never supplied.
  const handleLogPlan = async (planId: string) => {
    try {
      const res = await fetch(`/api/meal-plans/${planId}/promote`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ untimed: true }),
      })
      if (!res.ok) throw new Error('promote_failed')
      await Promise.all([fetchMealLogs(), fetchPlans()])
      showToast('Logged from your plan', 'success')
    } catch {
      showErrorToast('Could not log this plan.')
    }
  }

  const handleRemoveEntry = async (logId: string, itemId: string) => {
    const prev = logs
    setLogs(ls => ls.map(l => l._id === logId
      ? { ...l, items: l.items.filter(it => it._id !== itemId) }
      : l
    ).filter(l => l.items.length > 0))
    try {
      const res = await fetch(`/api/meal-logs/${logId}/items/${itemId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      if (!res.ok) {
        setLogs(prev)
        showErrorToast('Failed to delete entry.')
      } else {
        // Resync the headline daily-calorie ring + macro bars. The optimistic
        // setLogs above only touches the meal cards; dailyTotals is separate
        // state set exclusively by fetchMealLogs, so without this the ring keeps
        // counting the just-deleted item until an unrelated refetch.
        fetchMealLogs()
      }
    } catch (err) {
      setLogs(prev)
      console.error('Failed to delete entry:', err)
    }
  }

  const handleAddWater = async (amount: number) => {
    try {
      const tz = new Date().getTimezoneOffset()
      const res = await fetch('/api/nutrition/water', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ amount, date: dateParam, tz }),
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
      const tz = new Date().getTimezoneOffset()
      const res = await fetch('/api/nutrition/quick-add', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ ...data, date: dateParam, tz }),
      })
      if (res.ok) {
        invalidateMindSession()
        await fetchSideTables()
      }
    } catch (err) {
      console.error('Failed to quick add:', err)
    }
    setQuickAddOpen(false)
  }

  const handleDeleteQuickAdd = async (quickAddId: string) => {
    try {
      const tz = new Date().getTimezoneOffset()
      const res = await fetch('/api/nutrition/quick-add', {
        method: 'DELETE',
        headers: getHeaders(),
        body: JSON.stringify({ quickAddId, date: dateParam, tz }),
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
    setAddToLogId(null)
    setFoodSearchOpen(true)
  }

  // Add a food INTO an existing logged meal group (keeps it under that meal's
  // outline). Always log mode against the specific MealLog.
  const openAddToMeal = (logId: string, tag: string) => {
    setAddToLogId(logId)
    setFoodSearchTag(tag.toLowerCase())
    setFoodSearchAutoScan(false)
    setPlanForDate(null)
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
    // Only needs adding when nothing on the day already covers it; an existing
    // occurrence of that tag is already a section.
    if (!sections.some(s => s.tag === norm)) {
      setSessionTags(prev => [...prev, norm])
    }
    // sessionTags is session-only by design (an empty section you added but
    // never used should not linger), but the TAG itself must survive so it is
    // offered next time. Those are different things and only the second is saved.
    void createMealTag(norm)
    setNewTagInput('')
    setShowAddTagInput(false)
  }

  const handleRemoveSessionTag = (tag: string) => {
    setSessionTags(prev => prev.filter(t => t !== tag))
  }

  // Quick-add total calories
  const quickAddCalories = quickAdds.reduce((s, qa) => s + (qa.calories || 0), 0)
  // Planned totals for the visible date — meaningful whenever plans can exist
  // for it (today or a future day; past days never render plans, see showPlans).
  const plannedTotals = useMemo(() => {
    if (!showPlans) return { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
    let c = 0, p = 0, cb = 0, f = 0, fib = 0
    for (const plan of plans) {
      const n = plan.expectedNutrition
      c += n?.calories ?? 0
      p += n?.protein ?? 0
      cb += n?.carbs ?? 0
      f += n?.fats ?? 0
      fib += (n as { fiber?: number } | undefined)?.fiber ?? 0
    }
    return {
      calories: Math.round(c), protein: Math.round(p), carbs: Math.round(cb),
      fats: Math.round(f), fiber: Math.round(fib),
    }
  }, [showPlans, plans])

  // Today only: meals still planned (not yet logged) render as a light shadow
  // past the actual consumed arc/bars — a preview of where the day lands if
  // the rest of today's plan gets eaten. Future days already show plannedTotals
  // as the primary ring value (nothing to shadow against); past days don't
  // carry a shadow since there's nothing left to eat.
  const todayPlannedExtra = viewingToday ? plannedTotals : null

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

  // Nutrition is now generally available — was previously admin-gated by
  // FeatureGuard while the food DB + macro tracker stabilized. Kept the
  // FeatureGuard component around in case we need to gate other surfaces
  // again, but nutrition is unlocked for every authed user.

  // "Schedule meals" is the same control everywhere, but WHERE it sits is what
  // tells you what it means:
  //
  //   future day → above the timeline. Scheduling is the only thing you can do
  //                on a day you have not lived yet, so it leads.
  //   today      → below the water tracker, at the very end of the day. You
  //                scroll down past what you have already eaten and it is
  //                waiting there, which reads as "the rest of today" rather
  //                than as a second, competing way to add food. Planning a meal
  //                you have not eaten yet has always worked (the API allows
  //                today; see /api/meal-plans §past-date check) — there was
  //                simply nowhere on this page to reach it.
  //   past day   → not rendered. There is no future left to plan.
  //
  // One definition, two placements, so the two can never drift apart.
  const scheduleMealsButton = (
    <button
      type="button"
      onClick={() => setScheduleDrawerOpen(true)}
      className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
    >
      <CalendarDays className="h-4 w-4" />
      Schedule meals
    </button>
  )

  return (
    <>
      {/* pb-28 keeps the last interactive controls (water +oz, Quick Add / Meal
          Plan tiles) clear of the floating add-food FAB (fixed bottom-28). */}
      <PageTransition className="pb-28">
       <div className="space-y-4 sm:space-y-6" {...swipe.handlers}>
        {/* Header */}
        <header className="mb-2 flex items-start justify-between gap-3 sm:mb-4">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">Nutrition</h1>
            <p className="truncate text-sm text-zinc-500 dark:text-zinc-400 sm:text-base">
              Track your food, macros, and hydration
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <HeaderPillLink href="/dashboard/meals" Icon={ChefHat} data-tour="nutrition-my-stuff">My Stuff</HeaderPillLink>
            {/* Timeline + Estimate history tucked into one dropdown */}
            <div className="relative">
              <button
                onClick={() => setNavMenuOpen((o) => !o)}
                aria-label="Timeline and history"
                aria-expanded={navMenuOpen}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700"
              >
                <Clock className="h-4 w-4" /> Timeline
                <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
              </button>
              {navMenuOpen && (
                <>
                  <button className="fixed inset-0 z-40 cursor-default" aria-hidden tabIndex={-1} onClick={() => setNavMenuOpen(false)} />
                  <div className="absolute right-0 top-12 z-50 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                    <Link href={`/dashboard/timeline?date=${dateParam}`} onClick={() => setNavMenuOpen(false)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800">
                      <Clock className="h-4 w-4" /> Timeline
                    </Link>
                    <Link href="/dashboard/nutrition/meal-schedule" onClick={() => setNavMenuOpen(false)} className="flex w-full items-center gap-2.5 border-t border-zinc-100 px-3 py-2.5 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800">
                      <CalendarClock className="h-4 w-4" /> Meal Schedule
                    </Link>
                    <Link href="/dashboard/nutrition/scans" onClick={() => setNavMenuOpen(false)} className="flex w-full items-center gap-2.5 border-t border-zinc-100 px-3 py-2.5 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800">
                      <History className="h-4 w-4" /> Estimate history
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Add food — a compact (fake) search tap + two capture menus: a camera
            (take photo / scan barcode) and an upload (upload photo / describe). */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => openFoodSearch(defaultTagAt(scheduleWindows, minutesOfDay(new Date())))}
            data-tour="nutrition-search"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/60 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <Search className="h-4 w-4 shrink-0 text-zinc-400" />
            <span className="truncate text-sm text-zinc-400 dark:text-zinc-500">Search foods…</span>
          </button>

          {/* Camera menu — take photo / scan barcode */}
          <div className="relative shrink-0">
            <button
              onClick={() => setCaptureMenu((m) => (m === 'camera' ? null : 'camera'))}
              aria-label="Camera options"
              aria-expanded={captureMenu === 'camera'}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700"
            >
              <Camera className="h-5 w-5" />
            </button>
            {captureMenu === 'camera' && (
              <>
                <button className="fixed inset-0 z-40 cursor-default" aria-hidden tabIndex={-1} onClick={() => setCaptureMenu(null)} />
                <div className="absolute right-0 top-12 z-50 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                  <button onClick={() => { setCaptureMenu(null); openSnapCamera() }} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800">
                    <Camera className="h-4 w-4" /> Take photo
                  </button>
                  <button onClick={() => { setCaptureMenu(null); openFoodSearch(defaultTagAt(scheduleWindows, minutesOfDay(new Date())), true) }} className="flex w-full items-center gap-2.5 border-t border-zinc-100 px-3 py-2.5 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800">
                    <ScanBarcode className="h-4 w-4" /> Scan barcode
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Upload menu — upload photo / describe */}
          <div className="relative shrink-0">
            <button
              onClick={() => setCaptureMenu((m) => (m === 'upload' ? null : 'upload'))}
              aria-label="Upload options"
              aria-expanded={captureMenu === 'upload'}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700"
            >
              <Upload className="h-5 w-5" />
            </button>
            {captureMenu === 'upload' && (
              <>
                <button className="fixed inset-0 z-40 cursor-default" aria-hidden tabIndex={-1} onClick={() => setCaptureMenu(null)} />
                <div className="absolute right-0 top-12 z-50 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                  <button onClick={() => { setCaptureMenu(null); openSnapUpload() }} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800">
                    <ImagePlus className="h-4 w-4" /> Upload photo
                  </button>
                  <button onClick={() => { setCaptureMenu(null); openDescribe() }} className="flex w-full items-center gap-2.5 border-t border-zinc-100 px-3 py-2.5 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800">
                    <PencilLine className="h-4 w-4" /> Describe
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Hidden capture inputs feeding the plate flow (page-owned so both the
            dash and the search hub can trigger them within a user gesture). */}
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCaptureFile} />
        <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleCaptureFile} />

        {/* Date Navigation */}
        <DateNav
          date={selectedDate}
          onDateChange={changeDate}
        />

        {/* Future-day schedule CTA — static across future-day paging, so it
            sits OUTSIDE the sliding region.
            
            NOT gated on visibleTags. It used to be, which meant the button only
            existed once the day already had something on it — so on a fresh
            future day it rendered from the PREVIOUS day's tags still sitting in
            state, then vanished the moment they cleared. It read as a flash.
            Worse, a member with quick-adds configured fell between this and the
            empty state below (which requires no quick-adds) and got no way to
            schedule at all. Scheduling is exactly what a future day is for; the
            button should never be conditional on the day being non-empty. */}
        {viewingFuture && scheduleMealsButton}

        {/* Date-scoped content — slides horizontally on date change (same
            motion as the calendar grid). popLayout keeps exit/enter stacked. */}
        <div className="relative overflow-x-clip">
        <AnimatePresence initial={false} custom={slideDir} mode="popLayout">
        <motion.div
          key={dateParam}
          custom={slideDir}
          variants={slideVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
          className="space-y-4 sm:space-y-6"
        >

        {/* Calorie Ring + Macro Summary */}
        <CalorieRing
          consumed={totalConsumedCalories}
          goal={goals.calories}
          protein={{ current: totalProtein, goal: goals.protein, planned: todayPlannedExtra?.protein }}
          carbs={{ current: totalCarbs, goal: goals.carbs, planned: todayPlannedExtra?.carbs }}
          fiber={viewingFuture ? plannedTotals.fiber : dailyTotals.fiber}
          fats={{ current: totalFats, goal: goals.fats, planned: todayPlannedExtra?.fats }}
          plannedExtra={todayPlannedExtra?.calories}
        />
        {goalWeight && (
          <p
            data-testid="nutrition-goal-line"
            className="-mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400"
          >
            {nutritionGoalLine({
              calories: goals.calories,
              targetWeight: goalWeight.weight,
              unit: goalWeight.unit,
              direction: goalWeight.direction,
              paceStatus: goalWeight.paceStatus,
            })}
          </p>
        )}

        {/* Empty state — nothing logged today yet (or nothing planned, on a future day) */}
        {sections.length === 0 && quickAdds.length === 0 && (
          <EmptyState
            icon={<UtensilsCrossed className="h-6 w-6" />}
            title={viewingFuture ? 'Nothing planned yet' : 'Nothing logged yet'}
            description={viewingFuture
              ? "Plan ahead — schedule meals for this day so they're ready when it arrives."
              : 'Add your first food of the day to start tracking.'}
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                {viewingFuture ? (
                  // The blue CTA above is always present on a future day now, so
                  // a second Schedule button here would just be the same action
                  // twice on one screen.
                  null
                ) : (
                  <>
                    <button
                      onClick={() => openFoodSearch('breakfast', false)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                    >
                      <Plus className="h-4 w-4" />
                      Add food
                    </button>
                    <button
                      onClick={copyYesterday}
                      disabled={copyingYesterday}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <Copy className="h-4 w-4" />
                      {copyingYesterday ? 'Copying…' : 'Copy yesterday'}
                    </button>
                  </>
                )}
                <Link
                  href="/dashboard/meals"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <ChefHat className="h-4 w-4" />
                  Browse My Stuff
                </Link>
              </div>
            }
          />
        )}



        {/* One section per OCCURRENCE, in clock order — so a second snack later
            in the day is its own section rather than being pooled into the
            first one. Keyed by occurrence, not tag; two snack sections would
            collide on a tag key. */}
        {sections.map(section => (
          <TagSection
            key={section.key}
            tag={section.tag}
            logs={section.logs}
            plans={section.plans}
            // No clock label on an untimed sitting: it has a position, not a
            // time, and printing the anchor would read as a time the member
            // never entered.
            occurrenceAt={section.logs.length > 0 && !section.untimed ? section.sortMinutes : undefined}
            untimed={section.untimed}
            onAddFood={(t) => openFoodSearch(t, false)}
            onAddToMeal={(logId, t) => openAddToMeal(logId, t)}
            onEditEntry={(logId, item, currentTag, loggedAt, untimed) => {
              setEditEntry({ logId, item, currentTag, loggedAt, untimed })
            }}
            onEditMeal={(logId, mealName, currentTag, loggedAt, untimed) => {
              setEditMeal({ logId, mealName, currentTag, loggedAt, untimed })
            }}
            onRemoveEntry={handleRemoveEntry}
            onRemovePlan={handleRemovePlan}
            onLogPlan={dateParam === todayLocalKey() ? handleLogPlan : undefined}
            onRemoveTag={handleRemoveSessionTag}
            removable={section.empty && sessionTags.includes(section.tag)}
            onPlan={(t) => openPlanDatePicker(t)}
            onCombine={handleCombine}
            canSaveMeals={canSaveMeals}
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

        {/* End of today: what is still ahead of you. See scheduleMealsButton. */}
        {viewingToday && scheduleMealsButton}

        </motion.div>
        </AnimatePresence>
        </div>

        {/* AI copilot — scaffolded (plugs into lib/nutrition/aiSeams via the
            unified Become AI engine / redbtn graph later) */}
        <NutritionAITeaser remaining={{ calories: goals.calories - dailyTotals.calories, protein: goals.protein - dailyTotals.protein }} />

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
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">My Stuff</span>
          </Card>

          <Card
            as={Link}
            href="/dashboard/meal-plan"
            variant="compact"
            className="flex flex-col items-center gap-2 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Meal Plan</span>
          </Card>
        </div>
       </div>
      </PageTransition>

      {/* Floating add button — persistent "add food" affordance that stays put
          as the day view scrolls. Sits above the floating BottomNav (z-40) and
          clears it via bottom-28; modals (z-50+) overlay it. */}
      <button
        onClick={() => openFoodSearch(defaultTagAt(scheduleWindows, minutesOfDay(new Date())))}
        aria-label={viewingFuture ? 'Schedule food' : 'Add food'}
        className="fixed bottom-28 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg shadow-zinc-900/30 transition-transform hover:scale-105 active:scale-95 dark:bg-white dark:text-zinc-900"
      >
        <Plus className="h-7 w-7" />
      </button>

      {/* Snap Plate Modal — AI vision plate estimator */}
      <SnapPlateModal
        open={snapPlateOpen}
        tag={defaultTagAt(scheduleWindows, minutesOfDay(new Date()))}
        tagOptions={Array.from(new Set([...tagsResp.defaults, ...tagsResp.userTags]))}
        dateKey={dateParam}
        initialPhase={snapPlatePhase}
        initialImage={snapInitialImage}
        initialDescribe={snapDescribeText}
        initialReview={snapReview}
        initialImageUrl={snapImageUrl}
        initialScanId={snapScanId}
        onClose={() => setSnapPlateOpen(false)}
        onLogged={() => { invalidateMindSession(); fetchMealLogs(); fetchTags(); setFoodSearchOpen(false) }}
      />

      {/* Food Search Modal — log mode (default) and plan mode (when planForDate set). */}
      <FoodSearchModal
        isOpen={foodSearchOpen}
        currentTag={foodSearchTag}
        availableTags={tagsResp}
        viewedDate={planForDate ?? selectedDate}
        mode={planForDate ? 'plan' : 'log'}
        autoScan={foodSearchAutoScan}
        onSnapPhoto={() => openSnapCamera()}
        onUpload={() => openSnapUpload()}
        onDescribe={(text) => openDescribe(text)}
        onClose={() => { setFoodSearchOpen(false); setFoodSearchAutoScan(false); setPlanForDate(null); setAddToLogId(null) }}
        onAddMany={handleAddMany}
        canSaveMeals={canSaveMeals}
        onSelectFood={(entry, tag, loggedAt, _planOptions, untimed) => {
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
              servingLabel: (entry as { servingLabel?: string }).servingLabel,
              loggedQuantity: (entry as { loggedQuantity?: number }).loggedQuantity,
              loggedUnit: (entry as { loggedUnit?: string }).loggedUnit,
              loggedGramsPerServing: (entry as { loggedGramsPerServing?: number }).loggedGramsPerServing,
              loggedMlPerServing: (entry as { loggedMlPerServing?: number }).loggedMlPerServing,
            }
            const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
            const headers: HeadersInit = { 'Content-Type': 'application/json' }
            if (token) headers['Authorization'] = `Bearer ${token}`
            const targetDate = planForDate
            return fetch('/api/meal-plans', {
              method: 'POST',
              headers,
              body: JSON.stringify({ plannedDate: planned, tag: useTag, items: [item] }),
            }).then(r => {
              if (!r.ok) {
                showErrorToast('Failed to plan food.')
                return
              }
              showToast(
                `Planned for ${targetDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`,
                'success'
              )
              setSelectedDate(targetDate)
              setFoodSearchOpen(false)
              setPlanForDate(null)
            }).catch(() => {
              showErrorToast('Failed to plan food. Check your connection.')
            })
          }
          return handleAddFood(entry, tag, loggedAt, untimed)
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
        loggedAt={editEntry?.loggedAt}
        untimed={editEntry?.untimed}
        currentTag={editEntry?.currentTag}
        availableTags={tagsResp}
        onClose={() => setEditEntry(null)}
        onSaved={() => { fetchMealLogs(); fetchTags() }}
      />

      {/* Edit Meal Modal — moves a whole logged meal's tag/time at once */}
      <EditMealModal
        isOpen={editMeal !== null}
        logId={editMeal?.logId ?? null}
        mealName={editMeal?.mealName}
        currentTag={editMeal?.currentTag ?? 'snack'}
        loggedAt={editMeal?.loggedAt}
        untimed={editMeal?.untimed}
        availableTags={tagsResp}
        onClose={() => setEditMeal(null)}
        onSaved={() => { fetchMealLogs(); fetchTags() }}
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

      <Toast toast={toast} />
    </>
  )
}
