'use client'

// GuidedFlow — the system dashboards' interactive primitive. Replaces "tap →
// read a paragraph" with a full-screen, one-thing-per-screen guided run in the
// same immersive treatment as the session player: dark stage, progress bar,
// big type. Steps are either instructions (tap Next) or questions (type an
// answer). Finishes with a check moment, then onComplete(answers).

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Check, ArrowRight } from 'lucide-react'

export interface GuidedStep {
  title: string
  body?: string
  /** When set, this step asks for a typed answer. */
  inputPrompt?: string
  /** Per-step textarea placeholder (defaults to a generic starter). */
  placeholder?: string
}

export default function GuidedFlow({
  title,
  steps,
  accent = '#fb923c',
  doneText = 'Done. That counts.',
  onComplete,
  onExit,
}: {
  title: string
  steps: GuidedStep[]
  /** Accent color (system color). */
  accent?: string
  /** Per-system finish line (uniqueness, not just recolor). */
  doneText?: string
  onComplete: (answers: { prompt: string; answer: string }[]) => void
  onExit: () => void
}) {
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<{ prompt: string; answer: string }[]>([])
  const [input, setInput] = useState('')
  const [done, setDone] = useState(false)

  const step = steps[idx]
  const isLast = idx === steps.length - 1

  const advance = () => {
    const next = [...answers]
    if (step.inputPrompt) {
      if (!input.trim()) return
      next.push({ prompt: step.inputPrompt, answer: input.trim() })
      setAnswers(next)
      setInput('')
    }
    if (isLast) {
      setDone(true)
      setTimeout(() => onComplete(next), 900)
    } else {
      setIdx(idx + 1)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black text-white">
      {/* Subtle system-accent glow at the top — per-system uniqueness. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2"
        style={{ background: `radial-gradient(120% 70% at 50% 0%, ${accent}26, transparent 70%)` }}
      />
      {/* Top bar */}
      <div className="relative z-10 flex items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)]">
        <button onClick={onExit} aria-label="Exit" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-1 gap-1.5">
          {steps.map((_, i) => (
            <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: i < idx || done ? '100%' : i === idx ? '50%' : '0%', backgroundColor: accent }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <AnimatePresence mode="wait">
          {done ? (
            <motion.div key="done" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: `${accent}26` }}>
                <Check className="h-10 w-10" strokeWidth={3} style={{ color: accent }} />
              </span>
              <p className="mt-5 text-lg font-bold">{doneText}</p>
            </motion.div>
          ) : (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.18 }}
              className="flex w-full max-w-sm flex-col items-center"
            >
              <p className="text-xs uppercase tracking-widest text-white/40">{title}</p>
              <h2 className="mt-4 text-2xl font-extrabold leading-snug">{step.title}</h2>
              {step.body && <p className="mt-3 text-base leading-relaxed text-white/70">{step.body}</p>}
              {step.inputPrompt && (
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={step.placeholder ?? "Type it honestly…"}
                  rows={3}
                  autoFocus
                  className="mt-6 w-full resize-none rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-base text-white placeholder-white/30 focus:border-white/40 focus:outline-none"
                />
              )}
              <button
                onClick={advance}
                disabled={!!step.inputPrompt && !input.trim()}
                className="mt-8 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-black transition-transform active:scale-95 disabled:opacity-40"
                style={{ backgroundColor: 'white' }}
              >
                {isLast ? 'Finish' : 'Next'}
                <ArrowRight className="h-5 w-5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
