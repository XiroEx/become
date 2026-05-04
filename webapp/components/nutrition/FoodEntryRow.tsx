"use client"

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Pencil, Trash2 } from 'lucide-react'
import type { IFoodEntry } from '@/models/NutritionLog'

interface FoodEntryRowProps {
  food: IFoodEntry
  onEdit: () => void
  onDelete: () => void
}

// Variant names that are essentially "no preparation" — don't display them.
const HIDDEN_VARIANT_NAMES = new Set(['default', 'raw'])

function shouldShowVariantName(name: string | undefined): name is string {
  if (!name) return false
  return !HIDDEN_VARIANT_NAMES.has(name.trim().toLowerCase())
}

export default function FoodEntryRow({ food, onEdit, onDelete }: FoodEntryRowProps) {
  const [expanded, setExpanded] = useState(false)

  const totalCalories = Math.round(food.nutrition.calories * food.servings)
  const servingDisplay = `${food.servings !== 1 ? `${food.servings} servings` : '1 serving'}`
  const sizeDisplay = `${food.servingSize} ${food.servingUnit}`
  const showVariant = shouldShowVariantName(food.variantName)

  return (
    <div className="group">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
            {food.name}
            {showVariant && (
              <span className="font-normal text-zinc-500 dark:text-zinc-400">
                {' '}&middot; {food.variantName}
              </span>
            )}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
            {food.brand && (
              <span className="text-zinc-400 dark:text-zinc-500">{food.brand} &middot; </span>
            )}
            {servingDisplay} &middot; {sizeDisplay}
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
          {totalCalories}
        </span>
      </button>

      {/* Expanded detail with edit/delete */}
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
              {/* Macro chips */}
              <div className="flex gap-2 text-[11px] tabular-nums">
                <span className="rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  P {Math.round(food.nutrition.protein * food.servings)}g
                </span>
                <span className="rounded bg-green-100 px-1.5 py-0.5 font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
                  C {Math.round(food.nutrition.carbs * food.servings)}g
                </span>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  F {Math.round(food.nutrition.fats * food.servings)}g
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit()
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                  aria-label="Edit food entry"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete()
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  aria-label="Delete food entry"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
