"use client"

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sun,
  Sunrise,
  Moon,
  Cookie,
  Sandwich,
  Utensils,
  Dumbbell,
  Flame,
  Tag as TagIcon,
  Plus,
  ChevronDown,
  X,
  MoreVertical,
  CalendarDays,
  ChefHat,
  Camera,
  ScanBarcode,
  Upload,
  PencilLine,
  Trash2,
  Check,
} from 'lucide-react'
import type { IMealItem } from '@/models/Meal'
import { Card } from '@/components/ui'
import { formatQuantity, type Unit } from '@/lib/units'
import type { MealPlan } from '@/app/dashboard/timeline/planning'
import FoodItemRow from '@/components/nutrition/FoodItemRow'
import { formatClockLabel } from '@/lib/nutrition/mealSchedule'

/** The hard-metric amount line for a logged/planned item — the user's actual
 *  logged quantity+unit when present, else the legacy "X servings · size unit". */
function hardAmountOf(item: IMealItem): string {
  const s = item.servings ?? 1
  return item.loggedQuantity != null && item.loggedUnit
    ? formatQuantity(item.loggedQuantity, item.loggedUnit as Unit)
    : `${s !== 1 ? `${s} servings` : '1 serving'} · ${item.servingSize} ${item.servingUnit}`
}
function scaledMacrosOf(item: IMealItem) {
  const s = item.servings ?? 1
  return {
    protein: (item.nutrition.protein ?? 0) * s,
    carbs: (item.nutrition.carbs ?? 0) * s,
    fats: (item.nutrition.fats ?? 0) * s,
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MealLogLite {
  _id: string
  loggedAt: string
  items: (IMealItem & { _id?: string })[]
  tags: string[]
  totalNutrition?: { calories: number; protein: number; carbs: number; fats: number }
  mealId?: string
  mealName?: string
  source?: 'photo' | 'barcode' | 'upload' | 'describe' | 'search' | 'manual'
  notes?: string
  /** Logged for the day with no time. Placed by tag anchor, not by the clock. */
  untimed?: boolean
}

interface FlattenedItem {
  logId: string
  loggedAt: string
  untimed?: boolean
  mealName?: string
  source?: MealLogLite['source']
  item: IMealItem & { _id?: string }
}

interface TagSectionProps {
  tag: string
  logs: MealLogLite[]
  onAddFood: (tag: string) => void
  // Append a food into a specific logged meal group (keeps it under the meal's
  // outline). When omitted, meal groups show no add-to affordance.
  onAddToMeal?: (logId: string, tag: string) => void
  onEditEntry: (
    logId: string,
    item: IMealItem & { _id?: string },
    currentTag: string,
    loggedAt: string,
    untimed?: boolean,
  ) => void
  onRemoveEntry: (logId: string, itemId: string) => void
  onRemoveTag?: (tag: string) => void
  removable?: boolean
  // Plan affordances (Plan §6.1). When provided, the header gets a kebab
  // menu with "Plan…" (opens the food picker in plan mode for a future date)
  // and "Apply meal…" (opens the meal picker in plan mode).
  onPlan?: (tag: string) => void
  onApplyMeal?: (tag: string) => void
  // True when the parent page is viewing a future calendar day. Adjusts
  // the "+" button aria-label so screen readers announce "Schedule food"
  // instead of "Add food" — the underlying handler already routes through
  // plan mode in this case.
  futureDate?: boolean
  // Plan rendering — when the parent is viewing a future date, it passes the
  // MealPlan entries that target this tag. Each renders as a row prefixed
  // with a "Planned" pill. Optional handlers let the parent delete a plan or
  // edit a plan item without re-implementing modal plumbing here.
  plans?: MealPlan[]
  /** Minutes from local midnight of this SITTING's first log. Rendered next to
   *  the tag name so two sections of the same tag are tellable apart — without
   *  it, two "Snack" headers on one day look like a duplicate render rather than
   *  two separate sittings. Undefined for planned or empty sections, which have
   *  no real moment of their own. */
  occurrenceAt?: number
  /** This sitting was logged for the day with no time. */
  untimed?: boolean
  onRemovePlan?: (planId: string) => void
  onEditPlanItem?: (planId: string, item: IMealItem & { _id?: string }, planItems: (IMealItem & { _id?: string })[]) => void
  /** "Log it" — promote a plan into a real log (today). When provided, a Log it
   *  button appears in the planned header. */
  onLogPlan?: (planId: string) => void
  /** Combine items already logged in this section into one grouped entry,
   *  optionally keeping it as a reusable meal. When omitted, no select mode. */
  onCombine?: (
    picks: { logId: string; itemId: string }[],
    opts: { mealName?: string; saveAsMeal: boolean },
  ) => Promise<void> | void
  /** Whether this member may keep the result as a reusable meal (plus tier).
   *  Combining the day's rows is not gated; only saving the meal is. */
  canSaveMeals?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// Icon + colour mapping for known/default tags. Falls back to a generic tag.
const tagVisuals: Record<string, { Icon: typeof Sun; iconColor: string; bgColor: string }> = {
  breakfast: {
    Icon: Sunrise,
    iconColor: 'text-amber-500',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
  },
  lunch: {
    Icon: Sandwich,
    iconColor: 'text-orange-500',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  },
  dinner: {
    Icon: Utensils,
    iconColor: 'text-indigo-500',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
  },
  snack: {
    Icon: Cookie,
    iconColor: 'text-emerald-500',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
  },
  'pre-workout': {
    Icon: Dumbbell,
    iconColor: 'text-purple-500',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
  },
  'post-workout': {
    Icon: Flame,
    iconColor: 'text-rose-500',
    bgColor: 'bg-rose-100 dark:bg-rose-900/30',
  },
  brunch: {
    Icon: Sun,
    iconColor: 'text-yellow-500',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
  },
  dessert: {
    Icon: Cookie,
    iconColor: 'text-pink-500',
    bgColor: 'bg-pink-100 dark:bg-pink-900/30',
  },
  'late-night': {
    Icon: Moon,
    iconColor: 'text-slate-500',
    bgColor: 'bg-slate-100 dark:bg-slate-800/60',
  },
}

function getVisuals(tag: string) {
  return (
    tagVisuals[tag.toLowerCase()] ?? {
      Icon: TagIcon,
      iconColor: 'text-zinc-500',
      bgColor: 'bg-zinc-100 dark:bg-zinc-800',
    }
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TagSection({
  tag,
  logs,
  onAddFood,
  onAddToMeal,
  onEditEntry,
  onRemoveEntry,
  onRemoveTag,
  removable = false,
  onPlan,
  onApplyMeal,
  futureDate = false,
  plans = [],
  occurrenceAt,
  untimed = false,
  onRemovePlan,
  onEditPlanItem,
  onLogPlan,
  onCombine,
  canSaveMeals = false,
}: TagSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [kebabOpen, setKebabOpen] = useState(false)
  // Select mode: pick logged rows, then fold them into one entry.
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [combineName, setCombineName] = useState('')
  const [saveAsMeal, setSaveAsMeal] = useState(true)
  const [combining, setCombining] = useState(false)
  const visuals = getVisuals(tag)
  const label = titleCaseTag(tag)

  // Flatten items across all logs that carry this tag.
  const flat: FlattenedItem[] = []
  for (const log of logs) {
    for (const item of log.items) {
      flat.push({
        logId: log._id,
        loggedAt: log.loggedAt,
        untimed: log.untimed,
        mealName: log.mealName,
        source: log.source,
        item,
      })
    }
  }

  let totalCalories = 0
  let totalProtein = 0
  let totalCarbs = 0
  let totalFats = 0
  for (const { item } of flat) {
    const s = item.servings ?? 1
    totalCalories += (item.nutrition.calories ?? 0) * s
    totalProtein += (item.nutrition.protein ?? 0) * s
    totalCarbs += (item.nutrition.carbs ?? 0) * s
    totalFats += (item.nutrition.fats ?? 0) * s
  }
  // Add planned totals to the section totals so the header chip + footer
  // reflect everything the user will eat that day.
  let plannedCalories = 0
  for (const p of plans) {
    if (p.status !== 'active') continue
    plannedCalories += p.expectedNutrition?.calories ?? 0
    for (const item of p.items) {
      const s = item.servings ?? 1
      totalProtein += (item.nutrition?.protein ?? 0) * s
      totalCarbs += (item.nutrition?.carbs ?? 0) * s
      totalFats += (item.nutrition?.fats ?? 0) * s
    }
  }
  totalCalories = Math.round(totalCalories + plannedCalories)
  totalProtein = Math.round(totalProtein)
  totalCarbs = Math.round(totalCarbs)
  totalFats = Math.round(totalFats)
  const hasContent = flat.length > 0 || plans.length > 0

  // Group flattened items by mealName so meal-template logs render as a
  // mini-block with a "From: …" header.
  type Group = { key: string; mealName?: string; source?: MealLogLite['source']; items: FlattenedItem[] }
  const groups: Group[] = []
  let lastKey = ''
  for (const fi of flat) {
    const key = fi.mealName ? `meal:${fi.logId}` : `loose:${fi.logId}`
    if (key !== lastKey) {
      groups.push({ key, mealName: fi.mealName, source: fi.source, items: [] })
      lastKey = key
    }
    groups[groups.length - 1].items.push(fi)
  }

  // ── Select mode ────────────────────────────────────────────────────────────
  const keyOf = (logId: string, itemId: unknown) => `${logId}:${String(itemId)}`
  const selectableItems = flat.filter(fi => fi.item._id)
  const canCombine = Boolean(onCombine) && selectableItems.length >= 2

  const toggleSelected = (k: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const exitSelect = () => {
    setSelecting(false)
    setSelected(new Set())
    setCombineName('')
    setSaveAsMeal(true)
  }

  const pickedItems = selectableItems.filter(fi => selected.has(keyOf(fi.logId, fi.item._id)))

  const pickedTotals = pickedItems.reduce(
    (acc, fi) => {
      const n = fi.item.nutrition
      const q = fi.item.servings ?? 1
      acc.calories += (n.calories ?? 0) * q
      acc.protein += (n.protein ?? 0) * q
      acc.carbs += (n.carbs ?? 0) * q
      acc.fats += (n.fats ?? 0) * q
      return acc
    },
    { calories: 0, protein: 0, carbs: 0, fats: 0 },
  )

  // Same shape as the search sheet's basket name, so a meal built either way
  // reads the same in the list.
  const defaultCombineName =
    pickedItems.length === 0
      ? ''
      : pickedItems.length <= 3
        ? pickedItems.map(fi => fi.item.name).join(' + ')
        : `${pickedItems[0].item.name} + ${pickedItems[1].item.name} +${pickedItems.length - 2} more`

  const handleCombine = async () => {
    if (!onCombine || pickedItems.length < 2 || combining) return
    setCombining(true)
    try {
      await onCombine(
        pickedItems.map(fi => ({ logId: fi.logId, itemId: String(fi.item._id) })),
        {
          mealName:
            canSaveMeals && saveAsMeal
              ? (combineName.trim() || defaultCombineName || 'Meal')
              : (combineName.trim() || undefined),
          saveAsMeal: canSaveMeals && saveAsMeal,
        },
      )
      exitSelect()
    } finally {
      setCombining(false)
    }
  }

  return (
    <Card className="!p-0">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex w-full items-center gap-3 p-3 sm:p-4"
      >
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${visuals.bgColor}`}>
          <visuals.Icon className={`h-4 w-4 ${visuals.iconColor}`} />
        </div>

        <div className="flex flex-1 items-center justify-between min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
              {label}
            </span>
            {occurrenceAt != null && (
              <span className="shrink-0 text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
                {formatClockLabel(occurrenceAt)}
              </span>
            )}
            {untimed && (
              <span
                title="Logged for the day, no time set"
                className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500"
              >
                no time
              </span>
            )}
            {hasContent && (
              <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">
                {totalCalories} cal
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {removable && flat.length === 0 && onRemoveTag && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveTag(tag)
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                aria-label={`Remove ${label} section`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onAddFood(tag)
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              aria-label={futureDate ? `Schedule food for ${label}` : `Add food to ${label}`}
            >
              <Plus className="h-4 w-4" />
            </button>
            {(onPlan || onApplyMeal) && (
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setKebabOpen(o => !o)
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  aria-label={`More actions for ${label}`}
                  aria-expanded={kebabOpen}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                <AnimatePresence>
                  {kebabOpen && (
                    <>
                      {/* Dismiss overlay */}
                      <div
                        className="fixed inset-0 z-30"
                        onClick={(e) => { e.stopPropagation(); setKebabOpen(false) }}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-8 z-40 min-w-[160px] rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {onPlan && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setKebabOpen(false); onPlan(tag) }}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            <CalendarDays className="h-3.5 w-3.5 text-blue-500" />
                            Plan for a future day…
                          </button>
                        )}
                        {onApplyMeal && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setKebabOpen(false); onApplyMeal(tag) }}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            <ChefHat className="h-3.5 w-3.5 text-orange-500" />
                            Apply a saved meal…
                          </button>
                        )}
                        {canCombine && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setKebabOpen(false)
                              setIsCollapsed(false)
                              setSelecting(true)
                            }}
                            data-testid={`combine-start-${tag}`}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            <ChefHat className="h-3.5 w-3.5 text-emerald-500" />
                            Combine into a meal…
                          </button>
                        )}
                        {/* Delete everything logged in this section. Only shown
                            when there are actual logged entries (not plans). */}
                        {flat.length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setKebabOpen(false)
                              const entries = flat.filter(fi => fi.item._id)
                              if (entries.length === 0) return
                              const ok = typeof window === 'undefined' || window.confirm(
                                entries.length === 1
                                  ? `Delete the logged entry in ${label}?`
                                  : `Delete all ${entries.length} logged entries in ${label}?`,
                              )
                              if (!ok) return
                              for (const fi of entries) {
                                onRemoveEntry(fi.logId, String(fi.item._id))
                              }
                            }}
                            className="mt-0.5 flex w-full items-center gap-2 rounded border-t border-zinc-100 px-2 py-1.5 text-left text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-zinc-800 dark:text-red-400 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {flat.length === 1 ? 'Delete logged entry' : 'Delete logged entries'}
                          </button>
                        )}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )}
            <ChevronDown
              className={`h-4 w-4 text-zinc-400 transition-transform ${
                isCollapsed ? '-rotate-90' : ''
              }`}
            />
          </div>
        </div>
      </button>

      {/* Select-mode banner + action bar. Sits above the rows so the running
          count stays visible while scrolling a long section. */}
      {selecting && (
        <div
          data-testid={`combine-bar-${tag}`}
          className="border-y border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900/40 dark:bg-emerald-900/20"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">
              {pickedItems.length === 0
                ? 'Tap items to combine'
                : `${pickedItems.length} selected`}
              {pickedItems.length > 0 && (
                <span className="ml-2 font-normal tabular-nums text-emerald-700 dark:text-emerald-300">
                  {Math.round(pickedTotals.calories)} cal &middot; {Math.round(pickedTotals.protein)}p{' '}
                  {Math.round(pickedTotals.carbs)}c {Math.round(pickedTotals.fats)}f
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={exitSelect}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
            >
              Cancel
            </button>
          </div>

          {pickedItems.length >= 2 && (
            <>
              {canSaveMeals && (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSaveAsMeal(v => !v)}
                    aria-pressed={saveAsMeal}
                    aria-label="Also save as a reusable meal"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      saveAsMeal
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-emerald-300 dark:border-emerald-700'
                    }`}
                  >
                    {saveAsMeal && <Check className="h-3 w-3" />}
                  </button>
                  <input
                    value={combineName}
                    onChange={e => setCombineName(e.target.value)}
                    placeholder={defaultCombineName}
                    data-testid={`combine-name-${tag}`}
                    aria-label="Meal name"
                    className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 placeholder-zinc-400 dark:border-emerald-900/40 dark:bg-zinc-800 dark:text-white"
                  />
                </div>
              )}
              <button
                type="button"
                onClick={handleCombine}
                disabled={combining}
                data-testid={`combine-submit-${tag}`}
                className="mt-2 w-full rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                {canSaveMeals && saveAsMeal
                  ? `Combine ${pickedItems.length} and save as meal`
                  : `Combine ${pickedItems.length} into one entry`}
              </button>
            </>
          )}
        </div>
      )}

      {/* Items */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-200 dark:border-zinc-800">
              {!hasContent ? (
                <button
                  onClick={() => onAddFood(tag)}
                  className="flex w-full items-center justify-center gap-1.5 px-3 py-5 text-sm text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tap + to {futureDate ? 'schedule food' : 'add food'}
                </button>
              ) : (
                <>
                  {groups.map((group) => (
                    group.mealName ? (
                      // Meal group — collapsed by default into a single row (meal
                      // name + total cal); tap to drop down the ingredients. Keeps
                      // multiple meals in a tag from becoming a long flat list.
                      <MealGroupCard
                        key={group.key}
                        group={group}
                        tag={tag}
                        onEditEntry={onEditEntry}
                        onRemoveEntry={onRemoveEntry}
                        onAddToMeal={onAddToMeal}
                        selecting={selecting}
                        isSelected={(logId, itemId) => selected.has(keyOf(logId, itemId))}
                        onToggleSelect={(logId, itemId) => toggleSelected(keyOf(logId, itemId))}
                      />
                    ) : group.source && group.source !== 'manual' && group.source !== 'search' && group.items.length > 1 ? (
                      // Multi-food capture that isn't a saved meal — group it under
                      // a source-colored card (camera / barcode / upload / describe).
                      <CaptureGroupCard
                        key={group.key}
                        tag={tag}
                        source={group.source as 'photo' | 'barcode' | 'upload' | 'describe'}
                        items={group.items}
                        onEditEntry={onEditEntry}
                        onRemoveEntry={onRemoveEntry}
                      />
                    ) : (
                      <div key={group.key}>
                        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                          {group.items.map((fi) => (
                            <ItemRow
                              key={`${fi.logId}-${fi.item._id ?? Math.random()}`}
                              logId={fi.logId}
                              item={fi.item}
                              selectable={selecting && Boolean(fi.item._id)}
                              selected={selected.has(keyOf(fi.logId, fi.item._id))}
                              onToggleSelect={() => toggleSelected(keyOf(fi.logId, fi.item._id))}
                              onEdit={() => onEditEntry(fi.logId, fi.item, tag, fi.loggedAt, fi.untimed)}
                              onDelete={() => fi.item._id && onRemoveEntry(fi.logId, String(fi.item._id))}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  ))}

                  {/* Planned block.
                      A plan made FROM A MEAL keeps its shape here: it renders as
                      one collapsed card (meal name + total), matching how a
                      logged meal renders above, instead of spilling its
                      ingredients into the tag as loose rows. Planning a 3-item
                      meal used to produce 3 unrelated "Planned" rows with the
                      meal names collapsed into a comma list in this header, so
                      nothing tied an item to the meal it came from.
                      Plans without a mealName are genuinely loose items and
                      still render as individual rows. */}
                  {plans.length > 0 && (
                    <div className={flat.length > 0 ? 'border-t border-zinc-200 dark:border-zinc-800' : ''}>
                      <div className="flex items-center gap-1.5 bg-blue-50/60 px-3 py-1.5 dark:bg-blue-900/10">
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          Planned
                        </span>
                        {/* Only offer a blanket "log everything" when it would do
                            something a single meal card's own button cannot. */}
                        {onLogPlan && (plans.length > 1 || plans.some(p => !p.mealName)) && (
                          <button
                            onClick={() => plans.forEach(p => onLogPlan(p._id))}
                            className="ml-auto inline-flex shrink-0 items-center rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-semibold text-white transition-colors hover:bg-blue-700"
                          >
                            {plans.length > 1 ? 'Log all' : 'Log it'}
                          </button>
                        )}
                      </div>
                      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {plans.map((plan) => (
                          plan.mealName ? (
                            <PlannedMealCard
                              key={plan._id}
                              plan={plan}
                              onLog={onLogPlan ? () => onLogPlan(plan._id) : undefined}
                              onRemove={onRemovePlan ? () => onRemovePlan(plan._id) : undefined}
                              onEditItem={onEditPlanItem
                                ? (item) => onEditPlanItem(plan._id, item, plan.items)
                                : undefined}
                            />
                          ) : (
                            plan.items.map((item) => (
                              <PlanItemRow
                                key={`${plan._id}-${item._id ?? Math.random()}`}
                                planId={plan._id}
                                item={item}
                                onEdit={onEditPlanItem ? () => onEditPlanItem(plan._id, item, plan.items) : undefined}
                                onDelete={onRemovePlan ? () => onRemovePlan(plan._id) : undefined}
                              />
                            ))
                          )
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tag totals */}
                  <div className="border-t border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
                    <div className="flex items-center justify-between text-xs tabular-nums">
                      <div className="flex gap-3 text-zinc-500 dark:text-zinc-400">
                        <span>P: {totalProtein}g</span>
                        <span>C: {totalCarbs}g</span>
                        <span>F: {totalFats}g</span>
                      </div>
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                        {totalCalories} cal
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

// ── Meal group — foods logged together from a saved Meal, collapsed into a
// single row (meal name + total cal) that drops down to the ingredients. Keeps
// several meals in one tag from becoming a long flat list. ───────────────────

interface MealGroupCardProps {
  /** Select mode, threaded down from TagSection so items inside a meal group
   *  can be combined alongside loose ones. */
  selecting?: boolean
  isSelected?: (logId: string, itemId: unknown) => boolean
  onToggleSelect?: (logId: string, itemId: unknown) => void
  group: { key: string; mealName?: string; items: FlattenedItem[] }
  tag: string
  onEditEntry: TagSectionProps['onEditEntry']
  onRemoveEntry: (logId: string, itemId: string) => void
  onAddToMeal?: (logId: string, tag: string) => void
}

function MealGroupCard({
  group, tag, onEditEntry, onRemoveEntry, onAddToMeal,
  selecting, isSelected, onToggleSelect,
}: MealGroupCardProps) {
  const [open, setOpen] = useState(false)
  const totalCal = Math.round(group.items.reduce((s, fi) => s + (fi.item.nutrition?.calories ?? 0) * (fi.item.servings ?? 1), 0))
  return (
    <div className="mx-3 my-2 overflow-hidden rounded-xl border border-orange-200 bg-orange-50/40 dark:border-orange-900/40 dark:bg-orange-900/10">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex w-full items-center gap-1.5 px-3 py-2.5 text-left ${open ? 'border-b border-orange-200/70 dark:border-orange-900/40' : ''}`}
      >
        <ChefHat className="h-3.5 w-3.5 shrink-0 text-orange-500" />
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-orange-700/70 dark:text-orange-300/70">Meal</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{group.mealName}</span>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">{totalCal} cal</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-orange-400 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="divide-y divide-orange-100 dark:divide-orange-900/30">
              {group.items.map((fi, idx) => (
                <ItemRow
                  key={`${fi.logId}-${fi.item._id ?? idx}`}
                  logId={fi.logId}
                  item={fi.item}
                  selectable={Boolean(selecting) && Boolean(fi.item._id)}
                  selected={isSelected?.(fi.logId, fi.item._id) ?? false}
                  onToggleSelect={() => onToggleSelect?.(fi.logId, fi.item._id)}
                  onEdit={() => onEditEntry(fi.logId, fi.item, tag, fi.loggedAt, fi.untimed)}
                  onDelete={() => fi.item._id && onRemoveEntry(fi.logId, String(fi.item._id))}
                />
              ))}
            </div>
            {onAddToMeal && group.items[0]?.logId && (
              <button
                onClick={() => onAddToMeal(group.items[0].logId, tag)}
                className="flex w-full items-center justify-center gap-1.5 border-t border-orange-200/70 px-3 py-2 text-[11px] font-semibold text-orange-700/80 transition-colors hover:bg-orange-100/50 dark:border-orange-900/40 dark:text-orange-300/80 dark:hover:bg-orange-900/20"
              >
                <Plus className="h-3 w-3" />
                Add food to this meal
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Planned meal card ────────────────────────────────────────────────────────
//
// The planned twin of MealGroupCard. A plan created from a saved meal is ONE
// plan document carrying mealId + mealName + every item, so the grouping was
// always in the data; the tag section just used to flatten it away and render
// each ingredient as its own "Planned" row.
//
// Deliberately mirrors MealGroupCard's shape (collapsed to name + total, tap to
// expand) so a meal reads the same whether it is planned or already eaten, and
// only the colour changes: blue for planned, orange for logged.
interface PlannedMealCardProps {
  plan: MealPlan
  /** Promote just this meal. Absent on days where logging makes no sense. */
  onLog?: () => void
  onRemove?: () => void
  onEditItem?: (item: IMealItem & { _id?: string }) => void
}

function PlannedMealCard({ plan, onLog, onRemove, onEditItem }: PlannedMealCardProps) {
  const [open, setOpen] = useState(false)
  // expectedNutrition is authoritative (the server computed it when the plan was
  // created); fall back to summing items if an older plan predates it.
  const totalCal = Math.round(
    plan.expectedNutrition?.calories
    ?? plan.items.reduce((s, it) => s + (it.nutrition?.calories ?? 0) * (it.servings ?? 1), 0),
  )
  return (
    <div className="mx-3 my-2 overflow-hidden rounded-xl border border-blue-200 bg-blue-50/40 dark:border-blue-900/40 dark:bg-blue-900/10">
      <div className={`flex items-center gap-1.5 px-3 py-2.5 ${open ? 'border-b border-blue-200/70 dark:border-blue-900/40' : ''}`}>
        <button
          onClick={() => setOpen(o => !o)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          aria-expanded={open}
        >
          <ChefHat className="h-3.5 w-3.5 shrink-0 text-blue-500" />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-blue-700/70 dark:text-blue-300/70">Meal</span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{plan.mealName}</span>
          <span className="shrink-0 text-xs font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">{totalCal} cal</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-blue-400 transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
        {onLog && (
          <button
            onClick={onLog}
            className="inline-flex shrink-0 items-center rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Log it
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="divide-y divide-blue-100 dark:divide-blue-900/30">
              {plan.items.map((item, idx) => (
                <PlanItemRow
                  key={`${plan._id}-${item._id ?? idx}`}
                  planId={plan._id}
                  item={item}
                  hideBadge
                  onEdit={onEditItem ? () => onEditItem(item) : undefined}
                  // Deleting one ingredient of a planned meal deletes the plan,
                  // same as the flat rows did — the plan is the unit.
                  onDelete={onRemove}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Capture group — a multi-food capture (photo / barcode / upload / describe)
// that wasn't saved as a Meal. Groups the foods under a source-colored, bordered
// card with the matching icon + label, so it reads as one capture at a glance. ──
const captureVisuals: Record<'photo' | 'barcode' | 'upload' | 'describe', {
  Icon: typeof Camera; label: string; text: string; border: string; bg: string; divide: string; chevron: string; hover: string
}> = {
  photo:    { Icon: Camera,      label: 'Photo',     text: 'text-emerald-600 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-900/40', bg: 'bg-emerald-50/40 dark:bg-emerald-900/10', divide: 'divide-emerald-100 dark:divide-emerald-900/30', chevron: 'text-emerald-400', hover: 'hover:bg-emerald-100/50 dark:hover:bg-emerald-900/20' },
  upload:   { Icon: Upload,      label: 'Upload',    text: 'text-violet-600 dark:text-violet-300',   border: 'border-violet-200 dark:border-violet-900/40',  bg: 'bg-violet-50/40 dark:bg-violet-900/10',  divide: 'divide-violet-100 dark:divide-violet-900/30',  chevron: 'text-violet-400',  hover: 'hover:bg-violet-100/50 dark:hover:bg-violet-900/20' },
  barcode:  { Icon: ScanBarcode, label: 'Barcode',   text: 'text-blue-600 dark:text-blue-300',       border: 'border-blue-200 dark:border-blue-900/40',      bg: 'bg-blue-50/40 dark:bg-blue-900/10',      divide: 'divide-blue-100 dark:divide-blue-900/30',      chevron: 'text-blue-400',    hover: 'hover:bg-blue-100/50 dark:hover:bg-blue-900/20' },
  describe: { Icon: PencilLine,  label: 'Described',  text: 'text-cyan-600 dark:text-cyan-300',       border: 'border-cyan-200 dark:border-cyan-900/40',      bg: 'bg-cyan-50/40 dark:bg-cyan-900/10',      divide: 'divide-cyan-100 dark:divide-cyan-900/30',      chevron: 'text-cyan-400',    hover: 'hover:bg-cyan-100/50 dark:hover:bg-cyan-900/20' },
}

function CaptureGroupCard({ tag, source, items, onEditEntry, onRemoveEntry }: {
  tag: string
  source: 'photo' | 'barcode' | 'upload' | 'describe'
  items: FlattenedItem[]
  onEditEntry: TagSectionProps['onEditEntry']
  onRemoveEntry: (logId: string, itemId: string) => void
}) {
  const [open, setOpen] = useState(true)
  const v = captureVisuals[source] ?? captureVisuals.photo
  const totalCal = Math.round(items.reduce((s, fi) => s + (fi.item.nutrition?.calories ?? 0) * (fi.item.servings ?? 1), 0))
  return (
    <div className={`mx-3 my-2 overflow-hidden rounded-xl border ${v.border} ${v.bg}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex w-full items-center gap-1.5 px-3 py-2.5 text-left ${open ? `border-b ${v.border}` : ''}`}
      >
        <v.Icon className={`h-3.5 w-3.5 shrink-0 ${v.text}`} />
        <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide ${v.text} opacity-80`}>{v.label}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{items.length} items</span>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">{totalCal} cal</span>
        <ChevronDown className={`h-4 w-4 shrink-0 ${v.chevron} transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className={`divide-y ${v.divide}`}>
              {items.map((fi, idx) => (
                <ItemRow
                  key={`${fi.logId}-${fi.item._id ?? idx}`}
                  logId={fi.logId}
                  item={fi.item}
                  onEdit={() => onEditEntry(fi.logId, fi.item, tag, fi.loggedAt, fi.untimed)}
                  onDelete={() => fi.item._id && onRemoveEntry(fi.logId, String(fi.item._id))}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Plan item row — shown when the page is viewing a future date. Has a
// distinct visual treatment (blue tint background) and a "Planned" microbadge
// next to the food name. Edit/delete handlers are optional — when omitted the
// row is read-only. ────────────────────────────────────────────────────────

interface PlanItemRowProps {
  planId: string
  item: IMealItem & { _id?: string }
  onEdit?: () => void
  onDelete?: () => void
  /** Drop the per-row "Planned" pill. Set inside a PlannedMealCard, where the
   *  card sits under the PLANNED header already and repeating the word on every
   *  ingredient is just noise. */
  hideBadge?: boolean
}

function PlanItemRow({ item, onEdit, onDelete, hideBadge }: PlanItemRowProps) {
  const showVariant = shouldShowVariantName(item.variantName)
  return (
    <div className="bg-blue-50/30 dark:bg-blue-900/5">
      <FoodItemRow
        layout="log"
        name={item.name}
        variantName={showVariant ? item.variantName : undefined}
        brand={item.brand}
        servingLabel={item.servingLabel}
        hardAmount={hardAmountOf(item)}
        badges={hideBadge ? [] : [{ label: 'Planned', tone: 'zinc' }]}
        calories={Math.round((item.nutrition?.calories ?? 0) * (item.servings ?? 1))}
        macros={scaledMacrosOf(item)}
        onEdit={onEdit}
        onRemove={onDelete}
      />
    </div>
  )
}

// ── Internal item row ────────────────────────────────────────────────────────

interface ItemRowProps {
  logId: string
  item: IMealItem & { _id?: string }
  onEdit: () => void
  onDelete: () => void
  /** In select mode the row becomes a checkbox target and its edit/delete
   *  affordances are withheld — tapping to pick must never delete a log. */
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}

function ItemRow({ item, onEdit, onDelete, selectable, selected, onToggleSelect }: ItemRowProps) {
  const showVariant = shouldShowVariantName(item.variantName)

  const row = (
    <FoodItemRow
      layout="log"
      name={item.name}
      variantName={showVariant ? item.variantName : undefined}
      brand={item.brand}
      servingLabel={item.servingLabel}
      hardAmount={hardAmountOf(item)}
      calories={Math.round((item.nutrition.calories ?? 0) * (item.servings ?? 1))}
      macros={scaledMacrosOf(item)}
      onEdit={selectable ? undefined : onEdit}
      onRemove={selectable ? undefined : onDelete}
    />
  )

  if (!selectable) return row

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${selected ? 'Deselect' : 'Select'} ${item.name}`}
      onClick={onToggleSelect}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggleSelect?.()
        }
      }}
      className={`flex cursor-pointer items-center gap-2 pl-3 transition-colors ${
        selected ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
          selected
            ? 'border-emerald-600 bg-emerald-600 text-white'
            : 'border-zinc-300 dark:border-zinc-600'
        }`}
      >
        {selected && <Check className="h-3 w-3" />}
      </span>
      <div className="pointer-events-none min-w-0 flex-1">{row}</div>
    </div>
  )
}
