"use client"

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sunrise, Sun, Moon, Cookie, Plus, ChevronDown } from 'lucide-react'
import type { IFoodEntry } from '@/models/NutritionLog'
import FoodEntryRow from './FoodEntryRow'

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

interface MealSectionProps {
  mealType: MealType
  foods: IFoodEntry[]
  onAddFood: () => void
  onEditFood: (foodEntryId: string) => void
  onDeleteFood: (mealId: string, foodEntryId: string) => void
  mealId?: string
}

const mealConfig: Record<MealType, { label: string; Icon: typeof Sunrise; iconColor: string; bgColor: string }> = {
  breakfast: {
    label: 'Breakfast',
    Icon: Sunrise,
    iconColor: 'text-amber-500',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
  },
  lunch: {
    label: 'Lunch',
    Icon: Sun,
    iconColor: 'text-orange-500',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  },
  dinner: {
    label: 'Dinner',
    Icon: Moon,
    iconColor: 'text-indigo-500',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
  },
  snack: {
    label: 'Snack',
    Icon: Cookie,
    iconColor: 'text-emerald-500',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
  },
}

export default function MealSection({
  mealType,
  foods,
  onAddFood,
  onEditFood,
  onDeleteFood,
  mealId,
}: MealSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const config = mealConfig[mealType]

  const totalCalories = foods.reduce(
    (sum, f) => sum + Math.round(f.nutrition.calories * f.servings),
    0
  )
  const totalProtein = foods.reduce(
    (sum, f) => sum + Math.round(f.nutrition.protein * f.servings),
    0
  )
  const totalCarbs = foods.reduce(
    (sum, f) => sum + Math.round(f.nutrition.carbs * f.servings),
    0
  )
  const totalFats = foods.reduce(
    (sum, f) => sum + Math.round(f.nutrition.fats * f.servings),
    0
  )

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex w-full items-center gap-3 p-4"
      >
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${config.bgColor}`}>
          <config.Icon className={`h-4.5 w-4.5 ${config.iconColor}`} />
        </div>

        <div className="flex flex-1 items-center justify-between min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-900 dark:text-white">
              {config.label}
            </span>
            {foods.length > 0 && (
              <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                {totalCalories} cal
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onAddFood()
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              aria-label={`Add food to ${config.label}`}
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

      {/* Food list */}
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
              {foods.length === 0 ? (
                <button
                  onClick={onAddFood}
                  className="flex w-full items-center justify-center gap-1.5 px-4 py-5 text-sm text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tap + to add food
                </button>
              ) : (
                <>
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {foods.map((food) => (
                      <FoodEntryRow
                        key={food.id}
                        food={food}
                        onEdit={() => onEditFood(food.id)}
                        onDelete={() => onDeleteFood(mealId || '', food.id)}
                      />
                    ))}
                  </div>

                  {/* Meal totals */}
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
