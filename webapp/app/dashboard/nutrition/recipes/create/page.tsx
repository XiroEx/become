"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import PageTransition from '@/components/PageTransition'
import { ArrowLeft, Plus, X, Search, ChevronUp, ChevronDown, Save } from 'lucide-react'

interface FoodResult {
  _id: string
  name: string
  brand?: string
  category: string
  servingSize: number
  servingUnit: string
  nutrition: {
    calories: number
    protein: number
    carbs: number
    fats: number
    fiber?: number
  }
}

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

const CATEGORIES = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Meal Prep', 'Lunch/Dinner']
const UNITS = ['g', 'oz', 'cup', 'each', 'ml', 'tbsp', 'tsp', 'slice', 'scoop']

export default function CreateRecipePage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Lunch')
  const [servings, setServings] = useState(1)
  const [prepTime, setPrepTime] = useState('')
  const [cookTime, setCookTime] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([])
  const [instructions, setInstructions] = useState<string[]>([''])

  // Food search state
  const [showFoodSearch, setShowFoodSearch] = useState(false)
  const [foodQuery, setFoodQuery] = useState('')
  const [debouncedFoodQuery, setDebouncedFoodQuery] = useState('')
  const [foodResults, setFoodResults] = useState<FoodResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Debounce food search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedFoodQuery(foodQuery)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [foodQuery])

  // Fetch food results
  const searchFoods = useCallback(async () => {
    if (!debouncedFoodQuery) {
      setFoodResults([])
      return
    }

    setSearchLoading(true)
    try {
      const token = localStorage.getItem('token')
      if (!token) return

      const res = await fetch(`/api/nutrition/foods?q=${encodeURIComponent(debouncedFoodQuery)}&limit=10`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (res.ok) {
        const data = await res.json()
        setFoodResults(data.foods || [])
      }
    } catch (error) {
      console.error('Failed to search foods:', error)
    } finally {
      setSearchLoading(false)
    }
  }, [debouncedFoodQuery])

  useEffect(() => {
    searchFoods()
  }, [searchFoods])

  // Focus search input when modal opens
  useEffect(() => {
    if (showFoodSearch && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [showFoodSearch])

  const addFoodAsIngredient = (food: FoodResult) => {
    const ingredient: RecipeIngredient = {
      foodId: food._id,
      name: food.name,
      amount: food.servingSize,
      unit: food.servingUnit,
      nutrition: {
        calories: food.nutrition.calories,
        protein: food.nutrition.protein,
        carbs: food.nutrition.carbs,
        fats: food.nutrition.fats
      }
    }

    setIngredients(prev => [...prev, ingredient])
    setShowFoodSearch(false)
    setFoodQuery('')
    setFoodResults([])
  }

  const addManualIngredient = () => {
    setIngredients(prev => [...prev, {
      name: '',
      amount: 1,
      unit: 'g',
      nutrition: { calories: 0, protein: 0, carbs: 0, fats: 0 }
    }])
  }

  const updateIngredient = (index: number, field: string, value: string | number) => {
    setIngredients(prev => {
      const updated = [...prev]
      if (field === 'name') updated[index].name = value as string
      else if (field === 'amount') updated[index].amount = Number(value) || 0
      else if (field === 'unit') updated[index].unit = value as string
      else if (field.startsWith('nutrition.')) {
        const nutrientKey = field.split('.')[1] as keyof RecipeIngredient['nutrition']
        updated[index].nutrition[nutrientKey] = Number(value) || 0
      }
      return updated
    })
  }

  const removeIngredient = (index: number) => {
    setIngredients(prev => prev.filter((_, i) => i !== index))
  }

  const addInstruction = () => {
    setInstructions(prev => [...prev, ''])
  }

  const updateInstruction = (index: number, value: string) => {
    setInstructions(prev => {
      const updated = [...prev]
      updated[index] = value
      return updated
    })
  }

  const removeInstruction = (index: number) => {
    if (instructions.length <= 1) return
    setInstructions(prev => prev.filter((_, i) => i !== index))
  }

  const moveInstruction = (index: number, direction: 'up' | 'down') => {
    setInstructions(prev => {
      const updated = [...prev]
      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= updated.length) return prev
      ;[updated[index], updated[newIndex]] = [updated[newIndex], updated[index]]
      return updated
    })
  }

  // Calculate nutrition totals
  const totalNutrition = ingredients.reduce(
    (acc, ing) => ({
      calories: acc.calories + ing.nutrition.calories,
      protein: acc.protein + ing.nutrition.protein,
      carbs: acc.carbs + ing.nutrition.carbs,
      fats: acc.fats + ing.nutrition.fats
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  )

  const perServing = {
    calories: servings > 0 ? Math.round((totalNutrition.calories / servings) * 10) / 10 : 0,
    protein: servings > 0 ? Math.round((totalNutrition.protein / servings) * 10) / 10 : 0,
    carbs: servings > 0 ? Math.round((totalNutrition.carbs / servings) * 10) / 10 : 0,
    fats: servings > 0 ? Math.round((totalNutrition.fats / servings) * 10) / 10 : 0
  }

  const handleSave = async () => {
    if (!name.trim()) return
    if (ingredients.length === 0) return

    setSaving(true)

    try {
      const token = localStorage.getItem('token')
      if (!token) {
        router.push('/login')
        return
      }

      const tags = tagsInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0)

      const cleanedInstructions = instructions.filter(i => i.trim().length > 0)

      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        servings,
        prepTime: prepTime ? Number(prepTime) : undefined,
        cookTime: cookTime ? Number(cookTime) : undefined,
        tags,
        ingredients,
        instructions: cleanedInstructions,
        isPublic: true,
        totalsPerServing: perServing
      }

      const res = await fetch('/api/nutrition/recipes', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })

      if (res.ok) {
        const data = await res.json()
        const recipeId = data.recipe?._id
        if (recipeId) {
          router.push(`/dashboard/nutrition/recipes/${recipeId}`)
        } else {
          router.push('/dashboard/nutrition/recipes')
        }
      }
    } catch (error) {
      console.error('Failed to create recipe:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageTransition className="pb-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3 sm:mb-6">
        <button
          onClick={() => router.push('/dashboard/nutrition/recipes')}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          <ArrowLeft className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Create Recipe</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Build a new recipe from ingredients</p>
        </div>
      </div>

      {/* Basic Info */}
      <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:mb-6">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Recipe Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., High-Protein Chicken Bowl"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-600 dark:focus:border-white dark:focus:ring-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the recipe..."
              rows={2}
              className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-600 dark:focus:border-white dark:focus:ring-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-white dark:focus:ring-white"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Servings</label>
              <input
                type="number"
                value={servings}
                onChange={(e) => setServings(Math.max(1, Number(e.target.value)))}
                min={1}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-white dark:focus:ring-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Prep Time (min)</label>
              <input
                type="number"
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                placeholder="10"
                min={0}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-600 dark:focus:border-white dark:focus:ring-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Cook Time (min)</label>
              <input
                type="number"
                value={cookTime}
                onChange={(e) => setCookTime(e.target.value)}
                placeholder="20"
                min={0}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-600 dark:focus:border-white dark:focus:ring-white"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Tags (comma-separated)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="high-protein, quick, meal-prep"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-600 dark:focus:border-white dark:focus:ring-white"
            />
            {tagsInput && (
              <div className="mt-2 flex flex-wrap gap-1">
                {tagsInput.split(',').map((tag, i) => tag.trim() && (
                  <span key={i} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {tag.trim()}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ingredients */}
      <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Ingredients</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowFoodSearch(true)}
              className="flex cursor-pointer items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              <Search className="h-3 w-3" />
              Search Food
            </button>
            <button
              onClick={addManualIngredient}
              className="flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Plus className="h-3 w-3" />
              Manual
            </button>
          </div>
        </div>

        {ingredients.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 py-8 dark:border-zinc-700">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No ingredients added yet</p>
            <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Search for foods or add manually</p>
          </div>
        ) : (
          <div className="space-y-3">
            {ingredients.map((ingredient, index) => (
              <div
                key={index}
                className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="mb-2 flex items-center justify-between">
                  <input
                    type="text"
                    value={ingredient.name}
                    onChange={(e) => updateIngredient(index, 'name', e.target.value)}
                    placeholder="Ingredient name"
                    className="flex-1 border-none bg-transparent text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-white dark:placeholder:text-zinc-600"
                  />
                  <button
                    onClick={() => removeIngredient(index)}
                    className="ml-2 cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-red-600 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-0.5 block text-[10px] uppercase text-zinc-400">Amount</label>
                    <input
                      type="number"
                      value={ingredient.amount}
                      onChange={(e) => updateIngredient(index, 'amount', e.target.value)}
                      min={0}
                      step="0.1"
                      className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] uppercase text-zinc-400">Unit</label>
                    <select
                      value={ingredient.unit}
                      onChange={(e) => updateIngredient(index, 'unit', e.target.value)}
                      className="w-full cursor-pointer rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-white"
                    >
                      {UNITS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] uppercase text-zinc-400">Calories</label>
                    <input
                      type="number"
                      value={ingredient.nutrition.calories}
                      onChange={(e) => updateIngredient(index, 'nutrition.calories', e.target.value)}
                      min={0}
                      className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-white"
                    />
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-0.5 block text-[10px] uppercase text-zinc-400">Protein (g)</label>
                    <input
                      type="number"
                      value={ingredient.nutrition.protein}
                      onChange={(e) => updateIngredient(index, 'nutrition.protein', e.target.value)}
                      min={0}
                      step="0.1"
                      className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] uppercase text-zinc-400">Carbs (g)</label>
                    <input
                      type="number"
                      value={ingredient.nutrition.carbs}
                      onChange={(e) => updateIngredient(index, 'nutrition.carbs', e.target.value)}
                      min={0}
                      step="0.1"
                      className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] uppercase text-zinc-400">Fats (g)</label>
                    <input
                      type="number"
                      value={ingredient.nutrition.fats}
                      onChange={(e) => updateIngredient(index, 'nutrition.fats', e.target.value)}
                      min={0}
                      step="0.1"
                      className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-white"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Running Totals */}
        {ingredients.length > 0 && (
          <div className="mt-4 rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Recipe Total</div>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div>
                <div className="font-bold text-blue-600">{Math.round(totalNutrition.protein)}g</div>
                <div className="text-zinc-500">Protein</div>
              </div>
              <div>
                <div className="font-bold text-green-600">{Math.round(totalNutrition.carbs)}g</div>
                <div className="text-zinc-500">Carbs</div>
              </div>
              <div>
                <div className="font-bold text-yellow-600">{Math.round(totalNutrition.fats)}g</div>
                <div className="text-zinc-500">Fats</div>
              </div>
              <div>
                <div className="font-bold text-zinc-900 dark:text-white">{Math.round(totalNutrition.calories)}</div>
                <div className="text-zinc-500">Calories</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Per Serving Summary */}
      {ingredients.length > 0 && (
        <div className="mb-4 grid grid-cols-4 gap-3 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-950 sm:mb-6">
          <div className="text-center">
            <div className="text-lg font-bold text-blue-600 sm:text-2xl">{perServing.protein}g</div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400">Protein/srv</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-600 sm:text-2xl">{perServing.carbs}g</div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400">Carbs/srv</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-yellow-600 sm:text-2xl">{perServing.fats}g</div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400">Fats/srv</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-zinc-900 dark:text-white sm:text-2xl">{perServing.calories}</div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400">Cal/srv</div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Instructions</h2>
          <button
            onClick={addInstruction}
            className="flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <Plus className="h-3 w-3" />
            Add Step
          </button>
        </div>

        <div className="space-y-2">
          {instructions.map((instruction, index) => (
            <div key={index} className="flex items-start gap-2">
              <span className="mt-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white dark:bg-white dark:text-black">
                {index + 1}
              </span>

              <textarea
                value={instruction}
                onChange={(e) => updateInstruction(index, e.target.value)}
                placeholder={`Step ${index + 1}...`}
                rows={2}
                className="flex-1 resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-600 dark:focus:border-white dark:focus:ring-white"
              />

              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveInstruction(index, 'up')}
                  disabled={index === 0}
                  className="cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => moveInstruction(index, 'down')}
                  disabled={index === instructions.length - 1}
                  className="cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => removeInstruction(index)}
                  disabled={instructions.length <= 1}
                  className="cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => router.push('/dashboard/nutrition/recipes')}
          className="flex-1 cursor-pointer rounded-lg border border-zinc-200 py-3 font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim() || ingredients.length === 0}
          className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-zinc-900 py-3 font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Recipe'}
        </button>
      </div>

      {/* Food Search Modal */}
      {showFoodSearch && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => {
            setShowFoodSearch(false)
            setFoodQuery('')
            setFoodResults([])
          }}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-6 dark:bg-zinc-900 sm:rounded-2xl"
            style={{ WebkitOverflowScrolling: 'touch' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Search Foods</h2>
              <button
                onClick={() => {
                  setShowFoodSearch(false)
                  setFoodQuery('')
                  setFoodResults([])
                }}
                className="cursor-pointer rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={foodQuery}
                onChange={(e) => setFoodQuery(e.target.value)}
                placeholder="Search for a food..."
                className="w-full rounded-lg border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-600 dark:focus:border-white dark:focus:ring-white"
              />
            </div>

            {searchLoading && (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800">
                    <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700" />
                    <div className="mt-2 h-3 w-48 rounded bg-zinc-200 dark:bg-zinc-700" />
                  </div>
                ))}
              </div>
            )}

            {!searchLoading && foodResults.length === 0 && debouncedFoodQuery && (
              <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                No foods found for &quot;{debouncedFoodQuery}&quot;
              </p>
            )}

            {!searchLoading && foodResults.length > 0 && (
              <div className="space-y-1">
                {foodResults.map((food) => (
                  <button
                    key={food._id}
                    onClick={() => addFoodAsIngredient(food)}
                    className="w-full cursor-pointer rounded-lg p-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-white">{food.name}</p>
                        {food.brand && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-500">{food.brand}</p>
                        )}
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {food.servingSize}{food.servingUnit} &middot; {food.nutrition.calories} cal &middot;
                          P:{food.nutrition.protein}g C:{food.nutrition.carbs}g F:{food.nutrition.fats}g
                        </p>
                      </div>
                      <Plus className="h-4 w-4 shrink-0 text-zinc-400" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-700">
              <button
                onClick={() => {
                  setShowFoodSearch(false)
                  setFoodQuery('')
                  setFoodResults([])
                  addManualIngredient()
                }}
                className="w-full cursor-pointer rounded-lg border border-dashed border-zinc-300 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
              >
                + Add ingredient manually instead
              </button>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  )
}
