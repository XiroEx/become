"use client"

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, ChevronDown, Tag as TagIcon, Loader2, Apple, Repeat, CalendarDays } from 'lucide-react'
import { useLockScroll } from '@/lib/useLockScroll'
import { useKeyboardInset } from '@/lib/useKeyboardInset'
import QuantityPicker, {
  type QuantityPickerSelection,
  type QuantityPickerVariant,
} from '@/components/nutrition/QuantityPicker'
import DateOnlyPicker, { formatDatePillLabel } from '@/components/ui/DateOnlyPicker'
import { combineDateWithNowTime } from '@/lib/mealPlanDates'
import type { ServingUnit } from '@/models/Food'
import { prettifyUnitCodes } from '@/lib/units'

// `servingUnit` is loosened to `string` here because callers (saved foods
// page, meals page) hand us responses where the field is typed as `string`.
// The QuantityPicker re-narrows internally.
interface FoodLogSheetVariant {
  _id?: string
  name: string
  isDefault?: boolean
  servingSize: number
  servingUnit: string
  displayLabel?: string
  alternateServings?: { label: string; multiplier: number }[]
  nutrition: {
    calories: number
    protein: number
    carbs: number
    fats: number
    fiber?: number
    sugar?: number
    sodium?: number
    saturatedFat?: number
  }
  gramsPerServing?: number
  mlPerServing?: number
}

interface FoodLogSheetFood {
  _id: string
  name: string
  brand?: string
  imageUrl?: string
  servingSize: number
  servingUnit: string
  displayLabel?: string
  alternateServings?: { label: string; multiplier: number }[]
  nutrition: {
    calories: number
    protein: number
    carbs: number
    fats: number
    fiber?: number
    sugar?: number
    sodium?: number
    saturatedFat?: number
  }
  gramsPerServing?: number
  mlPerServing?: number
  variants?: FoodLogSheetVariant[]
}

interface Props {
  isOpen: boolean
  food: FoodLogSheetFood | null
  defaultTag: string
  availableTags?: { defaults: string[]; userTags: string[] }
  viewedDate?: Date
  // 'log' (default) — normal log flow: POST /api/meal-logs with loggedAt.
  // 'plan' — plan-create flow: POST /api/meal-plans with plannedDate from
  // `viewedDate` (required in plan mode). The time picker is hidden.
  mode?: 'log' | 'plan'
  onClose: () => void
  onLogged?: (foodId: string) => void
  // Plan-mode success callback: fires after POST /api/meal-plans. Receives
  // the API response shape ({ plan, merged?, replaced? }) so the caller can
  // surface the right toast.
  onPlanned?: (resp: { plan: unknown; merged?: boolean; replaced?: boolean }) => void
}

function titleCaseTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-')
}

// Format a Date as a local YYYY-MM-DD key — used to seed the DateOnlyPicker
// from `viewedDate` and to compare against "today".
function dateToKey(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

/**
 * Resolve the food's primary variant for the picker. Mirrors the projection
 * pattern used in FoodSearchModal (default variant when present, otherwise the
 * flat top-level fields synthesized into a single-variant view).
 */
function pickVariant(food: FoodLogSheetFood): QuantityPickerVariant {
  if (food.variants && food.variants.length > 0) {
    const v = food.variants.find(x => x.isDefault) ?? food.variants[0]
    return {
      servingSize: v.servingSize,
      servingUnit: v.servingUnit as ServingUnit,
      displayLabel: v.displayLabel,
      alternateServings: v.alternateServings ?? [],
      nutrition: v.nutrition,
      gramsPerServing: v.gramsPerServing,
      mlPerServing: v.mlPerServing,
    }
  }
  return {
    servingSize: food.servingSize,
    servingUnit: food.servingUnit as ServingUnit,
    displayLabel: food.displayLabel,
    alternateServings: food.alternateServings ?? [],
    nutrition: food.nutrition,
    gramsPerServing: food.gramsPerServing,
    mlPerServing: food.mlPerServing,
  }
}

export default function FoodLogSheet({
  isOpen,
  food,
  defaultTag,
  availableTags,
  viewedDate,
  mode = 'log',
  onClose,
  onLogged,
  onPlanned,
}: Props) {
  const isPlanMode = mode === 'plan'
  const [activeTag, setActiveTag] = useState<string>(defaultTag)
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const [customTagInput, setCustomTagInput] = useState('')
  const [selection, setSelection] = useState<QuantityPickerSelection | null>(null)
  // User-picked log date as YYYY-MM-DD — null = "Now". No time component;
  // submission grafts the current wall-clock time onto the picked date via
  // combineDateWithNowTime().
  const [customDate, setCustomDate] = useState<string | null>(null)
  const [dateEditOpen, setDateEditOpen] = useState(false)
  const [logging, setLogging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Recurrence (plan mode only). See plan §7.
  const [repeatOpen, setRepeatOpen] = useState(false)
  const [repeatEvery, setRepeatEvery] = useState<'day' | 'week'>('week')
  const [repeatCount, setRepeatCount] = useState<number>(6)

  useLockScroll(isOpen)

  // Lift the bottom-anchored sheet above the software keyboard so the Log button
  // isn't hidden behind the keypad when editing the amount (see useKeyboardInset).
  const keyboardInset = useKeyboardInset(isOpen)

  useEffect(() => {
    if (isOpen) {
      setActiveTag(defaultTag)
      setSelection(null)
      setCustomDate(null)
      setDateEditOpen(false)
      setError(null)
      setTagDropdownOpen(false)
      setCustomTagInput('')
      setRepeatOpen(false)
      setRepeatCount(6)
      setRepeatEvery('week')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, food?._id])

  const variant = useMemo(() => (food ? pickVariant(food) : null), [food])

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

  const previewNutrition = selection?.nutrition

  const handleAddCustomTag = () => {
    const norm = customTagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!norm) return
    setActiveTag(norm)
    setCustomTagInput('')
    setTagDropdownOpen(false)
  }

  const handleLog = async () => {
    if (!food || !variant || !selection || logging) return
    if (!Number.isFinite(selection.quantity) || selection.quantity <= 0) {
      setError('Pick a valid amount.')
      return
    }
    setLogging(true)
    setError(null)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const variantSrc = food.variants?.find(v => v.isDefault) || food.variants?.[0]
      // Match the FoodSearchModal log shape: per-serving nutrition + the
      // multiplier as `servings`, plus the new logged{Quantity,Unit,...} fields.
      const item = {
        foodId: food._id,
        variantId: variantSrc?._id,
        variantName: variantSrc?.name,
        name: food.name,
        brand: food.brand,
        servingSize: variant.servingSize,
        servingUnit: variant.servingUnit,
        servings: selection.multiplier,
        nutrition: {
          calories: variant.nutrition.calories,
          protein: variant.nutrition.protein,
          carbs: variant.nutrition.carbs,
          fats: variant.nutrition.fats,
          fiber: variant.nutrition.fiber,
          sugar: variant.nutrition.sugar,
          sodium: variant.nutrition.sodium,
          saturatedFat: variant.nutrition.saturatedFat,
        },
        loggedQuantity: selection.quantity,
        loggedUnit: selection.unit,
        loggedGramsPerServing: variant.gramsPerServing,
        loggedMlPerServing: variant.mlPerServing,
      }

      if (isPlanMode) {
        // Plan mode — POST /api/meal-plans. `plannedDate` is the YYYY-MM-DD
        // of `viewedDate` (required in plan mode). Default `mode: 'merge'`
        // so a same-(date, tag) plan accumulates items rather than 409-ing.
        const planDateBasis = viewedDate ?? new Date()
        const plannedDate = `${planDateBasis.getFullYear()}-${String(planDateBasis.getMonth() + 1).padStart(2, '0')}-${String(planDateBasis.getDate()).padStart(2, '0')}`
        const body: Record<string, unknown> = {
          plannedDate,
          tag: activeTag,
          items: [item],
        }
        if (repeatOpen && repeatCount > 1) {
          body.repeat = { every: repeatEvery, count: repeatCount }
        }
        const res = await fetch('/api/meal-plans', {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        })
        if (res.ok) {
          const data = await res.json().catch(() => ({}))
          onPlanned?.({ plan: data?.plan, merged: !!data?.merged, replaced: !!data?.replaced })
          setTimeout(() => onClose(), 250)
        } else {
          const data = await res.json().catch(() => ({}))
          setError(data?.error || 'Failed to plan food.')
        }
      } else {
        // No time picker — when the user picks a date, project to that day
        // with the current wall-clock time; otherwise stamp "now" as today.
        const loggedAt = customDate
          ? combineDateWithNowTime(customDate)
          : new Date().toISOString()

        const res = await fetch('/api/meal-logs', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            items: [item],
            tags: [activeTag],
            loggedAt,
          }),
        })
        if (res.ok) {
          onLogged?.(food._id)
          setTimeout(() => onClose(), 250)
        } else {
          const data = await res.json().catch(() => ({}))
          setError(data?.error || 'Failed to log food.')
        }
      }
    } catch {
      setError('Network error.')
    } finally {
      setLogging(false)
    }
  }

  const servingLabel = prettifyUnitCodes(food?.displayLabel || `${food?.servingSize}${food?.servingUnit}`)

  return (
    <AnimatePresence>
      {isOpen && food && variant && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 transition-[padding] duration-150 ease-out sm:items-center sm:p-4"
          style={{ paddingBottom: keyboardInset || undefined }}
          onClick={() => !logging && onClose()}
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
                {food.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={food.imageUrl} alt={food.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-400 dark:text-zinc-600">
                    <Apple className="h-5 w-5" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-bold text-zinc-900 dark:text-white">
                  {food.name}
                </h3>
                <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                  {food.brand ? `${food.brand} · ${servingLabel}` : servingLabel}
                </p>
              </div>
              <button
                onClick={onClose}
                disabled={logging}
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

              {/* Quantity picker */}
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Amount
                </p>
                <QuantityPicker variant={variant} onChange={setSelection} />
              </div>

              {/* Recurrence disclosure — plan mode only. Expand-on-create per plan §7. */}
              {isPlanMode && (
                <div>
                  {!repeatOpen ? (
                    <button
                      type="button"
                      onClick={() => setRepeatOpen(true)}
                      className="inline-flex w-fit items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      aria-label="Repeat this plan"
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
                        aria-label="Number of occurrences"
                      />
                      <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                        {repeatEvery === 'day'
                          ? (repeatCount === 1 ? 'day' : 'days')
                          : (repeatCount === 1 ? 'week' : 'weeks')}
                      </span>
                      <button
                        type="button"
                        onClick={() => { setRepeatOpen(false); setRepeatCount(6) }}
                        className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full text-blue-700 hover:bg-blue-200/60 dark:text-blue-200 dark:hover:bg-blue-900/40"
                        aria-label="Close recurrence"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}

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
                          : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
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
                          onClear={() => { setCustomDate(null); setDateEditOpen(false) }}
                          onChange={(next) => {
                            const todayKey = dateToKey(new Date())
                            setCustomDate(next === todayKey ? null : next)
                            setDateEditOpen(false)
                          }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Macro preview */}
              <div className="grid grid-cols-4 gap-2 rounded-lg bg-zinc-50 p-2.5 text-center dark:bg-zinc-800/50">
                <div>
                  <p className="text-base font-bold text-zinc-900 dark:text-white">
                    {Math.round(previewNutrition?.calories ?? 0)}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Cal</p>
                </div>
                <div>
                  <p className="text-base font-bold text-blue-600 dark:text-blue-400">
                    {Math.round((previewNutrition?.protein ?? 0) * 10) / 10}g
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Protein</p>
                </div>
                <div>
                  <p className="text-base font-bold text-green-600 dark:text-green-400">
                    {Math.round((previewNutrition?.carbs ?? 0) * 10) / 10}g
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Carbs</p>
                </div>
                <div>
                  <p className="text-base font-bold text-amber-600 dark:text-amber-400">
                    {Math.round((previewNutrition?.fats ?? 0) * 10) / 10}g
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Fats</p>
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleLog}
                disabled={logging || !selection || selection.quantity <= 0}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {logging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {logging ? (isPlanMode ? 'Planning…' : 'Logging…') : (isPlanMode ? 'Plan for day' : 'Log to day')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
