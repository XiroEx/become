"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Plus, Clock, Star, ChefHat, Loader2, Globe, ScanBarcode } from 'lucide-react'
import { useLockScroll } from '@/lib/useLockScroll'
import type { IFoodEntry } from '@/models/NutritionLog'
import BarcodeScanner from './BarcodeScanner'

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

interface FoodSearchModalProps {
  isOpen: boolean
  mealType: MealType
  onClose: () => void
  onSelectFood: (food: IFoodEntry, mealType: MealType) => void
  autoScan?: boolean
}

interface AlternateServing {
  label: string
  multiplier: number
}

interface FoodNutrition {
  calories: number
  protein: number
  carbs: number
  fats: number
  fiber?: number
  sugar?: number
  sodium?: number
}

interface FoodVariant {
  _id?: string
  name: string
  isDefault?: boolean
  servingSize: number
  servingUnit: string
  alternateServings?: AlternateServing[]
  nutrition: FoodNutrition
}

interface FoodResult {
  _id: string
  name: string
  brand?: string
  servingSize: number
  servingUnit: string
  alternateServings?: AlternateServing[]
  nutrition: FoodNutrition
  source?: 'custom' | 'manual' | 'openfoodfacts' | 'usda'
  image_url?: string
  nutriscore_grade?: string
  variants?: FoodVariant[]
}

// 24-char hex ObjectId — anything else is a synthetic external id (usda-/off-/etc.)
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i

function isObjectIdString(id: string): boolean {
  return OBJECT_ID_RE.test(id)
}

function pickDefaultVariantIdx(variants: FoodVariant[] | undefined): number {
  if (!variants || variants.length === 0) return 0
  const idx = variants.findIndex(v => v.isDefault)
  return idx >= 0 ? idx : 0
}

type TabId = 'all' | 'recent' | 'frequent' | 'custom'

const tabs: { id: TabId; label: string; Icon: typeof Search }[] = [
  { id: 'all', label: 'All', Icon: Search },
  { id: 'recent', label: 'Recent', Icon: Clock },
  { id: 'frequent', label: 'Frequent', Icon: Star },
  { id: 'custom', label: 'Custom', Icon: ChefHat },
]

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

export default function FoodSearchModal({
  isOpen,
  mealType,
  onClose,
  onSelectFood,
  autoScan = false,
}: FoodSearchModalProps) {
  const [currentMealType, setCurrentMealType] = useState<MealType>(mealType)
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<TabId>('all')
  const [results, setResults] = useState<FoodResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedFood, setSelectedFood] = useState<FoodResult | null>(null)
  const [servings, setServings] = useState('1')
  // Index into serving options: 0 = default serving, 1+ = alternate servings
  const [selectedServingIdx, setSelectedServingIdx] = useState(0)
  const [inputMode, setInputMode] = useState<'servings' | 'grams'>('servings')
  const [customGrams, setCustomGrams] = useState('100')
  // Index into selectedFood.variants — defaults to the variant marked isDefault.
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0)
  // Loading state for the import-on-pick network call.
  const [adding, setAdding] = useState(false)

  // Resolve the active variant for a food + variant index.
  const getActiveVariant = (food: FoodResult, variantIdx: number): FoodVariant => {
    if (food.variants && food.variants.length > 0) {
      return food.variants[variantIdx] ?? food.variants[0]
    }
    // Synthesize a single-variant view from the flat shape (external results).
    return {
      name: 'Default',
      isDefault: true,
      servingSize: food.servingSize,
      servingUnit: food.servingUnit,
      alternateServings: food.alternateServings,
      nutrition: food.nutrition,
    }
  }

  // Returns the gram amount of the first alternate (label) serving, or the base serving size.
  // Used to pre-fill the custom weight input with the actual label serving rather than 100g.
  const getLabelServingGrams = (food: FoodResult, variantIdx = 0): string => {
    const v = getActiveVariant(food, variantIdx)
    if (v.alternateServings && v.alternateServings.length > 0) {
      return String(Math.round(v.alternateServings[0].multiplier * v.servingSize))
    }
    return String(v.servingSize)
  }

  // Barcode scanner state
  const [scannerOpen, setScannerOpen] = useState(false)
  const [barcodeLoading, setBarcodeLoading] = useState(false)
  const [barcodeError, setBarcodeError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<NodeJS.Timeout>(undefined)

  useLockScroll(isOpen)

  // Sync state on open/close
  useEffect(() => {
    if (isOpen) {
      setCurrentMealType(mealType)
      setTimeout(() => inputRef.current?.focus(), 100)
      if (autoScan) {
        setTimeout(() => { setBarcodeError(null); setScannerOpen(true) }, 350)
      }
    } else {
      setQuery('')
      setResults([])
      setSelectedFood(null)
      setServings('1')
      setSelectedServingIdx(0)
      setSelectedVariantIdx(0)
      setInputMode('servings')
      setCustomGrams('100')
      setActiveTab('all')
      setScannerOpen(false)
      setBarcodeError(null)
      setAdding(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const handleBarcodeDetected = useCallback(async (code: string) => {
    setScannerOpen(false)
    setBarcodeLoading(true)
    setBarcodeError(null)
    try {
      const token = localStorage.getItem('token')
      const headers: HeadersInit = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`/api/nutrition/foods/barcode?code=${encodeURIComponent(code)}`, { headers })
      if (res.ok) {
        const data = await res.json()
        if (data.food) {
          const variantIdx = pickDefaultVariantIdx(data.food.variants)
          const activeVariant = getActiveVariant(data.food, variantIdx)
          setSelectedFood(data.food)
          setSelectedVariantIdx(variantIdx)
          setServings('1')
          setSelectedServingIdx(activeVariant.alternateServings?.length ? 1 : 0)
          setInputMode('servings')
          setCustomGrams(getLabelServingGrams(data.food, variantIdx))
          setResults([data.food])
        } else {
          setBarcodeError(`No food found for barcode ${code}. Try searching by name.`)
        }
      } else {
        setBarcodeError('Barcode lookup failed. Try searching by name.')
      }
    } catch {
      setBarcodeError('Barcode lookup failed. Try searching by name.')
    } finally {
      setBarcodeLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Active variant for the currently selected food (or null)
  const activeVariant = useMemo<FoodVariant | null>(() => {
    if (!selectedFood) return null
    return getActiveVariant(selectedFood, selectedVariantIdx)
  }, [selectedFood, selectedVariantIdx])

  // Build serving options for the active variant
  const servingOptions = useMemo(() => {
    if (!activeVariant) return []

    const options: { label: string; multiplier: number; servingSize: number; servingUnit: string }[] = [
      {
        label: `${activeVariant.servingSize} ${activeVariant.servingUnit}`,
        multiplier: 1,
        servingSize: activeVariant.servingSize,
        servingUnit: activeVariant.servingUnit,
      },
    ]

    if (activeVariant.alternateServings) {
      for (const alt of activeVariant.alternateServings) {
        options.push({
          label: alt.label,
          multiplier: alt.multiplier,
          servingSize: Math.round(activeVariant.servingSize * alt.multiplier * 10) / 10,
          servingUnit: activeVariant.servingUnit,
        })
      }
    }

    return options
  }, [activeVariant])

  // Current serving option
  const currentServing = servingOptions[selectedServingIdx] || servingOptions[0]
  const servingMultiplier = currentServing?.multiplier ?? 1

  const isWeightBased = activeVariant?.servingUnit === 'g' || activeVariant?.servingUnit === 'oz'
  const servingSizeInGrams = activeVariant
    ? activeVariant.servingUnit === 'oz'
      ? activeVariant.servingSize * 28.3495
      : activeVariant.servingSize
    : 1

  // Effective multiplier and servings count for the preview
  const effectiveServings = inputMode === 'grams'
    ? (Number(customGrams) || 0) / servingSizeInGrams
    : (Number(servings) || 1) * servingMultiplier

  // Copy-on-pick: external (usda-/off-) results get persisted to our Food
  // collection before being logged. Returns the resolved foodId + variants.
  const importExternalIfNeeded = async (
    food: FoodResult,
  ): Promise<{ foodId: string; variants?: FoodVariant[] }> => {
    const id = String(food._id || '')

    // Already a real Food doc — no work to do.
    if (isObjectIdString(id)) {
      return { foodId: id, variants: food.variants }
    }

    // Determine source + externalId from synthetic prefix
    let source: 'usda' | 'openfoodfacts' | null = null
    let externalId = ''
    if (id.startsWith('usda-')) {
      source = 'usda'
      externalId = id.slice('usda-'.length)
    } else if (id.startsWith('off-')) {
      source = 'openfoodfacts'
      externalId = id.slice('off-'.length)
    }

    if (!source || !externalId) {
      // Unrecognized id shape — return as-is (graceful degradation)
      return { foodId: id, variants: food.variants }
    }

    try {
      const token = localStorage.getItem('token')
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch('/api/nutrition/foods/import', {
        method: 'POST',
        headers,
        body: JSON.stringify({ source, externalId }),
      })
      if (!res.ok) {
        console.warn(`[FoodSearchModal] Import failed (${res.status}) for ${id} — proceeding without persisted Food`)
        return { foodId: id, variants: food.variants }
      }
      const data = await res.json()
      const importedFood = data?.food
      if (importedFood?._id) {
        return {
          foodId: String(importedFood._id),
          variants: importedFood.variants ?? food.variants,
        }
      }
      return { foodId: id, variants: food.variants }
    } catch (err) {
      console.warn('[FoodSearchModal] Import network error — proceeding without persisted Food', err)
      return { foodId: id, variants: food.variants }
    }
  }

  const handleAddFood = async () => {
    if (!selectedFood || !currentServing || !activeVariant || adding) return

    setAdding(true)
    try {
      const { foodId, variants: importedVariants } = await importExternalIfNeeded(selectedFood)

      // After import the imported food's variants[] is authoritative — match by name
      // to find the equivalent variantId (single-variant external foods just take [0]).
      let resolvedVariantId: string | undefined
      let resolvedVariantName: string | undefined = activeVariant.name
      if (importedVariants && importedVariants.length > 0) {
        const match = importedVariants.find(v => v.name === activeVariant.name) ?? importedVariants[0]
        resolvedVariantId = match._id ? String(match._id) : undefined
        resolvedVariantName = match.name
      } else if (activeVariant._id) {
        resolvedVariantId = String(activeVariant._id)
      }

      const baseEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        foodId: isObjectIdString(foodId) ? foodId : undefined,
        variantId: resolvedVariantId,
        variantName: resolvedVariantName,
        name: selectedFood.name,
        brand: selectedFood.brand,
      }

      let entry: IFoodEntry

      if (inputMode === 'grams' && isWeightBased) {
        const gramsServings = (Number(customGrams) || 1) / servingSizeInGrams
        // Store per-serving nutrition (unscaled) with fractional servings count
        entry = {
          ...baseEntry,
          servingSize: activeVariant.servingSize,
          servingUnit: activeVariant.servingUnit,
          servings: gramsServings,
          nutrition: {
            calories: Math.round(activeVariant.nutrition.calories * 10) / 10,
            protein:  Math.round(activeVariant.nutrition.protein  * 10) / 10,
            carbs:    Math.round(activeVariant.nutrition.carbs    * 10) / 10,
            fats:     Math.round(activeVariant.nutrition.fats     * 10) / 10,
            fiber:  activeVariant.nutrition.fiber  != null ? Math.round(activeVariant.nutrition.fiber  * 10) / 10 : undefined,
            sugar:  activeVariant.nutrition.sugar  != null ? Math.round(activeVariant.nutrition.sugar  * 10) / 10 : undefined,
            sodium: activeVariant.nutrition.sodium != null ? Math.round(activeVariant.nutrition.sodium * 1000) / 1000 : undefined,
          },
        }
      } else {
        const mult = servingMultiplier
        // Scale nutrition by the serving option multiplier (alt serving sizes)
        entry = {
          ...baseEntry,
          servingSize: currentServing.servingSize,
          servingUnit: currentServing.servingUnit,
          servings: Number(servings) || 1,
          nutrition: {
            calories: Math.round(activeVariant.nutrition.calories * mult * 10) / 10,
            protein:  Math.round(activeVariant.nutrition.protein  * mult * 10) / 10,
            carbs:    Math.round(activeVariant.nutrition.carbs    * mult * 10) / 10,
            fats:     Math.round(activeVariant.nutrition.fats     * mult * 10) / 10,
            fiber:  activeVariant.nutrition.fiber  != null ? Math.round(activeVariant.nutrition.fiber  * mult * 10) / 10 : undefined,
            sugar:  activeVariant.nutrition.sugar  != null ? Math.round(activeVariant.nutrition.sugar  * mult * 10) / 10 : undefined,
            sodium: activeVariant.nutrition.sodium != null ? Math.round(activeVariant.nutrition.sodium * mult * 1000) / 1000 : undefined,
          },
        }
      }

      onSelectFood(entry, currentMealType)
      setSelectedFood(null)
      setServings('1')
      setSelectedServingIdx(0)
      setSelectedVariantIdx(0)
      setInputMode('servings')
      setCustomGrams('100')
    } finally {
      setAdding(false)
    }
  }

  const mealLabel = currentMealType.charAt(0).toUpperCase() + currentMealType.slice(1)

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-900 sm:items-center sm:justify-center sm:bg-black/60 sm:backdrop-blur-sm sm:p-4 touch-none"
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
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
                  Add Food
                </h2>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { setBarcodeError(null); setScannerOpen(true) }}
                    data-testid="barcode-scan-btn"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    aria-label="Scan barcode"
                  >
                    <ScanBarcode className="h-5 w-5" />
                  </button>
                  <button
                    onClick={onClose}
                    data-testid="food-search-close"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Meal type picker */}
              <div className="mb-3 flex gap-1.5">
                {MEAL_TYPES.map(type => (
                  <button
                    key={type}
                    onClick={() => setCurrentMealType(type)}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize transition-colors ${
                      currentMealType === type
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                        : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {type}
                  </button>
                ))}
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

              {/* Barcode loading / error feedback */}
              {barcodeLoading && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">Looking up barcode…</span>
                </div>
              )}
              {barcodeError && !barcodeLoading && (
                <div
                  data-testid="barcode-error"
                  className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 dark:bg-red-900/20"
                >
                  <span className="text-xs text-red-600 dark:text-red-400">{barcodeError}</span>
                  <button
                    onClick={() => setBarcodeError(null)}
                    className="shrink-0 text-red-400 hover:text-red-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

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
            <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                            const variantIdx = pickDefaultVariantIdx(food.variants)
                            const av = getActiveVariant(food, variantIdx)
                            setSelectedFood(food)
                            setSelectedVariantIdx(variantIdx)
                            setServings('1')
                            // Pre-select the label serving (index 1) when available,
                            // so the default shown is what's on the nutrition label, not 100g.
                            setSelectedServingIdx(av.alternateServings?.length ? 1 : 0)
                            setInputMode('servings')
                            setCustomGrams(getLabelServingGrams(food, variantIdx))
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
                            {food.source === 'usda' && (
                              <span title="USDA FoodData Central" className="shrink-0">
                                <Globe
                                  className="h-3 w-3 text-green-500"
                                  aria-label="USDA FoodData Central"
                                />
                              </span>
                            )}
                            {food.source === 'openfoodfacts' && (
                              <span title="Open Food Facts" className="shrink-0">
                                <Globe
                                  className="h-3 w-3 text-blue-500"
                                  aria-label="Open Food Facts"
                                />
                              </span>
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
                              {/* Variant picker — only shown when a food has >1 variant */}
                              {selectedFood?._id === food._id && food.variants && food.variants.length > 1 && (
                                <div className="mb-2.5">
                                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                    Preparation
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {food.variants.map((variant, vIdx) => {
                                      const isActive = selectedVariantIdx === vIdx
                                      return (
                                        <button
                                          key={variant._id ?? vIdx}
                                          onClick={() => {
                                            setSelectedVariantIdx(vIdx)
                                            setServings('1')
                                            setSelectedServingIdx(variant.alternateServings?.length ? 1 : 0)
                                            setCustomGrams(getLabelServingGrams(food, vIdx))
                                          }}
                                          className={`flex flex-col items-start gap-0.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                                            isActive
                                              ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                                              : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600'
                                          }`}
                                        >
                                          <span className="font-semibold">{variant.name}</span>
                                          <span className={`text-[10px] tabular-nums ${isActive ? 'opacity-80' : 'opacity-70'}`}>
                                            {Math.round(variant.nutrition.calories)} cal
                                            {' · '}
                                            {Math.round(variant.nutrition.protein * 10) / 10}g protein
                                          </span>
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Servings / Grams toggle for weight-based foods */}
                              {selectedFood?._id === food._id && (activeVariant?.servingUnit === 'g' || activeVariant?.servingUnit === 'oz') && (
                                <div className="mb-2.5 flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
                                  <button
                                    onClick={() => setInputMode('servings')}
                                    className={`flex-1 rounded-md py-1 text-xs font-semibold transition-colors ${
                                      inputMode === 'servings'
                                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                                    }`}
                                  >
                                    Servings
                                  </button>
                                  <button
                                    onClick={() => setInputMode('grams')}
                                    className={`flex-1 rounded-md py-1 text-xs font-semibold transition-colors ${
                                      inputMode === 'grams'
                                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                                    }`}
                                  >
                                    Custom weight (g)
                                  </button>
                                </div>
                              )}

                              {/* Serving option selector (shown in servings mode when alternate servings exist) */}
                              {inputMode === 'servings' && servingOptions.length > 1 && (
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
                                {inputMode === 'grams' ? (
                                  <>
                                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Grams</label>
                                    <input
                                      type="number"
                                      min="1"
                                      step="1"
                                      value={customGrams}
                                      onChange={(e) => setCustomGrams(e.target.value)}
                                      className="w-20 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-center text-sm font-medium text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:focus:border-blue-400"
                                    />
                                  </>
                                ) : (
                                  <>
                                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Servings</label>
                                    <input
                                      type="number"
                                      min="0.25"
                                      step="0.25"
                                      value={servings}
                                      onChange={(e) => setServings(e.target.value)}
                                      className="w-20 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-center text-sm font-medium text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:focus:border-blue-400"
                                    />
                                  </>
                                )}
                                <div className="flex-1 text-right">
                                  <p className="text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                                      {Math.round((activeVariant?.nutrition.calories ?? 0) * effectiveServings)} cal
                                    </span>
                                  </p>
                                  <p className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                                    P: {Math.round((activeVariant?.nutrition.protein ?? 0) * effectiveServings)}g
                                    {' '}&middot;{' '}
                                    C: {Math.round((activeVariant?.nutrition.carbs ?? 0) * effectiveServings)}g
                                    {' '}&middot;{' '}
                                    F: {Math.round((activeVariant?.nutrition.fats ?? 0) * effectiveServings)}g
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={handleAddFood}
                                disabled={adding}
                                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-900 py-2 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-60 disabled:cursor-wait dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                              >
                                {adding ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Adding…
                                  </>
                                ) : (
                                  <>
                                    <Plus className="h-4 w-4" />
                                    Add to {mealLabel}
                                  </>
                                )}
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

      {/* Barcode scanner overlay — rendered outside the modal so it covers the full screen */}
      {scannerOpen && (
        <BarcodeScanner
          onClose={() => setScannerOpen(false)}
          onDetected={handleBarcodeDetected}
        />
      )}
    </AnimatePresence>
  )
}
