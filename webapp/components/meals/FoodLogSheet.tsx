"use client"

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, ChevronDown, Tag as TagIcon, Loader2, Apple } from 'lucide-react'
import { useLockScroll } from '@/lib/useLockScroll'

interface FoodLogSheetFood {
  _id: string
  name: string
  brand?: string
  imageUrl?: string
  servingSize: number
  servingUnit: string
  displayLabel?: string
  nutrition: { calories: number; protein: number; carbs: number; fats: number }
  variants?: Array<{
    _id?: string
    name: string
    isDefault?: boolean
    servingSize: number
    servingUnit: string
    nutrition: { calories: number; protein: number; carbs: number; fats: number }
  }>
}

interface Props {
  isOpen: boolean
  food: FoodLogSheetFood | null
  defaultTag: string
  availableTags?: { defaults: string[]; userTags: string[] }
  viewedDate?: Date
  onClose: () => void
  onLogged?: (foodId: string) => void
}

const SERVING_PILLS = [0.25, 0.5, 1, 1.5, 2, 3]

function titleCaseTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-')
}

function dateToDateTimeInputValue(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

function buildLocalIsoFromDateTime(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return new Date().toISOString()
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, 0)
  return d.toISOString()
}

export default function FoodLogSheet({
  isOpen,
  food,
  defaultTag,
  availableTags,
  viewedDate,
  onClose,
  onLogged,
}: Props) {
  const [activeTag, setActiveTag] = useState<string>(defaultTag)
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const [customTagInput, setCustomTagInput] = useState('')
  const [servings, setServings] = useState<number>(1)
  const [customServings, setCustomServings] = useState<string>('1')
  const [customServingsMode, setCustomServingsMode] = useState(false)
  const [customTime, setCustomTime] = useState<string | null>(null)
  const [timeEditOpen, setTimeEditOpen] = useState(false)
  const [logging, setLogging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useLockScroll(isOpen)

  useEffect(() => {
    if (isOpen) {
      setActiveTag(defaultTag)
      setServings(1)
      setCustomServings('1')
      setCustomServingsMode(false)
      setCustomTime(null)
      setTimeEditOpen(false)
      setError(null)
      setTagDropdownOpen(false)
      setCustomTagInput('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, food?._id])

  const allTagOptions = useMemo<string[]>(() => {
    const defaults = availableTags?.defaults ?? ['breakfast', 'lunch', 'dinner', 'snack', 'pre-workout', 'post-workout']
    const userTags = availableTags?.userTags ?? []
    const seen = new Set<string>()
    const out: string[] = []
    for (const t of [...defaults, ...userTags]) {
      const norm = String(t).toLowerCase()
      if (norm && !seen.has(norm)) {
        seen.add(norm)
        out.push(norm)
      }
    }
    return out
  }, [availableTags])

  const effectiveServings = useMemo<number>(() => {
    if (customServingsMode) {
      const n = Number(customServings)
      return Number.isFinite(n) && n > 0 ? n : 0
    }
    return servings
  }, [customServingsMode, customServings, servings])

  const previewNutrition = useMemo(() => {
    if (!food) return { calories: 0, protein: 0, carbs: 0, fats: 0 }
    const n = food.nutrition
    return {
      calories: Math.round((n.calories ?? 0) * effectiveServings),
      protein: Math.round((n.protein ?? 0) * effectiveServings * 10) / 10,
      carbs: Math.round((n.carbs ?? 0) * effectiveServings * 10) / 10,
      fats: Math.round((n.fats ?? 0) * effectiveServings * 10) / 10,
    }
  }, [food, effectiveServings])

  const handleAddCustomTag = () => {
    const norm = customTagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!norm) return
    setActiveTag(norm)
    setCustomTagInput('')
    setTagDropdownOpen(false)
  }

  const handleLog = async () => {
    if (!food || logging) return
    if (!Number.isFinite(effectiveServings) || effectiveServings <= 0) {
      setError('Pick a valid serving count.')
      return
    }
    setLogging(true)
    setError(null)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const variant = food.variants?.find(v => v.isDefault) || food.variants?.[0]
      const item = {
        foodId: food._id,
        variantId: variant?._id,
        variantName: variant?.name,
        name: food.name,
        brand: food.brand,
        servingSize: food.servingSize,
        servingUnit: food.servingUnit,
        servings: effectiveServings,
        nutrition: food.nutrition,
      }

      const loggedAt = customTime
        ? buildLocalIsoFromDateTime(customTime)
        : new Date().toISOString()

      const res = await fetch('/api/meal-logs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          items: [item],
          tags: [activeTag],
          loggedAt,
        }),
      })
      if (res.ok) {
        onLogged?.(food._id)
        setTimeout(() => onClose(), 250)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data?.error || 'Failed to log food.')
      }
    } catch {
      setError('Network error.')
    } finally {
      setLogging(false)
    }
  }

  const servingLabel = food?.displayLabel || `${food?.servingSize}${food?.servingUnit}`

  return (
    <AnimatePresence>
      {isOpen && food && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
          onClick={() => !logging && onClose()}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-900 sm:max-w-md sm:rounded-2xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800 sm:px-6">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                {food.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={food.imageUrl} alt={food.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-400 dark:text-zinc-600">
                    <Apple className="h-5 w-5" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-bold text-zinc-900 dark:text-white">
                  {food.name}
                </h3>
                <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                  {food.brand ? `${food.brand} · ${servingLabel}` : servingLabel}
                </p>
              </div>
              <button
                onClick={onClose}
                disabled={logging}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-5 sm:p-6">
              {/* Tag picker */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setTagDropdownOpen(v => !v)}
                  className="flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                >
                  <TagIcon className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Adding to</span>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                    {titleCaseTag(activeTag)}
                  </span>
                  <ChevronDown className={`ml-auto h-4 w-4 text-zinc-400 transition-transform ${tagDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {tagDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
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

              {/* Servings picker */}
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Servings
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SERVING_PILLS.map(s => {
                    const active = !customServingsMode && servings === s
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => { setCustomServingsMode(false); setServings(s) }}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                          active
                            ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                            : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {s === 1 ? `1 (${servingLabel})` : `${s}×`}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setCustomServingsMode(true)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      customServingsMode
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                        : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                    }`}
                  >
                    Custom
                  </button>
                </div>
                {customServingsMode && (
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Servings</label>
                    <input
                      type="number"
                      min="0.05"
                      max="20"
                      step="0.05"
                      value={customServings}
                      onChange={(e) => setCustomServings(e.target.value)}
                      className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-center text-sm font-medium text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                    />
                  </div>
                )}
              </div>

              {/* Time picker */}
              <div className="flex items-center gap-1.5">
                {!timeEditOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTimeEditOpen(true)
                      if (!customTime) {
                        const now = new Date()
                        const base = viewedDate ?? now
                        const combined = new Date(
                          base.getFullYear(),
                          base.getMonth(),
                          base.getDate(),
                          now.getHours(),
                          now.getMinutes(),
                        )
                        setCustomTime(dateToDateTimeInputValue(combined))
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    {customTime ? `At ${customTime.slice(11)}` : 'Now'}
                  </button>
                ) : (
                  <>
                    <input
                      type="datetime-local"
                      value={customTime ?? ''}
                      onChange={(e) => setCustomTime(e.target.value)}
                      className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => { setCustomTime(null); setTimeEditOpen(false) }}
                      className="rounded-full px-2 py-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                    >
                      Use now
                    </button>
                  </>
                )}
              </div>

              {/* Macro preview */}
              <div className="grid grid-cols-4 gap-2 rounded-lg bg-zinc-50 p-2.5 text-center dark:bg-zinc-800/50">
                <div>
                  <p className="text-base font-bold text-zinc-900 dark:text-white">{previewNutrition.calories}</p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Cal</p>
                </div>
                <div>
                  <p className="text-base font-bold text-blue-600 dark:text-blue-400">{previewNutrition.protein}g</p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Protein</p>
                </div>
                <div>
                  <p className="text-base font-bold text-green-600 dark:text-green-400">{previewNutrition.carbs}g</p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Carbs</p>
                </div>
                <div>
                  <p className="text-base font-bold text-amber-600 dark:text-amber-400">{previewNutrition.fats}g</p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Fats</p>
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleLog}
                disabled={logging || effectiveServings <= 0}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {logging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {logging ? 'Logging…' : 'Log to day'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
