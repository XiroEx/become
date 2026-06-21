"use client"

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import PageTransition from '@/components/PageTransition'
import FoodLogSheet from '@/components/meals/FoodLogSheet'
import {
  ArrowLeft,
  Trash2,
  ScrollText,
  Loader2,
  AlertCircle,
  Clock,
  Users,
  BookmarkPlus,
  Check,
  ArrowLeftRight,
} from 'lucide-react'
import { Toast } from '@/components/ui'
import { useToast } from '@/hooks/useToast'

interface RecipeIngredient {
  name: string
  brand?: string
  amount: number
  unit: string
  nutrition: { calories: number; protein: number; carbs: number; fats: number }
}

interface RecipeResponse {
  _id: string
  name: string
  description?: string
  imageUrl?: string
  tags?: string[]
  servings?: number
  prepTime?: number
  cookTime?: number
  ingredients: RecipeIngredient[]
  instructions?: string[]
  totalsPerServing?: { calories: number; protein: number; carbs: number; fats: number; fiber?: number }
  savedFoodId?: string
  createdBy?: string
}

interface MeResponse {
  user?: { _id?: string; id?: string; userId?: string }
  _id?: string; id?: string; userId?: string
}

function getDefaultTagForNow(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 11) return 'breakfast'
  if (h >= 11 && h < 14) return 'lunch'
  if (h >= 17 && h < 21) return 'dinner'
  return 'snack'
}

function titleCaseTag(tag: string): string {
  return tag.split(/[-_\s]+/).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('-')
}

export default function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [recipe, setRecipe] = useState<RecipeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savedFoodId, setSavedFoodId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [converting, setConverting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [logTargetFood, setLogTargetFood] = useState<Record<string, unknown> | null>(null)
  const [tagsResp, setTagsResp] = useState<{ defaults: string[]; userTags: string[] }>({ defaults: [], userTags: [] })
  const { toast, showToast } = useToast()

  const getHeaders = useCallback((): HeadersInit => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
  }, [])

  const fetchRecipe = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/nutrition/recipes/${id}`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setRecipe(data)
        setSavedFoodId(data.savedFoodId ? String(data.savedFoodId) : null)
      } else if (res.status === 404) setError('Recipe not found.')
      else setError('Failed to load recipe.')
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
    } catch { /* non-fatal */ }
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

  useEffect(() => { fetchRecipe(); fetchMe(); fetchTags() }, [fetchRecipe, fetchMe, fetchTags])

  const isOwner = Boolean(currentUserId && recipe?.createdBy && String(recipe.createdBy) === currentUserId)

  // Save-or-Log: recipes are never logged directly. First tap mints (or reuses)
  // a Food; once saved, tapping logs that Food.
  const handleSaveOrLog = async () => {
    if (!recipe || busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/nutrition/recipes/${recipe._id}/save-as-food`, { method: 'POST', headers: getHeaders() })
      const data = await res.json().catch(() => null)
      if (!res.ok) { showToast(data?.error || 'Could not save.', 'error'); return }
      const wasSaved = savedFoodId || data?.alreadyExisted
      setSavedFoodId(prev => prev || data?.food?._id || data?.food?.id || 'saved')
      if (wasSaved && data?.food) setLogTargetFood(data.food)
      else showToast('Saved to your Foods — tap again to log it', 'success')
    } catch {
      showToast('Could not save.', 'error')
    } finally {
      setBusy(false)
    }
  }

  // Convert to a meal (loggable group). MOVE — replaces the recipe — so route to it.
  const handleConvertToMeal = async () => {
    if (!recipe || converting) return
    setConverting(true)
    try {
      const res = await fetch(`/api/nutrition/recipes/${recipe._id}/to-meal`, { method: 'POST', headers: getHeaders() })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.meal?._id) {
        showToast('Converted to a meal', 'success')
        router.push(`/dashboard/meals/${data.meal._id}`)
      } else { showToast(data?.error || 'Failed to convert.', 'error'); setConverting(false) }
    } catch {
      showToast('Network error.', 'error'); setConverting(false)
    }
  }

  const handleDelete = async () => {
    if (!recipe) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/nutrition/recipes/${recipe._id}`, { method: 'DELETE', headers: getHeaders() })
      if (res.ok) router.push('/dashboard/meals')
      else { showToast('Failed to delete recipe.', 'error'); setDeleting(false) }
    } catch {
      showToast('Network error.', 'error'); setDeleting(false)
    }
  }

  if (loading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
      </PageTransition>
    )
  }

  if (error || !recipe) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <AlertCircle className="h-8 w-8 text-zinc-400" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{error ?? 'Recipe not found.'}</p>
          <Link href="/dashboard/meals" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black">Back to My Stuff</Link>
        </div>
      </PageTransition>
    )
  }

  const t = recipe.totalsPerServing
  const cal = Math.round(t?.calories ?? 0)
  const p = Math.round(t?.protein ?? 0)
  const c = Math.round(t?.carbs ?? 0)
  const f = Math.round(t?.fats ?? 0)
  const isSaved = Boolean(savedFoodId)

  return (
    <PageTransition className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/meals" className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
          <ArrowLeft className="h-4 w-4" />
          My Stuff
        </Link>
        {isOwner && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleConvertToMeal}
              disabled={converting}
              title="Convert to a meal (a loggable group of foods)"
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              {converting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeftRight className="h-3.5 w-3.5" />}
              To meal
            </button>
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
        {recipe.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={recipe.imageUrl} alt={recipe.name} className="h-40 w-full object-cover" />
        ) : (
          <div className="flex h-32 w-full items-center justify-center bg-gradient-to-br from-violet-100 via-purple-100 to-fuchsia-100 text-violet-600/70 dark:from-violet-900/30 dark:via-purple-900/30 dark:to-fuchsia-900/30 dark:text-violet-200/60">
            <ScrollText className="h-10 w-10" />
          </div>
        )}
        <div className="p-4">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white sm:text-2xl">{recipe.name}</h1>

          <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-600 dark:text-zinc-400">
            {recipe.prepTime != null && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Prep {recipe.prepTime}m</span>}
            {recipe.cookTime != null && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Cook {recipe.cookTime}m</span>}
            {recipe.servings != null && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {recipe.servings} servings</span>}
          </div>

          {recipe.tags && recipe.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {recipe.tags.map(tag => (
                <span key={tag} className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{titleCaseTag(tag)}</span>
              ))}
            </div>
          )}

          <p className="mt-3 text-[11px] uppercase tracking-wide text-zinc-400">Per serving</p>
          <div className="mt-1 grid grid-cols-4 gap-2 rounded-lg bg-zinc-50 p-2.5 text-center dark:bg-zinc-800/50">
            <div><p className="text-base font-bold text-zinc-900 dark:text-white">{cal}</p><p className="text-[10px] uppercase tracking-wide text-zinc-500">Cal</p></div>
            <div><p className="text-base font-bold text-blue-600 dark:text-blue-400">{p}g</p><p className="text-[10px] uppercase tracking-wide text-zinc-500">Protein</p></div>
            <div><p className="text-base font-bold text-green-600 dark:text-green-400">{c}g</p><p className="text-[10px] uppercase tracking-wide text-zinc-500">Carbs</p></div>
            <div><p className="text-base font-bold text-amber-600 dark:text-amber-400">{f}g</p><p className="text-[10px] uppercase tracking-wide text-zinc-500">Fats</p></div>
          </div>
        </div>
      </div>

      {/* Ingredients */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Ingredients</h2>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {recipe.ingredients.map((ing, idx) => (
            <div key={idx} className="flex items-center gap-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{ing.name}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{ing.amount} {ing.unit}</p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">{Math.round(ing.nutrition?.calories ?? 0)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Cooking instructions — recipes retain these (meals don't). */}
      {recipe.instructions && recipe.instructions.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Cooking instructions</h2>
          <ol className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
            {recipe.instructions.map((step, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="shrink-0 font-semibold text-zinc-400">{idx + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Save-or-Log CTA — recipes become a food, then log that food. */}
      <div className="sticky bottom-2 left-0 right-0 z-10 rounded-xl border border-zinc-200 bg-white/90 p-2 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
        <button
          onClick={handleSaveOrLog}
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" />
            : isSaved ? <><Check className="h-4 w-4" /> Log this food</>
            : <><BookmarkPlus className="h-4 w-4" /> Save as food</>}
        </button>
      </div>

      <FoodLogSheet
        isOpen={!!logTargetFood}
        food={logTargetFood as Parameters<typeof FoodLogSheet>[0]['food']}
        defaultTag={getDefaultTagForNow()}
        availableTags={tagsResp}
        onClose={() => setLogTargetFood(null)}
        onLogged={() => { showToast('Logged to your day', 'success'); setLogTargetFood(null) }}
      />

      {confirmDelete && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !deleting && setConfirmDelete(false)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">Delete this recipe?</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">This won&rsquo;t affect any food you&rsquo;ve already saved from it.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirmDelete(false)} disabled={deleting} className="flex-1 rounded-lg border border-zinc-200 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40">
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
