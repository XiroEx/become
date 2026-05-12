"use client"

// ---------------------------------------------------------------------------
// ScheduleMealsDrawer — feature-rich planning drawer (PR: schedule-meals-drawer).
//
// Replaces the plain "Add food" CTA on every nutrition surface when the user
// is viewing a future date / week / month. The drawer covers three distinct
// planning workflows:
//
//   • By day        — per-tag slot composition for ONE day. Each tag (breakfast,
//                     lunch, snack, dinner, etc.) is a slot Card with the
//                     existing plans inline and a "+ Add food" button that
//                     opens the FoodSearchModal in plan mode pinned to the
//                     drawer's date. Also exposes per-slot "↻ Apply meal" which
//                     opens MealApplySheet in plan mode.
//   • From template — pick a saved Meal template and apply it to a tag across
//                     a range of future dates with optional recurrence. POSTs
//                     to /api/meal-plans/bulk-from-meal.
//   • Copy day      — duplicate a source day's logs or plans onto target
//                     dates. POSTs to /api/meal-plans/bulk-from-day.
//
// Range toggle: the date pill switches between single date and from→to range.
// In range mode the "By day" tab is hidden (per-slot composition doesn't fit
// a range — use the other two tabs instead).
//
// Reuse rules:
//   • Do NOT re-implement food picking — open FoodSearchModal in plan mode.
//   • Do NOT re-implement meal selection — render an inline meal list, then
//     for the per-slot "↻ Apply meal" flow open MealApplySheet in plan mode.
//   • Do NOT re-implement bulk endpoints client-side — call the existing
//     /api/meal-plans/bulk-from-{day,meal} endpoints.
// ---------------------------------------------------------------------------

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Plus,
  CalendarDays,
  ChefHat,
  CopyPlus,
  Loader2,
  Check,
  Repeat,
  Search,
  AlertTriangle,
  Sun,
  Sunrise,
  Moon,
  Cookie,
  Sandwich,
  Utensils,
  Dumbbell,
  Flame,
  Tag as TagIcon,
} from 'lucide-react'
import { useLockScroll } from '@/lib/useLockScroll'
import DateOnlyPicker, { formatDatePillLabel } from '@/components/ui/DateOnlyPicker'
import FoodSearchModal from '@/components/nutrition/FoodSearchModal'
import MealApplySheet from '@/components/meals/MealApplySheet'
import { EmptyState } from '@/components/ui'
import { todayLocalKey, addDaysToKey, compareDateKeys } from '@/lib/mealPlanDates'
import type { IFoodEntry } from '@/models/NutritionLog'
import type { IMealItem } from '@/models/Meal'
import type { MealPlan } from '@/app/dashboard/timeline/planning'

// ── Types ─────────────────────────────────────────────────────────────────────

type TabKey = 'by-day' | 'from-template' | 'copy-day'

interface MealLite {
  _id: string
  name: string
  imageUrl?: string
  tags?: string[]
  totalNutrition?: { calories?: number; protein?: number; carbs?: number; fats?: number }
  recipe?: { servings?: number }
}

interface ScheduleMealsDrawerProps {
  isOpen: boolean
  /** The date the drawer opens at — used as the "By day" slot date and as the
   *  default range "from" date. Should be today or a future date. */
  defaultDate: Date
  /** Default range end. When omitted the drawer opens in single-date mode. */
  defaultEndDate?: Date
  /** Whether to start in range mode (false = single-date, true = range). */
  initialRange?: boolean
  /** Tags available — defaults + user-defined tags. Drives slot grid + tag picker. */
  availableTags?: { defaults: string[]; userTags: string[] }
  onClose: () => void
  /** Fires whenever the drawer mutates plans. Caller refetches affected views. */
  onMutated?: () => void
}

const DEFAULT_TAG_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner', 'pre-workout', 'post-workout'] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function dateToKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function titleCaseTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('-')
}

function getHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

const tagVisuals: Record<string, { Icon: typeof Sun; iconColor: string; bgColor: string }> = {
  breakfast: { Icon: Sunrise, iconColor: 'text-amber-500', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
  lunch: { Icon: Sandwich, iconColor: 'text-orange-500', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
  dinner: { Icon: Utensils, iconColor: 'text-indigo-500', bgColor: 'bg-indigo-100 dark:bg-indigo-900/30' },
  snack: { Icon: Cookie, iconColor: 'text-emerald-500', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' },
  'pre-workout': { Icon: Dumbbell, iconColor: 'text-purple-500', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
  'post-workout': { Icon: Flame, iconColor: 'text-rose-500', bgColor: 'bg-rose-100 dark:bg-rose-900/30' },
  brunch: { Icon: Sun, iconColor: 'text-yellow-500', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' },
  dessert: { Icon: Cookie, iconColor: 'text-pink-500', bgColor: 'bg-pink-100 dark:bg-pink-900/30' },
  'late-night': { Icon: Moon, iconColor: 'text-slate-500', bgColor: 'bg-slate-100 dark:bg-slate-800/60' },
}

function getVisuals(tag: string) {
  return tagVisuals[tag.toLowerCase()] ?? { Icon: TagIcon, iconColor: 'text-zinc-500', bgColor: 'bg-zinc-100 dark:bg-zinc-800' }
}

// Compute slot tags: defaults (canonical order) + user tags that aren't already
// present. Used by the "By day" tab to render the slot grid.
function buildSlotTags(availableTags?: { defaults: string[]; userTags: string[] }): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (t: string) => {
    const norm = t.trim().toLowerCase()
    if (!norm || seen.has(norm)) return
    seen.add(norm)
    out.push(norm)
  }
  for (const t of DEFAULT_TAG_SLOTS) push(t)
  for (const t of availableTags?.defaults ?? []) push(t)
  for (const t of availableTags?.userTags ?? []) push(t)
  return out
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScheduleMealsDrawer({
  isOpen,
  defaultDate,
  defaultEndDate,
  initialRange = false,
  availableTags,
  onClose,
  onMutated,
}: ScheduleMealsDrawerProps) {
  useLockScroll(isOpen)

  // ── Date state ───────────────────────────────────────────────────────────
  const [rangeMode, setRangeMode] = useState<boolean>(initialRange)
  const [fromKey, setFromKey] = useState<string>(() => dateToKey(defaultDate))
  const [toKey, setToKey] = useState<string>(() => dateToKey(defaultEndDate ?? defaultDate))
  const [fromOpen, setFromOpen] = useState(false)
  const [toOpen, setToOpen] = useState(false)

  // ── Tab state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>('by-day')

  // ── Plans loaded for "By day" ────────────────────────────────────────────
  const [dayPlans, setDayPlans] = useState<MealPlan[]>([])
  const [loadingDay, setLoadingDay] = useState(false)

  // ── Per-slot picker state (By-day tab) ───────────────────────────────────
  const [pickerSlotTag, setPickerSlotTag] = useState<string | null>(null)
  const [mealApplyTag, setMealApplyTag] = useState<string | null>(null)
  const [mealApplyMeal, setMealApplyMeal] = useState<MealLite | null>(null)

  // ── Toast ────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const showToast = useCallback((kind: 'ok' | 'err', msg: string) => {
    setToast({ kind, msg })
    setTimeout(() => setToast(null), 3200)
  }, [])

  // ── Reset when reopened ──────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setRangeMode(initialRange)
      setFromKey(dateToKey(defaultDate))
      setToKey(dateToKey(defaultEndDate ?? defaultDate))
      setActiveTab(initialRange ? 'from-template' : 'by-day')
      setFromOpen(false)
      setToOpen(false)
      setPickerSlotTag(null)
      setMealApplyTag(null)
      setMealApplyMeal(null)
      setToast(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // When user toggles range on, force-leave the "By day" tab since slot
  // composition doesn't fit a range.
  useEffect(() => {
    if (rangeMode && activeTab === 'by-day') setActiveTab('from-template')
  }, [rangeMode, activeTab])

  // ── Fetch plans for fromKey when "By day" is active ──────────────────────
  const refreshDayPlans = useCallback(async () => {
    if (rangeMode) return
    setLoadingDay(true)
    try {
      const res = await fetch(`/api/meal-plans?from=${fromKey}&to=${fromKey}`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        const list: MealPlan[] = Array.isArray(data?.plans) ? data.plans : []
        setDayPlans(list.filter(p => p.status === 'active'))
      } else {
        setDayPlans([])
      }
    } catch {
      setDayPlans([])
    } finally {
      setLoadingDay(false)
    }
  }, [rangeMode, fromKey])

  useEffect(() => {
    if (!isOpen) return
    if (rangeMode) return
    if (activeTab !== 'by-day') return
    refreshDayPlans()
  }, [isOpen, rangeMode, activeTab, refreshDayPlans])

  // ── Mutations ────────────────────────────────────────────────────────────

  const handleAddFoodToSlot = useCallback(async (
    entry: IFoodEntry,
    tag?: string,
  ) => {
    const useTag = (tag || pickerSlotTag || 'snack').toLowerCase()
    const extra = entry as typeof entry & {
      loggedQuantity?: number
      loggedUnit?: string
      loggedGramsPerServing?: number
      loggedMlPerServing?: number
    }
    const item = {
      foodId: entry.foodId != null ? String(entry.foodId) : undefined,
      variantId: entry.variantId != null ? String(entry.variantId) : undefined,
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
    try {
      const res = await fetch('/api/meal-plans', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ plannedDate: fromKey, tag: useTag, items: [item] }),
      })
      if (!res.ok) {
        showToast('err', 'Failed to plan food.')
        return
      }
      setPickerSlotTag(null)
      await refreshDayPlans()
      onMutated?.()
      showToast('ok', `Added to ${titleCaseTag(useTag)}`)
    } catch {
      showToast('err', 'Failed to plan food. Check your connection.')
    }
  }, [pickerSlotTag, fromKey, refreshDayPlans, onMutated, showToast])

  const handleDeletePlan = useCallback(async (planId: string) => {
    // Optimistic: drop locally, fire DELETE, on failure refetch.
    const prev = dayPlans
    setDayPlans(p => p.filter(x => x._id !== planId))
    try {
      const res = await fetch(`/api/meal-plans/${planId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      if (!res.ok) throw new Error('delete_failed')
      onMutated?.()
    } catch {
      setDayPlans(prev)
      showToast('err', 'Failed to remove plan.')
    }
  }, [dayPlans, onMutated, showToast])

  // ── Slot grid for "By day" ───────────────────────────────────────────────
  const slotTags = useMemo(() => buildSlotTags(availableTags), [availableTags])

  const plansBySlot = useMemo(() => {
    const map = new Map<string, MealPlan[]>()
    for (const p of dayPlans) {
      const key = p.tag.toLowerCase()
      const arr = map.get(key) ?? []
      arr.push(p)
      map.set(key, arr)
    }
    return map
  }, [dayPlans])

  // ── Render ───────────────────────────────────────────────────────────────
  const todayKey = useMemo(() => todayLocalKey(), [])
  // Drawer accepts today as valid for the "from" date (lets the user schedule
  // for today + tomorrow as a range) — past dates are blocked.

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
            className="relative flex h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-900 sm:h-[82vh] sm:max-h-[720px] sm:max-w-2xl sm:rounded-2xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            role="dialog"
            aria-modal="true"
            aria-label="Schedule meals"
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-5 sm:py-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-300" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white sm:text-lg">Schedule meals</h2>
                <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400 sm:text-xs">
                  {rangeMode
                    ? `${formatDatePillLabel(fromKey)} → ${formatDatePillLabel(toKey)}`
                    : formatDatePillLabel(fromKey)}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Date + range toggle */}
            <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {rangeMode ? 'From' : 'For'}
                </span>
                <button
                  type="button"
                  onClick={() => { setFromOpen(o => !o); setToOpen(false) }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60"
                  aria-expanded={fromOpen}
                >
                  <CalendarDays className="h-3 w-3" />
                  <span className="tabular-nums">{formatDatePillLabel(fromKey)}</span>
                </button>
                {rangeMode && (
                  <>
                    <span className="text-zinc-300 dark:text-zinc-600">→</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      To
                    </span>
                    <button
                      type="button"
                      onClick={() => { setToOpen(o => !o); setFromOpen(false) }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60"
                      aria-expanded={toOpen}
                    >
                      <CalendarDays className="h-3 w-3" />
                      <span className="tabular-nums">{formatDatePillLabel(toKey)}</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setRangeMode(r => {
                      const next = !r
                      // When toggling on, default the to-date to from + 6
                      if (next && compareDateKeys(toKey, fromKey) <= 0) {
                        setToKey(addDaysToKey(fromKey, 6))
                      }
                      return next
                    })
                  }}
                  aria-pressed={rangeMode}
                  className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    rangeMode
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                      : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
                  }`}
                >
                  <Repeat className="h-3 w-3" />
                  Range
                </button>
              </div>

              {/* Date disclosures */}
              <AnimatePresence initial={false}>
                {fromOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3">
                      <DateOnlyPicker
                        value={fromKey}
                        minDate={todayKey}
                        onChange={(next) => {
                          if (!next) return
                          setFromKey(next)
                          // Keep `to` >= `from` when in range mode.
                          if (rangeMode && compareDateKeys(toKey, next) < 0) setToKey(next)
                          setFromOpen(false)
                        }}
                      />
                    </div>
                  </motion.div>
                )}
                {toOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3">
                      <DateOnlyPicker
                        value={toKey}
                        minDate={fromKey}
                        onChange={(next) => {
                          if (!next) return
                          setToKey(next)
                          setToOpen(false)
                        }}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Tabs (segmented control) */}
            <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-5">
              <div className="inline-flex w-full rounded-xl border border-zinc-200 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
                {!rangeMode && (
                  <TabButton
                    active={activeTab === 'by-day'}
                    onClick={() => setActiveTab('by-day')}
                    icon={<Utensils className="h-3.5 w-3.5" />}
                    label="By day"
                  />
                )}
                <TabButton
                  active={activeTab === 'from-template'}
                  onClick={() => setActiveTab('from-template')}
                  icon={<ChefHat className="h-3.5 w-3.5" />}
                  label="From template"
                />
                <TabButton
                  active={activeTab === 'copy-day'}
                  onClick={() => setActiveTab('copy-day')}
                  icon={<CopyPlus className="h-3.5 w-3.5" />}
                  label="Copy day"
                />
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {activeTab === 'by-day' && !rangeMode && (
                <ByDayTab
                  dateKey={fromKey}
                  slotTags={slotTags}
                  plansBySlot={plansBySlot}
                  loading={loadingDay}
                  onAddFood={(tag) => setPickerSlotTag(tag)}
                  onApplyMeal={(tag) => setMealApplyTag(tag)}
                  onDeletePlan={handleDeletePlan}
                />
              )}
              {activeTab === 'from-template' && (
                <FromTemplateTab
                  fromKey={fromKey}
                  toKey={rangeMode ? toKey : fromKey}
                  availableTags={availableTags}
                  onApplied={(summary) => {
                    const total = summary.created + summary.merged + summary.replaced
                    showToast('ok', `Applied to ${total} day${total === 1 ? '' : 's'}`)
                    onMutated?.()
                    refreshDayPlans()
                  }}
                />
              )}
              {activeTab === 'copy-day' && (
                <CopyDayTab
                  fromKey={fromKey}
                  toKey={rangeMode ? toKey : fromKey}
                  rangeMode={rangeMode}
                  onApplied={(summary) => {
                    const total = summary.created + summary.merged + summary.replaced
                    showToast('ok', `Copied to ${total} day${total === 1 ? '' : 's'}`)
                    onMutated?.()
                    refreshDayPlans()
                  }}
                />
              )}
            </div>

            {/* Footer "Done" button */}
            <div className="border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 sm:px-5">
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-full items-center justify-center rounded-xl bg-zinc-900 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Done
              </button>
            </div>

            {/* Inline toast */}
            <AnimatePresence>
              {toast && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  className={`pointer-events-none absolute bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-lg ${
                    toast.kind === 'ok' ? 'bg-emerald-600' : 'bg-red-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {toast.kind === 'ok' ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    {toast.msg}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Per-slot food picker — opens above the drawer */}
          <FoodSearchModal
            isOpen={pickerSlotTag !== null}
            currentTag={pickerSlotTag ?? 'snack'}
            availableTags={availableTags}
            showTagPicker={false}
            viewedDate={keyToDate(fromKey)}
            mode="plan"
            onClose={() => setPickerSlotTag(null)}
            onSelectFood={(entry, tag) => handleAddFoodToSlot(entry, tag)}
          />

          {/* Per-slot meal-template applier — choose-meal sub-modal */}
          <MealPickerSubModal
            isOpen={mealApplyTag !== null && mealApplyMeal === null}
            tag={mealApplyTag}
            onClose={() => { setMealApplyTag(null) }}
            onPick={(meal) => setMealApplyMeal(meal)}
          />

          {/* MealApplySheet in plan mode for the chosen meal+tag+date.
              MealLite.totalNutrition is partial — coerce to the full shape
              MealApplySheet expects (calories|protein|carbs|fats default 0). */}
          <MealApplySheet
            isOpen={mealApplyMeal !== null}
            meal={mealApplyMeal ? {
              _id: mealApplyMeal._id,
              name: mealApplyMeal.name,
              imageUrl: mealApplyMeal.imageUrl,
              tags: mealApplyMeal.tags,
              recipe: mealApplyMeal.recipe,
              totalNutrition: mealApplyMeal.totalNutrition ? {
                calories: mealApplyMeal.totalNutrition.calories ?? 0,
                protein: mealApplyMeal.totalNutrition.protein ?? 0,
                carbs: mealApplyMeal.totalNutrition.carbs ?? 0,
                fats: mealApplyMeal.totalNutrition.fats ?? 0,
              } : undefined,
            } : null}
            defaultTag={mealApplyTag ?? 'lunch'}
            availableTags={availableTags}
            viewedDate={keyToDate(fromKey)}
            mode="plan"
            onClose={() => { setMealApplyMeal(null); setMealApplyTag(null) }}
            onApplied={() => {
              refreshDayPlans()
              onMutated?.()
              showToast('ok', `Applied meal to ${titleCaseTag(mealApplyTag ?? 'tag')}`)
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Tab button ────────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-semibold transition-colors sm:text-xs ${
        active
          ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
          : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}

// ── By day tab ────────────────────────────────────────────────────────────────

interface ByDayTabProps {
  dateKey: string
  slotTags: string[]
  plansBySlot: Map<string, MealPlan[]>
  loading: boolean
  onAddFood: (tag: string) => void
  onApplyMeal: (tag: string) => void
  onDeletePlan: (planId: string) => void
}

function ByDayTab({
  dateKey,
  slotTags,
  plansBySlot,
  loading,
  onAddFood,
  onApplyMeal,
  onDeletePlan,
}: ByDayTabProps) {
  // Calorie total across all plans for this day.
  let totalCals = 0
  for (const list of plansBySlot.values()) {
    for (const p of list) {
      totalCals += p.expectedNutrition?.calories ?? 0
    }
  }
  totalCals = Math.round(totalCals)

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50">
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
          Compose meals for <span className="font-semibold text-zinc-900 dark:text-white">{formatDatePillLabel(dateKey)}</span>
        </p>
        {totalCals > 0 && (
          <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
            {totalCals} cal planned
          </span>
        )}
      </div>

      {slotTags.map((tag) => {
        const plans = plansBySlot.get(tag) ?? []
        const cals = Math.round(plans.reduce((s, p) => s + (p.expectedNutrition?.calories ?? 0), 0))
        const visuals = getVisuals(tag)
        const items: { planId: string; name: string; brand?: string; cal: number }[] = []
        for (const p of plans) {
          for (const it of p.items) {
            items.push({
              planId: p._id,
              name: p.mealName ?? it.name,
              brand: it.brand,
              cal: Math.round((it.nutrition?.calories ?? 0) * (it.servings ?? 1)),
            })
          }
        }
        return (
          <div
            key={tag}
            className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center gap-3 px-3 py-2.5">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${visuals.bgColor}`}>
                <visuals.Icon className={`h-4 w-4 ${visuals.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                  {titleCaseTag(tag)}
                </p>
                {plans.length > 0 && (
                  <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                    {plans.length} plan{plans.length === 1 ? '' : 's'}
                    {cals > 0 && (
                      <span className="ml-1 tabular-nums">· {cals} cal</span>
                    )}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onAddFood(tag)}
                aria-label={`Add food to ${titleCaseTag(tag)}`}
                className="flex h-9 min-w-[40px] items-center justify-center gap-1 rounded-lg bg-zinc-900 px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
              <button
                type="button"
                onClick={() => onApplyMeal(tag)}
                aria-label={`Apply meal template to ${titleCaseTag(tag)}`}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                title="Apply meal template"
              >
                <ChefHat className="h-4 w-4" />
              </button>
            </div>

            {items.length > 0 && (
              <ul className="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
                {items.map((it, idx) => (
                  <li
                    key={`${it.planId}-${idx}`}
                    className="flex items-center gap-2 px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-xs font-medium text-zinc-900 dark:text-white">
                        {it.name}
                      </p>
                      {it.brand && (
                        <p className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
                          {it.brand}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                      {it.cal} cal
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeletePlan(it.planId)}
                      aria-label="Remove plan"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── From template tab ────────────────────────────────────────────────────────

interface FromTemplateTabProps {
  fromKey: string
  toKey: string
  availableTags?: { defaults: string[]; userTags: string[] }
  onApplied: (summary: { created: number; merged: number; replaced: number }) => void
}

function FromTemplateTab({ fromKey, toKey, availableTags, onApplied }: FromTemplateTabProps) {
  const [query, setQuery] = useState('')
  const [meals, setMeals] = useState<MealLite[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedMeal, setSelectedMeal] = useState<MealLite | null>(null)
  const [tag, setTag] = useState<string>('lunch')
  const [repeatOpen, setRepeatOpen] = useState(false)
  const [repeatEvery, setRepeatEvery] = useState<'day' | 'week'>('week')
  const [repeatCount, setRepeatCount] = useState<number>(4)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmNeeded, setConfirmNeeded] = useState(false)

  const targetDates = useMemo(() => {
    const out: string[] = []
    let cursor = fromKey
    while (compareDateKeys(cursor, toKey) <= 0) {
      out.push(cursor)
      cursor = addDaysToKey(cursor, 1)
      if (out.length > 60) break // safety cap
    }
    return out
  }, [fromKey, toKey])

  const totalTargets = useMemo(() => {
    const base = targetDates.length
    if (!repeatOpen || repeatCount <= 1) return base
    return base * repeatCount
  }, [targetDates.length, repeatOpen, repeatCount])

  const needsConfirm = totalTargets > 7

  const tagOptions = useMemo<string[]>(() => {
    const defaults = availableTags?.defaults ?? ['breakfast', 'lunch', 'dinner', 'snack', 'pre-workout', 'post-workout']
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

  // Fetch meals (debounced).
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
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
        const list: MealLite[] = Array.isArray(data?.meals) ? data.meals.map((m: MealLite) => ({
          _id: String(m._id),
          name: String(m.name),
          imageUrl: m.imageUrl,
          tags: m.tags,
          totalNutrition: m.totalNutrition,
          recipe: m.recipe,
        })) : []
        setMeals(list)
      } catch {
        if (!cancelled) setMeals([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    const t = setTimeout(run, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query])

  // Default tag to the meal's tag when picking.
  const pickMeal = (m: MealLite) => {
    setSelectedMeal(m)
    if (m.tags && m.tags.length > 0) setTag(String(m.tags[0]).toLowerCase())
  }

  const doSubmit = useCallback(async () => {
    if (!selectedMeal) return
    setSubmitting(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        mealId: selectedMeal._id,
        tag,
        targetDates,
        mode: 'merge',
      }
      if (repeatOpen && repeatCount > 1) {
        body.repeat = { every: repeatEvery, count: repeatCount }
      }
      const res = await fetch('/api/meal-plans/bulk-from-meal', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error || 'Failed to apply meal.')
        setSubmitting(false)
        return
      }
      const data = await res.json()
      onApplied({
        created: data?.created ?? 0,
        merged: data?.merged ?? 0,
        replaced: data?.replaced ?? 0,
      })
      setSubmitting(false)
      setConfirmNeeded(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error.')
      setSubmitting(false)
    }
  }, [selectedMeal, tag, targetDates, repeatOpen, repeatCount, repeatEvery, onApplied])

  const handleSubmit = () => {
    if (needsConfirm && !confirmNeeded) {
      setConfirmNeeded(true)
      return
    }
    doSubmit()
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Apply a saved meal template across {targetDates.length === 1 ? 'this date' : `${targetDates.length} dates`}
        {repeatOpen && repeatCount > 1 ? ` × ${repeatCount} (${totalTargets} plans)` : ''}.
      </p>

      {/* Meal search */}
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

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      ) : meals.length === 0 ? (
        <EmptyState
          icon={<ChefHat className="h-5 w-5" />}
          title="No meals found"
          description="Save a recipe in the Meals section to apply it across days."
        />
      ) : (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto">
          {meals.map(m => {
            const isSelected = selectedMeal?._id === m._id
            return (
              <li key={m._id}>
                <button
                  type="button"
                  onClick={() => pickMeal(m)}
                  aria-pressed={isSelected}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
                      : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800'
                  }`}
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
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Tag picker */}
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Tag
        </p>
        <div className="flex flex-wrap gap-1.5">
          {tagOptions.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(t)}
              aria-pressed={tag === t}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                tag === t
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              {titleCaseTag(t)}
            </button>
          ))}
        </div>
      </div>

      {/* Recurrence */}
      <div>
        {!repeatOpen ? (
          <button
            type="button"
            onClick={() => setRepeatOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
              aria-label="Recurrence interval"
              className="rounded-md border border-blue-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-blue-800 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-blue-900/60 dark:bg-zinc-900 dark:text-blue-200"
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
              {repeatEvery === 'day'
                ? (repeatCount === 1 ? 'day' : 'days')
                : (repeatCount === 1 ? 'week' : 'weeks')}
            </span>
            <button
              type="button"
              onClick={() => { setRepeatOpen(false); setRepeatCount(4) }}
              aria-label="Close recurrence"
              className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full text-blue-700 hover:bg-blue-200/60 dark:text-blue-200 dark:hover:bg-blue-900/40"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {needsConfirm && (
        <div
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${
            confirmNeeded
              ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
              : 'border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50'
          }`}
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            {confirmNeeded
              ? `Tap apply again to plan ${totalTargets} entries.`
              : `That's ${totalTargets} entries. We'll ask once more before submitting.`}
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
        disabled={submitting || !selectedMeal || targetDates.length === 0}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {submitting
          ? 'Applying…'
          : !selectedMeal
            ? 'Pick a meal'
            : needsConfirm && !confirmNeeded
              ? `Apply to ${totalTargets} entries? Tap again`
              : `Apply to ${totalTargets} entr${totalTargets === 1 ? 'y' : 'ies'}`}
      </button>
    </div>
  )
}

// ── Copy day tab ─────────────────────────────────────────────────────────────

interface CopyDayTabProps {
  fromKey: string
  toKey: string
  rangeMode: boolean
  onApplied: (summary: { created: number; merged: number; replaced: number }) => void
}

interface PreviewItem {
  tag: string
  name: string
  cal: number
}

function CopyDayTab({ fromKey, toKey, rangeMode, onApplied }: CopyDayTabProps) {
  const [sourceKey, setSourceKey] = useState<string>(() => addDaysToKey(todayLocalKey(), -1))
  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceType, setSourceType] = useState<'log' | 'plan'>('log')
  const [preview, setPreview] = useState<PreviewItem[]>([])
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmNeeded, setConfirmNeeded] = useState(false)

  // Target dates: a single date (fromKey) when not in range mode, or every date
  // from fromKey..toKey inclusive when in range mode.
  const targetDates = useMemo(() => {
    if (!rangeMode) return [fromKey]
    const out: string[] = []
    let cursor = fromKey
    while (compareDateKeys(cursor, toKey) <= 0) {
      out.push(cursor)
      cursor = addDaysToKey(cursor, 1)
      if (out.length > 60) break
    }
    return out
  }, [rangeMode, fromKey, toKey])

  const needsConfirm = targetDates.length > 7

  // Fetch the source day's content for preview.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoadingPreview(true)
      try {
        if (sourceType === 'log') {
          const res = await fetch(`/api/meal-logs?date=${sourceKey}&tz=${new Date().getTimezoneOffset()}`, { headers: getHeaders() })
          if (!res.ok) {
            if (!cancelled) setPreview([])
            return
          }
          const data = await res.json().catch(() => ({}))
          if (cancelled) return
          const items: PreviewItem[] = []
          for (const log of data?.logs ?? []) {
            const tag = (log.tags?.[0] ?? 'snack') as string
            for (const it of (log.items ?? []) as IMealItem[]) {
              items.push({
                tag,
                name: log.mealName ?? it.name,
                cal: Math.round((it.nutrition?.calories ?? 0) * (it.servings ?? 1)),
              })
            }
          }
          setPreview(items)
        } else {
          const res = await fetch(`/api/meal-plans?from=${sourceKey}&to=${sourceKey}`, { headers: getHeaders() })
          if (!res.ok) {
            if (!cancelled) setPreview([])
            return
          }
          const data = await res.json().catch(() => ({}))
          if (cancelled) return
          const items: PreviewItem[] = []
          for (const p of (data?.plans ?? []) as MealPlan[]) {
            if (p.status !== 'active') continue
            for (const it of p.items) {
              items.push({
                tag: p.tag,
                name: p.mealName ?? it.name,
                cal: Math.round((it.nutrition?.calories ?? 0) * (it.servings ?? 1)),
              })
            }
          }
          setPreview(items)
        }
      } catch {
        if (!cancelled) setPreview([])
      } finally {
        if (!cancelled) setLoadingPreview(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [sourceKey, sourceType])

  const doSubmit = useCallback(async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/meal-plans/bulk-from-day', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          sourceDate: sourceKey,
          sourceType,
          targetDates,
          mode: 'merge',
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error || 'Failed to copy day.')
        setSubmitting(false)
        return
      }
      const data = await res.json()
      onApplied({
        created: data?.created ?? 0,
        merged: data?.merged ?? 0,
        replaced: data?.replaced ?? 0,
      })
      setSubmitting(false)
      setConfirmNeeded(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error.')
      setSubmitting(false)
    }
  }, [sourceKey, sourceType, targetDates, onApplied])

  const handleSubmit = () => {
    if (needsConfirm && !confirmNeeded) {
      setConfirmNeeded(true)
      return
    }
    doSubmit()
  }

  // Group preview by tag for nicer display.
  const byTag = useMemo(() => {
    const map = new Map<string, PreviewItem[]>()
    for (const it of preview) {
      const arr = map.get(it.tag) ?? []
      arr.push(it)
      map.set(it.tag, arr)
    }
    return Array.from(map.entries())
  }, [preview])

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Duplicate a past or current day&apos;s meals onto {targetDates.length === 1 ? 'this date' : `${targetDates.length} target dates`}.
      </p>

      {/* Source date */}
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          From
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSourceOpen(o => !o)}
            className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60"
            aria-expanded={sourceOpen}
          >
            <CalendarDays className="h-3 w-3" />
            <span className="tabular-nums">{formatDatePillLabel(sourceKey)}</span>
          </button>
          <div className="ml-auto inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
            {(['log', 'plan'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setSourceType(t)}
                aria-pressed={sourceType === t}
                className={`rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
                  sourceType === t
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                    : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
              >
                {t === 'log' ? 'What I ate' : 'What I planned'}
              </button>
            ))}
          </div>
        </div>
        <AnimatePresence initial={false}>
          {sourceOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="pt-2">
                <DateOnlyPicker
                  value={sourceKey}
                  maxDate={todayLocalKey()}
                  onChange={(next) => {
                    if (!next) return
                    setSourceKey(next)
                    setSourceOpen(false)
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Preview */}
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Preview
        </p>
        {loadingPreview ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
          </div>
        ) : preview.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-3 text-center text-[11px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            Nothing to copy on this day.
          </p>
        ) : (
          <div className="space-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50/40 p-2 dark:border-zinc-700 dark:bg-zinc-800/30">
            {byTag.map(([tag, items]) => {
              const cals = items.reduce((s, x) => s + x.cal, 0)
              return (
                <div key={tag} className="rounded-md bg-white px-2 py-1.5 dark:bg-zinc-900">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-zinc-900 dark:text-white">
                      {titleCaseTag(tag)}
                    </span>
                    <span className="text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                      {items.length} item{items.length === 1 ? '' : 's'} · {cals} cal
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-zinc-500 dark:text-zinc-400">
                    {items.map(i => i.name).join(', ')}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400">
        Copying to <span className="font-semibold text-zinc-900 dark:text-white">{targetDates.length}</span> target{targetDates.length === 1 ? '' : 's'}.
      </div>

      {needsConfirm && (
        <div
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${
            confirmNeeded
              ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
              : 'border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50'
          }`}
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            {confirmNeeded
              ? `Tap copy again to apply to ${targetDates.length} dates.`
              : `That's ${targetDates.length} dates. We'll ask once more before submitting.`}
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
        disabled={submitting || preview.length === 0 || targetDates.length === 0}
        className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CopyPlus className="h-4 w-4" />}
        {submitting
          ? 'Copying…'
          : preview.length === 0
            ? 'Nothing to copy'
            : needsConfirm && !confirmNeeded
              ? `Copy to ${targetDates.length} dates? Tap again`
              : `Copy to ${targetDates.length} date${targetDates.length === 1 ? '' : 's'}`}
      </button>
    </div>
  )
}

// ── Meal picker sub-modal (Apply meal flow inside By-day) ────────────────────

interface MealPickerSubModalProps {
  isOpen: boolean
  tag: string | null
  onClose: () => void
  onPick: (meal: MealLite) => void
}

function MealPickerSubModal({ isOpen, tag, onClose, onPick }: MealPickerSubModalProps) {
  useLockScroll(isOpen)
  const [query, setQuery] = useState('')
  const [meals, setMeals] = useState<MealLite[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
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
        setMeals(Array.isArray(data?.meals) ? data.meals : [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    const t = setTimeout(run, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [isOpen, query])

  useEffect(() => {
    if (isOpen) setQuery('')
  }, [isOpen])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
          onClick={onClose}
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
            <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <ChefHat className="h-5 w-5 text-orange-500" />
              <h3 className="flex-1 text-sm font-bold text-zinc-900 dark:text-white">
                Apply meal{tag ? ` to ${titleCaseTag(tag)}` : ''}
              </h3>
              <button
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-4 sm:p-5">
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
              {loading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                </div>
              ) : meals.length === 0 ? (
                <p className="py-6 text-center text-sm text-zinc-400">No meals found.</p>
              ) : (
                <ul className="max-h-72 space-y-1.5 overflow-y-auto">
                  {meals.map(m => (
                    <li key={m._id}>
                      <button
                        type="button"
                        onClick={() => onPick(m)}
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Re-export for type imports.
export type { ScheduleMealsDrawerProps }
