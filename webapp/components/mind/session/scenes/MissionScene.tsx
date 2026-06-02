'use client'

// Mission scene — lock in today's one move. move.prompt holds the user's daily
// action (from their Mission). If unset, nudge them to define it in the Arsenal.
// Renders inside the player's black full-screen stage.

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Target, Check, ArrowRight } from 'lucide-react'
import type { SceneProps } from '@/lib/mind/moves'

export default function MissionScene({ move, onDone }: SceneProps) {
  const [locked, setLocked] = useState(false)

  if (!move.prompt) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
        <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15">
          <Target className="h-6 w-6 text-amber-300" />
        </span>
        <h1 className="text-2xl font-extrabold">Set your mission</h1>
        <p className="mt-2 max-w-xs text-white/50">
          Define your one daily non-negotiable to lock in here each day.
        </p>
        <Link
          href="/dashboard/mind/mission"
          className="mt-8 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-white/10 py-3.5 text-sm font-semibold text-white"
        >
          Define it in Mission
          <ArrowRight className="h-4 w-4" />
        </Link>
        <button onClick={onDone} className="mt-3 text-sm font-medium text-white/40 transition-colors hover:text-white/70">
          Continue
        </button>
      </div>
    )
  }

  const lockIn = () => {
    if (locked) return
    setLocked(true)
    setTimeout(onDone, 900)
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15">
        <Target className="h-6 w-6 text-amber-300" />
      </span>
      <p className="text-xs uppercase tracking-widest text-white/40">Your one move today</p>
      <p className="mt-5 max-w-sm text-2xl font-bold leading-snug text-white">{move.prompt}</p>

      <motion.button
        onClick={lockIn}
        animate={{ scale: locked ? 1 : 1 }}
        className={`mt-10 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold transition-colors active:scale-95 ${
          locked ? 'bg-gradient-to-r from-amber-500 to-green-500 text-white' : 'bg-white text-black'
        }`}
      >
        <Check className="h-5 w-5" strokeWidth={3} />
        {locked ? "Locked in." : "I'm locking in"}
      </motion.button>
    </div>
  )
}
