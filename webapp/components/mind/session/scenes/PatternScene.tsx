'use client'

// Anti-sabotage scene — catch the pattern before it runs you. Tap the pattern
// that's active right now and get its override (reframe). A reflective interrupt,
// no persistence. Renders inside the player's black full-screen stage.

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Shield, ArrowRight } from 'lucide-react'
import type { SceneProps } from '@/lib/mind/moves'

const PATTERNS = [
  { pattern: 'All-or-nothing thinking', override: 'Progress is not linear. One miss changes nothing unless you let it.' },
  { pattern: 'Waiting to feel ready', override: 'Do it now. Even 10%. The feeling comes after you start.' },
  { pattern: 'Perfectionism as avoidance', override: 'A mediocre plan executed beats a perfect plan in your notes app.' },
  { pattern: 'Comparing your start to their finish', override: 'Your only competition is who you were yesterday.' },
  { pattern: 'Comfort over growth', override: "The moment you're about to take the easy path is exactly where the growth is." },
]

export default function PatternScene({ move, onDone }: SceneProps) {
  const [selected, setSelected] = useState<number | null>(null)

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/15">
        <Shield className="h-6 w-6 text-orange-300" />
      </span>

      <AnimatePresence mode="wait">
        {selected === null ? (
          <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex w-full max-w-sm flex-col items-center">
            <h1 className="text-2xl font-extrabold">{move.title}</h1>
            <p className="mt-2 text-white/50">Which one&apos;s running right now?</p>
            <div className="mt-6 w-full space-y-2">
              {PATTERNS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-medium text-white/90 transition-colors hover:border-orange-400/50 active:scale-[0.98]"
                >
                  {p.pattern}
                </button>
              ))}
              <button onClick={onDone} className="w-full pt-2 text-sm font-medium text-white/40 transition-colors hover:text-white/70">
                None of these right now
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="override" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex w-full max-w-sm flex-col items-center">
            <p className="text-xs uppercase tracking-widest text-white/40">{PATTERNS[selected].pattern}</p>
            <p className="mt-5 text-xl font-semibold leading-relaxed text-white">{PATTERNS[selected].override}</p>
            <button
              onClick={onDone}
              className="mt-10 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95"
            >
              Override it <ArrowRight className="h-5 w-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
