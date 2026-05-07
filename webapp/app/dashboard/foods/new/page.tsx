"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PageTransition from '@/components/PageTransition'
import { ArrowLeft, Loader2, Save, AlertCircle } from 'lucide-react'

const CATEGORIES = [
  'Protein', 'Grain', 'Fruit', 'Vegetable', 'Dairy',
  'Fat', 'Beverage', 'Condiment', 'Snack', 'Other',
] as const

const SERVING_UNITS = ['g', 'oz', 'cup', 'each', 'ml', 'tbsp', 'tsp', 'slice', 'scoop'] as const

export default function NewCustomFoodPage() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [category, setCategory] = useState<string>('Other')
  const [servingSize, setServingSize] = useState<string>('100')
  const [servingUnit, setServingUnit] = useState<string>('g')
  const [displayLabel, setDisplayLabel] = useState('')

  // Required macros
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fats, setFats] = useState('')
  // Optional micros
  const [fiber, setFiber] = useState('')
  const [sugar, setSugar] = useState('')
  const [sodium, setSodium] = useState('')
  const [saturatedFat, setSaturatedFat] = useState('')

  const [bookmark, setBookmark] = useState(true)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Name is required.')
      return
    }
    const ss = Number(servingSize)
    if (!Number.isFinite(ss) || ss <= 0) {
      setError('Serving size must be a positive number.')
      return
    }
    const cal = Number(calories)
    const p = Number(protein)
    const c = Number(carbs)
    const f = Number(fats)
    if (![cal, p, c, f].every(n => Number.isFinite(n) && n >= 0)) {
      setError('Calories, protein, carbs, and fats are required.')
      return
    }

    setSaving(true)

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const variant: Record<string, unknown> = {
      name: 'Default',
      isDefault: true,
      servingSize: ss,
      servingUnit,
      nutrition: {
        calories: cal,
        protein: p,
        carbs: c,
        fats: f,
        fiber: fiber === '' ? undefined : Number(fiber) || 0,
        sugar: sugar === '' ? undefined : Number(sugar) || 0,
        sodium: sodium === '' ? undefined : Number(sodium) || 0,
        saturatedFat: saturatedFat === '' ? undefined : Number(saturatedFat) || 0,
      },
    }

    if (displayLabel.trim()) {
      variant.displayLabel = displayLabel.trim()
    }

    try {
      const res = await fetch('/api/nutrition/foods', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: name.trim(),
          brand: brand.trim() || undefined,
          category,
          variants: [variant],
        }),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d?.error || 'Failed to create food.')
        setSaving(false)
        return
      }

      const data = await res.json()
      const foodId = data?.food?._id ? String(data.food._id) : null

      // Bookmark to My Foods if requested.
      if (bookmark && foodId) {
        try {
          await fetch('/api/me/foods', {
            method: 'POST',
            headers,
            body: JSON.stringify({ foodId }),
          })
        } catch {
          // non-fatal
        }
      }

      // Redirect somewhere useful.
      router.push('/dashboard/meals?tab=foods')
    } catch {
      setError('Network error. Please try again.')
      setSaving(false)
    }
  }

  return (
    <PageTransition className="space-y-5 pb-24">
      <header className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <h1 className="text-lg font-bold text-zinc-900 dark:text-white sm:text-xl">
          New Custom Food
        </h1>
        <div className="w-16" />
      </header>

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Add a food not in our database — Grandma&rsquo;s pancake mix, your homemade
        sauce, anything you eat that you can&rsquo;t find.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label htmlFor="food-name" className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            id="food-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Grandma's Pancake Mix"
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500 dark:focus:border-white dark:focus:ring-white/10"
          />
        </div>

        {/* Brand */}
        <div>
          <label htmlFor="food-brand" className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Brand <span className="text-zinc-400">(optional)</span>
          </label>
          <input
            id="food-brand"
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="e.g. Aunt Jemima"
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500 dark:focus:border-white dark:focus:ring-white/10"
          />
        </div>

        {/* Category */}
        <div>
          <label htmlFor="food-category" className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Category
          </label>
          <select
            id="food-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-white dark:focus:ring-white/10"
          >
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Serving size + unit */}
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label htmlFor="serving-size" className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Serving size <span className="text-red-400">*</span>
            </label>
            <input
              id="serving-size"
              type="number"
              min="0"
              step="0.01"
              value={servingSize}
              onChange={(e) => setServingSize(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-white dark:focus:ring-white/10"
            />
          </div>
          <div>
            <label htmlFor="serving-unit" className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Unit
            </label>
            <select
              id="serving-unit"
              value={servingUnit}
              onChange={(e) => setServingUnit(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-white dark:focus:ring-white/10"
            >
              {SERVING_UNITS.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Display label */}
        <div>
          <label htmlFor="display-label" className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Display label <span className="text-zinc-400">(optional)</span>
          </label>
          <input
            id="display-label"
            type="text"
            value={displayLabel}
            onChange={(e) => setDisplayLabel(e.target.value)}
            placeholder='e.g. "1 medium pancake"'
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500 dark:focus:border-white dark:focus:ring-white/10"
          />
          <p className="mt-1 text-[11px] text-zinc-400">Shown in the picker instead of &quot;{servingSize} {servingUnit}&quot;.</p>
        </div>

        {/* Macros */}
        <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Per serving <span className="text-red-400">*</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Calories" value={calories} onChange={setCalories} />
            <NumberField label="Protein (g)" value={protein} onChange={setProtein} />
            <NumberField label="Carbs (g)" value={carbs} onChange={setCarbs} />
            <NumberField label="Fats (g)" value={fats} onChange={setFats} />
          </div>
        </div>

        {/* Micros */}
        <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Optional details
          </p>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Fiber (g)" value={fiber} onChange={setFiber} />
            <NumberField label="Sugar (g)" value={sugar} onChange={setSugar} />
            <NumberField label="Sodium (mg)" value={sodium} onChange={setSodium} />
            <NumberField label="Sat. fat (g)" value={saturatedFat} onChange={setSaturatedFat} />
          </div>
        </div>

        {/* Bookmark toggle */}
        <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-white">Save to My Foods</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Bookmark for one-tap logging.</p>
          </div>
          <button
            type="button"
            onClick={() => setBookmark(v => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              bookmark ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
            }`}
            aria-pressed={bookmark}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                bookmark ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </label>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="sticky bottom-2 left-0 right-0 z-10 flex gap-2 rounded-xl border border-zinc-200 bg-white/90 p-2 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
          <Link
            href="/dashboard/meals?tab=foods"
            className="flex-1 rounded-lg border border-zinc-200 py-2.5 text-center text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save food'}
          </button>
        </div>
      </form>
    </PageTransition>
  )
}

function NumberField({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
      />
    </label>
  )
}
