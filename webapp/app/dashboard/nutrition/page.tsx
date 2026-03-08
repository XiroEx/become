"use client"

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import PageTransition from '@/components/PageTransition'
import DateNav from '@/components/nutrition/DateNav'
import CalorieRing from '@/components/nutrition/CalorieRing'
import MealSection from '@/components/nutrition/MealSection'
import WaterTracker from '@/components/nutrition/WaterTracker'
import FoodSearchModal from '@/components/nutrition/FoodSearchModal'
import QuickAddModal from '@/components/nutrition/QuickAddModal'
import { Plus, BookOpen, Target } from 'lucide-react'
import type { IFoodEntry } from '@/models/NutritionLog'

// ── Types ──────────────────────────────────────────────────────────────────────

type FoodEntry = IFoodEntry

interface Meal {
  id: string
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  foods: FoodEntry[]
  loggedAt: string
}

interface NutritionLog {
  date: string
  meals: Meal[]
  water: { current: number; goal: number }
  quickAdds: { id: string; calories: number; protein: number; carbs: number; fats: number; note?: string }[]
  dailyTotals: { calories: number; protein: number; carbs: number; fats: number; fiber: number }
}

interface NutritionGoals {
  calories: number
  protein: number
  carbs: number
  fats: number
  waterGoal: number
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDateParam(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

// ── Defaults ───────────────────────────────────────────────────────────────────

const defaultLog: NutritionLog = {
  date: formatDateParam(new Date()),
  meals: [],
  water: { current: 0, goal: 8 },
  quickAdds: [],
  dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 },
}

const defaultGoals: NutritionGoals = {
  calories: 2300,
  protein: 180,
  carbs: 250,
  fats: 60,
  waterGoal: 8,
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function NutritionPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [log, setLog] = useState<NutritionLog>(defaultLog)
  const [goals, setGoals] = useState<NutritionGoals>(defaultGoals)
  const [loading, setLoading] = useState(true)

  // Modal state
  const [foodSearchOpen, setFoodSearchOpen] = useState(false)
  const [foodSearchMealType, setFoodSearchMealType] = useState<MealType>('breakfast')
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  const dateParam = formatDateParam(selectedDate)
  const isToday = isSameDay(selectedDate, new Date())

  // ── Auth helper ────────────────────────────────────────────────────────────

  const getHeaders = useCallback((): HeadersInit => {
    const token = localStorage.getItem('token')
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }, [])

  // ── Fetch nutrition log ────────────────────────────────────────────────────

  const fetchLog = useCallback(async () => {
    try {
      const res = await fetch(`/api/nutrition/log?date=${dateParam}`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setLog(data)
      } else {
        setLog({ ...defaultLog, date: dateParam })
      }
    } catch (err) {
      console.error('Failed to fetch nutrition log:', err)
      setLog({ ...defaultLog, date: dateParam })
    }
  }, [dateParam, getHeaders])

  // ── Fetch goals ────────────────────────────────────────────────────────────

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

  // ── Init ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      setLoading(true)
      await Promise.all([fetchLog(), fetchGoals()])
      setLoading(false)
    }
    init()
  }, [fetchLog, fetchGoals])

  // ── Date navigation ───────────────────────────────────────────────────────

  const handlePrevDay = () => {
    setSelectedDate(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() - 1)
      return d
    })
  }

  const handleNextDay = () => {
    setSelectedDate(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() + 1)
      return d
    })
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  const handleAddFood = async (mealType: MealType, food: FoodEntry) => {
    try {
      const res = await fetch('/api/nutrition/log', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ mealType, food, date: dateParam }),
      })
      if (res.ok) {
        await fetchLog()
      }
    } catch (err) {
      console.error('Failed to add food:', err)
    }
    setFoodSearchOpen(false)
  }

  const handleDeleteFood = async (mealId: string, foodEntryId: string) => {
    try {
      const res = await fetch('/api/nutrition/log', {
        method: 'DELETE',
        headers: getHeaders(),
        body: JSON.stringify({ mealId, foodEntryId, date: dateParam }),
      })
      if (res.ok) {
        await fetchLog()
      }
    } catch (err) {
      console.error('Failed to delete food:', err)
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
        await fetchLog()
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
        await fetchLog()
      }
    } catch (err) {
      console.error('Failed to quick add:', err)
    }
    setQuickAddOpen(false)
  }

  const openFoodSearch = (mealType: MealType) => {
    setFoodSearchMealType(mealType)
    setFoodSearchOpen(true)
  }

  // ── Meal helpers ──────────────────────────────────────────────────────────

  const getMealsForType = (type: MealType): Meal[] => {
    return log.meals.filter(m => m.mealType === type)
  }

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

        {/* Meal sections skeleton */}
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        ))}
      </PageTransition>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <PageTransition className="space-y-4 pb-6 sm:space-y-6">
        {/* Header */}
        <header className="mb-2 sm:mb-4">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">Nutrition</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 sm:text-base">
            Track your meals, macros, and hydration
          </p>
        </header>

        {/* Date Navigation */}
        <DateNav
          date={selectedDate}
          onDateChange={setSelectedDate}
        />

        {/* Calorie Ring + Macro Summary */}
        <CalorieRing
          consumed={log.dailyTotals.calories}
          goal={goals.calories}
          protein={{ current: log.dailyTotals.protein, goal: goals.protein }}
          carbs={{ current: log.dailyTotals.carbs, goal: goals.carbs }}
          fats={{ current: log.dailyTotals.fats, goal: goals.fats }}
        />

        {/* Meal Sections */}
        {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map(type => {
          const meals = getMealsForType(type)
          const foods = meals.flatMap(m => m.foods)
          const mealId = meals[0]?.id
          return (
            <MealSection
              key={type}
              mealType={type}
              foods={foods}
              onAddFood={() => openFoodSearch(type)}
              onEditFood={() => {}}
              onDeleteFood={(_, foodEntryId) => handleDeleteFood(mealId || '', foodEntryId)}
              mealId={mealId}
            />
          )
        })}

        {/* Water Tracker */}
        <WaterTracker
          current={log.water.current}
          goal={goals.waterGoal}
          onAddWater={handleAddWater}
        />

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <button
            onClick={() => setQuickAddOpen(true)}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <Plus className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Quick Add</span>
          </button>

          <Link
            href="/dashboard/nutrition/recipes"
            className="flex flex-col items-center gap-2 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <BookOpen className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Recipes</span>
          </Link>

          <Link
            href="/dashboard/nutrition/goals"
            className="flex flex-col items-center gap-2 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Target className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Goals</span>
          </Link>
        </div>
      </PageTransition>

      {/* Food Search Modal */}
      <FoodSearchModal
        isOpen={foodSearchOpen}
        mealType={foodSearchMealType}
        onClose={() => setFoodSearchOpen(false)}
        onSelectFood={(food: FoodEntry) => handleAddFood(foodSearchMealType, food)}
      />

      {/* Quick Add Modal */}
      <QuickAddModal
        isOpen={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onSubmit={handleQuickAdd}
      />
    </>
  )
}
