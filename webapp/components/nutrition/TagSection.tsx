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
  Trash2,
} from 'lucide-react'
import type { IMealItem } from '@/models/Meal'
import { Card } from '@/components/ui'
import { formatQuantity, type Unit } from '@/lib/units'
import type { MealPlan } from '@/app/dashboard/timeline/planning'
import FoodItemRow from '@/components/nutrition/FoodItemRow'

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
  notes?: string
}

interface FlattenedItem {
  logId: string
  mealName?: string
  item: IMealItem & { _id?: string }
}

interface TagSectionProps {
  tag: string
  logs: MealLogLite[]
  onAddFood: (tag: string) => void
  // Append a food into a specific logged meal group (keeps it under the meal's
  // outline). When omitted, meal groups show no add-to affordance.
  onAddToMeal?: (logId: string, tag: string) => void
  onEditEntry: (logId: string, item: IMealItem & { _id?: string }) => void
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
  onRemovePlan?: (planId: string) => void
  onEditPlanItem?: (planId: string, item: IMealItem & { _id?: string }, planItems: (IMealItem & { _id?: string })[]) => void
  /** "Log it" — promote a plan into a real log (today). When provided, a Log it
   *  button appears in the planned header. */
  onLogPlan?: (planId: string) => void
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
  onRemovePlan,
  onEditPlanItem,
  onLogPlan,
}: TagSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [kebabOpen, setKebabOpen] = useState(false)
  const visuals = getVisuals(tag)
  const label = titleCaseTag(tag)

  // Flatten items across all logs that carry this tag.
  const flat: FlattenedItem[] = []
  for (const log of logs) {
    for (const item of log.items) {
      flat.push({ logId: log._id, mealName: log.mealName, item })
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
  type Group = { key: string; mealName?: string; items: FlattenedItem[] }
  const groups: Group[] = []
  let lastKey = ''
  for (const fi of flat) {
    const key = fi.mealName ? `meal:${fi.logId}` : `loose:${fi.logId}`
    if (key !== lastKey) {
      groups.push({ key, mealName: fi.mealName, items: [] })
      lastKey = key
    }
    groups[groups.length - 1].items.push(fi)
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
                            Apply meal template…
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
                      />
                    ) : (
                      <div key={group.key}>
                        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                          {group.items.map((fi) => (
                            <ItemRow
                              key={`${fi.logId}-${fi.item._id ?? Math.random()}`}
                              logId={fi.logId}
                              item={fi.item}
                              onEdit={() => onEditEntry(fi.logId, fi.item)}
                              onDelete={() => fi.item._id && onRemoveEntry(fi.logId, String(fi.item._id))}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  ))}

                  {/* Planned rows — one per item per plan. Visually distinct
                      via a "Planned" pill on the leading row. */}
                  {plans.length > 0 && (
                    <div className={flat.length > 0 ? 'border-t border-zinc-200 dark:border-zinc-800' : ''}>
                      <div className="flex items-center gap-1.5 bg-blue-50/60 px-3 py-1.5 dark:bg-blue-900/10">
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          Planned
                        </span>
                        {plans.some(p => p.mealName) && (
                          <span className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                            {plans.filter(p => p.mealName).map(p => p.mealName).join(', ')}
                          </span>
                        )}
                        {onLogPlan && (
                          <button
                            onClick={() => plans.forEach(p => onLogPlan(p._id))}
                            className="ml-auto inline-flex shrink-0 items-center rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-semibold text-white transition-colors hover:bg-blue-700"
                          >
                            Log it
                          </button>
                        )}
                      </div>
                      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {plans.map((plan) =>
                          plan.items.map((item) => (
                            <PlanItemRow
                              key={`${plan._id}-${item._id ?? Math.random()}`}
                              planId={plan._id}
                              item={item}
                              onEdit={onEditPlanItem ? () => onEditPlanItem(plan._id, item, plan.items) : undefined}
                              onDelete={onRemovePlan ? () => onRemovePlan(plan._id) : undefined}
                            />
                          )),
                        )}
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
  group: { key: string; mealName?: string; items: { logId: string; item: IMealItem & { _id?: string } }[] }
  tag: string
  onEditEntry: (logId: string, item: IMealItem & { _id?: string }) => void
  onRemoveEntry: (logId: string, itemId: string) => void
  onAddToMeal?: (logId: string, tag: string) => void
}

function MealGroupCard({ group, tag, onEditEntry, onRemoveEntry, onAddToMeal }: MealGroupCardProps) {
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
                  onEdit={() => onEditEntry(fi.logId, fi.item)}
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

// ── Plan item row — shown when the page is viewing a future date. Has a
// distinct visual treatment (blue tint background) and a "Planned" microbadge
// next to the food name. Edit/delete handlers are optional — when omitted the
// row is read-only. ────────────────────────────────────────────────────────

interface PlanItemRowProps {
  planId: string
  item: IMealItem & { _id?: string }
  onEdit?: () => void
  onDelete?: () => void
}

function PlanItemRow({ item, onEdit, onDelete }: PlanItemRowProps) {
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
        badges={[{ label: 'Planned', tone: 'zinc' }]}
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
}

function ItemRow({ item, onEdit, onDelete }: ItemRowProps) {
  const showVariant = shouldShowVariantName(item.variantName)
  return (
    <FoodItemRow
      layout="log"
      name={item.name}
      variantName={showVariant ? item.variantName : undefined}
      brand={item.brand}
      servingLabel={item.servingLabel}
      hardAmount={hardAmountOf(item)}
      calories={Math.round((item.nutrition.calories ?? 0) * (item.servings ?? 1))}
      macros={scaledMacrosOf(item)}
      onEdit={onEdit}
      onRemove={onDelete}
    />
  )
}
