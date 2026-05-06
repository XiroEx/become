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
} from 'lucide-react'
import type { IMealItem } from '@/models/Meal'

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
  onEditEntry: (logId: string, item: IMealItem & { _id?: string }) => void
  onRemoveEntry: (logId: string, itemId: string) => void
  onRemoveTag?: (tag: string) => void
  removable?: boolean
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
  onEditEntry,
  onRemoveEntry,
  onRemoveTag,
  removable = false,
}: TagSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
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
  totalCalories = Math.round(totalCalories)
  totalProtein = Math.round(totalProtein)
  totalCarbs = Math.round(totalCarbs)
  totalFats = Math.round(totalFats)

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
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex w-full items-center gap-3 p-4"
      >
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${visuals.bgColor}`}>
          <visuals.Icon className={`h-4 w-4 ${visuals.iconColor}`} />
        </div>

        <div className="flex flex-1 items-center justify-between min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
              {label}
            </span>
            {flat.length > 0 && (
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
              aria-label={`Add food to ${label}`}
            >
              <Plus className="h-4 w-4" />
            </button>
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
            <div className="border-t border-zinc-100 dark:border-zinc-800">
              {flat.length === 0 ? (
                <button
                  onClick={() => onAddFood(tag)}
                  className="flex w-full items-center justify-center gap-1.5 px-4 py-5 text-sm text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tap + to add food
                </button>
              ) : (
                <>
                  {groups.map((group) => (
                    <div key={group.key}>
                      {group.mealName && (
                        <div className="flex items-center gap-1.5 border-b border-zinc-100 bg-zinc-50/60 px-4 py-1.5 text-[11px] font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-400">
                          <span className="uppercase tracking-wide">From:</span>
                          <span className="truncate text-zinc-700 dark:text-zinc-200">{group.mealName}</span>
                        </div>
                      )}
                      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
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
                  ))}

                  {/* Tag totals */}
                  <div className="border-t border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
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
  const [expanded, setExpanded] = useState(false)
  const totalCalories = Math.round((item.nutrition.calories ?? 0) * (item.servings ?? 1))
  const servingDisplay = `${item.servings !== 1 ? `${item.servings} servings` : '1 serving'}`
  const sizeDisplay = `${item.servingSize} ${item.servingUnit}`
  const showVariant = shouldShowVariantName(item.variantName)

  return (
    <div className="group">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
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
          {totalCalories}
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between px-3 pb-2">
              <div className="flex gap-2 text-[11px] tabular-nums">
                <span className="rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  P {Math.round((item.nutrition.protein ?? 0) * (item.servings ?? 1))}g
                </span>
                <span className="rounded bg-green-100 px-1.5 py-0.5 font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
                  C {Math.round((item.nutrition.carbs ?? 0) * (item.servings ?? 1))}g
                </span>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  F {Math.round((item.nutrition.fats ?? 0) * (item.servings ?? 1))}g
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit() }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                  aria-label="Edit entry"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete() }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  aria-label="Delete entry"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
