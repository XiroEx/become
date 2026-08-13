"use client"

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import PageTransition from '@/components/PageTransition'
import MealApplySheet from '@/components/meals/MealApplySheet'
import {
  ArrowLeft,
  Pencil,
  Trash2,
  ChefHat,
  Loader2,
  AlertCircle,
  ArrowLeftRight,
} from 'lucide-react'
import type { IMeal, IMealItem, IMealRecipe } from '@/models/Meal'
import { Toast } from '@/components/ui'
import { useToast } from '@/hooks/useToast'
import { useMealSchedule } from '@/hooks/useMealSchedule'


interface MealResponse extends Omit<IMeal, '_id' | 'createdBy'> {
  _id: string
  createdBy?: string
  items: (IMealItem & { _id?: string })[]
  recipe?: IMealRecipe
}

interface MeResponse {
  user?: { _id?: string; id?: string; userId?: string }
  _id?: string
  id?: string
  userId?: string
}

function titleCaseTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-')
}

export default function MealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [meal, setMeal] = useState<MealResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [applySheetOpen, setApplySheetOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [converting, setConverting] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const { toast, showToast } = useToast()
  const { defaultTagNow } = useMealSchedule()
  const [tagsResp, setTagsResp] = useState<{ defaults: string[]; userTags: string[] }>({
    defaults: [], userTags: [],
  })

  const getHeaders = useCallback((): HeadersInit => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
  }, [])

  const fetchMeal = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/meals/${id}`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setMeal(data.meal)
      } else if (res.status === 404) {
        setError('Meal not found.')
      } else {
        setError('Failed to load meal.')
      }
    } catch {
      setError('Network error.')
    } finally {
      setLoading(false)
    }
  }, [id, getHeaders])

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { headers: getHeaders() })
      if (res.ok) {
        const data: MeResponse = await res.json()
        const uid = data.user?._id || data.user?.id || data.user?.userId || data._id || data.id || data.userId || null
        setCurrentUserId(uid ? String(uid) : null)
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
    } catch { /* non-fatal */ }
  }, [getHeaders])

  useEffect(() => {
    fetchMeal()
    fetchMe()
    fetchTags()
  }, [fetchMeal, fetchMe, fetchTags])

  const isOwner = Boolean(currentUserId && meal?.createdBy && String(meal.createdBy) === currentUserId)

  // Convert this meal into a recipe (a group meant to become a food). This is a
  // MOVE — the meal is replaced by the recipe — so we route to the new recipe.
  const handleConvertToRecipe = async () => {
    if (!meal || converting) return
    setConverting(true)
    try {
      const res = await fetch(`/api/meals/${meal._id}/to-recipe`, {
        method: 'POST',
        headers: getHeaders(),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.recipe?._id) {
        showToast('Converted to a recipe', 'success')
        router.push(`/dashboard/recipes/${data.recipe._id}`)
      } else {
        showToast(data?.error || 'Failed to convert.', 'error')
        setConverting(false)
      }
    } catch {
      showToast('Network error.', 'error')
      setConverting(false)
    }
  }

  const handleDelete = async () => {
    if (!meal) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/meals/${meal._id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      if (res.ok) {
        router.push('/dashboard/meals')
      } else {
        showToast('Failed to delete meal.', 'error')
        setDeleting(false)
      }
    } catch {
      showToast('Network error.', 'error')
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

  if (error || !meal) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <AlertCircle className="h-8 w-8 text-zinc-400" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{error ?? 'Meal not found.'}</p>
          <Link
            href="/dashboard/meals"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black"
          >
            Back to meals
          </Link>
        </div>
      </PageTransition>
    )
  }

  const totalCal = Math.round(meal.totalNutrition?.calories ?? 0)
  const totalP = Math.round(meal.totalNutrition?.protein ?? 0)
  const totalC = Math.round(meal.totalNutrition?.carbs ?? 0)
  const totalF = Math.round(meal.totalNutrition?.fats ?? 0)

  return (
    <PageTransition className="space-y-4 pb-24">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/meals"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Meals
        </Link>
        {isOwner && (
          <div className="flex items-center gap-1" data-tour="meal-actions">
            <button
              onClick={handleConvertToRecipe}
              disabled={converting}
              title="Convert to a recipe (a group meant to be saved as a food)"
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              {converting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowLeftRight className="h-3.5 w-3.5" />
              )}
              To recipe
            </button>
            <Link
              href={`/dashboard/meals/${meal._id}/edit`}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Link>
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Header card */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {meal.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={meal.imageUrl} alt={meal.name} className="h-40 w-full object-cover" />
        ) : (
          <div className="flex h-32 w-full items-center justify-center bg-gradient-to-br from-amber-100 via-orange-100 to-rose-100 text-amber-600/70 dark:from-amber-900/30 dark:via-orange-900/30 dark:to-rose-900/30 dark:text-amber-200/60">
            <ChefHat className="h-10 w-10" />
          </div>
        )}
        <div className="p-4">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white sm:text-2xl">{meal.name}</h1>

          {meal.tags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {meal.tags.map(tag => (
                <span
                  key={tag}
                  className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                >
                  {titleCaseTag(tag)}
                </span>
              ))}
            </div>
          )}

          {/* Macro summary */}
          <div className="mt-3 grid grid-cols-4 gap-2 rounded-lg bg-zinc-50 p-2.5 text-center dark:bg-zinc-800/50" data-tour="meal-macros">
            <div>
              <p className="text-base font-bold text-zinc-900 dark:text-white">{totalCal}</p>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">Cal</p>
            </div>
            <div>
              <p className="text-base font-bold text-blue-600 dark:text-blue-400">{totalP}g</p>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">Protein</p>
            </div>
            <div>
              <p className="text-base font-bold text-green-600 dark:text-green-400">{totalC}g</p>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">Carbs</p>
            </div>
            <div>
              <p className="text-base font-bold text-amber-600 dark:text-amber-400">{totalF}g</p>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">Fats</p>
            </div>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Foods</h2>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {meal.items.map((it, idx) => (
            <div key={idx} className="flex items-center gap-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                  {it.name}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  {it.brand && <span className="text-zinc-400 dark:text-zinc-500">{it.brand} · </span>}
                  {it.servings} × {it.servingSize}{it.servingUnit}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                {Math.round((it.nutrition.calories ?? 0) * it.servings)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Notes — meals hold notes, not cooking instructions (those live on recipes). */}
      {meal.description && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Notes</h2>
          <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">{meal.description}</p>
        </div>
      )}

      {/* Apply button */}
      <div className="sticky bottom-2 left-0 right-0 z-10 rounded-xl border border-zinc-200 bg-white/90 p-2 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
        <button
          onClick={() => setApplySheetOpen(true)}
          data-tour="meal-apply"
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Apply to log
        </button>
      </div>

      {/* Apply sheet — portion + tag + time */}
      <MealApplySheet
        isOpen={applySheetOpen}
        meal={meal ? {
          _id: meal._id,
          name: meal.name,
          imageUrl: meal.imageUrl,
          totalNutrition: meal.totalNutrition,
          recipe: meal.recipe ? { servings: meal.recipe.servings } : undefined,
          tags: meal.tags,
        } : null}
        defaultTag={meal.defaultTag || defaultTagNow()}
        availableTags={tagsResp}
        onClose={() => setApplySheetOpen(false)}
        onApplied={() => {
          showToast('Logged to your day', 'success')
          setTimeout(() => {
            router.push('/dashboard/nutrition')
          }, 600)
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
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">Delete this meal?</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              This won&rsquo;t affect any logs you&rsquo;ve already made from it.
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
