'use client'

// Choice scene — a multiple-choice reflection. Pick the option that fits; get a
// short reframe back. A different modality from read/affirm. Renders inside the
// player's black full-screen stage.

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import type { SceneProps } from '@/lib/mind/moves'

export default function ChoiceScene({ move, onDone }: SceneProps) {
  const options = move.options ?? []
  const [picked, setPicked] = useState<number | null>(null)
  const response = picked != null ? options[picked]?.response : undefined

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <AnimatePresence mode="wait">
        {picked === null ? (
          <motion.div key="q" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex w-full max-w-sm flex-col items-center">
            <h1 className="text-2xl font-extrabold leading-snug">{move.title}</h1>
            {move.subtitle && <p className="mt-2 text-white/50">{move.subtitle}</p>}
            <div className="mt-7 w-full space-y-2.5">
              {options.map((o, i) => (
                <button
                  key={i}
                  onClick={() => setPicked(i)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-left text-base font-medium text-white/90 transition-colors hover:border-violet-400/50 active:scale-[0.98]"
                >
                  {o.label}
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key="a" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex w-full max-w-sm flex-col items-center">
            <p className="text-xs uppercase tracking-widest text-white/40">{options[picked]?.label}</p>
            {response && <p className="mt-5 text-xl font-semibold leading-relaxed text-white">{response}</p>}
            <button
              onClick={onDone}
              className="mt-10 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95"
            >
              Continue
              <ArrowRight className="h-5 w-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
