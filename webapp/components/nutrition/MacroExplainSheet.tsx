'use client'

// "Where did this number come from?"
//
// Opened by tapping a figure on the targets card. Shows the actual arithmetic in
// the member's own numbers, then — for protein — how it compares to their
// bodyweight, which is the only comparison that tells them whether the number is
// sensible for THEM.
//
// It never changes a target. Someone who understands why 348 g came out of a 40%
// split can decide for themselves; someone shown a scary number with no working
// just stops trusting the plan.

import { motion, AnimatePresence } from 'framer-motion'
import { X, Info, AlertTriangle, Calculator } from 'lucide-react'
import type { CalcStep, MacroNote } from '@/lib/nutrition/macroExplain'

export interface MacroExplainSheetProps {
  isOpen: boolean
  title: string
  headline: string
  steps: CalcStep[]
  note?: MacroNote
  onClose: () => void
}

export default function MacroExplainSheet({
  isOpen, title, headline, steps, note, onClose,
}: MacroExplainSheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[85] flex items-end justify-center bg-black/50 sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 32, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 32, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={title}
            data-testid="macro-explain-sheet"
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 pb-8 dark:bg-zinc-900 sm:rounded-2xl sm:pb-5"
          >
            <div className="mb-1 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 shrink-0 text-zinc-500" />
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</p>
              </div>
              <button onClick={onClose} aria-label="Close" className="text-zinc-400 hover:text-zinc-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-4 text-2xl font-bold text-zinc-900 dark:text-white" data-testid="explain-headline">
              {headline}
            </p>

            <ol className="mb-4 space-y-2.5">
              {steps.map((s, i) => (
                <li
                  key={s.label}
                  className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-xs font-semibold text-zinc-900 dark:text-white">
                      <span className="mr-1.5 text-zinc-400">{i + 1}.</span>
                      {s.label}
                    </p>
                    <p className="shrink-0 whitespace-nowrap text-xs font-bold tabular-nums text-zinc-900 dark:text-white">
                      {s.value}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {s.detail}
                  </p>
                </li>
              ))}
            </ol>

            {note && (
              <div
                data-testid={`explain-note-${note.tone}`}
                className={`mb-4 flex gap-2 rounded-xl border p-3 ${
                  note.tone === 'caution'
                    ? 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10'
                    : 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10'
                }`}
              >
                {note.tone === 'caution' ? (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                )}
                <p
                  className={`text-[11px] leading-relaxed ${
                    note.tone === 'caution'
                      ? 'text-amber-900 dark:text-amber-200'
                      : 'text-emerald-900 dark:text-emerald-200'
                  }`}
                >
                  {note.text}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-black"
            >
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
