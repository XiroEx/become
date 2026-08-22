'use client'

// Compose scene ("Fill it in") — a mostly-written affirmation with blanks; tap a
// positive word for each blank. No wrong answers: every option completes a true,
// empowering line — the pick just makes it yours. Replaces the word-scramble.
// Renders inside the player's black full-screen stage.

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { SlidersHorizontal, Check } from 'lucide-react'
import type { SceneProps } from '@/lib/mind/moves'

export default function ComposeScene({ move, onDone }: SceneProps) {
  const template = move.compose?.template ?? '{0}'
  const blanks = move.compose?.blanks ?? [['ready']]

  // Split into text + {n} tokens, dropping empties.
  const segments = useMemo(
    () => template.split(/(\{\d+\})/).filter((s) => s !== ''),
    [template],
  )

  const [picks, setPicks] = useState<(string | null)[]>(() => blanks.map(() => null))
  const [editing, setEditing] = useState<number | null>(null)
  const [locked, setLocked] = useState(false)

  const firstNull = picks.findIndex((p) => p === null)
  const current = editing != null ? editing : firstNull // -1 when all filled
  const allFilled = picks.every((p) => p !== null)

  const choose = (word: string) => {
    if (current < 0 || locked) return
    setPicks((prev) => {
      const next = [...prev]
      next[current] = word
      return next
    })
    setEditing(null)
  }

  const lock = () => {
    if (!allFilled || locked) return
    setLocked(true)
    setTimeout(onDone, 1100)
  }

  // Render the sentence with inline blanks (tappable to re-edit).
  const sentence = (interactive: boolean) => (
    <p className="text-2xl font-bold leading-relaxed text-white">
      {segments.map((s, i) => {
        const m = s.match(/^\{(\d+)\}$/)
        if (!m) return <span key={i}>{s}</span>
        const bi = Number(m[1])
        const val = picks[bi]
        const isCurrent = interactive && bi === current
        return (
          <button
            key={i}
            onClick={interactive ? () => !locked && setEditing(bi) : undefined}
            className={`mx-0.5 rounded-lg px-1.5 transition-colors ${
              val
                ? 'text-violet-300'
                : 'text-white/30'
            } ${isCurrent ? 'bg-white/10 ring-1 ring-violet-400/60' : ''}`}
          >
            {val ?? '_____'}
          </button>
        )
      })}
    </p>
  )

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15">
        {locked ? (
          <Check className="h-6 w-6 text-green-300" strokeWidth={3} />
        ) : (
          <SlidersHorizontal className="h-6 w-6 text-violet-300" />
        )}
      </span>

      {!locked && <p className="mb-1 text-xs uppercase tracking-widest text-white/40">{move.title}</p>}
      {!locked && <p className="mb-6 text-sm text-white/50">{move.subtitle ?? 'Choose the words that fit.'}</p>}

      <div className="w-full max-w-sm">{sentence(!locked)}</div>

      <AnimatePresence mode="wait">
        {locked ? (
          <motion.p key="locked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 text-sm font-semibold text-green-300">
            That&apos;s yours. Own it.
          </motion.p>
        ) : current >= 0 ? (
          <motion.div
            key={`opts-${current}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 flex flex-wrap justify-center gap-2"
          >
            {blanks[current].map((opt) => (
              <button
                key={opt}
                data-testid="compose-option"
                onClick={() => choose(opt)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/90 transition-colors hover:border-violet-400/50 active:scale-95"
              >
                {opt}
              </button>
            ))}
          </motion.div>
        ) : (
          <motion.button
            key="lock"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={lock}
            className="mt-8 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95"
          >
            <Check className="h-5 w-5" strokeWidth={3} />
            Lock it in
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
