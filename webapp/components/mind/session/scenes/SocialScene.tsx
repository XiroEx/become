'use client'

// Social scene — one accountability action that pulls another person into your
// progress. Rotates daily; commit to it. Renders inside the player's black
// full-screen stage.

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Users, Check } from 'lucide-react'
import type { SceneProps } from '@/lib/mind/moves'

const ACCOUNTABILITY = [
  'Text someone your plan for today — before you have the option not to.',
  "Tell one person about a goal you've been keeping to yourself.",
  'Find one person who has what you want. Ask them one specific question this week.',
  'Schedule a check-in with someone who will ask the hard question about your progress.',
  'Be honest with someone about where you actually are — not where you want to appear to be.',
]

function dayOfYear(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000)
}

export default function SocialScene({ move, onDone }: SceneProps) {
  const [committed, setCommitted] = useState(false)
  const action = ACCOUNTABILITY[dayOfYear() % ACCOUNTABILITY.length]

  const commit = () => {
    if (committed) return
    setCommitted(true)
    setTimeout(onDone, 900)
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
