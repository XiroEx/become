"use client"

import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, ChevronDown, Tag as TagIcon, Clock, ChefHat, Loader2 } from 'lucide-react'
import { useLockScroll } from '@/lib/useLockScroll'

interface MealApplyMeal {
  _id: string
  name: string
  imageUrl?: string
  totalNutrition?: {
    calories: number
    protein: number
    carbs: number
    fats: number
  }
  recipe?: {
    servings?: number
  }
  tags?: string[]
}

interface MealApplySheetProps {
  isOpen: boolean
  meal: MealApplyMeal | null
  // Default tag suggested by caller (typically based on time of day).
  defaultTag: string
  availableTags?: { defaults: string[]; userTags: string[] }
  // Date the user is viewing (sets the day in the time picker). Defaults to today.
  viewedDate?: Date
  onClose: () => void
  // Called after a successful POST to /api/meals/[id]/log. Caller refetches state.
  onApplied?: () => void
}

interface PortionPill {
  label: string
  value: number  // fractional value to use as portion (when no recipe.servings)
  servingsLabel?: string  // alternate label when recipe.servings is set
}

// Common portion fractions/integers shown as pills in the picker.
// `value` is what we'd send as `portion` if there's no recipe.servings.
// When recipe.servings IS set, we treat the same value as "servings selected"
// and divide by recipe.servings for the actual portion sent.
const PORTION_PILLS: PortionPill[] = [
  { label: '1/4', value: 0.25 },
  { label: '1/3', value: 1 / 3 },
  { label: '1/2', value: 0.5 },
  { label: '2/3', value: 2 / 3 },
  { label: '3/4', value: 0.75 },
  { label: '1', value: 1 },
  { label: '1.5', value: 1.5 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
]

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

export default function MealApplySheet({
  isOpen,
  meal,
  defaultTag,
  availableTags,
  viewedDate,
  onClose,
  onApplied,
}: MealApplySheetProps) {
  const [activeTag, setActiveTag] = useState<string>(defaultTag)
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const [customTagInput, setCustomTagInput] = useState('')

  // Selected pill index, or null when "custom" mode is active.
  const [selectedPillIdx, setSelectedPillIdx] = useState<number>(5) // default to "1"
  const [customMode, setCustomMode] = useState(false)
  const [customValue, setCustomValue] = useState<string>('1')

  // Custom datetime — null = "Now"
  const [customTime, setCustomTime] = useState<string | null>(null)
  const [timeEditOpen, setTimeEditOpen] = useState(false)

  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const customInputRef = useRef<HTMLInputElement>(null)

  useLockScroll(isOpen)

  // Reset when opening for a new meal.
  useEffect(() => {
    if (isOpen) {
      setActiveTag(defaultTag)
      setSelectedPillIdx(5) // "1"
      setCustomMode(false)
      setCustomValue('1')
      setCustomTime(null)
      setTimeEditOpen(false)
      setApplied(false)
      setError(null)
      setTagDropdownOpen(false)
      setCustomTagInput('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, meal?._id])

  const recipeServings = meal?.recipe?.servings && meal.recipe.servings > 0 ? meal.recipe.servings : null

  // The numeric value the user has selected (either from a pill or custom input).
  const selectedValue = useMemo<number>(() => {
    if (customMode) {
      const n = Number(customValue)
      return Number.isFinite(n) && n > 0 ? n : 0
    }
    return PORTION_PILLS[selectedPillIdx]?.value ?? 1
  }, [customMode, customValue, selectedPillIdx])

  // Effective portion sent to the server.
  // Recipe-aware: when meal.recipe.servings is set, "1" means "1 of N servings",
  // so the actual portion is selectedValue / recipeServings.
  const effectivePortion = useMemo<number>(() => {
    if (recipeServings) return selectedValue / recipeServings
    return selectedValue
  }, [selectedValue, recipeServings])

  // Live nutrition preview for the chosen portion.
  const previewNutrition = useMemo(() => {
    const n = meal?.totalNutrition
    if (!n) return { calories: 0, protein: 0, carbs: 0, fats: 0 }
    return {
      calories: Math.round((n.calories ?? 0) * effectivePortion),
      protein: Math.round((n.protein ?? 0) * effectivePortion * 10) / 10,
      carbs: Math.round((n.carbs ?? 0) * effectivePortion * 10) / 10,
      fats: Math.round((n.fats ?? 0) * effectivePortion * 10) / 10,
    }
  }, [meal, effectivePortion])

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

  const handleAddCustomTag = () => {
    const norm = customTagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!norm) return
    setActiveTag(norm)
    setCustomTagInput('')
    setTagDropdownOpen(false)
  }

  const handleApply = async () => {
    if (!meal || applying) return
    if (!Number.isFinite(effectivePortion) || effectivePortion <= 0) {
      setError('Pick a valid portion.')
      return
    }
    setApplying(true)
    setError(null)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const loggedAt = customTime
        ? buildLocalIsoFromDateTime(customTime)
        : new Date().toISOString()

      const res = await fetch(`/api/meals/${meal._id}/log`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          portion: effectivePortion,
          tags: [activeTag],
          loggedAt,
        }),
      })
      if (res.ok) {
        setApplied(true)
        onApplied?.()
        // Auto-close after a brief beat so the user sees the success state.
        setTimeout(() => {
          onClose()
        }, 600)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data?.error || 'Failed to log meal.')
      }
    } catch {
      setError('Network error.')
    } finally {
      setApplying(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && meal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
          onClick={() => !applying && onClose()}
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
                {meal.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={meal.imageUrl} alt={meal.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-400 dark:text-zinc-600">
                    <ChefHat className="h-5 w-5" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-bold text-zinc-900 dark:text-white">
                  {meal.name}
                </h3>
                {recipeServings != null && (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Recipe yields {recipeServings} {recipeServings === 1 ? 'serving' : 'servings'}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                disabled={applying}
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

              {/* Portion picker */}
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Portion
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PORTION_PILLS.map((p, idx) => {
                    const active = !customMode && selectedPillIdx === idx
                    const oneLabel = recipeServings ? `1 of ${recipeServings}` : '1 portion'
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setCustomMode(false)
                          setSelectedPillIdx(idx)
                        }}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                          active
                            ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                            : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {p.value === 1 ? oneLabel : p.label}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setCustomMode(true)
                      setTimeout(() => customInputRef.current?.focus(), 50)
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      customMode
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                        : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {customMode && (
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      {recipeServings ? `Servings (of ${recipeServings})` : 'Portions'}
                    </label>
                    <input
                      ref={customInputRef}
                      type="number"
                      min="0.05"
                      max="20"
                      step="0.05"
                      value={customValue}
                      onChange={(e) => setCustomValue(e.target.value)}
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
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      customTime
                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60'
                        : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600'
                    }`}
                  >
                    <Clock className="h-3 w-3" />
                    <span className="tabular-nums">{customTime ? 'Custom time' : 'Now'}</span>
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

              {/* Live nutrition preview */}
              <div className="grid grid-cols-4 gap-2 rounded-lg bg-zinc-50 p-2.5 text-center dark:bg-zinc-800/50">
                <div>
                  <p className="text-base font-bold tabular-nums text-zinc-900 dark:text-white">
                    {previewNutrition.calories}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Cal</p>
                </div>
                <div>
                  <p className="text-base font-bold tabular-nums text-blue-600 dark:text-blue-400">
                    {previewNutrition.protein}g
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Protein</p>
                </div>
                <div>
                  <p className="text-base font-bold tabular-nums text-green-600 dark:text-green-400">
                    {previewNutrition.carbs}g
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Carbs</p>
                </div>
                <div>
                  <p className="text-base font-bold tabular-nums text-amber-600 dark:text-amber-400">
                    {previewNutrition.fats}g
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">Fats</p>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
                  {error}
                </div>
              )}

              {/* Apply button */}
              <button
                onClick={handleApply}
                disabled={applying || applied || effectivePortion <= 0}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {applying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Logging…
                  </>
                ) : applied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Logged!
                  </>
                ) : (
                  `Apply to ${titleCaseTag(activeTag)}`
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
