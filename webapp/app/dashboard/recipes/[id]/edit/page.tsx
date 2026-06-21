"use client"

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageTransition from '@/components/PageTransition'
import { ArrowLeft, Loader2, AlertCircle, Trash2, Plus } from 'lucide-react'
import { Toast } from '@/components/ui'
import { useToast } from '@/hooks/useToast'

interface IngredientRow {
  name: string
  brand?: string
  amount: number
  unit: string
  // Per-unit nutrition basis so editing `amount` scales nutrition proportionally.
  perUnit: { calories: number; protein: number; carbs: number; fats: number }
  foodId?: string
  variantId?: string
  variantName?: string
}

const r1 = (n: number) => Math.round(n * 10) / 10

export default function RecipeEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { toast, showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [servings, setServings] = useState('1')
  const [prepTime, setPrepTime] = useState('')
  const [cookTime, setCookTime] = useState('')
  const [instructions, setInstructions] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [ingredients, setIngredients] = useState<IngredientRow[]>([])
  const [allTagOptions, setAllTagOptions] = useState<string[]>([])

  const getHeaders = useCallback((): HeadersInit => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true); setError(null)
      try {
        const [recRes, tagsRes] = await Promise.all([
          fetch(`/api/nutrition/recipes/${id}`, { headers: getHeaders() }),
          fetch('/api/tags', { headers: getHeaders() }),
        ])
        if (cancelled) return
        if (!recRes.ok) { setError(recRes.status === 404 ? 'Recipe not found.' : 'Failed to load recipe.'); return }
        const rec = await recRes.json()
        setName(rec.name ?? '')
        setDescription(rec.description ?? '')
        setServings(rec.servings != null ? String(rec.servings) : '1')
        setPrepTime(rec.prepTime != null ? String(rec.prepTime) : '')
        setCookTime(rec.cookTime != null ? String(rec.cookTime) : '')
        setInstructions(Array.isArray(rec.instructions) ? rec.instructions.join('\n') : '')
        setTags(Array.isArray(rec.tags) ? rec.tags : [])
        setIngredients((rec.ingredients ?? []).map((ing: Record<string, unknown>) => {
          const amount = typeof ing.amount === 'number' && ing.amount > 0 ? ing.amount : 1
          const n = (ing.nutrition ?? {}) as Record<string, number>
          return {
            name: String(ing.name ?? ''),
            brand: ing.brand as string | undefined,
            amount,
            unit: String(ing.unit ?? 'serving'),
            perUnit: {
              calories: (n.calories ?? 0) / amount,
              protein: (n.protein ?? 0) / amount,
              carbs: (n.carbs ?? 0) / amount,
              fats: (n.fats ?? 0) / amount,
            },
            foodId: ing.foodId ? String(ing.foodId) : undefined,
            variantId: ing.variantId ? String(ing.variantId) : undefined,
            variantName: ing.variantName as string | undefined,
          }
        }))
        if (tagsRes.ok) {
          const td = await tagsRes.json()
          const defaults: string[] = Array.isArray(td.defaults) ? td.defaults : ['breakfast', 'lunch', 'dinner', 'snack']
          const userTags: string[] = Array.isArray(td.userTags) ? td.userTags : []
          const seen = new Set<string>(); const out: string[] = []
          for (const t of [...defaults, ...userTags]) { const l = String(t).toLowerCase(); if (!seen.has(l)) { seen.add(l); out.push(l) } }
          setAllTagOptions(out)
        }
      } catch {
        if (!cancelled) setError('Network error.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id, getHeaders])

  const setAmount = (idx: number, raw: string) => {
    const amt = Number(raw)
    setIngredients(prev => prev.map((ing, i) => i === idx ? { ...ing, amount: Number.isFinite(amt) && amt >= 0 ? amt : ing.amount } : ing))
  }

  const removeIngredient = (idx: number) => setIngredients(prev => prev.filter((_, i) => i !== idx))

  const toggleTag = (tag: string) =>
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])

  const handleSave = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        servings: Math.max(1, Number(servings) || 1),
        prepTime: prepTime.trim() ? Number(prepTime) : undefined,
        cookTime: cookTime.trim() ? Number(cookTime) : undefined,
        instructions: instructions.split('\n').map(s => s.trim()).filter(Boolean),
        tags,
        // Ingredient nutrition = per-unit × amount (so amount edits scale macros).
        // Sending ingredients makes the API recompute totalsPerServing.
        ingredients: ingredients.map(ing => ({
          ...(ing.foodId ? { foodId: ing.foodId } : {}),
          ...(ing.variantId ? { variantId: ing.variantId } : {}),
          ...(ing.variantName ? { variantName: ing.variantName } : {}),
          name: ing.name,
          amount: ing.amount,
          unit: ing.unit,
          nutrition: {
            calories: Math.round(ing.perUnit.calories * ing.amount),
            protein: r1(ing.perUnit.protein * ing.amount),
            carbs: r1(ing.perUnit.carbs * ing.amount),
            fats: r1(ing.perUnit.fats * ing.amount),
          },
        })),
      }
      const res = await fetch(`/api/nutrition/recipes/${id}`, {
        method: 'PUT', headers: getHeaders(), body: JSON.stringify(payload),
      })
      if (res.ok) {
        showToast('Recipe saved', 'success')
        router.push(`/dashboard/recipes/${id}`)
      } else {
        const d = await res.json().catch(() => null)
        showToast(d?.error || 'Failed to save.', 'error')
        setSaving(false)
      }
    } catch {
      showToast('Network error.', 'error')
      setSaving(false)
    }
  }

  if (loading) {
    return <PageTransition><div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div></PageTransition>
  }
  if (error) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <AlertCircle className="h-8 w-8 text-zinc-400" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
          <Link href="/dashboard/meals" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black">Back to My Stuff</Link>
        </div>
      </PageTransition>
    )
  }

  const inputCls = "w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500 dark:focus:border-white"

  return (
    <PageTransition className="space-y-4 pb-28">
      <div className="flex items-center justify-between">
        <Link href={`/dashboard/recipes/${id}`} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
          <ArrowLeft className="h-4 w-4" /> Cancel
        </Link>
        <h1 className="text-base font-bold text-zinc-900 dark:text-white">Edit recipe</h1>
        <div className="w-16" />
      </div>

      <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="Recipe name" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={inputCls} placeholder="A short description…" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Servings</label>
            <input type="number" inputMode="decimal" min="1" step="any" value={servings} onChange={e => setServings(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Prep (min)</label>
            <input type="number" inputMode="numeric" min="0" step="any" value={prepTime} onChange={e => setPrepTime(e.target.value)} className={inputCls} placeholder="—" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Cook (min)</label>
            <input type="number" inputMode="numeric" min="0" step="any" value={cookTime} onChange={e => setCookTime(e.target.value)} className={inputCls} placeholder="—" />
          </div>
        </div>
        {allTagOptions.length > 0 && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {allTagOptions.map(tag => {
                const active = tags.includes(tag)
                return (
                  <button key={tag} type="button" onClick={() => toggleTag(tag)}
                    className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${active ? 'bg-zinc-900 text-white dark:bg-white dark:text-black' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}>
                    {tag}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Ingredients — edit amount or remove. (Add a new ingredient by converting
          to a meal, adding the food, and converting back — picker add is next.) */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Ingredients</h2>
        {ingredients.length === 0 ? (
          <p className="py-2 text-sm text-zinc-400">No ingredients.</p>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {ingredients.map((ing, idx) => (
              <div key={idx} className="flex items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">{ing.name}</p>
                  <p className="text-xs text-zinc-400">{Math.round(ing.perUnit.calories * ing.amount)} cal</p>
                </div>
                <input
                  type="number" inputMode="decimal" min="0" step="any" value={ing.amount}
                  onChange={e => setAmount(idx, e.target.value)}
                  className="w-16 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-center text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  aria-label={`Amount of ${ing.name}`}
                />
                <span className="w-12 shrink-0 truncate text-xs text-zinc-500">{ing.unit}</span>
                <button onClick={() => removeIngredient(idx)} aria-label={`Remove ${ing.name}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Cooking instructions</label>
        <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={6}
          placeholder="One step per line…"
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500" />
      </div>

      <div className="sticky bottom-2 left-0 right-0 z-10 rounded-xl border border-zinc-200 bg-white/90 p-2 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
        <button onClick={handleSave} disabled={saving || !name.trim()}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Save recipe
        </button>
      </div>

      <Toast toast={toast} />
    </PageTransition>
  )
}
