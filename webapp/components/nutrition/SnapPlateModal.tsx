"use client"

import { useRef, useState, useCallback, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Camera, Loader2, RotateCcw, Plus, Minus, Check, ImagePlus } from 'lucide-react'
import { resizeImageToBlob } from '@/lib/imageResize'
import { blobToDataUrl } from '@/lib/blobToBase64'
import {
  plateEstimator,
  PlateUnavailableError,
} from '@/lib/nutrition/aiEngine'
import type { PlateEstimate, EstimatedPlateItem } from '@/lib/nutrition/aiSeams'
import { getToken } from '@/lib/clientAuth'
import { Toast } from '@/components/ui'
import { useToast } from '@/hooks/useToast'
import { useLockScroll } from '@/lib/useLockScroll'

// ── Types ────────────────────────────────────────────────────────────────────

interface SnapPlateModalProps {
  open: boolean
  tag: string
  /** YYYY-MM-DD or an ISO string used for loggedAt stamping. Pass the page's
   *  selectedDate formatted param so the log lands on the right day. */
  dateKey: string
  onClose: () => void
  /** Called after items are successfully POSTed to /api/meal-logs. */
  onLogged: () => void
}

interface ReviewItem extends EstimatedPlateItem {
  /** User-adjustable multiplier on top of the AI-estimated nutrition. 1 = as-is. */
  multiplier: number
  /** Excluded by the user before logging. */
  removed: boolean
}

type ModalState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'review'; items: ReviewItem[]; imageThumb: string }
  | { phase: 'logging' }

// ── Helpers ──────────────────────────────────────────────────────────────────

function confidenceLabel(c: number): string {
  if (c >= 0.8) return 'High'
  if (c >= 0.5) return 'Medium'
  return 'Low'
}

function confidenceColor(c: number): string {
  if (c >= 0.8) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
  if (c >= 0.5) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
  return 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300'
}

function scaledNutrition(item: EstimatedPlateItem, multiplier: number) {
  const n = item.nutrition
  return {
    calories: Math.round((n.calories ?? 0) * multiplier),
    protein: Math.round((n.protein ?? 0) * multiplier * 10) / 10,
    carbs: Math.round((n.carbs ?? 0) * multiplier * 10) / 10,
    fats: Math.round((n.fats ?? 0) * multiplier * 10) / 10,
  }
}

function runningTotal(items: ReviewItem[]) {
  let calories = 0, protein = 0, carbs = 0, fats = 0
  for (const it of items) {
    if (it.removed) continue
    const s = scaledNutrition(it, it.multiplier)
    calories += s.calories
    protein += s.protein
    carbs += s.carbs
    fats += s.fats
  }
  return {
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fats: Math.round(fats * 10) / 10,
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SnapPlateModal({
  open,
  tag,
  dateKey,
  onClose,
  onLogged,
}: SnapPlateModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)   // camera (capture)
  const galleryInputRef = useRef<HTMLInputElement>(null) // upload from library (no capture)
  const [state, setState] = useState<ModalState>({ phase: 'idle' })
  const { toast, showToast } = useToast(3500)

  useLockScroll(open)

  // Reset to the chooser when the modal closes so it opens fresh each time.
  useEffect(() => {
    if (!open) setState({ phase: 'idle' })
  }, [open])

  const pickCamera = () => fileInputRef.current?.click()
  const pickGallery = () => galleryInputRef.current?.click()

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset the input value so the same photo can be re-picked if needed.
    e.target.value = ''
    if (!file) {
      // User cancelled the native picker — return to the chooser (don't close).
      setState({ phase: 'idle' })
      return
    }

    setState({ phase: 'loading' })

    try {
      const resized = await resizeImageToBlob(file, { maxDim: 1024, quality: 0.6 })
      const dataUrl = await blobToDataUrl(resized)

      // Build a small thumbnail for the review screen header.
      const imageThumb = dataUrl

      // ctx: minimal — vision doesn't depend on user context.
      const estimate: PlateEstimate = await plateEstimator.estimate(dataUrl, { userId: '' })

      if (!estimate.items || estimate.items.length === 0) {
        setState({
          phase: 'error',
          message: "Couldn't read that plate — try a clearer, well-lit photo.",
        })
        return
      }

      const reviewItems: ReviewItem[] = estimate.items.map((item) => ({
        ...item,
        multiplier: 1,
        removed: false,
      }))

      setState({ phase: 'review', items: reviewItems, imageThumb })
    } catch (err) {
      if (err instanceof PlateUnavailableError) {
        setState({
          phase: 'error',
          message: "Couldn't read that plate — try a clearer, well-lit photo.",
        })
      } else {
        console.error('[SnapPlateModal] plate estimate error', err)
        setState({
          phase: 'error',
          message: "Something went wrong. Try a clearer, well-lit photo.",
        })
      }
    }
  }, [])

  const handleRetry = () => {
    // Back to the chooser so the user can take a new photo OR upload one.
    setState({ phase: 'idle' })
  }

  const setMultiplier = (idx: number, delta: number) => {
    if (state.phase !== 'review') return
    setState({
      ...state,
      items: state.items.map((it, i) =>
        i === idx
          ? { ...it, multiplier: Math.max(0.25, parseFloat((it.multiplier + delta).toFixed(2))) }
          : it
      ),
    })
  }

  const toggleRemove = (idx: number) => {
    if (state.phase !== 'review') return
    setState({
      ...state,
      items: state.items.map((it, i) =>
        i === idx ? { ...it, removed: !it.removed } : it
      ),
    })
  }

  const handleLog = async () => {
    if (state.phase !== 'review') return
    // Capture before state transition so we can restore on failure.
    const allItems = state.items
    const imageThumb = state.imageThumb
    const activeItems = allItems.filter((it) => !it.removed)
    if (activeItems.length === 0) {
      showToast('Remove all items? Add at least one to log.', 'error')
      return
    }

    const restoreReview = () => setState({ phase: 'review', items: allItems, imageThumb })

    setState({ phase: 'logging' })

    try {
      const token = getToken()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      // loggedAt: if dateKey is today use now, otherwise stamp at noon of that date.
      const todayKey = (() => {
        const d = new Date()
        const y = d.getFullYear()
        const mo = String(d.getMonth() + 1).padStart(2, '0')
        const dy = String(d.getDate()).padStart(2, '0')
        return `${y}-${mo}-${dy}`
      })()
      const loggedAt = dateKey === todayKey
        ? new Date().toISOString()
        : `${dateKey}T12:00:00.000Z`

      const mealItems = activeItems.map((it) => {
        const s = scaledNutrition(it, it.multiplier)
        return {
          name: it.name,
          servingSize: 1,
          servingUnit: 'serving',
          servings: it.multiplier,
          nutrition: {
            calories: s.calories,
            protein: s.protein,
            carbs: s.carbs,
            fats: s.fats,
          },
        }
      })

      const res = await fetch('/api/meal-logs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          items: mealItems,
          tags: [tag],
          loggedAt,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const msg = data?.error ? `Failed to log: ${data.error}` : 'Failed to log. Please try again.'
        showToast(msg, 'error')
        restoreReview()
        return
      }

      showToast(`${activeItems.length} item${activeItems.length === 1 ? '' : 's'} logged`, 'success')
      onLogged()
      onClose()
    } catch (err) {
      console.error('[SnapPlateModal] log error', err)
      showToast('Failed to log. Check your connection.', 'error')
      restoreReview()
    }
  }

  if (!open) return null

  return (
    <>
      {/* Hidden inputs — camera (capture) and library upload (no capture). */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handleFileChange}
        aria-hidden="true"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileChange}
        aria-hidden="true"
      />

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex flex-col bg-white dark:bg-zinc-900 sm:items-center sm:justify-center sm:bg-black/60 sm:backdrop-blur-sm sm:p-4 touch-none"
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
              className="relative flex h-full w-full flex-col sm:h-auto sm:max-h-[85vh] sm:max-w-lg sm:overflow-hidden sm:rounded-2xl sm:bg-white sm:shadow-2xl sm:dark:bg-zinc-900"
            >
              {/* Header */}
              <div className="shrink-0 flex items-center justify-between border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <Camera className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-zinc-900 dark:text-white">Snap your plate</h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">AI estimate &mdash; tweak before logging</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto overscroll-contain">

                {/* Idle — choose camera or upload */}
                {state.phase === 'idle' && (
                  <div className="flex flex-col items-center justify-center gap-6 py-16 px-6 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-900/20">
                      <Camera className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-900 dark:text-white">Snap or upload your plate</p>
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        Take a photo now, or pick one from your library.
                      </p>
                    </div>
                    <div className="flex w-full max-w-xs flex-col gap-2.5">
                      <button
                        onClick={pickCamera}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                      >
                        <Camera className="h-4 w-4" />
                        Take photo
                      </button>
                      <button
                        onClick={pickGallery}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        <ImagePlus className="h-4 w-4" />
                        Upload photo
                      </button>
                    </div>
                  </div>
                )}

                {/* Loading */}
                {state.phase === 'loading' && (
                  <div className="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-900/20">
                      <Loader2 className="h-7 w-7 animate-spin text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-900 dark:text-white">Reading your plate&hellip;</p>
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">This can take up to 30 seconds.</p>
                    </div>
                  </div>
                )}

                {/* Error */}
                {state.phase === 'error' && (
                  <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-900/20">
                      <Camera className="h-7 w-7 text-amber-500 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-900 dark:text-white">{state.message}</p>
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        For best results, use good lighting and show the whole plate.
                      </p>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={handleRetry}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Try again
                      </button>
                      <button
                        onClick={onClose}
                        className="inline-flex items-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}

                {/* Review */}
                {state.phase === 'review' && (
                  <ReviewBody
                    items={state.items}
                    imageThumb={state.imageThumb}
                    onSetMultiplier={setMultiplier}
                    onToggleRemove={toggleRemove}
                  />
                )}

                {state.phase === 'logging' && (
                  <div className="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Logging&hellip;</p>
                  </div>
                )}
              </div>

              {/* Footer CTA — only on review */}
              {state.phase === 'review' && (
                <ReviewFooter
                  items={state.items}
                  tag={tag}
                  onLog={handleLog}
                  onRetry={handleRetry}
                />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Toast toast={toast} />
    </>
  )
}

// ── ReviewBody ────────────────────────────────────────────────────────────────

interface ReviewBodyProps {
  items: ReviewItem[]
  imageThumb: string
  onSetMultiplier: (idx: number, delta: number) => void
  onToggleRemove: (idx: number) => void
}

function ReviewBody({ items, imageThumb, onSetMultiplier, onToggleRemove }: ReviewBodyProps) {
  const STEP = 0.25

  return (
    <div className="space-y-1 pb-2">
      {/* Thumb */}
      <div className="relative mx-4 mt-4 mb-2 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800" style={{ height: 140 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageThumb}
          alt="Your plate"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <p className="absolute bottom-2 left-3 text-xs font-medium text-white/80">
          AI estimate &mdash; adjust if needed
        </p>
      </div>

      {/* Item rows */}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800 px-4">
        {items.map((item, idx) => {
          const scaled = scaledNutrition(item, item.multiplier)
          return (
            <div
              key={idx}
              className={`py-3 transition-opacity ${item.removed ? 'opacity-40' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-zinc-900 dark:text-white truncate">{item.name}</span>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${confidenceColor(item.confidence)}`}>
                      {confidenceLabel(item.confidence)}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.estimatedServing}</p>
                  {!item.removed && (
                    <p className="mt-0.5 text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
                      <span className="font-semibold">{scaled.calories} cal</span>
                      <span className="ml-1.5 text-zinc-400 dark:text-zinc-500">
                        P {scaled.protein}g &middot; C {scaled.carbs}g &middot; F {scaled.fats}g
                      </span>
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Multiplier stepper */}
                  {!item.removed && (
                    <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 dark:border-zinc-700 dark:bg-zinc-800">
                      <button
                        onClick={() => onSetMultiplier(idx, -STEP)}
                        disabled={item.multiplier <= 0.25}
                        className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-200 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-700"
                        aria-label="Decrease serving"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center text-xs font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                        {item.multiplier === 1 ? '1x' : `${item.multiplier}x`}
                      </span>
                      <button
                        onClick={() => onSetMultiplier(idx, STEP)}
                        className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-700"
                        aria-label="Increase serving"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  )}

                  {/* Remove / restore toggle */}
                  <button
                    onClick={() => onToggleRemove(idx)}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                      item.removed
                        ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50'
                        : 'text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400'
                    }`}
                    aria-label={item.removed ? 'Restore item' : 'Remove item'}
                  >
                    {item.removed ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── ReviewFooter ──────────────────────────────────────────────────────────────

interface ReviewFooterProps {
  items: ReviewItem[]
  tag: string
  onLog: () => void
  onRetry: () => void
}

function ReviewFooter({ items, tag, onLog, onRetry }: ReviewFooterProps) {
  const totals = runningTotal(items)
  const activeCount = items.filter((it) => !it.removed).length

  return (
    <div className="shrink-0 border-t border-zinc-200 px-4 py-4 dark:border-zinc-800">
      {/* Running total */}
      <div className="mb-3 flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-zinc-800">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {activeCount} item{activeCount === 1 ? '' : 's'}
        </span>
        <div className="text-right">
          <span className="text-sm font-bold tabular-nums text-zinc-900 dark:text-white">{totals.calories} cal</span>
          <span className="ml-2 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            P {totals.protein}g &middot; C {totals.carbs}g &middot; F {totals.fats}g
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onRetry}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          aria-label="Take new photo"
          title="Take a new photo"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          onClick={onLog}
          disabled={activeCount === 0}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          <Plus className="h-4 w-4" />
          Add to {tag}
        </button>
      </div>
    </div>
  )
}
