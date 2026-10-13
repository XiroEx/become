'use client'

// One line under the tile grid, shown once right after a mood is logged from
// the daily check-in: the mood → Mindset gateway. Dismissible, never persisted,
// gone on the next load. (The MoodCard sheet has its own version of this for
// moods picked from the tile.)

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Brain, X } from 'lucide-react'
import { moodGateway } from '@/lib/mind/moodBridge'
import type { MoodLevel } from '@/components/MoodCard'

export default function MoodGatewayBanner({ mood, onDismiss }: { mood: MoodLevel; onDismiss: () => void }) {
  const g = moodGateway(mood)
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      data-testid="mood-gateway-banner"
      className="flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2.5 dark:border-purple-900/50 dark:bg-purple-950/30"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-zinc-900">
        <Brain className="h-4 w-4 text-purple-600 dark:text-purple-400" />
      </span>
      <p className="min-w-0 flex-1 text-sm text-zinc-700 dark:text-zinc-200">
        <span className="font-semibold">{g.headline}</span>{' '}
        <span className="text-zinc-600 dark:text-zinc-300">{g.body}</span>
      </p>
      <Link
        href="/dashboard/mind"
        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        Mindset
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-white/60 hover:text-zinc-600 dark:hover:bg-zinc-800"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  )
}
