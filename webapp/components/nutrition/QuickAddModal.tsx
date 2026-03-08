"use client"

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Zap } from 'lucide-react'

interface QuickAddModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: {
    calories: number
    protein: number
    carbs: number
    fats: number
    note?: string
  }) => void
}

export default function QuickAddModal({ isOpen, onClose, onSubmit }: QuickAddModalProps) {
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fats, setFats] = useState('')
  const [note, setNote] = useState('')

  const calculatedCalories = useMemo(() => {
    const p = Number(protein) || 0
    const c = Number(carbs) || 0
    const f = Number(fats) || 0
    if (p === 0 && c === 0 && f === 0) return null
    return p * 4 + c * 4 + f * 9
  }, [protein, carbs, fats])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const cal = Number(calories) || 0
    if (cal <= 0) return

    onSubmit({
      calories: cal,
      protein: Number(protein) || 0,
      carbs: Number(carbs) || 0,
      fats: Number(fats) || 0,
      note: note.trim() || undefined,
    })

    // Reset form
    setCalories('')
    setProtein('')
    setCarbs('')
    setFats('')
    setNote('')
  }

  const handleClose = () => {
    setCalories('')
    setProtein('')
    setCarbs('')
    setFats('')
    setNote('')
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                  <Zap className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
                </div>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Quick Add</h2>
              </div>
              <button
                onClick={handleClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Calories (required) */}
              <div>
                <label
                  htmlFor="qa-calories"
                  className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Calories <span className="text-red-400">*</span>
                </label>
                <input
                  id="qa-calories"
                  type="number"
                  min="0"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  placeholder="e.g., 350"
                  required
                  className="w-full rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 text-center text-lg font-semibold text-zinc-900 placeholder-zinc-400 transition-colors focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500 dark:focus:border-amber-400"
                />
              </div>

              {/* Macros (optional) */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Macros <span className="text-zinc-400 dark:text-zinc-500">(optional)</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="mb-1 block text-center text-[11px] font-medium text-blue-600 dark:text-blue-400">
                      Protein
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={protein}
                      onChange={(e) => setProtein(e.target.value)}
                      placeholder="g"
                      className="w-full rounded-lg border-2 border-zinc-200 bg-white px-2 py-2 text-center text-sm font-medium text-zinc-900 placeholder-zinc-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500 dark:focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-center text-[11px] font-medium text-green-600 dark:text-green-400">
                      Carbs
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={carbs}
                      onChange={(e) => setCarbs(e.target.value)}
                      placeholder="g"
                      className="w-full rounded-lg border-2 border-zinc-200 bg-white px-2 py-2 text-center text-sm font-medium text-zinc-900 placeholder-zinc-400 transition-colors focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500 dark:focus:border-green-400"
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-center text-[11px] font-medium text-amber-600 dark:text-amber-400">
                      Fats
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={fats}
                      onChange={(e) => setFats(e.target.value)}
                      placeholder="g"
                      className="w-full rounded-lg border-2 border-zinc-200 bg-white px-2 py-2 text-center text-sm font-medium text-zinc-900 placeholder-zinc-400 transition-colors focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500 dark:focus:border-amber-400"
                    />
                  </div>
                </div>

                {/* Calculated calories from macros */}
                {calculatedCalories !== null && (
                  <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
                    Macros = <span className="font-semibold text-zinc-700 dark:text-zinc-300">{calculatedCalories} cal</span>
                    {calories && Number(calories) !== calculatedCalories && (
                      <span className="ml-1 text-amber-500">
                        (differs from entered calories)
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Note (optional) */}
              <div>
                <label
                  htmlFor="qa-note"
                  className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Note <span className="text-zinc-400 dark:text-zinc-500">(optional)</span>
                </label>
                <input
                  id="qa-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g., Post-workout shake"
                  className="w-full rounded-lg border-2 border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500 dark:focus:border-zinc-500"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 rounded-xl border-2 border-zinc-200 py-3 font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-zinc-900 py-3 font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  Add
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
