"use client"

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Bookmark,
  Trash2,
  Check,
  ShieldCheck,
  Layers,
} from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import FoodThumbnail from '@/components/nutrition/FoodThumbnail'
import FoodLogSheet from '@/components/meals/FoodLogSheet'
import BridgeFieldGroup, { type BridgeValues } from '@/components/nutrition/BridgeFieldGroup'
import { scalePerServingNutrition } from '@/lib/foodMath'
import { Toast } from '@/components/ui'
import { useToast } from '@/hooks/useToast'

interface Variant {
  _id?: string
  name: string
  isDefault?: boolean
  servingSize: number
  servingUnit: string
  displayLabel?: string
  alternateServings?: { label: string; multiplier: number }[]
  gramsPerServing?: number
  mlPerServing?: number
  nutrition: {
    calories: number
    protein: number
    carbs: number
    fats: number
    fiber?: number
    sugar?: number
    sodium?: number
    saturatedFat?: number
  }
}

interface FoodResponse {
  _id: string
  name: string
  brand?: string
  category?: string
  source?: string
  imageUrl?: string
  isVerified?: boolean
  isFirstClass?: boolean
  servingSize: number
  servingUnit: string
  displayLabel?: string
  gramsPerServing?: number
  mlPerServing?: number
  nutrition: Variant['nutrition']
  variants?: Variant[]
  createdBy?: string
  externalDataType?: string
}

interface MeResponse {
  user?: { _id?: string; id?: string; userId?: string }
  _id?: string
  id?: string
  userId?: string
}

interface TagsResp {
  defaults: string[]
  userTags: string[]
}

function getDefaultTagForNow(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 11) return 'breakfast'
  if (h >= 11 && h < 14) return 'lunch'
  if (h >= 17 && h < 21) return 'dinner'
  return 'snack'
}

function NutritionRow({ label, value, unit, accent }: { label: string; value: number; unit: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${accent ?? 'text-zinc-900 dark:text-white'}`}>
        {Math.round(value * 10) / 10}{unit}
      </span>
    </div>
  )
}

export default function FoodDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [food, setFood] = useState<FoodResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)
  const [bookmarking, setBookmarking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [logSheetOpen, setLogSheetOpen] = useState(false)
  const [tagsResp, setTagsResp] = useState<TagsResp>({ defaults: [], userTags: [] })
  const { toast, showToast } = useToast(2200)
  // Saved-bridge values keyed by variant index. Only the owner sees the edit UI.
  const [savingBridge, setSavingBridge] = useState<number | null>(null)

  const getHeaders = useCallback((): HeadersInit => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
  }, [])

  const fetchFood = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/nutrition/foods/${id}`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setFood(data.food)
      } else if (res.status === 404) {
        setError('Food not found.')
      } else {
        setError('Failed to load food.')
      }
    } catch {
      setError('Network error.')
    } finally {
      setLoading(false)
    }
  }, [id, getHeaders])

  const fetchMeAndSavedStatus = useCallback(async () => {
    try {
      const [meRes, savedRes] = await Promise.all([
        fetch('/api/auth/me', { headers: getHeaders() }),
        fetch('/api/me/foods', { headers: getHeaders() }),
      ])
      if (meRes.ok) {
        const data: MeResponse = await meRes.json()
        const uid = data.user?._id || data.user?.id || data.user?.userId || data._id || data.id || data.userId || null
        setCurrentUserId(uid ? String(uid) : null)
      }
      if (savedRes.ok) {
        const data = await savedRes.json()
        const list: Array<{ _id: string }> = Array.isArray(data.foods) ? data.foods : []
        setIsSaved(list.some(f => String(f._id) === String(id)))
      }
    } catch {
      /* non-fatal */
    }
  }, [getHeaders, id])

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
    } catch { /* non-fatal */ }
  }, [getHeaders])

  useEffect(() => {
    fetchFood()
    fetchMeAndSavedStatus()
    fetchTags()
  }, [fetchFood, fetchMeAndSavedStatus, fetchTags])

  const isOwner = Boolean(currentUserId && food?.createdBy && String(food.createdBy) === currentUserId)

  const handleBookmarkToggle = async () => {
    if (!food || bookmarking) return
    setBookmarking(true)
    try {
      if (isSaved) {
        const res = await fetch(`/api/me/foods/${food._id}`, { method: 'DELETE', headers: getHeaders() })
        if (res.ok) {
          setIsSaved(false)
          showToast('Removed from favorites', 'neutral')
        } else {
          showToast('Failed to remove', 'error')
        }
      } else {
        const res = await fetch('/api/me/foods', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ foodId: food._id }),
        })
        if (res.ok) {
          setIsSaved(true)
          showToast('Added to favorites', 'success')
        } else {
          showToast('Failed to add', 'error')
        }
      }
    } catch {
      showToast('Network error', 'error')
    } finally {
      setBookmarking(false)
    }
  }

  const handleBridgeSave = useCallback(
    async (variantIndex: number, next: BridgeValues) => {
      if (!food) return
      const variants = (food.variants && food.variants.length > 0 ? food.variants : []).slice()
      if (variants.length === 0) {
        // Synthesize a default variant from the flattened fields so PATCH writes
        // a real array.
        variants.push({
          _id: undefined,
          name: 'Default',
          isDefault: true,
          servingSize: food.servingSize,
          servingUnit: food.servingUnit,
          displayLabel: food.displayLabel,
          alternateServings: [],
          nutrition: food.nutrition,
        })
      }
      const target = variants[variantIndex]
      if (!target) return

      const noChange =
        (target.gramsPerServing ?? null) === (next.gramsPerServing ?? null) &&
        (target.mlPerServing ?? null) === (next.mlPerServing ?? null)
      if (noChange) return

      const updated: Variant[] = variants.map((v, i) =>
        i === variantIndex
          ? {
              ...v,
              gramsPerServing: next.gramsPerServing,
              mlPerServing: next.mlPerServing,
            }
          : v
      )

      setSavingBridge(variantIndex)
      try {
        const res = await fetch(`/api/nutrition/foods/${food._id}`, {
          method: 'PATCH',
          headers: getHeaders(),
          body: JSON.stringify({ variants: updated }),
        })
        if (res.ok) {
          // Optimistically update local state so the readout reflects the save.
          setFood({ ...food, variants: updated })
          showToast('Bridge saved', 'success')
        } else {
          showToast('Failed to save bridge', 'error')
        }
      } catch {
        showToast('Network error', 'error')
      } finally {
        setSavingBridge(null)
      }
    },
    [food, getHeaders, showToast]
  )

  const handleDelete = async () => {
    if (!food || deleting) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/nutrition/foods/${food._id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      if (res.ok) {
        router.push('/dashboard/meals?tab=foods')
      } else {
        showToast('Failed to delete', 'error')
        setDeleting(false)
      }
    } catch {
      showToast('Network error', 'error')
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      </PageTransition>
    )
  }

  if (error || !food) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <AlertCircle className="h-8 w-8 text-zinc-400" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{error ?? 'Food not found.'}</p>
          <Link
            href="/dashboard/meals?tab=foods"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black"
          >
            Back to favorites
          </Link>
        </div>
      </PageTransition>
    )
  }

  const variants: Variant[] = food.variants && food.variants.length > 0 ? food.variants : [{
    _id: undefined,
    name: 'Default',
    isDefault: true,
    servingSize: food.servingSize,
    servingUnit: food.servingUnit,
    displayLabel: food.displayLabel,
    alternateServings: [],
    gramsPerServing: food.gramsPerServing,
    mlPerServing: food.mlPerServing,
    nutrition: food.nutrition,
  }]
  const defaultVariant = variants.find(v => v.isDefault) ?? variants[0]

  // Per-serving nutrition. The variant's stored `nutrition` is per
  // `servingSize` `servingUnit` (commonly per-100g for OpenFoodFacts imports).
  // When `gramsPerServing` / `mlPerServing` are set and differ from the
  // storage size, the actual user-facing serving is THAT (e.g. one 38g bag),
  // so the per-serving macros must be scaled down accordingly. This matches
  // the QuantityPicker's primary-chip behavior. Logic lives in
  // `lib/foodMath.scalePerServingNutrition` so the variants list below
  // can reuse it.
  const n = scalePerServingNutrition(defaultVariant)

  return (
    <PageTransition className="space-y-4 pb-32">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/meals?tab=foods"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Favorites
        </Link>
        <div className="flex items-center gap-1">
          <button
            onClick={handleBookmarkToggle}
            disabled={bookmarking}
            className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              isSaved
                ? 'text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
            }`}
          >
            {bookmarking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bookmark className={`h-3.5 w-3.5 ${isSaved ? 'fill-current' : ''}`} />}
            {isSaved ? 'Saved' : 'Save'}
          </button>
          {isOwner && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Hero — image or large category-tinted thumbnail */}
      <div className="overflow-hidden sm:rounded-xl sm:border sm:border-zinc-200 dark:sm:border-zinc-800">
        <FoodThumbnail
          name={food.name}
          category={food.category}
          imageUrl={food.imageUrl}
          className="h-44 w-full sm:rounded-none"
          iconClassName="h-16 w-16"
        />
      </div>

      {/* Title block */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white sm:text-2xl">{food.name}</h1>
            {food.brand && (
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{food.brand}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {food.isVerified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                <ShieldCheck className="h-3 w-3" />
                Verified
              </span>
            )}
            {food.category && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {food.category}
              </span>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
          Per {defaultVariant.displayLabel || `${defaultVariant.servingSize} ${defaultVariant.servingUnit}`}
          {food.source && food.source !== 'manual' && (
            <span> · Source: {food.source.toUpperCase()}</span>
          )}
        </p>
      </div>

      {/* Macro summary */}
      <div className="grid grid-cols-4 gap-2 rounded-lg bg-zinc-50 p-2.5 text-center dark:bg-zinc-800/50">
        <div>
          <p className="text-lg font-bold text-zinc-900 dark:text-white">{Math.round(n.calories)}</p>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Cal</p>
        </div>
        <div>
          <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{Math.round(n.protein * 10) / 10}g</p>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Protein</p>
        </div>
        <div>
          <p className="text-lg font-bold text-green-600 dark:text-green-400">{Math.round(n.carbs * 10) / 10}g</p>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Carbs</p>
        </div>
        <div>
          <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{Math.round(n.fats * 10) / 10}g</p>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Fats</p>
        </div>
      </div>

      {/* Full nutrition breakdown */}
      <div className="sm:rounded-xl sm:border sm:border-zinc-200 sm:bg-white sm:p-4 dark:sm:border-zinc-800 dark:sm:bg-zinc-900">
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Nutrition (per serving)</h2>
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          <NutritionRow label="Calories" value={n.calories} unit="" />
          <NutritionRow label="Protein" value={n.protein} unit=" g" accent="text-blue-600 dark:text-blue-400" />
          <NutritionRow label="Carbohydrates" value={n.carbs} unit=" g" accent="text-green-600 dark:text-green-400" />
          {n.fiber != null && <NutritionRow label="Fiber" value={n.fiber} unit=" g" />}
          {n.sugar != null && <NutritionRow label="Sugar" value={n.sugar} unit=" g" />}
          <NutritionRow label="Fats" value={n.fats} unit=" g" accent="text-amber-600 dark:text-amber-400" />
          {n.saturatedFat != null && <NutritionRow label="Saturated fat" value={n.saturatedFat} unit=" g" />}
          {n.sodium != null && <NutritionRow label="Sodium" value={n.sodium} unit=" mg" />}
        </div>
      </div>

      {/* Variants — only render if more than one */}
      {variants.length > 1 && (
        <div className="sm:rounded-xl sm:border sm:border-zinc-200 sm:bg-white sm:p-4 dark:sm:border-zinc-800 dark:sm:bg-zinc-900">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            <Layers className="h-3.5 w-3.5" />
            Variants ({variants.length})
          </h2>
          <div className="space-y-2">
            {variants.map((v, idx) => {
              // Each variant's stored nutrition is per its own (servingSize,
              // servingUnit) — for OFF imports that's per-100g. Scale to the
              // actual per-serving values so the list matches the headline.
              const vn = scalePerServingNutrition(v)
              return (
              <div
                key={v._id ?? idx}
                className="border-b border-zinc-100 py-2 dark:border-zinc-800 last:border-0"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">
                      {v.name}
                      {v.isDefault && (
                        <span className="ml-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          default
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {v.displayLabel || `${v.servingSize} ${v.servingUnit}`}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                    {Math.round(vn.calories)} cal
                  </p>
                </div>
                {isOwner && (
                  <div className="mt-2">
                    <BridgeFieldGroup
                      value={{ gramsPerServing: v.gramsPerServing, mlPerServing: v.mlPerServing }}
                      onChange={(next) => handleBridgeSave(idx, next)}
                      servingUnit={v.servingUnit}
                      collapsible
                      title={
                        savingBridge === idx
                          ? 'Saving bridge…'
                          : 'Optional: weight / volume per serving'
                      }
                    />
                  </div>
                )}
              </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Single-variant bridge editor (only for owners) */}
      {isOwner && variants.length === 1 && (
        <div className="sm:rounded-xl sm:border sm:border-zinc-200 sm:bg-white sm:p-4 dark:sm:border-zinc-800 dark:sm:bg-zinc-900">
          <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Bridge values
          </h2>
          <p className="mb-2 text-[11px] text-zinc-500 dark:text-zinc-500">
            Optional — lets the picker convert between mass and volume for this food.
          </p>
          <BridgeFieldGroup
            value={{
              gramsPerServing: defaultVariant.gramsPerServing,
              mlPerServing: defaultVariant.mlPerServing,
            }}
            onChange={(next) => handleBridgeSave(0, next)}
            servingUnit={defaultVariant.servingUnit}
            collapsible={false}
          />
          {savingBridge === 0 && (
            <p className="mt-1 text-[11px] text-zinc-400">Saving…</p>
          )}
        </div>
      )}

      {/* Sticky bottom CTA */}
      <div className="fixed bottom-20 left-0 right-0 z-30 px-3 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <button
            onClick={() => setLogSheetOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            <Check className="h-4 w-4" />
            Log this food
          </button>
        </div>
      </div>

      {/* Food log sheet */}
      <FoodLogSheet
        isOpen={logSheetOpen}
        food={food}
        defaultTag={getDefaultTagForNow()}
        availableTags={tagsResp}
        onClose={() => setLogSheetOpen(false)}
        onLogged={() => {
          showToast('Logged to your day', 'success')
        }}
      />

      {/* Delete confirm overlay */}
      {confirmDelete && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !deleting && setConfirmDelete(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">Delete this food?</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Past logs that used this food keep their snapshot — they won&rsquo;t change.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 rounded-lg border border-zinc-200 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </motion.div>
      )}

      <Toast toast={toast} />
    </PageTransition>
  )
}
