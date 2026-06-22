"use client"

// ---------------------------------------------------------------------------
// FoodItemRow — the ONE editable food line used across the nutrition section.
//
// Conceptually every surface shows the same thing: a food + an amount + its
// macros, optionally editable. This component unifies that. Two layouts share a
// single header (name, badges, brand, amount, macros):
//
//   layout="review"  AI plate review / builders — inline macros, a quantity
//                    stepper, and an X to remove. Shows confidence + match
//                    badges ("In your foods", "New", …).
//   layout="log"     Day-view logged rows — total calories on the right, a
//                    kebab (Edit / Delete), tap-to-expand macro chips.
//
// Amount display: `servingLabel` is the friendly name ("1 medium", "6 bites");
// `hardAmount` is the hard metric ("74 g") shown secondary ONLY when it adds
// information (differs from the friendly label). All nutrition passed in is
// already TOTAL (scaled) — this component never does its own scaling.
// ---------------------------------------------------------------------------

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Minus, Plus, X, Check, MoreVertical, Pencil, Trash2 } from 'lucide-react'

export interface FoodItemRowBadge {
  label: string
  tone?: 'green' | 'zinc'
}

export interface FoodItemRowProps {
  name: string
  brand?: string
  /** Variant qualifier, e.g. "Scrambled" — appended to the name when shown. */
  variantName?: string
  /** Friendly amount label ("1 medium", "6 bites", "240 g"). Primary line. */
  servingLabel?: string
  /** Hard metric ("74 g", "2 servings · 100 g"). Secondary, shown when it
   *  differs from `servingLabel`. */
  hardAmount?: string
  /** TOTAL calories for the row (already scaled). */
  calories: number
  /** TOTAL macros for the row (already scaled). */
  macros?: { protein: number; carbs: number; fats: number }

  // ── decorations ──
  /** 0..1 → High / Medium / Low pill (review layout). */
  confidence?: number
  badges?: FoodItemRowBadge[]

  // ── layout / state ──
  layout?: 'review' | 'log'
  dimmed?: boolean

  // ── stepper (review layout) ──
  count?: number
  onStep?: (delta: number) => void
  stepDelta?: number
  stepFloor?: number

  // ── actions ──
  onEdit?: () => void
  onRemove?: () => void
}

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

function round(n: number, dp = 0): number {
  const f = 10 ** dp
  return Math.round((n ?? 0) * f) / f
}

/** Header shared by both layouts: name (+variant), badges, brand, amount. */
function RowHeader({
  name, brand, variantName, servingLabel, hardAmount, confidence, badges,
}: Pick<FoodItemRowProps, 'name' | 'brand' | 'variantName' | 'servingLabel' | 'hardAmount' | 'confidence' | 'badges'>) {
  const showHard = !!hardAmount && hardAmount !== servingLabel
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="truncate text-sm font-medium text-zinc-900 dark:text-white">
          {name}
          {variantName && (
            <span className="font-normal text-zinc-500 dark:text-zinc-400"> &middot; {variantName}</span>
          )}
        </span>
        {confidence != null && (
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${confidenceColor(confidence)}`}>
            {confidenceLabel(confidence)}
          </span>
        )}
        {badges?.map((b, i) => (
          <span
            key={i}
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              b.tone === 'zinc'
                ? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
            }`}
          >
            {b.label}
          </span>
        ))}
      </div>
      <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
        {brand && <span className="text-zinc-400 dark:text-zinc-500">{brand} &middot; </span>}
        {servingLabel || hardAmount || ''}
        {showHard && servingLabel && (
          <span className="text-zinc-400 dark:text-zinc-500"> &middot; {hardAmount}</span>
        )}
      </p>
    </div>
  )
}

function MacroLine({ macros }: { macros: { protein: number; carbs: number; fats: number } }) {
  return (
    <span className="text-zinc-400 dark:text-zinc-500">
      P {round(macros.protein, 1)}g &middot; C {round(macros.carbs, 1)}g &middot; F {round(macros.fats, 1)}g
    </span>
  )
}

export default function FoodItemRow(props: FoodItemRowProps) {
  const {
    calories, macros, confidence, badges, layout = 'review', dimmed,
    count, onStep, stepDelta = 1, stepFloor = 0.5, onEdit, onRemove,
    name, brand, variantName, servingLabel, hardAmount,
  } = props

  const header = (
    <RowHeader
      name={name} brand={brand} variantName={variantName}
      servingLabel={servingLabel} hardAmount={hardAmount}
      confidence={confidence} badges={badges}
    />
  )

  // ── Review layout: inline macros + quantity stepper + remove (X) ──────────
  if (layout === 'review') {
    return (
      <div className={`py-3 transition-opacity ${dimmed ? 'opacity-40' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {header}
            {!dimmed && (
              <p className="mt-0.5 text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
                <span className="font-semibold">{round(calories)} cal</span>
                {macros && <span className="ml-1.5"><MacroLine macros={macros} /></span>}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!dimmed && onStep && (
              <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 dark:border-zinc-700 dark:bg-zinc-800">
                <button
                  onClick={() => onStep(-stepDelta)}
                  disabled={(count ?? 1) <= stepFloor}
                  className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-200 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-700"
                  aria-label="Decrease amount"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="min-w-[2rem] px-1 text-center text-xs font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                  {round(count ?? 1, 2)}
                </span>
                <button
                  onClick={() => onStep(stepDelta)}
                  className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-700"
                  aria-label="Increase amount"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            )}
            {onEdit && (
              <button
                onClick={onEdit}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                aria-label="Edit item"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {onRemove && (
              <button
                onClick={onRemove}
                className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                  dimmed
                    ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50'
                    : 'text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400'
                }`}
                aria-label={dimmed ? 'Restore item' : 'Remove item'}
              >
                {dimmed ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Log layout: tap-to-expand macro chips + kebab (Edit / Delete) ─────────
  return <LogRow {...props} header={header} />
}

function LogRow({
  calories, macros, onEdit, onRemove, name, brand, variantName, servingLabel, hardAmount, confidence, badges,
}: FoodItemRowProps & { header: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const kebabRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)

  const toggleMenu = () => {
    if (menuOpen) { setMenuOpen(false); return }
    const r = kebabRef.current?.getBoundingClientRect()
    if (r) {
      const MENU_H = 92
      const openUp = window.innerHeight - r.bottom < MENU_H + 16
      setMenuPos({ top: openUp ? r.top - MENU_H - 6 : r.bottom + 6, right: window.innerWidth - r.right })
    }
    setMenuOpen(true)
  }

  const hasMenu = !!(onEdit || onRemove)

  return (
    <div className="group relative">
      <div className="flex w-full items-center gap-1 pr-1.5">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        >
          <RowHeader
            name={name} brand={brand} variantName={variantName}
            servingLabel={servingLabel} hardAmount={hardAmount}
            confidence={confidence} badges={badges}
          />
          <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
            {round(calories)}
          </span>
        </button>
        {hasMenu && (
          <button
            ref={kebabRef}
            onClick={(e) => { e.stopPropagation(); toggleMenu() }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Entry options"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        )}
      </div>

      {menuOpen && menuPos && typeof document !== 'undefined' && createPortal(
        <>
          <button
            className="fixed inset-0 z-[60] cursor-default"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="fixed z-[61] w-36 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            {onEdit && (
              <button
                onClick={() => { setMenuOpen(false); onEdit() }}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </button>
            )}
            {onRemove && (
              <button
                onClick={() => { setMenuOpen(false); onRemove() }}
                className="flex w-full items-center gap-2.5 border-t border-zinc-100 px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-zinc-800 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            )}
          </div>
        </>,
        document.body,
      )}

      <AnimatePresence>
        {expanded && macros && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 pb-2 text-[11px] tabular-nums">
              <span className="rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                P {round(macros.protein)}g
              </span>
              <span className="rounded bg-green-100 px-1.5 py-0.5 font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
                C {round(macros.carbs)}g
              </span>
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                F {round(macros.fats)}g
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
