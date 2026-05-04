"use client"

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Pencil } from 'lucide-react'
import { useLockScroll } from '@/lib/useLockScroll'
import type { IMealItem } from '@/models/Meal'

interface EditFoodModalProps {
  isOpen: boolean
  // The item to edit. Must include _id for the PATCH route to work.
  item: (IMealItem & { _id?: string }) | null
  // The MealLog id this item belongs to.
  logId: string
  onClose: () => void
  onSaved: () => void   // refetch after save
}

type InputMode = 'servings' | 'grams'

function servingSizeInGrams(item: IMealItem): number {
  return item.servingUnit === 'oz' ? item.servingSize * 28.3495 : item.servingSize
}

// Variant names that are essentially "no preparation" — don't display them.
const HIDDEN_VARIANT_NAMES = new Set(['default', 'raw'])

function shouldShowVariantName(name: string | undefined): name is string {
  if (!name) return false
  return !HIDDEN_VARIANT_NAMES.has(name.trim().toLowerCase())
}

export default function EditFoodModal({ isOpen, item, logId, onClose, onSaved }: EditFoodModalProps) {
  const [servings, setServings] = useState('')
  const [customGrams, setCustomGrams] = useState('')
  const [inputMode, setInputMode] = useState<InputMode>('servings')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isWeightBased = item?.servingUnit === 'g' || item?.servingUnit === 'oz'

  useLockScroll(isOpen)

  useEffect(() => {
    if (item) {
      setServings(String(item.servings))
      setCustomGrams(String(Math.round(item.servings * servingSizeInGrams(item))))
      setInputMode('servings')
      setError('')
    }
  }, [item])

  // nutrition is stored per-serving
  const base = useMemo(() => {
    if (!item) return null
    return {
      calories: item.nutrition.calories,
      protein:  item.nutrition.protein,
      carbs:    item.nutrition.carbs,
      fats:     item.nutrition.fats,
    }
  }, [item])

  const effectiveServings = useMemo(() => {
    if (!item) return 0
    if (inputMode === 'grams') {
      const grams = parseFloat(customGrams) || 0
      return grams / servingSizeInGrams(item)
    }
    return parseFloat(servings) || 0
  }, [inputMode, servings, customGrams, item])

  const preview = useMemo(() => {
    if (!base) return null
    const s = effectiveServings
    return {
      calories: Math.round(base.calories * s),
      protein:  Math.round(base.protein  * s * 10) / 10,
      carbs:    Math.round(base.carbs    * s * 10) / 10,
      fats:     Math.round(base.fats     * s * 10) / 10,
    }
  }, [base, effectiveServings])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!item || !item._id || !logId) return
    if (effectiveServings <= 0) { setError('Amount must be greater than 0'); return }

    setSaving(true)
    setError('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/meal-logs/${logId}/items/${item._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ servings: effectiveServings }),
      })
      if (res.ok) {
        onSaved()
        onClose()
      } else {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Failed to save. Please try again.')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    if (saving) return
    setError('')
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && item && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm touch-none sm:items-center sm:p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Pencil className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-zinc-900 dark:text-white truncate">
                    {item.name}
                    {shouldShowVariantName(item.variantName) && (
                      <span className="font-normal text-zinc-500 dark:text-zinc-400">
                        {' '}&middot; {item.variantName}
                      </span>
                    )}
                  </h2>
                  {item.brand && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{item.brand}</p>
                  )}
                </div>
              </div>
              <button
                onClick={handleClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Mode toggle for weight-based foods */}
              {isWeightBased && (
                <div className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
                  <button
                    type="button"
                    onClick={() => setInputMode('servings')}
                    className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
                      inputMode === 'servings'
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                    }`}
                  >
                    Servings
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('grams')}
                    className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
                      inputMode === 'grams'
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                    }`}
                  >
                    Custom weight (g)
                  </button>
                </div>
              )}

              {inputMode === 'servings' ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Servings
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.25"
                      min="0.25"
                      value={servings}
                      onChange={(e) => setServings(e.target.value)}
                      className="w-28 rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 text-center text-lg font-semibold text-zinc-900 placeholder-zinc-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500 dark:focus:border-blue-400"
                      autoFocus
                    />
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                      × {item.servingSize}{item.servingUnit}
                    </span>
                  </div>

                  <div className="mt-2 flex gap-2">
                    {[0.5, 1, 1.5, 2].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setServings(String(v))}
                        className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                          parseFloat(servings) === v
                            ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {v}×
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Amount (grams)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="1"
                      min="1"
                      value={customGrams}
                      onChange={(e) => setCustomGrams(e.target.value)}
                      className="w-28 rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 text-center text-lg font-semibold text-zinc-900 placeholder-zinc-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500 dark:focus:border-blue-400"
                      autoFocus
                    />
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">g</span>
                  </div>

                  <div className="mt-2 flex gap-2">
                    {[50, 100, 150, 200].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setCustomGrams(String(v))}
                        className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                          parseFloat(customGrams) === v
                            ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {v}g
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Macro preview */}
              {preview && (
                <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800">
                  <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Updated macros</p>
                  <div className="flex items-center justify-between">
                    <div className="text-center">
                      <p className="text-base font-bold text-zinc-900 dark:text-white">{preview.calories}</p>
                      <p className="text-[10px] text-zinc-500">cal</p>
                    </div>
                    <div className="text-center">
                      <p className="text-base font-bold text-blue-600 dark:text-blue-400">{preview.protein}g</p>
                      <p className="text-[10px] text-zinc-500">protein</p>
                    </div>
                    <div className="text-center">
                      <p className="text-base font-bold text-green-600 dark:text-green-400">{preview.carbs}g</p>
                      <p className="text-[10px] text-zinc-500">carbs</p>
                    </div>
                    <div className="text-center">
                      <p className="text-base font-bold text-amber-600 dark:text-amber-400">{preview.fats}g</p>
                      <p className="text-[10px] text-zinc-500">fats</p>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={saving}
                  className="flex-1 rounded-xl border-2 border-zinc-200 py-3 font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || effectiveServings <= 0}
                  className="flex-1 rounded-xl bg-zinc-900 py-3 font-semibold text-white transition-colors hover:bg-black disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
