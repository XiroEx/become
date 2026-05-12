"use client"

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import PageTransition from '@/components/PageTransition'
import { ArrowLeft, Minus, Plus, Clock, Tag, Trash2, Pencil } from 'lucide-react'

interface RecipeIngredient {
  foodId?: string
  name: string
  amount: number
  unit: string
  nutrition: {
    calories: number
    protein: number
    carbs: number
    fats: number
  }
}

interface Recipe {
  _id: string
  name: string
  description?: string
  category: string
  servings: number
  ingredients: RecipeIngredient[]
  instructions: string[]
  prepTime?: number
  cookTime?: number
  totalsPerServing: {
    calories: number
    protein: number
    carbs: number
    fats: number
    fiber?: number
  }
  tags: string[]
  isPublic: boolean
  createdBy?: string
  imageUrl?: string
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

const MEAL_TYPES: { key: MealType; label: string; icon: string }[] = [
  { key: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { key: 'lunch', label: 'Lunch', icon: '☀️' },
  { key: 'dinner', label: 'Dinner', icon: '🌙' },
  { key: 'snack', label: 'Snack', icon: '🍎' }
]

export default function RecipeDetailPage() {
  const router = useRouter()
  const params = useParams()
  const recipeId = params.id as string

  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [servingScale, setServingScale] = useState(1)
  const [showMealPicker, setShowMealPicker] = useState(false)
  const [logging, setLogging] = useState(false)
  const [logMessage, setLogMessage] = useState('')
  const [isOwner, setIsOwner] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchRecipe = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        router.push('/login')
        return
      }

      const res = await fetch(`/api/nutrition/recipes/${recipeId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (res.ok) {
        const data = await res.json()
        // API returns recipe object directly (not wrapped)
        const recipeData = data.recipe || data
        setRecipe(recipeData)
        setServingScale(recipeData.servings || 1)

        // Check ownership — compare createdBy to current user
        try {
          const profileRes = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
          })
          if (profileRes.ok) {
            const profile = await profileRes.json()
            const createdBy = recipeData.createdBy
            if (createdBy && profile.userId && createdBy.toString() === profile.userId.toString()) {
              setIsOwner(true)
            }
          }
        } catch {
          // Ownership check failed — not critical
        }
      } else if (res.status === 404) {
        router.push('/dashboard/nutrition/recipes')
      }
    } catch (error) {
      console.error('Failed to fetch recipe:', error)
    } finally {
      setLoading(false)
    }
  }, [recipeId, router])

  useEffect(() => {
    fetchRecipe()
  }, [fetchRecipe])

  const getScaledValue = (value: number): number => {
    if (!recipe) return value
    const ratio = servingScale / recipe.servings
    return Math.round(value * ratio * 10) / 10
  }

  const handleLogServing = async (mealType: MealType) => {
    if (!recipe) return
    setLogging(true)
    setLogMessage('')

    try {
      const token = localStorage.getItem('token')
      if (!token) return

      // Log each ingredient as part of a meal, scaled by servings
      const ratio = 1 / recipe.servings // 1 serving worth

      const food = {
        name: recipe.name,
        servingSize: 1,
        servingUnit: 'serving',
        servings: 1,
        nutrition: {
          calories: Math.round(recipe.totalsPerServing.calories),
          protein: Math.round(recipe.totalsPerServing.protein),
          carbs: Math.round(recipe.totalsPerServing.carbs),
          fats: Math.round(recipe.totalsPerServing.fats),
          fiber: Math.round(recipe.totalsPerServing.fiber || 0)
        }
      }

      const res = await fetch('/api/nutrition/log', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mealType, food, tz: new Date().getTimezoneOffset() })
      })

      if (res.ok) {
        setLogMessage('Logged successfully!')
        setShowMealPicker(false)
        setTimeout(() => setLogMessage(''), 3000)
      } else {
        setLogMessage('Failed to log meal')
      }
    } catch (error) {
      console.error('Failed to log recipe:', error)
      setLogMessage('Failed to log meal')
    } finally {
      setLogging(false)
    }
  }

  const handleDelete = async () => {
    if (!recipe) return
    setDeleting(true)

    try {
      const token = localStorage.getItem('token')
      if (!token) return

      const res = await fetch(`/api/nutrition/recipes/${recipeId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (res.ok) {
        router.push('/dashboard/nutrition/recipes')
      }
    } catch (error) {
      console.error('Failed to delete recipe:', error)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <PageTransition className="pb-6">
        <div className="animate-pulse space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-8 w-64 rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
            ))}
          </div>
          <div className="h-40 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-60 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </PageTransition>
    )
  }

  if (!recipe) return null

  return (
    <PageTransition className="pb-6">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between sm:mb-6">
        <div className="flex items-start gap-3">
          <button
            onClick={() => router.push('/dashboard/nutrition/recipes')}
            className="mt-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{recipe.name}</h1>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                {recipe.category}
              </span>
              {(recipe.prepTime || recipe.cookTime) && (
                <span className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-500">
                  <Clock className="h-3 w-3" />
                  {recipe.prepTime && `${recipe.prepTime}m prep`}
                  {recipe.prepTime && recipe.cookTime && ' + '}
                  {recipe.cookTime && `${recipe.cookTime}m cook`}
                </span>
              )}
            </div>
          </div>
        </div>

        {isOwner && (
          <div className="flex gap-2">
            <button
              onClick={() => router.push(`/dashboard/nutrition/recipes/${recipeId}/edit`)}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <Pencil className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-red-200 bg-white transition-colors hover:bg-red-50 dark:border-red-900 dark:bg-zinc-900 dark:hover:bg-red-950"
            >
              <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
            </button>
          </div>
        )}
      </div>

      {/* Description */}
      {recipe.description && (
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400 sm:mb-6">{recipe.description}</p>
      )}

      {/* Nutrition Per Serving */}
      <div className="mb-4 grid grid-cols-4 gap-3 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-950 sm:mb-6">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{getScaledValue(recipe.totalsPerServing.protein)}g</div>
          <div className="text-xs text-zinc-600 dark:text-zinc-400">Protein</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{getScaledValue(recipe.totalsPerServing.carbs)}g</div>
          <div className="text-xs text-zinc-600 dark:text-zinc-400">Carbs</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-yellow-600">{getScaledValue(recipe.totalsPerServing.fats)}g</div>
          <div className="text-xs text-zinc-600 dark:text-zinc-400">Fats</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-zinc-900 dark:text-white">{getScaledValue(recipe.totalsPerServing.calories)}</div>
          <div className="text-xs text-zinc-600 dark:text-zinc-400">Calories</div>
        </div>
      </div>

      {/* Serving Scaler */}
      <div className="mb-4 flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:mb-6 sm:p-4">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Servings</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setServingScale(prev => Math.max(1, prev - 1))}
            disabled={servingScale <= 1}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            <Minus className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
          </button>
          <span className="min-w-[2rem] text-center text-lg font-bold text-zinc-900 dark:text-white">{servingScale}</span>
          <button
            onClick={() => setServingScale(prev => prev + 1)}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            <Plus className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
          </button>
        </div>
      </div>

      {/* Ingredients */}
      <div className="mb-4 sm:mb-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Ingredients</h3>
        <ul className="mt-3 space-y-2">
          {recipe.ingredients.map((ingredient, index) => {
            const scaledAmount = getScaledValue(ingredient.amount)
            return (
              <li
                key={index}
                className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300"
              >
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400 dark:bg-zinc-600" />
                <span>
                  <span className="font-medium">{scaledAmount} {ingredient.unit}</span> {ingredient.name}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Instructions */}
      {recipe.instructions.length > 0 && (
        <div className="mb-4 sm:mb-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Instructions</h3>
          <ol className="mt-3 space-y-3">
            {recipe.instructions.map((instruction, index) => (
              <li
                key={index}
                className="flex gap-3 text-sm text-zinc-700 dark:text-zinc-300"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white dark:bg-white dark:text-black">
                  {index + 1}
                </span>
                <span className="pt-0.5">{instruction}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Tags */}
      {recipe.tags.length > 0 && (
        <div className="mb-6">
          <div className="flex flex-wrap gap-1.5">
            {recipe.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              >
                <Tag className="h-3 w-3" />
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Log Serving Button */}
      <button
        onClick={() => setShowMealPicker(true)}
        className="w-full cursor-pointer rounded-lg bg-green-600 py-3 font-semibold text-white transition-colors hover:bg-green-700"
      >
        Log 1 Serving
      </button>

      {logMessage && (
        <p className={`mt-3 text-center text-sm ${
          logMessage.includes('success') ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        }`}>
          {logMessage}
        </p>
      )}

      {/* Meal Type Picker Modal */}
      {showMealPicker && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => setShowMealPicker(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white p-6 dark:bg-zinc-900 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-bold text-zinc-900 dark:text-white">Log as...</h2>
            <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">Choose a meal type for this entry</p>

            <div className="grid grid-cols-2 gap-2">
              {MEAL_TYPES.map((meal) => (
                <button
                  key={meal.key}
                  onClick={() => handleLogServing(meal.key)}
                  disabled={logging}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600 dark:hover:bg-zinc-700"
                >
                  <span className="text-lg">{meal.icon}</span>
                  <span className="text-sm font-medium text-zinc-900 dark:text-white">{meal.label}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowMealPicker(false)}
              className="mt-3 w-full cursor-pointer rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-lg font-bold text-zinc-900 dark:text-white">Delete Recipe?</h2>
            <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
              This action cannot be undone. The recipe &quot;{recipe.name}&quot; will be permanently removed.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 cursor-pointer rounded-lg border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 cursor-pointer rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  )
}
