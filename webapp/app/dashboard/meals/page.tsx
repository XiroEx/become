"use client"

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import PageTransition from '@/components/PageTransition'
import MealCard from '@/components/meals/MealCard'
import MealApplySheet from '@/components/meals/MealApplySheet'
import FoodLogSheet from '@/components/meals/FoodLogSheet'
import SavedFoodCard from '@/components/meals/SavedFoodCard'
import { Search, Plus, ChefHat, Loader2, X, Tag as TagIcon, AlertCircle, Bookmark } from 'lucide-react'
import { EmptyState } from '@/components/ui'

interface MealLite {
  _id: string
  name: string
  description?: string
  imageUrl?: string
  tags: string[]
  items: { _id?: string }[]
  totalNutrition?: {
    calories: number
    protein: number
    carbs: number
    fats: number
  }
  recipe?: { servings?: number }
  createdBy?: string
  isVerified?: boolean
}

interface MeResponse {
  user?: { _id?: string; id?: string; userId?: string }
  _id?: string
  id?: string
  userId?: string
}

interface SavedFoodLite {
  _id: string
  name: string
  brand?: string
  servingSize: number
  servingUnit: string
  displayLabel?: string
  isVerified?: boolean
  imageUrl?: string
  category?: string
  nutrition: { calories: number; protein: number; carbs: number; fats: number }
  variants?: Array<{
    _id?: string
    name: string
    isDefault?: boolean
    servingSize: number
    servingUnit: string
    nutrition: { calories: number; protein: number; carbs: number; fats: number }
  }>
}

function getDefaultTagForNow(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 11) return 'breakfast'
  if (h >= 11 && h < 14) return 'lunch'
  if (h >= 17 && h < 21) return 'dinner'
  return 'snack'
}

function titleCaseTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-')
}

type Tab = 'meals' | 'foods'

export default function MealsPage() {
  const [tab, setTab] = useState<Tab>('meals')
  const [meals, setMeals] = useState<MealLite[]>([])
  const [savedFoods, setSavedFoods] = useState<SavedFoodLite[]>([])
  const [loading, setLoading] = useState(true)
  const [foodsLoading, setFoodsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [tagsResp, setTagsResp] = useState<{ defaults: string[]; userTags: string[] }>({
    defaults: [], userTags: [],
  })
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [applyTargetMeal, setApplyTargetMeal] = useState<MealLite | null>(null)
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())
  const [logTargetFood, setLogTargetFood] = useState<SavedFoodLite | null>(null)
  const [loggedFoodIds, setLoggedFoodIds] = useState<Set<string>>(new Set())
  const [removingFoodId, setRemovingFoodId] = useState<string | null>(null)
  const [errorToast, setErrorToast] = useState<string | null>(null)

  const getHeaders = useCallback((): HeadersInit => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
  }, [])

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(t)
  }, [search])

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { headers: getHeaders() })
      if (res.ok) {
        const data: MeResponse = await res.json()
        const id = data.user?._id || data.user?.id || data.user?.userId || data._id || data.id || data.userId || null
        setCurrentUserId(id ? String(id) : null)
      }
    } catch {
      /* non-fatal */
    }
  }, [getHeaders])

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/tags', { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setTagsResp({
          defaults: Array.isArray(data.defaults) ? data.defaults : [],
          userTags: Array.isArray(data.userTags) ? data.userTags : [],
        })
      }
    } catch {
      /* non-fatal */
    }
  }, [getHeaders])

  const fetchMeals = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('q', debouncedSearch)
      if (selectedTag) params.set('tag', selectedTag)
      params.set('limit', '50')
      const res = await fetch(`/api/meals?${params.toString()}`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setMeals(Array.isArray(data.meals) ? data.meals : [])
      } else {
        setMeals([])
      }
    } catch {
      setMeals([])
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, selectedTag, getHeaders])

  const fetchSavedFoods = useCallback(async () => {
    setFoodsLoading(true)
    try {
      const res = await fetch('/api/me/foods', { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setSavedFoods(Array.isArray(data.foods) ? data.foods : [])
      } else {
        setSavedFoods([])
      }
    } catch {
      setSavedFoods([])
    } finally {
      setFoodsLoading(false)
    }
  }, [getHeaders])

  useEffect(() => {
    fetchMe()
    fetchTags()
  }, [fetchMe, fetchTags])

  useEffect(() => {
    if (tab === 'meals') fetchMeals()
    else fetchSavedFoods()
  }, [tab, fetchMeals, fetchSavedFoods])

  const allTags = useMemo<string[]>(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const t of [...tagsResp.defaults, ...tagsResp.userTags]) {
      const norm = String(t).toLowerCase()
      if (!seen.has(norm)) {
        seen.add(norm)
        out.push(norm)
      }
    }
    return out
  }, [tagsResp])

  const handleOpenFoodLog = (food: SavedFoodLite) => {
    setLogTargetFood(food)
  }

  const handleFoodLogged = (foodId: string) => {
    setLoggedFoodIds(prev => {
      const next = new Set(prev)
      next.add(foodId)
      return next
    })
    setTimeout(() => {
      setLoggedFoodIds(prev => {
        const next = new Set(prev)
        next.delete(foodId)
        return next
      })
    }, 2200)
  }

  const handleRemoveFood = async (foodId: string) => {
    if (removingFoodId) return
    setRemovingFoodId(foodId)
    try {
      const res = await fetch(`/api/me/foods/${foodId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      if (res.ok) {
        setSavedFoods(prev => prev.filter(f => f._id !== foodId))
      } else {
        setErrorToast('Failed to remove food.')
        setTimeout(() => setErrorToast(null), 3500)
      }
    } catch {
      setErrorToast('Network error.')
      setTimeout(() => setErrorToast(null), 3500)
    } finally {
      setRemovingFoodId(null)
    }
  }

  const filteredFoods = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return savedFoods
    return savedFoods.filter(f =>
      f.name.toLowerCase().includes(q) || (f.brand?.toLowerCase().includes(q) ?? false)
    )
  }, [savedFoods, debouncedSearch])

  // Open the Apply sheet for a given meal. The sheet handles the actual POST.
  const handleApplyOpen = (mealId: string) => {
    const m = meals.find(x => x._id === mealId)
    if (m) setApplyTargetMeal(m)
  }

  const handleApplied = (mealId: string) => {
    setAppliedIds(prev => {
      const next = new Set(prev)
      next.add(mealId)
      return next
    })
    setTimeout(() => {
      setAppliedIds(prev => {
        const next = new Set(prev)
        next.delete(mealId)
        return next
      })
    }, 2200)
  }

  return (
    <PageTransition className="space-y-4 pb-24 sm:space-y-6">
      <header className="mb-2 sm:mb-4">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">Recipes</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 sm:text-base">
          {tab === 'meals'
            ? 'Save the recipes you cook often. Tap to log.'
            : 'Your favorite foods. Tap to log.'}
        </p>
      </header>

      {/* Tab strip — Meals | My Foods */}
      <div className="inline-flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
        <button
          onClick={() => setTab('meals')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
            tab === 'meals'
              ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-white'
              : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
          }`}
        >
          <ChefHat className="h-3.5 w-3.5" />
          Recipes
        </button>
        <button
          onClick={() => setTab('foods')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
            tab === 'foods'
              ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-white'
              : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
          }`}
        >
          <Bookmark className="h-3.5 w-3.5" />
          Favorites
        </button>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === 'meals' ? 'Search your recipes…' : 'Search your favorites…'}
          className="w-full rounded-xl border border-zinc-200 bg-white py-3 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500 dark:focus:border-zinc-600"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* New custom food button — My Foods tab */}
      {tab === 'foods' && (
        <div className="flex justify-end">
          <Link
            href="/dashboard/foods/new"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <Plus className="h-3.5 w-3.5" />
            New custom food
          </Link>
        </div>
      )}

      {/* Tag filter chips — Meals tab only */}
      {tab === 'meals' && allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedTag(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedTag === null
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
            }`}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedTag === tag
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
              }`}
            >
              {titleCaseTag(tag)}
            </button>
          ))}
        </div>
      )}

      {/* Meal list (Meals tab only) */}
      {tab === 'meals' && (loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : meals.length === 0 ? (
        <EmptyState
          icon={<ChefHat className="h-7 w-7" />}
          title={debouncedSearch || selectedTag ? 'No recipes match' : 'No saved recipes yet'}
          description={
            debouncedSearch || selectedTag
              ? 'Try a different search or clear the filter.'
              : 'Save your go-to recipes as templates and log them with one tap.'
          }
          action={!debouncedSearch && !selectedTag ? (
            <Link
              href="/dashboard/meals/new"
              className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              <Plus className="h-4 w-4" />
              Create your first recipe
            </Link>
          ) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {meals.map(meal => (
            <MealCard
              key={meal._id}
              id={String(meal._id)}
              name={meal.name}
              description={meal.description}
              imageUrl={meal.imageUrl}
              tags={meal.tags || []}
              totalNutrition={meal.totalNutrition}
              itemCount={meal.items?.length ?? 0}
              isOwner={Boolean(currentUserId && meal.createdBy && String(meal.createdBy) === currentUserId)}
              isVerified={meal.isVerified}
              applying={false}
              applied={appliedIds.has(meal._id)}
              onApply={() => handleApplyOpen(meal._id)}
            />
          ))}
        </div>
      ))}

      {/* My Foods list (Foods tab only) */}
      {tab === 'foods' && (foodsLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : filteredFoods.length === 0 ? (
        <EmptyState
          icon={<Bookmark className="h-7 w-7 fill-current text-amber-500" />}
          title={debouncedSearch ? 'No favorites match' : 'No favorites yet'}
          description={
            debouncedSearch
              ? 'Try a different search.'
              : 'Tap the bookmark on any food in the search modal to add it here.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          <AnimatePresence initial={false}>
            {filteredFoods.map(food => (
              <SavedFoodCard
                key={food._id}
                id={food._id}
                name={food.name}
                brand={food.brand}
                servingSize={food.servingSize}
                servingUnit={food.servingUnit}
                displayLabel={food.displayLabel}
                isVerified={food.isVerified}
                imageUrl={food.imageUrl}
                category={food.category}
                calories={Math.round(food.nutrition.calories)}
                protein={Math.round(food.nutrition.protein)}
                carbs={Math.round(food.nutrition.carbs)}
                fats={Math.round(food.nutrition.fats)}
                logging={false}
                logged={loggedFoodIds.has(food._id)}
                removing={removingFoodId === food._id}
                onLog={() => handleOpenFoodLog(food)}
                onRemove={() => handleRemoveFood(food._id)}
              />
            ))}
          </AnimatePresence>
        </div>
      ))}

      {/* Floating + New Recipe button (Recipes tab only — favorites are added via search modal) */}
      {tab === 'meals' && (
        <Link
          href="/dashboard/meals/new"
          className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg transition-transform hover:scale-105 active:scale-95 dark:bg-white dark:text-black sm:right-6"
          aria-label="Create new recipe"
        >
          <Plus className="h-6 w-6" />
        </Link>
      )}

      {/* Error toast */}
      {errorToast && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-24 left-1/2 z-[100] -translate-x-1/2 flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-medium text-white shadow-lg"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorToast}
        </motion.div>
      )}
      {/* Food log sheet — when/what to add this saved food as */}
      <FoodLogSheet
        isOpen={!!logTargetFood}
        food={logTargetFood}
        defaultTag={getDefaultTagForNow()}
        availableTags={tagsResp}
        onClose={() => setLogTargetFood(null)}
        onLogged={(foodId) => handleFoodLogged(foodId)}
      />

      {/* Apply sheet — portion + tag + time */}
      <MealApplySheet
        isOpen={!!applyTargetMeal}
        meal={applyTargetMeal ? {
          _id: applyTargetMeal._id,
          name: applyTargetMeal.name,
          imageUrl: applyTargetMeal.imageUrl,
          totalNutrition: applyTargetMeal.totalNutrition,
          recipe: applyTargetMeal.recipe ? { servings: applyTargetMeal.recipe.servings } : undefined,
          tags: applyTargetMeal.tags,
        } : null}
        defaultTag={getDefaultTagForNow()}
        availableTags={tagsResp}
        onClose={() => setApplyTargetMeal(null)}
        onApplied={() => {
          if (applyTargetMeal) handleApplied(applyTargetMeal._id)
        }}
      />

      {/* Hidden TagIcon import keeps it available if we extend the empty state later */}
      <span className="hidden"><TagIcon className="h-0 w-0" /></span>
    </PageTransition>
  )
}
