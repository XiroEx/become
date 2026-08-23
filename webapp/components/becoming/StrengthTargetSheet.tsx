'use client'

/**
 * "Why this target?" — the sheet behind a tapped strength target.
 *
 * A target with no visible reasoning is just a number someone made up, and the
 * old one effectively was: a flat +5% that never re-baselined. Members could
 * not tell an ambitious target from an arbitrary one, so neither carried
 * weight. This shows the whole argument — which stage the lift is in, what
 * their own logged sets say, the rate that implies, and what the number is not.
 *
 * Doubles as the explainer for the metric itself: the same sheet opens from the
 * "What is an estimated max?" affordance, in which case there is no target to
 * justify and only the definition renders.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { X, Info, TrendingUp } from 'lucide-react'
import type { TargetExplanation } from '@/lib/strength/targets'
import {
  EST_MAX_EXAMPLE,
  EST_MAX_EXPLAINER,
  EST_MAX_FORMULA_NOTE,
  EST_MAX_LABEL,
} from '@/lib/strength/language'

export interface StrengthTargetSheetProps {
  open: boolean
  onClose: () => void
  /** Lift name. Omitted for the plain "what is this metric" mode. */
  liftName?: string
  /** Current estimated max, in the member's unit. */
  current?: number
  /** The target being explained. Absent → metric-definition mode. */
  target?: number
  unit: 'lbs' | 'kg'
  explanation?: TargetExplanation | null
  /** True when the member has already passed this target. */
  reached?: boolean
  hue: string
}

export default function StrengthTargetSheet({
  open,
  onClose,
  liftName,
  current,
  target,
  unit,
  explanation,
  reached,
  hue,
}: StrengthTargetSheetProps) {
  const isTargetMode = target != null && !!explanation

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
          onClick={onClose}
          data-testid="strength-target-sheet"
        >
          <motion.div
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.6 }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            onClick={e => e.stopPropagation()}
            className="relative max-h-[86vh] w-full overflow-y-auto rounded-t-3xl bg-[#0d0f14] pb-[max(1.25rem,env(safe-area-inset-bottom))] ring-1 ring-white/10 sm:max-w-md sm:rounded-3xl"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full blur-3xl" style={{ background: hue, opacity: 0.2 }} />

            <div className="relative px-5 pt-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
                    {isTargetMode ? 'Why this target' : EST_MAX_LABEL}
                  </p>
                  <h2 className="mt-1 truncate text-lg font-bold text-white">
                    {isTargetMode ? liftName : `What is an ${EST_MAX_LABEL.toLowerCase()}?`}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/15"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              {isTargetMode ? (
                <>
                  {/* The number, and where it sits relative to now. */}
                  <div className="mb-4 flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3.5 ring-1 ring-white/10">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/45">Now</p>
                      <p className="mt-0.5 text-lg font-bold tabular-nums text-white">
                        {current != null ? Math.round(current).toLocaleString() : '—'}
                        <span className="ml-1 text-xs font-medium text-white/50">{unit}</span>
                      </p>
                    </div>
                    <TrendingUp className="h-4 w-4 shrink-0 text-white/30" />
                    <div className="min-w-0 flex-1 text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/45">Target</p>
                      <p className="mt-0.5 text-lg font-bold tabular-nums" style={{ color: `color-mix(in srgb, ${hue} 66%, white)` }}>
                        {Math.round(target).toLocaleString()}
                        <span className="ml-1 text-xs font-medium text-white/50">{unit}</span>
                      </p>
                    </div>
                  </div>

                  {reached && (
                    <div className="mb-4 rounded-xl bg-emerald-400/10 px-3.5 py-2.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-400/20">
                      You have already passed this one. Set a new target to keep the number ahead of you.
                    </div>
                  )}

                  <div className="mb-3 flex items-center gap-2">
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: `${hue}22`, color: `color-mix(in srgb, ${hue} 70%, white)` }}>
                      {explanation.tierLabel}
                    </span>
                    <span className="text-xs text-white/50">{explanation.headline}</span>
                  </div>

                  <ul className="mb-4 space-y-2.5">
                    {explanation.why.map((line, i) => (
                      <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-white/75">
                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: hue }} />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mb-3 rounded-xl bg-white/[0.04] p-3.5 ring-1 ring-white/[0.07]">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">How it is worked out</p>
                    <p className="text-xs leading-relaxed text-white/65">{explanation.method}</p>
                  </div>

                  <div className="mb-5 flex gap-2.5 rounded-xl bg-amber-300/[0.07] p-3.5 ring-1 ring-amber-300/15">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/80" />
                    <p className="text-xs leading-relaxed text-white/65">{explanation.caveat}</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-4 space-y-3">
                    {EST_MAX_EXPLAINER.map((line, i) => (
                      <p key={i} className="text-sm leading-relaxed text-white/75">{line}</p>
                    ))}
                  </div>

                  <div className="mb-4 rounded-xl bg-white/[0.06] p-3.5 text-center ring-1 ring-white/10">
                    <p className="text-xs text-white/55">{EST_MAX_EXAMPLE.input}</p>
                    <p className="my-1 text-[10px] uppercase tracking-widest text-white/30">gives</p>
                    <p className="text-xl font-bold tabular-nums" style={{ color: `color-mix(in srgb, ${hue} 66%, white)` }}>
                      {EST_MAX_EXAMPLE.output} <span className="text-xs font-medium text-white/50">{unit}</span>
                    </p>
                  </div>

                  <div className="mb-5 rounded-xl bg-white/[0.04] p-3.5 ring-1 ring-white/[0.07]">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">The maths</p>
                    <p className="text-xs leading-relaxed text-white/65">{EST_MAX_FORMULA_NOTE}</p>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
