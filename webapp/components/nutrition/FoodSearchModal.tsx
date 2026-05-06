"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Plus, Clock, Star, Loader2, Globe, ScanBarcode, Tag as TagIcon, ChevronDown, Check, Bookmark, Trash2, ChefHat } from 'lucide-react'
import { useLockScroll } from '@/lib/useLockScroll'
import type { IFoodEntry } from '@/models/NutritionLog'
import { getToken } from '@/lib/clientAuth'
import BarcodeScanner from './BarcodeScanner'
import MealApplySheet from '@/components/meals/MealApplySheet'

interface FoodSearchModalProps {
  isOpen: boolean
  // Current tag the food will be added under. When omitted, the modal hides
  // the tag picker entirely (used in "meal building" mode).
  currentTag?: string
  // Available tags for the picker. Defaults + user tags are passed by the page.
  availableTags?: { defaults: string[]; userTags: string[] }
  // Whether to show the tag picker. Default true when currentTag is provided.
  showTagPicker?: boolean
  // The date the user is currently viewing in the nutrition page. The custom
  // time picker uses this date as its "day" — the picker only sets the time.
  // Defaults to today when omitted.
  viewedDate?: Date
  onClose: () => void
  // Tag is optional — meal-building flow ignores it.
  // loggedAt (ISO string) is optional — passed when user explicitly picks a custom time.
  onSelectFood: (food: IFoodEntry, tag?: string, loggedAt?: string) => void
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
  displayLabel?: string
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
  isSaved?: boolean
}

interface MealResult {
  _id: string
  name: string
  description?: string
  imageUrl?: string
  tags?: string[]
  items?: { _id?: string }[]
  totalNutrition?: {
    calories: number
    protein: number
    carbs: number
    fats: number
  }
  recipe?: { servings?: number }
  isVerified?: boolean
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

function titleCaseTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-')
}

type TabId = 'all' | 'mine' | 'recent' | 'frequent'

const tabs: { id: TabId; label: string; Icon: typeof Search }[] = [
  { id: 'all', label: 'All', Icon: Search },
  { id: 'mine', label: 'My Foods', Icon: Bookmark },
  { id: 'recent', label: 'Recent', Icon: Clock },
  { id: 'frequent', label: 'Frequent', Icon: Star },
]

// ── Date+time picker helpers ─────────────────────────────────────────────────

// Format a Date to "yyyy-MM-ddTHH:mm" in local timezone — matches the value
// shape <input type="datetime-local"> emits.
function dateToDateTimeInputValue(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

// Combine a viewed-day Date with an "HH:mm" string — used as the default
// datetime when the user first opens the picker.
function combineDateAndTime(base: Date, timeOnly: { hours: number; minutes: number }): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), timeOnly.hours, timeOnly.minutes, 0, 0)
}

// Render datetime-local "yyyy-MM-ddTHH:mm" as a friendly label.
// Same day → "11:30 PM". Yesterday/tomorrow → "Yesterday 11:30 PM". Else → "May 2, 11:30 PM".
function formatDateTimeDisplay(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return value
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  const h = Number(m[4])
  const mi = Number(m[5])
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  const time = `${h12}:${String(mi).padStart(2, '0')} ${ampm}`

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((startOfDate.getTime() - startOfToday.getTime()) / 86_400_000)

  if (diffDays === 0) return time
  if (diffDays === -1) return `Yesterday ${time}`
  if (diffDays === 1) return `Tomorrow ${time}`
  const monthName = date.toLocaleString('en-US', { month: 'short' })
  return `${monthName} ${date.getDate()}, ${time}`
}

// Convert a "yyyy-MM-ddTHH:mm" datetime-local string to a UTC ISO string in local TZ.
function buildLocalIsoFromDateTime(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return new Date().toISOString()
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, 0)
  return d.toISOString()
}

export default function FoodSearchModal({
  isOpen,
  currentTag,
  availableTags,
  showTagPicker,
  viewedDate,
  onClose,
  onSelectFood,
  autoScan = false,
}: FoodSearchModalProps) {
  const tagPickerEnabled = showTagPicker ?? Boolean(currentTag)
  const [activeTag, setActiveTag] = useState<string>(currentTag ?? 'snack')
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const [customTagInput, setCustomTagInput] = useState('')

  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<TabId>('all')
  const [results, setResults] = useState<FoodResult[]>([])
  const [mealResults, setMealResults] = useState<MealResult[]>([])
  const [mealsLoading, setMealsLoading] = useState(false)
  const [mealsExpanded, setMealsExpanded] = useState(true)
  const [foodsExpanded, setFoodsExpanded] = useState(true)
  const [applyMeal, setApplyMeal] = useState<MealResult | null>(null)
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
  // Custom logged-at as "yyyy-MM-ddTHH:mm" (datetime-local input shape) — null
  // means "Now". Lets users backdate to any day, including yesterday / earlier.
  const [customTime, setCustomTime] = useState<string | null>(null)
  // When true, render the inline <input type="datetime-local"> instead of just the pill.
  const [timeEditOpen, setTimeEditOpen] = useState(false)

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

  // Set of foodIds (real ObjectId strings) the user has saved.
  // Source of truth for the bookmark icon — independently of fetched results.
  const [savedFoodIds, setSavedFoodIds] = useState<Set<string>>(new Set())
  // Result-row id (food._id from the result, may be synthetic) currently being toggled
  const [savingRowId, setSavingRowId] = useState<string | null>(null)
  // Transient toast for save/unsave feedback
  const [saveToast, setSaveToast] = useState<string | null>(null)
  const toastTimerRef = useRef<NodeJS.Timeout>(undefined)

  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<NodeJS.Timeout>(undefined)

  useLockScroll(isOpen)

  // Sync state on open/close
  useEffect(() => {
    if (isOpen) {
      setActiveTag(currentTag ?? 'snack')
      setTimeout(() => inputRef.current?.focus(), 100)
      if (autoScan) {
        setTimeout(() => { setBarcodeError(null); setScannerOpen(true) }, 350)
      }
    } else {
      setQuery('')
      setResults([])
      setMealResults([])
      setMealsExpanded(true)
      setFoodsExpanded(true)
      setApplyMeal(null)
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
      setTagDropdownOpen(false)
      setCustomTagInput('')
      setSaveToast(null)
      setCustomTime(null)
      setTimeEditOpen(false)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Fetch the user's saved-food id set on open so we know which results to flag,
  // even before the first server response carries `isSaved`.
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    ;(async () => {
      try {
        const token = getToken()
        const headers: HeadersInit = {}
        if (token) headers['Authorization'] = `Bearer ${token}`
        const res = await fetch('/api/me/foods', { headers })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        const ids = new Set<string>(
          (data.foods || []).map((f: { _id: string }) => String(f._id)).filter(Boolean)
        )
        setSavedFoodIds(ids)
      } catch {
        // best-effort
      }
    })()
    return () => { cancelled = true }
  }, [isOpen])

  const showToast = useCallback((msg: string) => {
    setSaveToast(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setSaveToast(null), 1800)
  }, [])

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

  const fetchMeals = useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setMealResults([])
      return
    }
    setMealsLoading(true)
    try {
      const token = getToken()
      const headers: HeadersInit = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`/api/meals?q=${encodeURIComponent(searchQuery)}&limit=10`, { headers })
      if (res.ok) {
        const data = await res.json()
        setMealResults(Array.isArray(data.meals) ? data.meals : [])
      } else {
        setMealResults([])
      }
    } catch {
      setMealResults([])
    } finally {
      setMealsLoading(false)
    }
  }, [])

  const fetchResults = useCallback(
    async (searchQuery: string, tab: TabId) => {
      setLoading(true)
      try {
        const token = getToken()
        const headers: HeadersInit = {}
        if (token) headers['Authorization'] = `Bearer ${token}`

        let url: string
        if (tab === 'recent') {
          url = '/api/nutrition/foods/recent'
        } else if (tab === 'frequent') {
          url = '/api/nutrition/foods/frequent'
        } else if (tab === 'mine') {
          url = '/api/me/foods'
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

  // Debounced search for the "all" tab. Tabs that don't take a query fire once.
  // Meals are searched in parallel only on the "all" tab and only when the
  // user has typed something — they don't make sense for "Recent" food picks.
  useEffect(() => {
    if (!isOpen) return

    if (activeTab === 'recent' || activeTab === 'frequent' || activeTab === 'mine') {
      fetchResults('', activeTab)
      setMealResults([])
      return
    }

    // "all" tab with an empty query: show the user's saved foods as the landing
    // view. Falls back to the standard "type 2 chars" empty state if they have none.
    if (query.trim().length < 2) {
      if (activeTab === 'all') {
        fetchResults('', 'mine')
      } else {
        setResults([])
      }
      setMealResults([])
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchResults(query, activeTab)
      if (activeTab === 'all') fetchMeals(query)
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, activeTab, isOpen, fetchResults, fetchMeals])

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
        // Prefer human-friendly displayLabel ("1 cup", "1 medium banana") when set;
        // fall back to the bare "240 g" form. Math is unaffected — multiplier is 1.
        label: activeVariant.displayLabel || `${activeVariant.servingSize} ${activeVariant.servingUnit}`,
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

  // Save a food (by real foodId) to /api/me/foods. Returns the new isSaved state.
  const saveFoodIdToServer = async (foodId: string): Promise<boolean> => {
    try {
      const token = getToken()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch('/api/me/foods', {
        method: 'POST',
        headers,
        body: JSON.stringify({ foodId }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  const removeFoodIdFromServer = async (foodId: string): Promise<boolean> => {
    try {
      const token = getToken()
      const headers: HeadersInit = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`/api/me/foods/${foodId}`, {
        method: 'DELETE',
        headers,
      })
      return res.ok
    } catch {
      return false
    }
  }

  // Toggle save on an arbitrary result row. For external results (usda-/off-),
  // this triggers an import-then-save chain so the persisted Food becomes the
  // canonical reference in the user's saved list.
  const handleToggleSave = async (food: FoodResult, e: React.MouseEvent) => {
    e.stopPropagation()
    const rowId = String(food._id)
    if (savingRowId === rowId) return
    setSavingRowId(rowId)

    try {
      let foodId = rowId
      let isExternal = !isObjectIdString(rowId)
      const currentlySaved = !isExternal && savedFoodIds.has(foodId)

      if (currentlySaved) {
        // Optimistic remove
        setSavedFoodIds(prev => {
          const next = new Set(prev)
          next.delete(foodId)
          return next
        })
        // Reflect on the visible result row
        setResults(prev => prev.map(r => (String(r._id) === rowId ? { ...r, isSaved: false } : r)))

        const ok = await removeFoodIdFromServer(foodId)
        if (!ok) {
          // Revert
          setSavedFoodIds(prev => {
            const next = new Set(prev)
            next.add(foodId)
            return next
          })
          setResults(prev => prev.map(r => (String(r._id) === rowId ? { ...r, isSaved: true } : r)))
          showToast('Could not remove')
        } else {
          showToast('Removed from My Foods')
          // If we're on the My Foods tab, drop the row from the list
          if (activeTab === 'mine') {
            setResults(prev => prev.filter(r => String(r._id) !== rowId))
          }
        }
        return
      }

      // SAVE (potentially with import for external results)
      let resolvedVariants: FoodVariant[] | undefined = food.variants

      if (isExternal) {
        const imported = await importExternalIfNeeded(food)
        foodId = imported.foodId
        resolvedVariants = imported.variants
        isExternal = !isObjectIdString(foodId)
        if (isExternal) {
          showToast('Could not save (import failed)')
          return
        }
      }

      // Optimistic add
      setSavedFoodIds(prev => {
        const next = new Set(prev)
        next.add(foodId)
        return next
      })
      setResults(prev => prev.map(r => (String(r._id) === rowId ? { ...r, _id: foodId, isSaved: true, variants: resolvedVariants ?? r.variants } : r)))

      const ok = await saveFoodIdToServer(foodId)
      if (!ok) {
        setSavedFoodIds(prev => {
          const next = new Set(prev)
          next.delete(foodId)
          return next
        })
        setResults(prev => prev.map(r => (String(r._id) === foodId ? { ...r, isSaved: false } : r)))
        showToast('Could not save')
      } else {
        showToast('Saved to My Foods')
      }
    } finally {
      setSavingRowId(null)
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

      // Compute custom loggedAt only when the user explicitly picked a date+time.
      // customTime is now a full "yyyy-MM-ddTHH:mm" string so the user can backdate
      // to yesterday or any earlier day. When null, the server defaults to "now".
      let loggedAtIso: string | undefined
      if (customTime) {
        loggedAtIso = buildLocalIsoFromDateTime(customTime)
      }

      onSelectFood(
        entry,
        tagPickerEnabled ? activeTag : undefined,
        loggedAtIso,
      )
      setSelectedFood(null)
      setServings('1')
      setSelectedServingIdx(0)
      setSelectedVariantIdx(0)
      setInputMode('servings')
      setCustomGrams('100')
      setCustomTime(null)
      setTimeEditOpen(false)
    } finally {
      setAdding(false)
    }
  }

  const tagLabel = tagPickerEnabled ? titleCaseTag(activeTag) : ''

  // Build the unified tag list for the dropdown (defaults first, then user tags)
  const allTagOptions = useMemo<string[]>(() => {
    const defaults = availableTags?.defaults ?? ['breakfast', 'lunch', 'dinner', 'snack', 'pre-workout', 'post-workout']
    const userTags = availableTags?.userTags ?? []
    const seen = new Set<string>()
    const out: string[] = []
    for (const t of [...defaults, ...userTags]) {
      const norm = t.trim().toLowerCase()
      if (!norm || seen.has(norm)) continue
      seen.add(norm)
      out.push(norm)
    }
    return out
  }, [availableTags])

  const handleAddCustomTag = () => {
    const norm = customTagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!norm) return
    setActiveTag(norm)
    setCustomTagInput('')
    setTagDropdownOpen(false)
  }

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
            className="relative flex h-full w-full flex-col sm:h-[85vh] sm:max-h-[700px] sm:max-w-lg sm:rounded-2xl sm:bg-white sm:shadow-2xl sm:dark:bg-zinc-900"
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

              {/* Tag picker + Custom Food shortcut */}
              {tagPickerEnabled && (
                <div className="mb-3 relative flex items-center gap-2">
                  <Link
                    href="/dashboard/foods/new"
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    title="Create a custom food"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Custom Food</span>
                    <span className="sm:hidden">Custom</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setTagDropdownOpen(v => !v)}
                    className="flex flex-1 min-w-0 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                  >
                    <TagIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Adding to</span>
                    <span className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{tagLabel}</span>
                    <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-zinc-400 transition-transform ${tagDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {tagDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-800"
                      >
                        <div className="grid grid-cols-2 gap-1">
                          {allTagOptions.map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => { setActiveTag(t); setTagDropdownOpen(false) }}
                              className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                                activeTag === t
                                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600'
                              }`}
                            >
                              <span className="truncate">{titleCaseTag(t)}</span>
                              {activeTag === t && <Check className="h-3 w-3 shrink-0" />}
                            </button>
                          ))}
                        </div>

                        <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                          <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                            New tag
                          </p>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={customTagInput}
                              onChange={(e) => setCustomTagInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomTag() } }}
                              placeholder="e.g. brunch"
                              className="flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400/30 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:placeholder-zinc-500"
                            />
                            <button
                              type="button"
                              onClick={handleAddCustomTag}
                              disabled={!customTagInput.trim()}
                              className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-semibold text-white transition-colors hover:bg-black disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search foods and meals…"
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
              {/* Meals section — only on "all" tab + query (≥2 chars). Sticky-style header
                  matches the "My Foods" header pattern; chevron toggles collapse. */}
              {activeTab === 'all' && query.trim().length >= 2 && (mealsLoading || mealResults.length > 0) && (
                <div className="border-b border-zinc-100 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setMealsExpanded(v => !v)}
                    className="flex w-full items-center gap-1.5 bg-emerald-50/95 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800 transition-colors hover:bg-emerald-100/95 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
                  >
                    <ChefHat className="h-3 w-3" />
                    Meals
                    <span className="text-[10px] font-normal opacity-70">
                      {mealsLoading ? '…' : `(${mealResults.length})`}
                    </span>
                    <ChevronDown
                      className={`ml-auto h-3 w-3 transition-transform ${mealsExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {mealsExpanded && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
                        {mealsLoading && mealResults.length === 0 ? (
                          <div className="flex items-center gap-2 px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Searching meals…
                          </div>
                        ) : (
                          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {mealResults.map(meal => {
                              const cal = Math.round(meal.totalNutrition?.calories ?? 0)
                              return (
                                <button
                                  key={meal._id}
                                  type="button"
                                  onClick={() => setApplyMeal(meal)}
                                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                                >
                                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-amber-100 via-orange-100 to-rose-100 dark:from-amber-900/30 dark:via-orange-900/30 dark:to-rose-900/30">
                                    {meal.imageUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={meal.imageUrl} alt={meal.name} className="h-full w-full object-cover" />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center text-amber-600/70 dark:text-amber-200/60">
                                        <ChefHat className="h-4 w-4" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
                                      {meal.name}
                                      {meal.isVerified && (
                                        <span className="ml-1 inline-flex items-center rounded-md bg-emerald-100 px-1 text-[9px] font-bold uppercase text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                          ✓
                                        </span>
                                      )}
                                    </p>
                                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                                      {meal.items?.length ?? 0} {meal.items?.length === 1 ? 'item' : 'items'}
                                      {meal.recipe?.servings ? ` · yields ${meal.recipe.servings}` : ''}
                                    </p>
                                  </div>
                                  <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                                    {cal} cal
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Foods header — only when meals are also visible, so users see the boundary. */}
              {activeTab === 'all' && query.trim().length >= 2 && mealResults.length > 0 && results.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFoodsExpanded(v => !v)}
                  className="flex w-full items-center gap-1.5 border-b border-zinc-100 bg-zinc-50/95 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-300 dark:hover:bg-zinc-800/70"
                >
                  <Search className="h-3 w-3" />
                  Foods
                  <span className="text-[10px] font-normal opacity-70">({results.length})</span>
                  <ChevronDown className={`ml-auto h-3 w-3 transition-transform ${foodsExpanded ? 'rotate-180' : ''}`} />
                </button>
              )}

              {!foodsExpanded && activeTab === 'all' && query.trim().length >= 2 && mealResults.length > 0 && results.length > 0 ? null :
              loading ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    Searching...
                  </span>
                </div>
              ) : results.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 px-4">
                  {activeTab === 'mine' ? (
                    <>
                      <Bookmark className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
                        No saved foods yet.
                      </p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center max-w-xs">
                        Tap the bookmark on any search result to add it here.
                      </p>
                    </>
                  ) : (
                    <>
                      <Search className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
                        {activeTab === 'all' && query.length < 2
                          ? 'Type at least 2 characters to search'
                          : 'No foods found'}
                      </p>
                      {/* Create custom food CTA — only when search returned nothing for both
                          foods and meals. Stays out of the way for normal "show recents" empty state. */}
                      {activeTab === 'all' && query.trim().length >= 2 && mealResults.length === 0 && !mealsLoading && (
                        <>
                          <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center max-w-xs">
                            Can&apos;t find it?
                          </p>
                          <Link
                            href="/dashboard/foods/new"
                            onClick={onClose}
                            className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Create custom food
                          </Link>
                        </>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {/* Empty-state hint at the top of the All tab when the user has no saved foods. */}
                  {activeTab === 'all' && query.trim().length < 2 && savedFoodIds.size === 0 && (
                    <div className="flex items-start gap-2 bg-zinc-50 px-4 py-3 dark:bg-zinc-800/50">
                      <Bookmark className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Save foods you eat often — tap the bookmark on any result to add it here.
                      </p>
                    </div>
                  )}
                  {results.map((food, idx) => {
                    const prev = idx > 0 ? results[idx - 1] : null
                    const showMyFoodsHeader =
                      activeTab !== 'mine' &&
                      food.isSaved === true &&
                      (idx === 0 || prev?.isSaved !== true)
                    const showOtherResultsHeader =
                      activeTab === 'all' &&
                      query.trim().length >= 2 &&
                      food.isSaved !== true &&
                      prev?.isSaved === true
                    return (
                  <div key={food._id}>
                    {showMyFoodsHeader && (
                      <div className="sticky top-0 z-[1] flex items-center gap-1.5 bg-amber-50/95 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800 backdrop-blur dark:bg-amber-900/30 dark:text-amber-200">
                        <Bookmark className="h-3 w-3 fill-current" />
                        My Foods
                      </div>
                    )}
                    {showOtherResultsHeader && (
                      <div className="bg-zinc-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-800/40 dark:text-zinc-400">
                        Other Results
                      </div>
                    )}
                      <div
                        role="button"
                        tabIndex={0}
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
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            ;(e.currentTarget as HTMLDivElement).click()
                          }
                        }}
                        className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors ${
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
                        {/* Save / unsave bookmark (or remove on My Foods tab) */}
                        {(() => {
                          const rowIdStr = String(food._id)
                          const isSavedNow =
                            food.isSaved === true ||
                            (isObjectIdString(rowIdStr) && savedFoodIds.has(rowIdStr))
                          const isBusy = savingRowId === rowIdStr
                          if (activeTab === 'mine') {
                            return (
                              <button
                                type="button"
                                onClick={(e) => handleToggleSave(food, e)}
                                disabled={isBusy}
                                aria-label="Remove from My Foods"
                                className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-900/30"
                              >
                                {isBusy ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            )
                          }
                          return (
                            <button
                              type="button"
                              onClick={(e) => handleToggleSave(food, e)}
                              disabled={isBusy}
                              aria-label={isSavedNow ? 'Remove from My Foods' : 'Save to My Foods'}
                              className={`ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
                                isSavedNow
                                  ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30'
                                  : 'text-zinc-300 hover:bg-zinc-100 hover:text-amber-500 dark:text-zinc-600 dark:hover:bg-zinc-800'
                              }`}
                            >
                              {isBusy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Bookmark className={`h-4 w-4 transition-all ${isSavedNow ? 'fill-current' : ''}`} />
                              )}
                            </button>
                          )
                        })()}
                      </div>

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
                              {/* When picker — defaults to "Now"; tap to set a custom date+time
                                  (lets users backdate to yesterday or any prior day). */}
                              <div className="mt-2.5 flex items-center gap-1.5">
                                {!timeEditOpen ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTimeEditOpen(true)
                                      // Default the picker to the viewed day at the current local time.
                                      // If the user is on "today", this is just now. If they're viewing a
                                      // past date, it pre-fills to that date at the current clock time.
                                      if (!customTime) {
                                        const now = new Date()
                                        const base = viewedDate ?? now
                                        setCustomTime(dateToDateTimeInputValue(combineDateAndTime(base, { hours: now.getHours(), minutes: now.getMinutes() })))
                                      }
                                    }}
                                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                      customTime
                                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60'
                                        : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600'
                                    }`}
                                    aria-label={customTime ? `Logged at ${formatDateTimeDisplay(customTime)}, tap to change` : 'Logged time: now, tap to set a custom date and time'}
                                  >
                                    <Clock className="h-3 w-3" />
                                    <span className="tabular-nums">
                                      {customTime ? formatDateTimeDisplay(customTime) : 'Now'}
                                    </span>
                                    {customTime && (
                                      <span
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setCustomTime(null)
                                          setTimeEditOpen(false)
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            setCustomTime(null)
                                            setTimeEditOpen(false)
                                          }
                                        }}
                                        className="-mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-blue-200/60 dark:hover:bg-blue-900/60"
                                        aria-label="Clear custom time"
                                      >
                                        <X className="h-2.5 w-2.5" />
                                      </span>
                                    )}
                                  </button>
                                ) : (
                                  <div className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 dark:bg-blue-900/40">
                                    <Clock className="h-3 w-3 text-blue-700 dark:text-blue-200" />
                                    <input
                                      type="datetime-local"
                                      value={customTime ?? dateToDateTimeInputValue(new Date())}
                                      onChange={(e) => setCustomTime(e.target.value || null)}
                                      onBlur={() => setTimeEditOpen(false)}
                                      max={dateToDateTimeInputValue(new Date())}
                                      autoFocus
                                      className="bg-transparent text-[11px] font-semibold text-blue-700 tabular-nums focus:outline-none dark:text-blue-200"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCustomTime(null)
                                        setTimeEditOpen(false)
                                      }}
                                      className="-mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-blue-700 hover:bg-blue-200/60 dark:text-blue-200 dark:hover:bg-blue-900/60"
                                      aria-label="Clear custom time"
                                    >
                                      <X className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                )}
                                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                                  {customTime ? 'Logged at custom time' : 'Logged now'}
                                </span>
                              </div>
                              <button
                                onClick={handleAddFood}
                                disabled={adding}
                                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-900 py-2 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-60 disabled:cursor-wait dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                              >
                                {adding ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Adding…
                                  </>
                                ) : (
                                  <>
                                    <Plus className="h-4 w-4" />
                                    {tagPickerEnabled ? `Add to ${tagLabel}` : 'Add'}
                                  </>
                                )}
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                  </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Save toast */}
            <AnimatePresence>
              {saveToast && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.15 }}
                  className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-zinc-900/95 px-4 py-2 text-xs font-medium text-white shadow-lg dark:bg-white/95 dark:text-black"
                >
                  {saveToast}
                </motion.div>
              )}
            </AnimatePresence>
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

      {/* Meal Apply sheet — opened when a meal result is tapped. Closes the food
          search modal on success so the user lands back on their day. */}
      <MealApplySheet
        isOpen={!!applyMeal}
        meal={applyMeal}
        defaultTag={tagPickerEnabled ? activeTag : 'snack'}
        availableTags={availableTags}
        viewedDate={viewedDate}
        onClose={() => setApplyMeal(null)}
        onApplied={() => {
          setApplyMeal(null)
          onClose()
        }}
      />
    </AnimatePresence>
  )
}
