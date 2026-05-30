"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Plus, Clock, Star, ChefHat, Loader2, Globe } from 'lucide-react'
import type { IFoodEntry } from '@/models/NutritionLog'

interface FoodSearchModalProps {
  isOpen: boolean
  mealType: string
  onClose: () => void
  onSelectFood: (food: IFoodEntry) => void
}

interface AlternateServing {
  label: string
  multiplier: number
}

interface FoodResult {
  _id: string
  name: string
  brand?: string
  servingSize: number
  servingUnit: string
  alternateServings?: AlternateServing[]
  nutrition: {
    calories: number
    protein: number
    carbs: number
    fats: number
    fiber?: number
    sugar?: number
    sodium?: number
  }
  source?: 'custom' | 'openfoodfacts'
  image_url?: string
  nutriscore_grade?: string
}

type TabId = 'all' | 'recent' | 'frequent' | 'custom'

const tabs: { id: TabId; label: string; Icon: typeof Search }[] = [
  { id: 'all', label: 'All', Icon: Search },
  { id: 'recent', label: 'Recent', Icon: Clock },
  { id: 'frequent', label: 'Frequent', Icon: Star },
  { id: 'custom', label: 'Custom', Icon: ChefHat },
]

export default function FoodSearchModal({
  isOpen,
  mealType,
  onClose,
  onSelectFood,
}: FoodSearchModalProps) {
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<TabId>('all')
  const [results, setResults] = useState<FoodResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedFood, setSelectedFood] = useState<FoodResult | null>(null)
  const [servings, setServings] = useState('1')
  // Index into serving options: 0 = default serving, 1+ = alternate servings
  const [selectedServingIdx, setSelectedServingIdx] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<NodeJS.Timeout>(undefined)

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    } else {
      setQuery('')
      setResults([])
      setSelectedFood(null)
      setServings('1')
      setSelectedServingIdx(0)
      setActiveTab('all')
    }
  }, [isOpen])

  const fetchResults = useCallback(
    async (searchQuery: string, tab: TabId) => {
      setLoading(true)
      try {
        const token = localStorage.getItem('token')
        const headers: HeadersInit = {}
        if (token) headers['Authorization'] = `Bearer ${token}`

        let url: string
        if (tab === 'recent') {
          url = '/api/nutrition/foods/recent'
        } else if (tab === 'frequent') {
          url = '/api/nutrition/foods/frequent'
        } else if (tab === 'custom') {
          url = `/api/nutrition/foods?q=${encodeURIComponent(searchQuery)}&custom=true`
        } else {
          url = `/api/nutrition/foods?q=${encodeURIComponent(searchQuery)}`
        }

        const res = await fetch(url, { headers })
        if (res.ok) {
          const data = await res.json()
          setResults(data.foods || data || [])
        } else {
          setResults([])
        }
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    },
    []
  )

  // Debounced search for "all" and "custom" tabs
  useEffect(() => {
    if (!isOpen) return

    if (activeTab === 'recent' || activeTab === 'frequent') {
      fetchResults('', activeTab)
      return
    }

    if (query.trim().length < 2) {
      setResults([])
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchResults(query, activeTab)
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, activeTab, isOpen, fetchResults])

  // Build serving options for the selected food
  const servingOptions = useMemo(() => {
    if (!selectedFood) return []

    const options: { label: string; multiplier: number; servingSize: number; servingUnit: string }[] = [
      {
        label: `${selectedFood.servingSize} ${selectedFood.servingUnit}`,
        multiplier: 1,
        servingSize: selectedFood.servingSize,
        servingUnit: selectedFood.servingUnit,
      },
    ]

    if (selectedFood.alternateServings) {
      for (const alt of selectedFood.alternateServings) {
        options.push({
          label: alt.label,
          multiplier: alt.multiplier,
          servingSize: Math.round(selectedFood.servingSize * alt.multiplier * 10) / 10,
          servingUnit: selectedFood.servingUnit,
        })
      }
    }

    return options
  }, [selectedFood])

  // Current serving option
  const currentServing = servingOptions[selectedServingIdx] || servingOptions[0]
  const servingMultiplier = currentServing?.multiplier ?? 1

  const handleAddFood = () => {
    if (!selectedFood || !currentServing) return

    const numServings = Number(servings) || 1
    const mult = servingMultiplier

    // Scale nutrition by the serving option multiplier
    const scaledNutrition = {
      calories: Math.round(selectedFood.nutrition.calories * mult * 10) / 10,
      protein: Math.round(selectedFood.nutrition.protein * mult * 10) / 10,
      carbs: Math.round(selectedFood.nutrition.carbs * mult * 10) / 10,
      fats: Math.round(selectedFood.nutrition.fats * mult * 10) / 10,
      fiber: selectedFood.nutrition.fiber != null
        ? Math.round(selectedFood.nutrition.fiber * mult * 10) / 10
        : undefined,
      sugar: selectedFood.nutrition.sugar != null
        ? Math.round(selectedFood.nutrition.sugar * mult * 10) / 10
        : undefined,
      sodium: selectedFood.nutrition.sodium != null
        ? Math.round(selectedFood.nutrition.sodium * mult * 10000) / 10000
        : undefined,
    }

    const entry: IFoodEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: selectedFood.name,
      brand: selectedFood.brand,
      servingSize: currentServing.servingSize,
      servingUnit: currentServing.servingUnit,
      servings: numServings,
      nutrition: scaledNutrition,
    }

    onSelectFood(entry)
    setSelectedFood(null)
    setServings('1')
    setSelectedServingIdx(0)
  }

  const mealLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1)

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-900 sm:items-center sm:justify-center sm:bg-black/60 sm:backdrop-blur-sm sm:p-4"
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="flex h-full w-full flex-col sm:h-[85vh] sm:max-h-[700px] sm:max-w-lg sm:rounded-2xl sm:bg-white sm:shadow-2xl sm:dark:bg-zinc-900"
          >
            {/* Header */}
            <div className="shrink-0 border-b border-zinc-200 p-4 dark:border-zinc-800">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                  Add to {mealLabel}
                </h2>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search foods..."
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500 dark:focus:border-zinc-600 dark:focus:bg-zinc-800"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Tabs */}
              <div className="mt-3 flex gap-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                    }`}
                  >
                    <tab.Icon className="h-3 w-3" />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    Searching...
                  </span>
                </div>
              ) : results.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 px-4">
                  <Search className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
                    {(activeTab === 'all' || activeTab === 'custom') && query.length < 2
                      ? 'Type at least 2 characters to search'
                      : 'No foods found'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {results.map((food) => (
                    <div key={food._id}>
                      <button
                        onClick={() => {
                          if (selectedFood?._id === food._id) {
                            setSelectedFood(null)
                          } else {
                            setSelectedFood(food)
                            setServings('1')
                            setSelectedServingIdx(0)
                          }
                        }}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                          selectedFood?._id === food._id
                            ? 'bg-blue-50 dark:bg-blue-900/20'
                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                              {food.name}
                            </p>
                            {food.source === 'openfoodfacts' && (
                              <Globe className="h-3 w-3 shrink-0 text-emerald-500" title="Open Food Facts" />
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                            {food.brand && (
                              <span className="text-zinc-400 dark:text-zinc-500">
                                {food.brand} &middot;{' '}
                              </span>
                            )}
                            {food.servingSize} {food.servingUnit}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                          {food.nutrition.calories} cal
                        </span>
                      </button>

                      {/* Serving size picker (inline) */}
                      <AnimatePresence>
                        {selectedFood?._id === food._id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                              {/* Serving option selector (shown when alternate servings exist) */}
                              {servingOptions.length > 1 && (
                                <div className="mb-2.5 flex flex-wrap gap-1.5">
                                  {servingOptions.map((opt, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => setSelectedServingIdx(idx)}
                                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                        selectedServingIdx === idx
                                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                                          : 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-600'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              )}

                              <div className="flex items-center gap-3">
                                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                  Servings
                                </label>
                                <input
                                  type="number"
                                  min="0.25"
                                  step="0.25"
                                  value={servings}
                                  onChange={(e) => setServings(e.target.value)}
                                  className="w-20 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-center text-sm font-medium text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:focus:border-blue-400"
                                />
                                <div className="flex-1 text-right">
                                  <p className="text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                                      {Math.round(food.nutrition.calories * servingMultiplier * (Number(servings) || 1))} cal
                                    </span>
                                  </p>
                                  <p className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                                    P: {Math.round(food.nutrition.protein * servingMultiplier * (Number(servings) || 1))}g
                                    {' '}&middot;{' '}
                                    C: {Math.round(food.nutrition.carbs * servingMultiplier * (Number(servings) || 1))}g
                                    {' '}&middot;{' '}
                                    F: {Math.round(food.nutrition.fats * servingMultiplier * (Number(servings) || 1))}g
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={handleAddFood}
                                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-900 py-2 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                              >
                                <Plus className="h-4 w-4" />
                                Add to {mealLabel}
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
