'use client'

// Global "a generation is cooking" pill. Reads the durable run store, so it shows
// whenever ANY AI run is in flight — no matter which screen started it or where
// the user has navigated since. This is what makes "start it, leave, come back"
// legible: the work is visibly still happening. Auto-hides when nothing is active.
//
// Sits above the floating BottomNav (z-50, bottom offset clears the nav) per the
// app's floating-nav layering contract.

import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useActiveAiRuns } from '@/lib/ai/useRuns'

export default function AiActivityIndicator() {
  const active = useActiveAiRuns()
  const top = active[0]
  const count = active.length

  return (
    <AnimatePresence>
      {top && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.9 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex justify-center px-4"
          aria-live="polite"
        >
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-white/15 bg-zinc-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-md dark:bg-zinc-800/90">
            <span className="relative flex h-4 w-4 items-center justify-center">
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ background: 'conic-gradient(from 0deg, #a78bfa, #34d399, transparent)' }}
                animate={{ rotate: 360 }}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
              />
              <Sparkles className="relative h-2.5 w-2.5 text-white" />
            </span>
            <span>{count > 1 ? `${count} generating…` : `${top.label}…`}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
