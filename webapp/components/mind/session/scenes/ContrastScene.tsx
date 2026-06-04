'use client'

// Mental contrasting (WOOP-lite) — the non-affirm "plan it" beat. See the outcome,
// then name the most likely obstacle, then commit to an if-then plan. Research
// (Oettingen) shows pairing the vision WITH the obstacle beats rosy visualization
// alone for follow-through. Renders inside the player's black full-screen stage.

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Target, ArrowRight, Check } from 'lucide-react'
import type { SceneProps } from '@/lib/mind/moves'
import { CONTRAST_OBSTACLES, CONTRAST_PLANS } from '@/lib/mind/library'

function sample<T>(arr: T[], n: number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, Math.min(n, a.length))
}

export default function ContrastScene({ move, onDone }: SceneProps) {
  const [step, setStep] = useState(0) // 0 outcome · 1 obstacle · 2 plan · 3 done
  const [obstacle, setObstacle] = useState<string | null>(null)
  const obstacles = useMemo(() => sample(CONTRAST_OBSTACLES, 5), [])
  const plans = useMemo(() => sample(CONTRAST_PLANS, 5), [])
  const outcome = move.statement?.trim() || 'Today, done well — the version of you you’re building.'

  const finish = () => {
    setStep(3)
    setTimeout(onDone, 1000)
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15">
        <Target className="h-6 w-6 text-emerald-300" />
      </span>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="see" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex w-full max-w-sm flex-col items-center">
            <p className="text-xs uppercase tracking-widest text-white/40">See it</p>
            <p className="mt-4 text-2xl font-bold leading-snug text-white">&ldquo;{outcome}&rdquo;</p>
            <p className="mt-3 text-sm text-white/50">Picture it actually happening.</p>
            <button
              onClick={() => setStep(1)}
              className="mt-9 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95"
            >
              Now, the obstacle <ArrowRight className="h-5 w-5" />
            </button>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div key="obstacle" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex w-full max-w-sm flex-col items-center">
            <h1 className="text-2xl font-extrabold">What’s most likely to get in the way?</h1>
            <p className="mt-2 text-white/50">Name it honestly — that’s the point.</p>
            <div className="mt-6 w-full space-y-2.5">
              {obstacles.map((o) => (
                <button
                  key={o}
                  onClick={() => { setObstacle(o); setStep(2) }}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-left text-base font-medium text-white/90 transition-colors hover:border-emerald-400/50 active:scale-[0.98]"
                >
                  {o}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="plan" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex w-full max-w-sm flex-col items-center">
            <p className="text-xs uppercase tracking-widest text-white/40">When &ldquo;{obstacle}&rdquo; shows up…</p>
            <h1 className="mt-3 text-2xl font-extrabold">…then I will:</h1>
            <div className="mt-6 w-full space-y-2.5">
              {plans.map((p) => (
                <button
                  key={p}
                  onClick={finish}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-left text-base font-medium text-white/90 transition-colors hover:border-emerald-400/50 active:scale-[0.98]"
                >
                  {p}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-green-500">
              <Check className="h-8 w-8" strokeWidth={3} />
            </span>
            <p className="mt-4 text-lg font-bold">Plan set.</p>
            <p className="mt-1 max-w-xs text-sm text-white/50">You’ve already met the obstacle once — in your head.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
