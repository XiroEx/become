"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import PageTransition from '@/components/PageTransition'
import { ArrowLeft, Plus, Search, Clock } from 'lucide-react'

interface RecipeSummary {
  _id: string
  name: string
  category: string
  description?: string
  servings: number
  prepTime?: number
  cookTime?: number
  totalsPerServing: {
    calories: number
    protein: number
    carbs: number
    fats: number
  }
  tags: string[]
  createdBy?: string
  isPublic: boolean
}

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'My Recipes' },
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
  { key: 'meal_prep', label: 'Meal Prep' }
]

const CATEGORY_COLORS: Record<string, string> = {
  breakfast: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  lunch: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  dinner: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  snack: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  meal_prep: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  'lunch/dinner': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400'
}

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category.toLowerCase()] || 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400'
}

const RECIPES_PAGE = 5

export default function RecipesPage() {
  const router = useRouter()
  const [recipes, setRecipes] = useState<RecipeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const [shown, setShown] = useState(RECIPES_PAGE)

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchQuery])

  const fetchRecipes = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        router.push('/login')
        return
      }

      const params = new URLSearchParams()
      if (debouncedQuery) params.set('q', debouncedQuery)

      if (activeFilter === 'mine') {
        params.set('mine', 'true')
      } else if (activeFilter !== 'all') {
        params.set('category', activeFilter)
      }

      const res = await fetch(`/api/nutrition/recipes?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (res.ok) {
        const data = await res.json()
        setRecipes(data.recipes || [])
        setShown(RECIPES_PAGE)
      }
    } catch (error) {
      console.error('Failed to fetch recipes:', error)
    } finally {
      setLoading(false)
    }
  }, [debouncedQuery, activeFilter, router])

  useEffect(() => {
    fetchRecipes()
  }, [fetchRecipes])

  return (
    <PageTransition className="pb-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between sm:mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard/nutrition')}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Recipes</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Browse and create meal ideas</p>
          </div>
        </div>

        <button
          onClick={() => router.push('/dashboard/nutrition/recipes/create')}
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Create</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search recipes..."
          className="w-full rounded-lg border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-600 dark:focus:border-white dark:focus:ring-white"
        />
      </div>

      {/* Filter Tabs */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide sm:mb-6">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            className={`shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
              activeFilter === tab.key
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Recipe List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="h-5 w-48 rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="mt-2 h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
              <div className="mt-3 h-4 w-64 rounded bg-zinc-200 dark:bg-zinc-700" />
            </div>
          ))}
        </div>
      ) : recipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 py-16 dark:border-zinc-700">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
            <Search className="h-5 w-5 text-zinc-400" />
          </div>
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">No recipes found</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
            {debouncedQuery ? 'Try a different search term' : 'Create your first recipe to get started'}
          </p>
          {!debouncedQuery && (
            <button
              onClick={() => router.push('/dashboard/nutrition/recipes/create')}
              className="mt-4 cursor-pointer rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Create Recipe
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {recipes.slice(0, shown).map((recipe) => (
            <button
              key={recipe._id}
              onClick={() => router.push(`/dashboard/nutrition/recipes/${recipe._id}`)}
              className="group w-full cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 text-left shadow-sm transition-all duration-200 hover:scale-[1.01] hover:border-zinc-300 hover:shadow-md active:scale-[0.99] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 sm:p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-zinc-900 group-hover:text-black dark:text-white dark:group-hover:text-white">
                      {recipe.name}
                    </h3>
                    <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${getCategoryColor(recipe.category)}`}>
                      {recipe.category}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-3 text-xs text-zinc-600 dark:text-zinc-400">
                    <span>P:{recipe.totalsPerServing.protein}g</span>
                    <span>C:{recipe.totalsPerServing.carbs}g</span>
                    <span>F:{recipe.totalsPerServing.fats}g</span>
                    <span className="font-semibold">{recipe.totalsPerServing.calories} cal</span>
                  </div>

                  {(recipe.prepTime || recipe.cookTime) && (
                    <div className="mt-1.5 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-500">
                      <Clock className="h-3 w-3" />
                      {recipe.prepTime && <span>Prep: {recipe.prepTime}m</span>}
                      {recipe.prepTime && recipe.cookTime && <span className="text-zinc-300 dark:text-zinc-600">|</span>}
                      {recipe.cookTime && <span>Cook: {recipe.cookTime}m</span>}
                    </div>
                  )}
                </div>

                <svg
                  className="mt-1 h-5 w-5 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
          {recipes.length > RECIPES_PAGE && (
            <button
              onClick={() => setShown(n => n > RECIPES_PAGE ? RECIPES_PAGE : n + RECIPES_PAGE)}
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              {shown >= recipes.length
                ? 'Show less'
                : `Show more (${recipes.length - shown} remaining)`}
            </button>
          )}
        </div>
      )}
    </PageTransition>
  )
}
