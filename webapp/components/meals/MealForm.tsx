"use client"

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, X, Save, ArrowLeft, ChevronDown, AlertCircle, Loader2, ChefHat, ImagePlus, ImageIcon } from 'lucide-react'
import FoodSearchModal from '@/components/nutrition/FoodSearchModal'
import BridgeFieldGroup, { type BridgeValues } from '@/components/nutrition/BridgeFieldGroup'
import { resizeImageToBlob } from '@/lib/imageResize'
import type { IFoodEntry } from '@/lib/nutritionTypes'
import type { IMealItem, IMealRecipe } from '@/models/Meal'

export interface MealFormInitial {
  name: string
  description?: string
  imageUrl?: string
  tags: string[]
  items: (IMealItem & { _id?: string })[]
  recipe?: IMealRecipe
}

interface MealFormProps {
  mealId?: string         // present = edit mode
  initial?: MealFormInitial
  availableTags?: { defaults: string[]; userTags: string[] }
}

function titleCaseTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-')
}

export default function MealForm({ mealId, initial, availableTags }: MealFormProps) {
  const router = useRouter()

  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [imageUrl, setImageUrl] = useState<string | undefined>(initial?.imageUrl)
  // Local preview (objectURL) shown while the user is picking a new image
  // before we POST it to the server. Cleared once the upload succeeds.
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  // Pending File object held until the meal is saved (only relevant in CREATE
  // mode — we need a mealId before we can upload).
  const [pendingImageBlob, setPendingImageBlob] = useState<Blob | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [items, setItems] = useState<(IMealItem & { _id?: string })[]>(initial?.items ?? [])
  const [hasRecipe, setHasRecipe] = useState<boolean>(!!initial?.recipe)
  const [recipeInstructions, setRecipeInstructions] = useState<string>(
    initial?.recipe?.instructions?.join('\n') ?? ''
  )
  const [prepTime, setPrepTime] = useState<string>(
    initial?.recipe?.prepTimeMinutes != null ? String(initial.recipe.prepTimeMinutes) : ''
  )
  const [cookTime, setCookTime] = useState<string>(
    initial?.recipe?.cookTimeMinutes != null ? String(initial.recipe.cookTimeMinutes) : ''
  )
  const [recipeServings, setRecipeServings] = useState<string>(
    initial?.recipe?.servings != null ? String(initial.recipe.servings) : '1'
  )
  // Optional explicit per-serving bridges. When set, save-as-food on this
  // meal uses these instead of the auto-estimator (UNITS_AND_SERVINGS_PLAN §10.8).
  const [bridge, setBridge] = useState<BridgeValues>({
    gramsPerServing: initial?.recipe?.gramsPerServing,
    mlPerServing: initial?.recipe?.mlPerServing,
  })

  const [foodSearchOpen, setFoodSearchOpen] = useState(false)
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [customTagInput, setCustomTagInput] = useState('')

  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initial) {
      setName(initial.name)
      setDescription(initial.description ?? '')
      setImageUrl(initial.imageUrl)
      setTags(initial.tags ?? [])
      setItems(initial.items ?? [])
      setHasRecipe(!!initial.recipe)
      setRecipeInstructions(initial.recipe?.instructions?.join('\n') ?? '')
      setPrepTime(initial.recipe?.prepTimeMinutes != null ? String(initial.recipe.prepTimeMinutes) : '')
      setCookTime(initial.recipe?.cookTimeMinutes != null ? String(initial.recipe.cookTimeMinutes) : '')
      setRecipeServings(initial.recipe?.servings != null ? String(initial.recipe.servings) : '1')
      setBridge({
        gramsPerServing: initial.recipe?.gramsPerServing,
        mlPerServing: initial.recipe?.mlPerServing,
      })
    }
  }, [initial])

  // Free objectURL previews on unmount / when replaced.
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview)
    }
  }, [imagePreview])

  const totalCalories = useMemo(() => {
    return Math.round(items.reduce((s, it) => s + (it.nutrition?.calories ?? 0) * (it.servings ?? 1), 0))
  }, [items])
  const totalProtein = useMemo(() => {
    return Math.round(items.reduce((s, it) => s + (it.nutrition?.protein ?? 0) * (it.servings ?? 1), 0))
  }, [items])
  const totalCarbs = useMemo(() => {
    return Math.round(items.reduce((s, it) => s + (it.nutrition?.carbs ?? 0) * (it.servings ?? 1), 0))
  }, [items])
  const totalFats = useMemo(() => {
    return Math.round(items.reduce((s, it) => s + (it.nutrition?.fats ?? 0) * (it.servings ?? 1), 0))
  }, [items])

  const allTagOptions = useMemo<string[]>(() => {
    const defaults = availableTags?.defaults ?? ['breakfast', 'lunch', 'dinner', 'snack', 'pre-workout', 'post-workout']
    const userTags = availableTags?.userTags ?? []
    const seen = new Set<string>()
    const out: string[] = []
    for (const t of [...defaults, ...userTags]) {
      const norm = String(t).trim().toLowerCase()
      if (norm && !seen.has(norm)) {
        seen.add(norm)
        out.push(norm)
      }
    }
    return out
  }, [availableTags])

  const handleToggleTag = (tag: string) => {
    const norm = tag.trim().toLowerCase()
    if (!norm) return
    setTags(prev => prev.includes(norm) ? prev.filter(t => t !== norm) : [...prev, norm])
  }

  const handleAddCustomTag = () => {
    const norm = customTagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!norm) return
    if (!tags.includes(norm)) setTags(prev => [...prev, norm])
    setCustomTagInput('')
  }

  const handleAddItem = (food: IFoodEntry) => {
    // FoodSearchModal extends IFoodEntry with the new logged* fields (PR 4).
    // Forward them so meal templates carry the same provenance and re-edits
    // round-trip through the picker.
    const extra = food as IFoodEntry & {
      loggedQuantity?: number
      loggedUnit?: string
      loggedGramsPerServing?: number
      loggedMlPerServing?: number
    }
    const newItem: IMealItem & { _id?: string } = {
      foodId: food.foodId as IMealItem['foodId'],
      variantId: food.variantId as IMealItem['variantId'],
      variantName: food.variantName,
      name: food.name,
      brand: food.brand,
      servingSize: food.servingSize,
      servingUnit: food.servingUnit,
      servings: food.servings,
      nutrition: {
        calories: food.nutrition.calories,
        protein: food.nutrition.protein,
        carbs: food.nutrition.carbs,
        fats: food.nutrition.fats,
        fiber: food.nutrition.fiber,
        sugar: food.nutrition.sugar,
        sodium: food.nutrition.sodium,
      },
      loggedQuantity: extra.loggedQuantity,
      loggedUnit: extra.loggedUnit,
      loggedGramsPerServing: extra.loggedGramsPerServing,
      loggedMlPerServing: extra.loggedMlPerServing,
    }
    setItems(prev => [...prev, newItem])
    setFoodSearchOpen(false)
  }

  const handleRemoveItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  // ---------------------------------------------------------------------------
  // Image handling
  //
  // EDIT mode: pick → resize → POST immediately to /api/meals/[id]/image →
  //            update imageUrl from response.
  // CREATE mode: pick → resize → hold the resized blob until the meal exists
  //              (we need a mealId to upload). The blob is uploaded right after
  //              the create succeeds, then we navigate.
  // ---------------------------------------------------------------------------

  const uploadImageBlob = async (mealIdToUpload: string, blob: Blob): Promise<string | null> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const headers: HeadersInit = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const fd = new FormData()
    fd.append('image', blob, 'meal.jpg')
    const res = await fetch(`/api/meals/${mealIdToUpload}/image`, {
      method: 'POST',
      headers,
      body: fd,
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d?.error || 'Failed to upload image')
    }
    const data = await res.json()
    return typeof data?.imageUrl === 'string' ? data.imageUrl : null
  }

  const handlePickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setImageError(null)
    setImageBusy(true)
    try {
      const blob = await resizeImageToBlob(file, { maxDim: 1600, quality: 0.82 })
      // Build a local preview immediately for UX feedback
      if (imagePreview) URL.revokeObjectURL(imagePreview)
      const previewUrl = URL.createObjectURL(blob)
      setImagePreview(previewUrl)

      if (mealId) {
        // Edit mode — upload right away.
        const newUrl = await uploadImageBlob(mealId, blob)
        if (newUrl) {
          setImageUrl(newUrl)
          // Now that the server has the image, drop the local preview.
          URL.revokeObjectURL(previewUrl)
          setImagePreview(null)
        }
      } else {
        // Create mode — hold the blob until create completes.
        setPendingImageBlob(blob)
      }
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Failed to process image')
    } finally {
      setImageBusy(false)
    }
  }

  const handleRemoveImage = async () => {
    setImageError(null)
    if (mealId && imageUrl) {
      // Delete on the server.
      setImageBusy(true)
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        const headers: HeadersInit = {}
        if (token) headers['Authorization'] = `Bearer ${token}`
        const res = await fetch(`/api/meals/${mealId}/image`, { method: 'DELETE', headers })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d?.error || 'Failed to remove image')
        }
        setImageUrl(undefined)
      } catch (err) {
        setImageError(err instanceof Error ? err.message : 'Failed to remove image')
      } finally {
        setImageBusy(false)
      }
    }
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview)
      setImagePreview(null)
    }
    setPendingImageBlob(null)
    if (!mealId) setImageUrl(undefined)
  }

  const handleSave = async () => {
    setError(null)
    if (!name.trim()) {
      setError('Name is required.')
      return
    }
    if (items.length === 0) {
      setError('Add at least one item.')
      return
    }
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const body = {
      name: name.trim(),
      description: description.trim() || undefined,
      tags,
      items: items.map(it => ({
        foodId: it.foodId ? String(it.foodId) : undefined,
        variantId: it.variantId ? String(it.variantId) : undefined,
        variantName: it.variantName,
        name: it.name,
        brand: it.brand,
        servingSize: it.servingSize,
        servingUnit: it.servingUnit,
        servings: it.servings,
        nutrition: it.nutrition,
      })),
      recipe: hasRecipe
        ? {
            instructions: recipeInstructions
              .split('\n')
              .map(line => line.trim())
              .filter(line => line.length > 0),
            prepTimeMinutes: prepTime ? Number(prepTime) || undefined : undefined,
            cookTimeMinutes: cookTime ? Number(cookTime) || undefined : undefined,
            servings: Number(recipeServings) || 1,
            gramsPerServing: bridge.gramsPerServing,
            mlPerServing: bridge.mlPerServing,
          }
        : undefined,
    }

    try {
      const url = mealId ? `/api/meals/${mealId}` : '/api/meals'
      const method = mealId ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers, body: JSON.stringify(body) })
      if (res.ok) {
        const data = await res.json()
        const id = data?.meal?._id ? String(data.meal._id) : mealId

        // If we have a pending image (CREATE flow), upload it now that we
        // have a mealId. Errors here are non-fatal — the meal saved fine.
        if (id && pendingImageBlob) {
          try {
            await uploadImageBlob(id, pendingImageBlob)
          } catch (err) {
            console.warn('[MealForm] image upload after create failed', err)
          }
        }

        if (id) {
          router.push(`/dashboard/meals/${id}`)
        } else {
          router.push('/dashboard/meals')
        }
      } else {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Failed to save recipe.')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <>
      <div className="space-y-5 pb-24">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-white sm:text-xl">
            {mealId ? 'Edit Recipe' : 'New Recipe'}
          </h1>
          <div className="w-16" /> {/* spacer */}
        </div>

        {/* Image uploader */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Photo <span className="text-zinc-400">(optional)</span>
          </label>
          <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            {(imagePreview || imageUrl) ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview ?? imageUrl}
                  alt="Meal preview"
                  className="h-40 w-full object-cover sm:h-48"
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={imageBusy}
                    className="rounded-md bg-white/90 px-2 py-1 text-xs font-semibold text-zinc-900 shadow-sm hover:bg-white disabled:opacity-50"
                  >
                    {imageBusy ? 'Uploading…' : 'Replace'}
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    disabled={imageBusy}
                    className="rounded-md bg-red-600/90 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-red-600 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={imageBusy}
                className="flex h-32 w-full flex-col items-center justify-center gap-1 text-zinc-400 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-500 dark:hover:bg-zinc-800 sm:h-40"
              >
                {imageBusy ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <ImagePlus className="h-6 w-6" />
                )}
                <span className="text-xs font-medium">
                  {imageBusy ? 'Processing…' : 'Tap to add a photo'}
                </span>
                <span className="text-[10px] text-zinc-400">
                  <ImageIcon className="mr-0.5 inline h-2.5 w-2.5" />
                  Camera or library
                </span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePickImage}
              className="hidden"
            />
          </div>
          {imageError && (
            <p className="mt-1 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="h-3 w-3" />
              {imageError}
            </p>
          )}
        </div>

        {/* Name */}
        <div>
          <label htmlFor="meal-name" className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            id="meal-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Post-Workout Smoothie"
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500 dark:focus:border-white dark:focus:ring-white/10"
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="meal-desc" className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Description <span className="text-zinc-400">(optional)</span>
          </label>
          <textarea
            id="meal-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A short note about this meal…"
            rows={2}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500 dark:focus:border-white dark:focus:ring-white/10"
          />
        </div>

        {/* Tags */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Tags
            </label>
            <button
              type="button"
              onClick={() => setTagPickerOpen(v => !v)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              {tagPickerOpen ? 'Done' : 'Edit'}
              <ChevronDown className={`h-3 w-3 transition-transform ${tagPickerOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Selected tag chips */}
          {tags.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white dark:bg-white dark:text-black"
                >
                  {titleCaseTag(tag)}
                  <button
                    type="button"
                    onClick={() => setTags(prev => prev.filter(t => t !== tag))}
                    aria-label={`Remove ${tag}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <AnimatePresence>
            {tagPickerOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="border-b border-zinc-200 py-3 dark:border-zinc-800 sm:rounded-lg sm:border sm:border-zinc-200 sm:bg-white sm:p-3 sm:py-3 dark:sm:border-zinc-700 dark:sm:bg-zinc-900">
                  <div className="grid grid-cols-2 gap-1">
                    {allTagOptions.map(tag => {
                      const active = tags.includes(tag)
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleToggleTag(tag)}
                          className={`rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                            active
                              ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
                          }`}
                        >
                          {titleCaseTag(tag)}
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Custom tag
                    </p>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={customTagInput}
                        onChange={(e) => setCustomTagInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomTag() } }}
                        placeholder="e.g. high-protein"
                        className="flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs focus:border-zinc-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomTag}
                        disabled={!customTagInput.trim()}
                        className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-black"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Items */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Items
            </label>
            {items.length > 0 && (
              <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                {totalCalories} cal · P{totalProtein} C{totalCarbs} F{totalFats}
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            {items.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white/0 p-6 text-center dark:border-zinc-700 sm:bg-white sm:p-8 dark:sm:bg-zinc-900">
                <ChefHat className="h-7 w-7 text-zinc-300 dark:text-zinc-600" />
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No items yet. Add foods to build your meal.
                </p>
              </div>
            )}

            {items.map((it, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 border-b border-zinc-200 py-2.5 dark:border-zinc-800 sm:rounded-lg sm:border sm:border-zinc-200 sm:bg-white sm:px-3 dark:sm:border-zinc-800 dark:sm:bg-zinc-900"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                    {it.name}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {it.brand && <span className="text-zinc-400 dark:text-zinc-500">{it.brand} · </span>}
                    {it.servings} × {it.servingSize}{it.servingUnit}
                  </p>
                </div>
                <span className="text-xs font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                  {Math.round((it.nutrition.calories ?? 0) * it.servings)}
                </span>
                <button
                  onClick={() => handleRemoveItem(idx)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  aria-label="Remove item"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            <button
              onClick={() => setFoodSearchOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
            >
              <Plus className="h-4 w-4" />
              Add item
            </button>
          </div>
        </div>

        {/* Recipe toggle */}
        <div>
          <label className="flex items-center justify-between gap-3 py-2 sm:rounded-xl sm:border sm:border-zinc-200 sm:bg-white sm:p-3 dark:sm:border-zinc-800 dark:sm:bg-zinc-900">
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-white">Cooking instructions</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Add a recipe with prep / cook time.</p>
            </div>
            <button
              type="button"
              onClick={() => setHasRecipe(v => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                hasRecipe ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
              }`}
              aria-pressed={hasRecipe}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  hasRecipe ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>

          <AnimatePresence>
            {hasRecipe && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-2 space-y-3 sm:rounded-xl sm:border sm:border-zinc-200 sm:bg-white sm:p-3 dark:sm:border-zinc-800 dark:sm:bg-zinc-900">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                        Prep (min)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={prepTime}
                        onChange={(e) => setPrepTime(e.target.value)}
                        className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                        Cook (min)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={cookTime}
                        onChange={(e) => setCookTime(e.target.value)}
                        className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                        Yields (servings)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={recipeServings}
                        onChange={(e) => setRecipeServings(e.target.value)}
                        className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                      Instructions (one step per line)
                    </label>
                    <textarea
                      value={recipeInstructions}
                      onChange={(e) => setRecipeInstructions(e.target.value)}
                      rows={5}
                      placeholder={'1. Combine all ingredients in a blender\n2. Blend until smooth'}
                      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    />
                  </div>
                  <BridgeFieldGroup
                    value={bridge}
                    onChange={setBridge}
                    collapsible
                    title="Optional: weight or volume per serving"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="sticky bottom-2 left-0 right-0 z-10 flex gap-2 rounded-xl border border-zinc-200 bg-white/90 p-2 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
          <button
            onClick={() => router.back()}
            disabled={saving}
            className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || items.length === 0}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : mealId ? 'Save changes' : 'Create recipe'}
          </button>
        </div>
      </div>

      {/* Food picker — meal-building mode (no tag picker) */}
      <FoodSearchModal
        isOpen={foodSearchOpen}
        showTagPicker={false}
        onClose={() => setFoodSearchOpen(false)}
        onSelectFood={handleAddItem}
      />
    </>
  )
}
