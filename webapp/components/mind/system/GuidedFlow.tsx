'use client'

// GuidedFlow — the system dashboards' interactive primitive. Full-screen,
// one-thing-per-screen guided run in the session-player treatment (dark stage,
// progress bar, big type). Steps come in several INTERACTION TYPES so a run
// isn't all typing — info, type-an-answer, pick-one (choices), and a 1–5 scale.
// Finishes with a per-system check moment, then onComplete(answers). This is the
// seam the AI engine will later generate steps into.

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Check, ArrowRight, ChevronLeft } from 'lucide-react'

export interface GuidedStep {
  title: string
  body?: string
  /** Type-an-answer step. */
  inputPrompt?: string
  /** Per-step textarea placeholder (defaults to a generic starter). */
  placeholder?: string
  /** Pick-one step — tapping a choice records it and advances (no typing). */
  choices?: string[]
  /** 1–5 (or custom) scale step — tap a number to record + advance. */
  scale?: { min: number; max: number; minLabel: string; maxLabel: string }
}

/** Loose text match — punctuation and spacing vary between the two fields. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Does `body` already pose this question? The model frequently ends its body
 * copy with the same question it puts in `inputPrompt`, and showing both reads
 * as a stutter.
 */
function containsAsk(body: string | undefined, ask: string): boolean {
  if (!body) return false
  const b = normalize(body)
  const a = normalize(ask)
  return a.length > 0 && b.includes(a)
}

export default function GuidedFlow({
  title,
  steps,
  accent = '#fb923c',
  doneText = 'Done. That counts.',
  onComplete,
  onExit,
  onReflect,
}: {
  title: string
  steps: GuidedStep[]
  /** Accent color (system color). */
  accent?: string
  /** Per-system finish line (uniqueness, not just recolor). */
  doneText?: string
  onComplete: (answers: { prompt: string; answer: string }[]) => void
  onExit: () => void
  /** Adaptive close: given the answers the user just typed, return a short
   *  personalized reflection that REPLACES the final canned step. Only used on
   *  flows that collected typed input; a null/thrown result quietly falls back to
   *  the static close so the flow can never break on an AI failure. */
  onReflect?: (answers: { prompt: string; answer: string }[]) => Promise<string | null>
}) {
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<{ prompt: string; answer: string }[]>([])
  const [input, setInput] = useState('')
  const [done, setDone] = useState(false)
  const [reflection, setReflection] = useState<string | null>(null)
  const [reflecting, setReflecting] = useState(false)
  const reflectStarted = useRef(false)

  const step = steps[idx]
  const isLast = idx === steps.length - 1
  const isChoice = !!step.choices?.length
  const isScale = !!step.scale
  const isInput = !!step.inputPrompt
  // The final step of a typed flow becomes a generated reflection that responds
  // to what the user actually wrote — so it's not the same canned close forever.
  const flowHasInput = steps.some((s) => !!s.inputPrompt)
  const isReflectStep = isLast && !!onReflect && flowHasInput

  // THE ASK. `inputPrompt` used to be invisible: it gated the textarea and
  // labelled the saved answer, but was never rendered. So when the model wrote a
  // statement into `body` and put the actual question in `inputPrompt`, the
  // member got a declaration and a bare text box with nothing asked of them —
  // "One Concrete Action" and "The Amplified Impact" both landed that way. It
  // only looked right when the model happened to repeat the question inside
  // `body`, which is also why it must not render twice when it does.
  const ask = step.inputPrompt?.trim() ?? ''
  const showAsk = isInput && !!ask && !containsAsk(step.body, ask)

  useEffect(() => {
    if (!isReflectStep || reflectStarted.current) return
    reflectStarted.current = true
    setReflecting(true)
    Promise.resolve(onReflect!(answers))
      .then((t) => setReflection(t && t.trim() ? t.trim() : null))
      .catch(() => setReflection(null))
      .finally(() => setReflecting(false))
  }, [isReflectStep, answers, onReflect])

  // Record an answer (when the step produces one) and move forward.
  const commit = (answer?: string) => {
    const next = [...answers]
    if (answer !== undefined) {
      next.push({ prompt: step.inputPrompt || step.title, answer })
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

  // Step back one screen. If the previous step recorded an answer (typed / choice
  // / scale), drop it so re-answering doesn't duplicate, and restore a typed
  // answer into the box so it can be edited. Resets the adaptive-close state so it
  // regenerates if the user returns to the final step.
  const back = () => {
    if (idx === 0 || done) return
    const prev = idx - 1
    const prevStep = steps[prev]
    const prevProduced = !!prevStep.inputPrompt || !!prevStep.choices?.length || !!prevStep.scale
    if (prevProduced) {
      setInput(prevStep.inputPrompt ? (answers[answers.length - 1]?.answer ?? '') : '')
      setAnswers((a) => a.slice(0, -1))
    } else {
      setInput('')
    }
    reflectStarted.current = false
    setReflection(null)
    setReflecting(false)
    setIdx(prev)
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
        <button onClick={onExit} aria-label="Exit" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
          <X className="h-5 w-5" />
        </button>
        {/* Back — go to the previous step (hidden on the first step and the done screen). */}
        <button
          onClick={back}
          aria-label="Back"
          disabled={idx === 0 || done}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 transition-opacity ${idx === 0 || done ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
        >
          <ChevronLeft className="h-5 w-5" />
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
          ) : isReflectStep ? (
            /* Adaptive close — a reflection written from what the user just typed. */
            <motion.div
              key="reflect"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.18 }}
              className="flex w-full max-w-sm flex-col items-center"
            >
              <p className="text-xs uppercase tracking-widest text-white/40">{title}</p>
              <h2 className="mt-4 text-2xl font-extrabold leading-snug">
                {reflecting ? 'Taking it in…' : 'Here’s what I see'}
              </h2>
              {reflecting ? (
                <div className="mt-6 flex items-center gap-2.5 text-white/60">
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-sm">Reading what you wrote…</span>
                </div>
              ) : (
                <p className="mt-3 text-base leading-relaxed text-white/80">{reflection ?? step.body}</p>
              )}
              <button
                onClick={() => commit()}
                disabled={reflecting}
                className="mt-8 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95 disabled:opacity-40"
              >
                Finish <ArrowRight className="h-5 w-5" />
              </button>
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

              {/* The question itself — brighter and heavier than the body copy,
                  so the screen reads as something asked rather than something
                  declared at you. */}
              {showAsk && (
                <p className="mt-4 text-lg font-semibold leading-snug text-white">{ask}</p>
              )}

              {/* ── Type-an-answer ── */}
              {isInput && (
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={step.placeholder ?? 'Type it honestly…'}
                  rows={3}
                  autoFocus
                  className="mt-6 w-full resize-none rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-base text-white placeholder-white/30 focus:border-white/40 focus:outline-none"
                />
              )}

              {/* ── Pick-one ── */}
              {isChoice && (
                <div className="mt-6 flex w-full flex-col gap-2.5">
                  {step.choices!.map((c) => (
                    <button
                      key={c}
                      onClick={() => commit(c)}
                      className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3.5 text-left text-base font-medium text-white transition-colors hover:border-white/40 active:scale-[0.99]"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}

              {/* ── 1–5 scale ── */}
              {isScale && (
                <div className="mt-7 w-full">
                  <div className="flex items-center justify-between gap-2">
                    {Array.from({ length: step.scale!.max - step.scale!.min + 1 }, (_, i) => step.scale!.min + i).map((n) => (
                      <button
                        key={n}
                        onClick={() => commit(String(n))}
                        className="flex h-12 flex-1 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-lg font-bold text-white transition-colors hover:border-white/50 active:scale-95"
                        style={{ borderColor: undefined }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between text-[11px] text-white/40">
                    <span>{step.scale!.minLabel}</span>
                    <span>{step.scale!.maxLabel}</span>
                  </div>
                </div>
              )}

              {/* Advance button — only for info + type steps (choice/scale auto-advance). */}
              {!isChoice && !isScale && (
                <button
                  onClick={() => commit(isInput ? input.trim() : undefined)}
                  disabled={isInput && !input.trim()}
                  className="mt-8 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95 disabled:opacity-40"
                >
                  {isLast ? 'Finish' : 'Next'}
                  <ArrowRight className="h-5 w-5" />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
