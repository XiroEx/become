"use client"

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Pencil } from 'lucide-react'
import { useLockScroll } from '@/lib/useLockScroll'
import type { IMealItem } from '@/models/Meal'
import type { ServingUnit } from '@/models/Food'
import type { Unit } from '@/lib/units'
import QuantityPicker, {
  type QuantityPickerSelection,
  type QuantityPickerVariant,
} from './QuantityPicker'

interface EditFoodModalProps {
  isOpen: boolean
  // The item to edit. Must include _id for the PATCH route to work.
  item: (IMealItem & { _id?: string }) | null
  // The MealLog id this item belongs to.
  logId: string
  onClose: () => void
  onSaved: () => void   // refetch after save
}

// Variant names that are essentially "no preparation" — don't display them.
const HIDDEN_VARIANT_NAMES = new Set(['default', 'raw'])

function shouldShowVariantName(name: string | undefined): name is string {
  if (!name) return false
  return !HIDDEN_VARIANT_NAMES.has(name.trim().toLowerCase())
}

/**
 * Build a synthetic variant + initial selection for the QuantityPicker from a
 * stored MealLog item. The item carries per-serving nutrition + a `servings`
 * multiplier, so we project it back to a single canonical variant ("1 serving =
 * servingSize × servingUnit at the snapshotted nutrition") and treat the
 * already-applied multiplier as "loggedQuantity" in the same unit.
 *
 * Read-on-write back-compat (UNITS_AND_SERVINGS_PLAN §14 decision 2): when the
 * stored item lacks loggedQuantity / loggedUnit (old write), we synthesize
 * `loggedQuantity = servingSize × multiplier` so the picker opens at the same
 * physical amount the user originally logged.
 */
function deriveVariantAndInitial(item: IMealItem): {
  variant: QuantityPickerVariant
  initial: { quantity: number; unit: Unit }
} {
  const servingUnit = (item.servingUnit as Unit)
  const variant: QuantityPickerVariant = {
    servingSize: item.servingSize,
    servingUnit: servingUnit as ServingUnit,
    nutrition: {
      calories: item.nutrition.calories,
      protein:  item.nutrition.protein,
      carbs:    item.nutrition.carbs,
      fats:     item.nutrition.fats,
      fiber:    item.nutrition.fiber,
      sugar:    item.nutrition.sugar,
      sodium:   item.nutrition.sodium,
      saturatedFat: item.nutrition.saturatedFat,
    },
    alternateServings: [],
    gramsPerServing: item.loggedGramsPerServing,
    mlPerServing: item.loggedMlPerServing,
  }

  if (item.loggedQuantity != null && item.loggedUnit) {
    return {
      variant,
      initial: { quantity: item.loggedQuantity, unit: item.loggedUnit as Unit },
    }
  }

  // Backfill: synthesize from `servings × servingSize` in the variant's own unit.
  const synthesizedQty = (item.servings ?? 1) * item.servingSize
  return { variant, initial: { quantity: synthesizedQty, unit: servingUnit } }
}

export default function EditFoodModal({ isOpen, item, logId, onClose, onSaved }: EditFoodModalProps) {
  const [selection, setSelection] = useState<QuantityPickerSelection | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useLockScroll(isOpen)

  // Fresh derive on each item change so the picker opens with the right state.
  const derived = useMemo(() => (item ? deriveVariantAndInitial(item) : null), [item])

  useEffect(() => {
    if (item) {
      setSelection(null)
      setError('')
    }
  }, [item])

  // Live preview: the selection itself carries the scaled nutrition.
  const preview = selection?.nutrition

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!item || !item._id || !logId || !selection) return
    if (selection.quantity <= 0) { setError('Amount must be greater than 0'); return }

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
        body: JSON.stringify({
          // Back-compat: keep `servings` (multiplier) flowing for legacy readers.
          servings: selection.multiplier,
          // New shape — picked up by the route updates in this PR.
          loggedQuantity: selection.quantity,
          loggedUnit: selection.unit,
          loggedGramsPerServing: item.loggedGramsPerServing,
          loggedMlPerServing: item.loggedMlPerServing,
        }),
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
      {isOpen && item && derived && (
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
            className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900 sm:rounded-2xl sm:p-6"
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
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Amount
                </p>
                <QuantityPicker
                  variant={derived.variant}
                  initial={derived.initial}
                  onChange={setSelection}
                />
              </div>

              {/* Macro preview */}
              {preview && (
                <div className="rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-800/50">
                  <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Updated macros</p>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-base font-bold text-zinc-900 dark:text-white">{Math.round(preview.calories)}</p>
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500">Cal</p>
                    </div>
                    <div>
                      <p className="text-base font-bold text-blue-600 dark:text-blue-400">{Math.round(preview.protein * 10) / 10}g</p>
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500">Protein</p>
                    </div>
                    <div>
                      <p className="text-base font-bold text-green-600 dark:text-green-400">{Math.round(preview.carbs * 10) / 10}g</p>
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500">Carbs</p>
                    </div>
                    <div>
                      <p className="text-base font-bold text-amber-600 dark:text-amber-400">{Math.round(preview.fats * 10) / 10}g</p>
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500">Fats</p>
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
                  className="flex-1 rounded-xl border border-zinc-200 py-3 font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !selection || selection.quantity <= 0}
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
