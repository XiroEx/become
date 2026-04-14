"use client"

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Pencil } from 'lucide-react'
import { useLockScroll } from '@/lib/useLockScroll'
import type { IFoodEntry } from '@/models/NutritionLog'

interface EditFoodModalProps {
  isOpen: boolean
  food: IFoodEntry | null
  mealId: string
  date: string          // "YYYY-MM-DD"
  onClose: () => void
  onSaved: () => void   // refetch after save
}

export default function EditFoodModal({ isOpen, food, mealId, date, onClose, onSaved }: EditFoodModalProps) {
  const [servings, setServings] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useLockScroll(isOpen)

  // Sync fields when the target food changes
  useEffect(() => {
    if (food) {
      setServings(String(food.servings))
      setError('')
    }
  }, [food])

  // Per-serving base macros (nutrition stored as total = base × servings)
  const base = useMemo(() => {
    if (!food) return null
    const s = food.servings || 1
    return {
      calories: food.nutrition.calories / s,
      protein:  food.nutrition.protein  / s,
      carbs:    food.nutrition.carbs    / s,
      fats:     food.nutrition.fats     / s,
    }
  }, [food])

  const preview = useMemo(() => {
    if (!base) return null
    const s = parseFloat(servings) || 0
    return {
      calories: Math.round(base.calories * s),
      protein:  Math.round(base.protein  * s * 10) / 10,
      carbs:    Math.round(base.carbs    * s * 10) / 10,
      fats:     Math.round(base.fats     * s * 10) / 10,
    }
  }, [base, servings])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!food) return
    const s = parseFloat(servings)
    if (!s || s <= 0) { setError('Servings must be greater than 0'); return }

    setSaving(true)
    setError('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/nutrition/log', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mealId, foodEntryId: food.id, updates: { servings: s }, date }),
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
      {isOpen && food && (
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
                  <h2 className="text-base font-bold text-zinc-900 dark:text-white truncate">{food.name}</h2>
                  {food.brand && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{food.brand}</p>
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
              {/* Servings input */}
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
                    × {food.servingSize}{food.servingUnit}
                  </span>
                </div>

                {/* Quick-select buttons */}
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
                  disabled={saving || !servings || parseFloat(servings) <= 0}
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
