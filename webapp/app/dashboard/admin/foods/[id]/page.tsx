'use client'

// ---------------------------------------------------------------------------
// Admin Foods — detail / edit view.
//
// Lets an admin:
//   - Edit name / brand / category / aliases
//   - Toggle isVerified / isFirstClass / needsReview
//   - Edit each variant's name, default flag, serving size/unit, displayLabel,
//     nutrition, gramsPerServing, mlPerServing, and alternateServings
//   - Re-import from USDA (overwrites the variant)
//   - Delete the food
//
// "Save" PATCHes the whole dirty object — we only send keys that changed.
// ---------------------------------------------------------------------------

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Loader2,
  Trash2,
  AlertCircle,
  Plus,
  X,
  RefreshCw,
  Save,
  Check,
  Split as SplitIcon,
  GitMerge,
  Search,
} from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import { Card } from '@/components/ui/Card'
import BridgeFieldGroup, { type BridgeValues } from '@/components/nutrition/BridgeFieldGroup'
import { paginateVariants, VARIANTS_PAGE_SIZE } from '@/lib/foodVariantPagination'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Variant {
  _id?: string
  name: string
  isDefault: boolean
  servingSize: number
  servingUnit: string
  displayLabel?: string
  alternateServings: { label: string; multiplier: number }[]
  gramsPerServing?: number
  mlPerServing?: number
  externalId?: string
  externalDataType?: string
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

interface AdminFood {
  _id: string
  name: string
  brand?: string
  category?: string
  source?: 'manual' | 'usda' | 'openfoodfacts'
  externalId?: string
  externalDataType?: string
  needsReview?: boolean
  isVerified?: boolean
  isFirstClass?: boolean
  groupKey?: string
  imageUrl?: string
  barcode?: string
  variants: Variant[]
  aliases?: string[]
  usageCount?: number
  servingSize: number
  servingUnit: string
  displayLabel?: string
  gramsPerServing?: number
  mlPerServing?: number
  nutrition: Variant['nutrition']
  createdAt?: string
  updatedAt?: string
}

interface ReviewIssue {
  code: string
  message: string
}

const CATEGORIES = [
  'Protein', 'Grain', 'Fruit', 'Vegetable', 'Dairy',
  'Fat', 'Beverage', 'Condiment', 'Snack', 'Other',
] as const

const SERVING_UNITS = [
  'g', 'oz', 'cup', 'each', 'ml', 'tbsp', 'tsp', 'slice', 'scoop', 'serving',
] as const

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function NutritionField({
  label,
  value,
  onChange,
  unit = 'g',
  step = '0.1',
}: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
  unit?: string
  step?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </span>
      <div className="relative">
        <input
          type="number"
          step={step}
          value={value ?? ''}
          onChange={e => {
            const v = e.target.value
            onChange(v === '' ? undefined : Number(v))
          }}
          className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 pr-8 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-100 dark:focus:ring-zinc-100/10"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400">
          {unit}
        </span>
      </div>
    </label>
  )
}

function AlternateServingsEditor({
  servings,
  onChange,
}: {
  servings: { label: string; multiplier: number }[]
  onChange: (next: { label: string; multiplier: number }[]) => void
}) {
  return (
    <div className="space-y-2">
      {servings.map((s, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type="text"
            value={s.label}
            onChange={e => {
              const next = servings.slice()
              next[idx] = { ...s, label: e.target.value }
              onChange(next)
            }}
            placeholder="Label (e.g. 1 cup)"
            className="flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <input
            type="number"
            step="0.001"
            value={s.multiplier}
            onChange={e => {
              const next = servings.slice()
              next[idx] = { ...s, multiplier: Number(e.target.value) || 0 }
              onChange(next)
            }}
            placeholder="×"
            className="w-20 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="button"
            onClick={() => onChange(servings.filter((_, i) => i !== idx))}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
            aria-label="Remove serving"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...servings, { label: '', multiplier: 1 }])}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        <Plus className="h-3 w-3" />
        Add serving
      </button>
    </div>
  )
}

function VariantEditor({
  variant,
  index,
  onChange,
  onRemove,
  canRemove,
  onSplit,
  canSplit,
  splitting,
}: {
  variant: Variant
  index: number
  onChange: (next: Variant) => void
  onRemove: () => void
  canRemove: boolean
  onSplit?: () => void
  canSplit?: boolean
  splitting?: boolean
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Variant #{index + 1}
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={variant.isDefault}
            onChange={e => onChange({ ...variant, isDefault: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
          />
          Default
        </label>
        {canSplit && onSplit && (
          <button
            type="button"
            onClick={onSplit}
            disabled={splitting}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50 dark:hover:bg-amber-900/20 dark:hover:text-amber-400"
            title="Split this variant into its own food"
          >
            {splitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <SplitIcon className="h-3 w-3" />}
            Split
          </button>
        )}
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
            aria-label="Remove variant"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {(variant.externalId || variant.externalDataType) && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-400">
          {variant.externalDataType && (
            <span className="rounded bg-zinc-200 px-1.5 py-0.5 dark:bg-zinc-700">
              {variant.externalDataType}
            </span>
          )}
          {variant.externalId && (
            <span className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono dark:bg-zinc-700">
              fdcId {variant.externalId}
            </span>
          )}
        </div>
      )}

      <div className="space-y-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Variant name</span>
          <input
            type="text"
            value={variant.name}
            onChange={e => onChange({ ...variant, name: e.target.value })}
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Serving size</span>
            <input
              type="number"
              step="0.01"
              value={variant.servingSize}
              onChange={e => onChange({ ...variant, servingSize: Number(e.target.value) || 0 })}
              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Unit</span>
            <select
              value={variant.servingUnit}
              onChange={e => onChange({ ...variant, servingUnit: e.target.value })}
              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {SERVING_UNITS.map(u => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Display label (optional)</span>
          <input
            type="text"
            value={variant.displayLabel ?? ''}
            placeholder="1 cup (240 g)"
            onChange={e => onChange({ ...variant, displayLabel: e.target.value || undefined })}
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>

        <div>
          <p className="mb-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Nutrition (per serving)</p>
          <div className="grid grid-cols-2 gap-2">
            <NutritionField
              label="Calories"
              value={variant.nutrition.calories}
              unit=""
              onChange={v =>
                onChange({ ...variant, nutrition: { ...variant.nutrition, calories: v ?? 0 } })
              }
            />
            <NutritionField
              label="Protein"
              value={variant.nutrition.protein}
              onChange={v =>
                onChange({ ...variant, nutrition: { ...variant.nutrition, protein: v ?? 0 } })
              }
            />
            <NutritionField
              label="Carbs"
              value={variant.nutrition.carbs}
              onChange={v =>
                onChange({ ...variant, nutrition: { ...variant.nutrition, carbs: v ?? 0 } })
              }
            />
            <NutritionField
              label="Fats"
              value={variant.nutrition.fats}
              onChange={v =>
                onChange({ ...variant, nutrition: { ...variant.nutrition, fats: v ?? 0 } })
              }
            />
            <NutritionField
              label="Fiber"
              value={variant.nutrition.fiber}
              onChange={v =>
                onChange({ ...variant, nutrition: { ...variant.nutrition, fiber: v } })
              }
            />
            <NutritionField
              label="Sugar"
              value={variant.nutrition.sugar}
              onChange={v =>
                onChange({ ...variant, nutrition: { ...variant.nutrition, sugar: v } })
              }
            />
            <NutritionField
              label="Sodium"
              value={variant.nutrition.sodium}
              unit="mg"
              onChange={v =>
                onChange({ ...variant, nutrition: { ...variant.nutrition, sodium: v } })
              }
            />
            <NutritionField
              label="Sat. fat"
              value={variant.nutrition.saturatedFat}
              onChange={v =>
                onChange({ ...variant, nutrition: { ...variant.nutrition, saturatedFat: v } })
              }
            />
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Bridges</p>
          <BridgeFieldGroup
            collapsible={false}
            value={{ gramsPerServing: variant.gramsPerServing, mlPerServing: variant.mlPerServing }}
            onChange={(b: BridgeValues) =>
              onChange({
                ...variant,
                gramsPerServing: b.gramsPerServing,
                mlPerServing: b.mlPerServing,
              })
            }
            servingUnit={variant.servingUnit}
          />
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Alternate servings</p>
          <AlternateServingsEditor
            servings={variant.alternateServings ?? []}
            onChange={alt => onChange({ ...variant, alternateServings: alt })}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminFoodDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [food, setFood] = useState<AdminFood | null>(null)
  const [original, setOriginal] = useState<AdminFood | null>(null)
  const [issues, setIssues] = useState<ReviewIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [reimporting, setReimporting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [splittingVariantId, setSplittingVariantId] = useState<string | null>(null)
  const [mergePickerOpen, setMergePickerOpen] = useState(false)
  const [mergeQuery, setMergeQuery] = useState('')
  const [mergeResults, setMergeResults] = useState<Array<{
    _id: string
    name: string
    brand?: string
    source?: string
    externalDataType?: string
    variants?: { _id?: string }[]
  }>>([])
  const [mergeSearching, setMergeSearching] = useState(false)
  const [merging, setMerging] = useState(false)

  // Variant pagination + filter (scales the list past the 12-cap and any
  // admin-added overflow). Page index is 0-based.
  const [variantFilter, setVariantFilter] = useState('')
  const [variantPage, setVariantPage] = useState(0)

  // Related-foods lazy-load: siblings live in their own collapsible section.
  // We don't fetch the list until the admin opens it (the search API is
  // cheap, but every byte counts on the heaviest admin page).
  const [siblingsOpen, setSiblingsOpen] = useState(false)
  const [siblingsLoading, setSiblingsLoading] = useState(false)
  const [siblings, setSiblings] = useState<Array<{
    _id: string
    name: string
    brand?: string
    source?: string
    externalDataType?: string
    variants?: { _id?: string }[]
  }>>([])
  const [expandedSiblingId, setExpandedSiblingId] = useState<string | null>(null)
  const [expandedSiblingDetail, setExpandedSiblingDetail] = useState<unknown>(null)
  const [expandedSiblingLoading, setExpandedSiblingLoading] = useState(false)

  const headers = useCallback((): HeadersInit => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const h: HeadersInit = { 'Content-Type': 'application/json' }
    if (token) h['Authorization'] = `Bearer ${token}`
    return h
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/foods/${id}`, { headers: headers() })
      if (!res.ok) {
        if (res.status === 404) setError('Food not found.')
        else setError('Failed to load food.')
        return
      }
      const data = (await res.json()) as { food: AdminFood; issues: ReviewIssue[] }
      setFood(data.food)
      setOriginal(data.food)
      setIssues(data.issues ?? [])
    } catch {
      setError('Network error.')
    } finally {
      setLoading(false)
    }
  }, [headers, id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const dirty = (() => {
    if (!food || !original) return false
    return JSON.stringify(food) !== JSON.stringify(original)
  })()

  const save = async () => {
    if (!food || !original || saving) return
    setSaving(true)
    try {
      // Build a sparse patch — only fields that changed.
      const patch: Record<string, unknown> = {}
      if (food.name !== original.name) patch.name = food.name
      if ((food.brand ?? '') !== (original.brand ?? '')) patch.brand = food.brand ?? ''
      if (food.category !== original.category) patch.category = food.category
      if (Boolean(food.isVerified) !== Boolean(original.isVerified)) patch.isVerified = !!food.isVerified
      if (Boolean(food.isFirstClass) !== Boolean(original.isFirstClass)) patch.isFirstClass = !!food.isFirstClass
      if (Boolean(food.needsReview) !== Boolean(original.needsReview)) patch.needsReview = !!food.needsReview
      if (JSON.stringify(food.aliases ?? []) !== JSON.stringify(original.aliases ?? [])) {
        patch.aliases = food.aliases ?? []
      }
      if (JSON.stringify(food.variants) !== JSON.stringify(original.variants)) {
        patch.variants = food.variants
      }

      if (Object.keys(patch).length === 0) {
        setToast({ message: 'No changes', type: 'success' })
        return
      }

      const res = await fetch(`/api/admin/foods/${id}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setToast({ message: (data as { error?: string }).error ?? 'Save failed', type: 'error' })
        return
      }
      const data = (await res.json()) as { food: AdminFood; issues: ReviewIssue[] }
      setFood(data.food)
      setOriginal(data.food)
      setIssues(data.issues ?? [])
      setToast({ message: 'Saved', type: 'success' })
    } catch {
      setToast({ message: 'Network error', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const reimport = async () => {
    if (!food || reimporting) return
    setReimporting(true)
    try {
      const res = await fetch(`/api/admin/foods/${id}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ action: 'reimport-usda' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setToast({ message: (data as { error?: string }).error ?? 'Re-import failed', type: 'error' })
        return
      }
      const data = (await res.json()) as { food: AdminFood; issues: ReviewIssue[] }
      setFood(data.food)
      setOriginal(data.food)
      setIssues(data.issues ?? [])
      setToast({ message: 'Re-imported from USDA', type: 'success' })
    } catch {
      setToast({ message: 'Network error', type: 'error' })
    } finally {
      setReimporting(false)
    }
  }

  const remove = async () => {
    if (!food || deleting) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/foods/${id}`, {
        method: 'DELETE',
        headers: headers(),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setToast({ message: (data as { error?: string }).error ?? 'Delete failed', type: 'error' })
        setDeleting(false)
        return
      }
      router.push('/dashboard/admin/foods')
    } catch {
      setToast({ message: 'Network error', type: 'error' })
      setDeleting(false)
    }
  }

  const splitVariant = async (variantId: string) => {
    if (!food || splittingVariantId) return
    setSplittingVariantId(variantId)
    try {
      const res = await fetch(`/api/admin/foods/${id}/split`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ variantId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setToast({ message: (data as { error?: string }).error ?? 'Split failed', type: 'error' })
        return
      }
      const data = (await res.json()) as { food: AdminFood }
      setToast({ message: `Split into "${data.food.name}"`, type: 'success' })
      // Navigate to the new food so the admin can curate it.
      router.push(`/dashboard/admin/foods/${data.food._id}`)
    } catch {
      setToast({ message: 'Network error', type: 'error' })
    } finally {
      setSplittingVariantId(null)
    }
  }

  const searchMergeTargets = async (q: string) => {
    setMergeQuery(q)
    if (!q.trim() || !food) {
      setMergeResults([])
      return
    }
    setMergeSearching(true)
    try {
      const params = new URLSearchParams({
        q,
        limit: '12',
      })
      // Match source so admins don't accidentally try to merge USDA into OFF.
      if (food.source) params.set('source', food.source)
      const res = await fetch(`/api/admin/foods?${params.toString()}`, {
        headers: headers(),
      })
      if (!res.ok) {
        setMergeResults([])
        return
      }
      const data = (await res.json()) as { foods: typeof mergeResults }
      // Don't allow selecting the food itself.
      setMergeResults(data.foods.filter(f => f._id !== id))
    } catch {
      setMergeResults([])
    } finally {
      setMergeSearching(false)
    }
  }

  const mergeInto = async (targetId: string) => {
    if (!food || merging) return
    setMerging(true)
    try {
      const res = await fetch(`/api/admin/foods/${id}/merge`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ targetId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setToast({ message: (data as { error?: string }).error ?? 'Merge failed', type: 'error' })
        return
      }
      setToast({ message: 'Merged', type: 'success' })
      // Source food is gone — navigate to the target.
      router.push(`/dashboard/admin/foods/${targetId}`)
    } catch {
      setToast({ message: 'Network error', type: 'error' })
    } finally {
      setMerging(false)
      setMergePickerOpen(false)
    }
  }

  if (loading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      </PageTransition>
    )
  }

  if (error || !food) {
    return (
      <PageTransition>
        <Card variant="default" className="text-center">
          <p className="py-8 text-sm text-zinc-500">{error ?? 'Food not found.'}</p>
          <Link
            href="/dashboard/admin/foods"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black"
          >
            Back to Foods
          </Link>
        </Card>
      </PageTransition>
    )
  }

  return (
    <PageTransition className="space-y-3 pb-32">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/admin/foods"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" />
          All foods
        </Link>
        <button
          onClick={() => setConfirmDelete(true)}
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>

      {/* Title block */}
      <Card variant="default">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{food.name}</h1>
            {food.brand && <p className="text-sm text-zinc-500">{food.brand}</p>}
            <p className="mt-1 text-[11px] text-zinc-500">
              {food.source && <span className="uppercase">{food.source}</span>}
              {food.externalDataType && <span> · {food.externalDataType}</span>}
              {food.externalId && <span> · ID {food.externalId}</span>}
              {food.groupKey && <span> · group: {food.groupKey}</span>}
              {food.usageCount != null && <span> · used {food.usageCount}×</span>}
            </p>
          </div>
        </div>
      </Card>

      {/* Review issues */}
      {issues.length > 0 && (
        <Card variant="default" accent="danger">
          <div className="pl-2">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-red-600 dark:text-red-400">
              Auto-flag reasons
            </p>
            <ul className="space-y-1">
              {issues.map((iss, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />
                  <span>{iss.message}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {/* Status toggles */}
      <Card variant="default">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">Status</p>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={!!food.needsReview}
              onChange={e => setFood({ ...food, needsReview: e.target.checked })}
              className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
            />
            Needs review
          </label>
          <label className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={!!food.isVerified}
              onChange={e => setFood({ ...food, isVerified: e.target.checked })}
              className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
            />
            Verified
          </label>
          <label className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={!!food.isFirstClass}
              onChange={e => setFood({ ...food, isFirstClass: e.target.checked })}
              className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
            />
            First class
          </label>
        </div>
      </Card>

      {/* Top-level fields */}
      <Card variant="default">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">Identity</p>
        <div className="space-y-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Name</span>
            <input
              type="text"
              value={food.name}
              onChange={e => setFood({ ...food, name: e.target.value })}
              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Brand</span>
            <input
              type="text"
              value={food.brand ?? ''}
              onChange={e => setFood({ ...food, brand: e.target.value })}
              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Category</span>
            <select
              value={food.category ?? 'Other'}
              onChange={e => setFood({ ...food, category: e.target.value })}
              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {CATEGORIES.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">Aliases (comma-separated)</span>
            <input
              type="text"
              value={(food.aliases ?? []).join(', ')}
              onChange={e =>
                setFood({
                  ...food,
                  aliases: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                })
              }
              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
        </div>
      </Card>

      {/* Source-specific actions */}
      {food.source === 'usda' && food.externalId && (
        <Card variant="default">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">USDA source</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                Re-fetch the latest detail and overwrite the default variant.
              </p>
            </div>
            <button
              type="button"
              onClick={reimport}
              disabled={reimporting}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {reimporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Re-import
            </button>
          </div>
        </Card>
      )}

      {/* Merge into another food */}
      <Card variant="default">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Merge</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Move all variants into another food, then delete this one. Same source only.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setMergePickerOpen(o => !o)
              if (!mergePickerOpen) {
                setMergeQuery('')
                setMergeResults([])
              }
            }}
            disabled={merging}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <GitMerge className="h-3.5 w-3.5" />
            {mergePickerOpen ? 'Cancel' : 'Merge into another food'}
          </button>
        </div>

        {mergePickerOpen && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={mergeQuery}
                onChange={e => searchMergeTargets(e.target.value)}
                placeholder="Search foods..."
                className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                autoFocus
              />
            </div>
            {mergeSearching && (
              <p className="text-xs text-zinc-500">Searching...</p>
            )}
            {!mergeSearching && mergeQuery && mergeResults.length === 0 && (
              <p className="text-xs text-zinc-500">No matches.</p>
            )}
            {mergeResults.length > 0 && (
              <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
                {mergeResults.map(t => (
                  <li key={t._id}>
                    <button
                      type="button"
                      onClick={() => mergeInto(t._id)}
                      disabled={merging}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:opacity-50 dark:hover:bg-zinc-800"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {t.name}
                        </p>
                        <p className="truncate text-[11px] text-zinc-500">
                          {t.brand && <>{t.brand} · </>}
                          {t.source && <span className="uppercase">{t.source}</span>}
                          {t.externalDataType && <> · {t.externalDataType}</>}
                          {Array.isArray(t.variants) && (
                            <> · {t.variants.length} variant{t.variants.length === 1 ? '' : 's'}</>
                          )}
                        </p>
                      </div>
                      <GitMerge className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      {/* Variants — paginated + filtered for scale.
        * Page size: VARIANTS_PAGE_SIZE (20). visibleIndices map back to the
        * original food.variants array so edit/remove callbacks still target
        * the right row when the filter narrows the visible set. */}
      <Card variant="default">
        {(() => {
          const paged = paginateVariants(food.variants, {
            filter: variantFilter,
            page: variantPage,
            pageSize: VARIANTS_PAGE_SIZE,
          })
          return (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                  Variants ({food.variants.length})
                  {variantFilter ? <> · {paged.filteredTotal} match{paged.filteredTotal === 1 ? '' : 'es'}</> : null}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setFood({
                      ...food,
                      variants: [
                        ...food.variants,
                        {
                          name: 'New variant',
                          isDefault: false,
                          servingSize: 100,
                          servingUnit: 'g',
                          alternateServings: [],
                          nutrition: { calories: 0, protein: 0, carbs: 0, fats: 0 },
                        },
                      ],
                    })
                  }
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  <Plus className="h-3 w-3" />
                  Add variant
                </button>
              </div>

              {food.variants.length > VARIANTS_PAGE_SIZE && (
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={variantFilter}
                    onChange={e => {
                      setVariantFilter(e.target.value)
                      setVariantPage(0)
                    }}
                    placeholder="Filter variants by name, externalId, or dataType..."
                    data-testid="variant-filter"
                    className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
              )}

              <div className="space-y-3" data-testid="variants-list">
                {paged.visible.map((v, displayIdx) => {
                  const idx = paged.visibleIndices[displayIdx]
                  return (
                    <VariantEditor
                      key={v._id ?? `new-${idx}`}
                      index={idx}
                      variant={v}
                      canRemove={food.variants.length > 1}
                      canSplit={food.variants.length > 1 && !!v._id && !dirty}
                      splitting={splittingVariantId === v._id}
                      onSplit={v._id ? () => splitVariant(v._id!) : undefined}
                      onRemove={() =>
                        setFood({
                          ...food,
                          variants: food.variants.filter((_, i) => i !== idx),
                        })
                      }
                      onChange={next => {
                        const variants = food.variants.slice()
                        if (next.isDefault && !food.variants[idx].isDefault) {
                          for (let i = 0; i < variants.length; i++) variants[i] = { ...variants[i], isDefault: false }
                        }
                        variants[idx] = next
                        setFood({ ...food, variants })
                      }}
                    />
                  )
                })}
                {paged.visible.length === 0 && (
                  <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-center text-xs text-zinc-500 dark:border-zinc-700">
                    No variants match the filter.
                  </p>
                )}
              </div>

              {paged.totalPages > 1 && (
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                  <button
                    type="button"
                    onClick={() => setVariantPage(p => Math.max(0, p - 1))}
                    disabled={!paged.hasPrev}
                    data-testid="variants-prev"
                    className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Prev
                  </button>
                  <span className="text-[11px] text-zinc-500" data-testid="variants-page-indicator">
                    Page {paged.page + 1} of {paged.totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setVariantPage(p => p + 1)}
                    disabled={!paged.hasNext}
                    data-testid="variants-next"
                    className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )
        })()}
      </Card>

      {/* Related foods (siblings by groupKey) — lazy-loaded on expand */}
      {food.groupKey && (
        <Card variant="default">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
              Related foods
            </p>
            <button
              type="button"
              data-testid="siblings-toggle"
              onClick={async () => {
                const opening = !siblingsOpen
                setSiblingsOpen(opening)
                if (opening && siblings.length === 0 && !siblingsLoading) {
                  setSiblingsLoading(true)
                  try {
                    const res = await fetch(
                      `/api/admin/foods?groupKey=${encodeURIComponent(food.groupKey!)}&limit=50`,
                      { headers: headers() },
                    )
                    if (res.ok) {
                      const data = await res.json()
                      const list = Array.isArray(data.foods) ? data.foods : []
                      setSiblings(list.filter((f: { _id: string }) => f._id !== food._id))
                    }
                  } catch {
                    /* swallow — admin can retry */
                  } finally {
                    setSiblingsLoading(false)
                  }
                }
              }}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {siblingsOpen ? 'Hide siblings' : 'Show siblings'}
            </button>
          </div>

          {siblingsOpen && (
            <div className="mt-3" data-testid="siblings-list">
              {siblingsLoading && <p className="text-xs text-zinc-500">Loading…</p>}
              {!siblingsLoading && siblings.length === 0 && (
                <p className="text-xs text-zinc-500">No other foods share this groupKey.</p>
              )}
              {siblings.length > 0 && (
                <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
                  {siblings.map(s => (
                    <li key={s._id} data-testid="sibling-row">
                      <button
                        type="button"
                        data-testid="sibling-expand"
                        onClick={async () => {
                          const opening = expandedSiblingId !== s._id
                          setExpandedSiblingId(opening ? s._id : null)
                          setExpandedSiblingDetail(null)
                          if (opening) {
                            setExpandedSiblingLoading(true)
                            try {
                              const res = await fetch(`/api/admin/foods/${s._id}`, { headers: headers() })
                              if (res.ok) setExpandedSiblingDetail(await res.json())
                            } catch {
                              /* swallow */
                            } finally {
                              setExpandedSiblingLoading(false)
                            }
                          }
                        }}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {s.name}
                          </p>
                          <p className="truncate text-[11px] text-zinc-500">
                            {s.brand && <>{s.brand} · </>}
                            {s.source && <span className="uppercase">{s.source}</span>}
                            {s.externalDataType && <> · {s.externalDataType}</>}
                            {Array.isArray(s.variants) && (
                              <> · {s.variants.length} variant{s.variants.length === 1 ? '' : 's'}</>
                            )}
                          </p>
                        </div>
                      </button>
                      {expandedSiblingId === s._id && (
                        <div className="border-t border-zinc-100 bg-zinc-50/40 px-3 py-2 text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40" data-testid="sibling-detail">
                          {expandedSiblingLoading && 'Loading details…'}
                          {!expandedSiblingLoading && expandedSiblingDetail != null && (
                            <Link
                              href={`/dashboard/admin/foods/${s._id}`}
                              className="font-medium text-zinc-700 underline dark:text-zinc-200"
                            >
                              Open detail page →
                            </Link>
                          )}
                          {!expandedSiblingLoading && expandedSiblingDetail == null && 'Failed to load details.'}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Sticky save bar */}
      <div className="fixed bottom-20 left-0 right-0 z-30 px-3 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white shadow-lg transition disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {dirty ? 'Save changes' : 'No changes'}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-32 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-lg ${
            toast.type === 'success' ? 'bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900' : 'bg-red-600'
          }`}
        >
          <Check className="h-4 w-4" />
          {toast.message}
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-zinc-900">
            <h3 className="mb-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">Delete this food?</h3>
            <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
              This permanently removes the Food doc. Past logs that referenced it keep their
              snapshot — they won&rsquo;t change.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 rounded-xl border border-zinc-200 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={remove}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  )
}
