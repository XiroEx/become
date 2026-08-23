"use client"

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Pencil, AlertTriangle, Tag as TagIcon } from 'lucide-react'
import FlagFoodSheet, { type LogCorrection } from '@/components/nutrition/FlagFoodSheet'
import { useLockScroll } from '@/lib/useLockScroll'
import { useKeyboardInset } from '@/lib/useKeyboardInset'
import type { IMealItem } from '@/models/Meal'
import type { ServingUnit } from '@/models/Food'
import type { Unit } from '@/lib/units'
import QuantityPicker, {
  type QuantityPickerSelection,
  type QuantityPickerVariant,
} from './QuantityPicker'
import BridgeFieldGroup, { type BridgeValues } from './BridgeFieldGroup'

interface EditFoodModalProps {
  isOpen: boolean
  // The item to edit. Must include _id for the PATCH route to work.
  item: (IMealItem & { _id?: string }) | null
  // The MealLog id this item belongs to. Required in log mode (mode='log' or unset).
  logId: string
  // 'log' (default) — PATCH /api/meal-logs/[logId]/items/[itemId]
  // 'plan' — PATCH /api/meal-plans/[planId] with the full items[] array, with
  //   this item replaced by the picker's new values. Requires planId + planItems.
  mode?: 'log' | 'plan'
  planId?: string
  planItems?: (IMealItem & { _id?: string })[]
  // Log mode only: the section this row is currently shown under, plus every
  // tag the member can move it to.
  currentTag?: string
  availableTags?: { defaults: string[]; userTags: string[] }
  onClose: () => void
  onSaved: () => void   // refetch after save
}

// Variant names that are essentially "no preparation" — don't display them.
const HIDDEN_VARIANT_NAMES = new Set(['default', 'raw'])

function shouldShowVariantName(name: string | undefined): name is string {
  if (!name) return false
  return !HIDDEN_VARIANT_NAMES.has(name.trim().toLowerCase())
}

function tagLabel(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
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

export default function EditFoodModal({
  isOpen, item, logId, mode = 'log', planId, planItems,
  currentTag = 'snack', availableTags, onClose, onSaved,
}: EditFoodModalProps) {
  const isPlanMode = mode === 'plan'
  const [selection, setSelection] = useState<QuantityPickerSelection | null>(null)
  const [saving, setSaving] = useState(false)
  const [flagOpen, setFlagOpen] = useState(false)
  // A macro correction the member typed for THIS entry, on the item's storage
  // basis. Held until save so it travels with the amount edit rather than being
  // a second, invisible write.
  const [nutritionOverride, setNutritionOverride] = useState<LogCorrection | null>(null)
  const [error, setError] = useState('')
  const normalizedCurrentTag = currentTag.trim().toLowerCase().replace(/\s+/g, '-') || 'snack'
  const [selectedTag, setSelectedTag] = useState(normalizedCurrentTag)

  const tagOptions = useMemo(() => {
    const tags = [
      normalizedCurrentTag,
      ...(availableTags?.defaults ?? []),
      ...(availableTags?.userTags ?? []),
    ]
    return Array.from(new Set(
      tags
        .map(tag => String(tag).trim().toLowerCase().replace(/\s+/g, '-'))
        .filter(Boolean),
    ))
  }, [normalizedCurrentTag, availableTags])

  // Local bridge edits — start from the logged snapshot. Saving the form
  // persists these alongside the quantity edit, so the next time this item
  // opens the picker has the bridge available for cross-family conversions.
  const [bridge, setBridge] = useState<BridgeValues>({})

  useLockScroll(isOpen)

  // Lift the bottom-anchored sheet above the software keyboard (iOS keeps the
  // layout viewport full-height when the keyboard opens, so the Save/Cancel row
  // would otherwise sit hidden behind the keypad).
  const keyboardInset = useKeyboardInset(isOpen)

  // Fresh derive on each item change so the picker opens with the right state.
  const derived = useMemo(() => (item ? deriveVariantAndInitial(item) : null), [item])

  useEffect(() => {
    if (item) {
      setSelection(null)
      setError('')
      setSelectedTag(normalizedCurrentTag)
      // A pending correction belongs to the entry it was typed for. Leaving it
      // set would silently apply one row's macros to the next row opened.
      setNutritionOverride(null)
      setBridge({
        gramsPerServing: item.loggedGramsPerServing,
        mlPerServing: item.loggedMlPerServing,
      })
    }
  }, [item, normalizedCurrentTag])

  // Apply the live bridge values to the picker variant so the unit dropdown
  // reflects them immediately (e.g. typing 100 g unlocks gram options on a
  // cup-native variant).
  const variantForPicker = useMemo<QuantityPickerVariant | null>(() => {
    if (!derived) return null
    return {
      ...derived.variant,
      gramsPerServing: bridge.gramsPerServing ?? derived.variant.gramsPerServing,
      mlPerServing: bridge.mlPerServing ?? derived.variant.mlPerServing,
    }
  }, [derived, bridge.gramsPerServing, bridge.mlPerServing])

  // Live preview: the selection itself carries the scaled nutrition. A pending
  // correction is per storage basis, so it scales by the same multiplier.
  const preview = useMemo(() => {
    if (!selection) return undefined
    if (!nutritionOverride) return selection.nutrition
    const f = selection.multiplier > 0 ? selection.multiplier : 1
    return {
      ...selection.nutrition,
      calories: nutritionOverride.calories * f,
      protein: nutritionOverride.protein * f,
      carbs: nutritionOverride.carbs * f,
      fats: nutritionOverride.fats * f,
    }
  }, [selection, nutritionOverride])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!item || !item._id || !selection) return
    // Guard quantity AND multiplier: plan-mode below divides per-serving
    // nutrition by selection.multiplier — a 0/invalid multiplier would write
    // Infinity/NaN macros to the plan.
    if (selection.quantity <= 0 || !(selection.multiplier > 0)) {
      setError('Amount must be greater than 0'); return
    }

    setSaving(true)
    setError('')
    try {
      const token = localStorage.getItem('token')
      let res: Response
      if (isPlanMode) {
        if (!planId || !planItems) {
          setError('Plan context missing.')
          setSaving(false)
          return
        }
        // Build updated items[] — replace the matching item by _id and PATCH
        // the whole plan with the new array. Per plan §4.4, PATCH accepts a
        // full items[] replacement and recomputes expectedNutrition via the
        // pre-save hook.
        const updated = planItems.map(it => {
          if (it._id !== item._id) return it
          return {
            ...it,
            servings: selection.multiplier,
            loggedQuantity: selection.quantity,
            loggedUnit: selection.unit,
            loggedGramsPerServing: selection.gramsPerServing ?? bridge.gramsPerServing ?? it.loggedGramsPerServing,
            loggedMlPerServing: selection.mlPerServing ?? bridge.mlPerServing ?? it.loggedMlPerServing,
            // Roll the scaled-per-serving nutrition forward; the QuantityPicker
            // returned per-serving nutrition based on the bridge it solved.
            nutrition: {
              calories: selection.nutrition.calories / selection.multiplier,
              protein:  selection.nutrition.protein  / selection.multiplier,
              carbs:    selection.nutrition.carbs    / selection.multiplier,
              fats:     selection.nutrition.fats     / selection.multiplier,
              fiber:    (selection.nutrition.fiber  ?? 0) / selection.multiplier,
              sugar:    (selection.nutrition.sugar  ?? 0) / selection.multiplier,
              sodium:   (selection.nutrition.sodium ?? 0) / selection.multiplier,
              saturatedFat: (selection.nutrition.saturatedFat ?? 0) / selection.multiplier,
            },
          }
        })
        res = await fetch(`/api/meal-plans/${planId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ items: updated }),
        })
      } else {
        if (!logId) {
          setError('Log id missing.')
          setSaving(false)
          return
        }
        res = await fetch(`/api/meal-logs/${logId}/items/${item._id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            // Back-compat: keep `servings` (multiplier) flowing for legacy readers.
            servings: selection.multiplier,
            // Only present when the member corrected the macros. The route
            // replaces nutrition wholesale, so sending it unconditionally would
            // rewrite good data with a round-tripped copy of itself. Sent as its
            // own object (not the raw override) so a `servingLabel` alongside it
            // never lands inside `nutrition`, which the route doesn't expect there.
            ...(nutritionOverride ? {
              nutrition: {
                calories: nutritionOverride.calories,
                protein: nutritionOverride.protein,
                carbs: nutritionOverride.carbs,
                fats: nutritionOverride.fats,
                fiber: nutritionOverride.fiber,
              },
            } : {}),
            // Only present when the member actually retyped the serving label —
            // see the `LogCorrection.servingLabel` doc comment.
            ...(nutritionOverride?.servingLabel !== undefined ? { servingLabel: nutritionOverride.servingLabel } : {}),
            // New shape — picked up by the route updates in this PR.
            loggedQuantity: selection.quantity,
            loggedUnit: selection.unit,
            // Bridge values: prefer the user's inline edits, fall back to the
            // existing snapshot. The route only assigns these when the field is
            // present, so undefined values leave the stored snapshot intact.
            loggedGramsPerServing: selection.gramsPerServing ?? bridge.gramsPerServing ?? item.loggedGramsPerServing,
            loggedMlPerServing: selection.mlPerServing ?? bridge.mlPerServing ?? item.loggedMlPerServing,
            ...(selectedTag !== normalizedCurrentTag
              ? { tag: selectedTag, fromTag: normalizedCurrentTag }
              : {}),
          }),
        })
      }
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm touch-none transition-[padding] duration-150 ease-out sm:items-center sm:p-4"
          style={{ paddingBottom: keyboardInset || undefined }}
          onClick={handleClose}
        >
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="max-h-full w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900 sm:rounded-2xl sm:p-6"
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
                  variant={variantForPicker ?? derived.variant}
                  initial={derived.initial}
                  onChange={setSelection}
                />
              </div>

              {!isPlanMode && (
                <div>
                  <label
                    htmlFor="edit-food-tag"
                    className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                  >
                    Meal tag
                  </label>
                  <div className="relative">
                    <TagIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <select
                      id="edit-food-tag"
                      value={selectedTag}
                      onChange={(event) => setSelectedTag(event.target.value)}
                      className="w-full appearance-none rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-8 text-sm font-medium text-zinc-900 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-zinc-500"
                    >
                      {tagOptions.map(tag => (
                        <option key={tag} value={tag}>{tagLabel(tag)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/*
                Bridge disclosure (PR 5 §5). Default-collapsed when both
                bridges are missing on the item; expanded when either is set.
                Saving the form persists these onto the item so the next edit
                opens with cross-family options available.
              */}
              <BridgeFieldGroup
                value={bridge}
                onChange={setBridge}
                servingUnit={item.servingUnit}
                collapsible
              />


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

              {/* Two different jobs behind one control, and which one is on offer
                  depends on whether a shared record exists.

                  With a foodId: report the catalogue AND fix your own entry.
                  Without one (an AI photo/describe estimate that never matched a
                  product): fixing your own entry is the only thing that means
                  anything, so that is all it offers.

                  This used to be gated on foodId outright, which is why a
                  described protein bar had no way to correct its macros at all.
                  The only route people found was deleting the row and re-adding
                  it through search. */}
              <button
                type="button"
                onClick={() => setFlagOpen(true)}
                data-testid="fix-or-report"
                className={`flex w-full items-center justify-center gap-1.5 pt-1 text-xs font-medium underline-offset-2 hover:underline ${
                  nutritionOverride ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                {nutritionOverride
                  ? 'Macros edited — save to apply'
                  : item?.foodId ? 'Something look wrong?' : 'Fix these macros'}
              </button>

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

      {/* Mounted for every item, not just catalogue ones — see the button above. */}
      {item && (
        <FlagFoodSheet
          isOpen={flagOpen}
          canReport={Boolean(item.foodId)}
          foodId={item.foodId ? String(item.foodId) : ''}
          foodName={item.name ?? 'this food'}
          currentNutrition={{
            calories: nutritionOverride?.calories ?? item.nutrition.calories,
            protein: nutritionOverride?.protein ?? item.nutrition.protein,
            carbs: nutritionOverride?.carbs ?? item.nutrition.carbs,
            fats: nutritionOverride?.fats ?? item.nutrition.fats,
            fiber: nutritionOverride?.fiber ?? item.nutrition.fiber ?? 0,
          }}
          // storage basis -> the portion on screen. Prefer the live picker, but
          // fall back to the item's own `servings`, which IS that same factor and
          // is available immediately. Depending on `selection` alone made this
          // silently no-op: the sheet can render before the picker has emitted,
          // and a factor of 1 puts the raw 100 g numbers back in the fields --
          // the exact bug being fixed.
          portion={{
            label: item.servingLabel
              || (item.loggedQuantity != null && item.loggedUnit
                ? `${item.loggedQuantity} ${item.loggedUnit}`
                : selection ? `${selection.quantity} ${selection.unit}` : 'this entry'),
            factor: selection?.multiplier ?? item.servings ?? 1,
          }}
          // Correcting an ALREADY-LOGGED entry was impossible: this sheet was
          // mounted without onApplyToLog, so it could only file a report. The
          // member's only route to right numbers was to delete the row and
          // re-add it through search, which is exactly what people did.
          onApplyToLog={setNutritionOverride}
          onClose={() => setFlagOpen(false)}
          // This is an already-logged entry with no other way to correct the
          // serving text — unlike the search/add flow, which has its own
          // free-text serving-name editor before anything is logged.
          editableServingLabel
        />
      )}
    </AnimatePresence>
  )
}
