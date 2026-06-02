'use client'

// Assemble scene — rebuild the declaration from a shuffled word bank, in order.
// Tap a word to place it; tap a placed word to send it back. When the line is
// correct it locks in. A playful, memory-reinforcing modality. Renders inside the
// player's black full-screen stage.

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Blocks, Check } from 'lucide-react'
import type { SceneProps } from '@/lib/mind/moves'

interface Tile {
  id: number
  word: string
}

function shuffled(tiles: Tile[]): Tile[] {
  const a = [...tiles]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  // Guard against the (rare) already-in-order shuffle for short lines.
  if (a.length > 1 && a.every((t, i) => t.id === i)) {
    ;[a[0], a[a.length - 1]] = [a[a.length - 1], a[0]]
  }
  return a
}

export default function AssembleScene({ move, onDone }: SceneProps) {
  const target = useMemo(() => (move.statement ?? '').trim().split(/\s+/).filter(Boolean), [move.statement])
  const initialBank = useMemo(() => shuffled(target.map((word, id) => ({ id, word }))), [target])

  const [bank, setBank] = useState<Tile[]>(initialBank)
  const [placed, setPlaced] = useState<Tile[]>([])
  const [locked, setLocked] = useState(false)

  const place = (tile: Tile) => {
    if (locked) return
    setBank((b) => b.filter((t) => t.id !== tile.id))
    setPlaced((p) => [...p, tile])
  }

  const unplace = (tile: Tile) => {
    if (locked) return
    setPlaced((p) => p.filter((t) => t.id !== tile.id))
    setBank((b) => [...b, tile])
  }

  const correct = placed.length === target.length && placed.every((t, i) => t.word === target[i])
  // First placed word that's out of position → flag for self-correction.
  const firstWrong = placed.findIndex((t, i) => t.word !== target[i])

  useEffect(() => {
    if (!correct || locked) return
    setLocked(true)
    const t = setTimeout(onDone, 1100)
    return () => clearTimeout(t)
  }, [correct, locked, onDone])

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/15">
        <Blocks className="h-6 w-6 text-sky-300" />
      </span>

      <AnimatePresence mode="wait">
        {locked ? (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-green-500">
              <Check className="h-8 w-8" strokeWidth={3} />
            </span>
            <p className="mt-4 max-w-sm text-xl font-bold leading-snug">&ldquo;{move.statement}&rdquo;</p>
            <p className="mt-2 text-sm text-white/50">Built it. Now live it.</p>
          </motion.div>
        ) : (
          <motion.div key="build" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex w-full max-w-sm flex-col items-center">
            <p className="text-xs uppercase tracking-widest text-white/40">{move.title}</p>
            <p className="mt-2 text-sm text-white/50">{move.subtitle ?? 'Tap the words in order.'}</p>

            {/* Build line */}
            <div className="mt-6 flex min-h-[4.5rem] w-full flex-wrap content-start items-start justify-center gap-2 rounded-2xl border border-dashed border-white/15 p-3">
              {placed.length === 0 && <span className="self-center text-sm text-white/25">Tap words below…</span>}
              {placed.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => unplace(t)}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors active:scale-95 ${
                    firstWrong !== -1 && i >= firstWrong ? 'bg-red-500/20 text-red-200' : 'bg-white/15 text-white'
                  }`}
                >
                  {t.word}
                </button>
              ))}
            </div>

            {/* Word bank */}
            <div className="mt-6 flex w-full flex-wrap items-center justify-center gap-2">
              {bank.map((t) => (
                <button
                  key={t.id}
                  onClick={() => place(t)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/90 transition-colors hover:border-sky-400/50 active:scale-95"
                >
                  {t.word}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
