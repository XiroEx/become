'use client'

// Social scene — one accountability action that pulls another person into your
// progress. Rotates daily; commit to it. Renders inside the player's black
// full-screen stage.

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Users, Check } from 'lucide-react'
import type { SceneProps } from '@/lib/mind/moves'
import { ACCOUNTABILITY_ACTIONS } from '@/lib/mind/library'

export default function SocialScene({ move, onDone }: SceneProps) {
  const [committed, setCommitted] = useState(false)
  // Fresh action each time the scene mounts.
  const action = useMemo(
    () => ACCOUNTABILITY_ACTIONS[Math.floor(Math.random() * ACCOUNTABILITY_ACTIONS.length)],
    [],
  )

  const commit = () => {
    if (committed) return
    setCommitted(true)
    setTimeout(() => onDone({ q: 'Who I am pulling in', a: action }), 900)
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15">
        <Users className="h-6 w-6 text-emerald-300" />
      </span>
      <p className="text-xs uppercase tracking-widest text-white/40">{move.title}</p>
      <p className="mt-5 max-w-sm text-xl font-semibold leading-relaxed text-white">{action}</p>

      <motion.button
        onClick={commit}
        className={`mt-10 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold transition-colors active:scale-95 ${
          committed ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white' : 'bg-white text-black'
        }`}
      >
        <Check className="h-5 w-5" strokeWidth={3} />
        {committed ? "I'm on it." : "I'll do this"}
      </motion.button>
    </div>
  )
}
