'use client'

// The Mind coach entry point — now LIVE. Opens a real coaching chat backed by the
// become-ai graph (consultant.mindset, freeform). The card sits on the Mind home;
// tapping it opens CoachChat. If the graph is unavailable the chat still answers
// with an on-brand fallback, so it never feels broken.

import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Sparkles, ChevronRight } from 'lucide-react'
import CoachChat from '@/components/ai/CoachChat'

export default function MindCoachTeaser() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-green-50 p-4 text-left transition-transform active:scale-[0.99] dark:border-violet-500/20 dark:from-violet-500/10 dark:to-green-500/10"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-green-500 text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Talk to your coach</p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              Work through the resistance, the doubt, the next move.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400" />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <CoachChat
            endpoint="/api/ai/consultant"
            domain="mindset"
            persistKey="mind-coach"
            runLabel="Coach is replying"
            title="Your mindset coach"
            subtitle="Here for the hard part"
            accentFrom="from-violet-500"
            accentTo="to-green-500"
            greeting="I'm here. What's loudest right now — the resistance, the doubt, something you're avoiding? Say it plainly and we'll work it."
            placeholder="Type what you're working through…"
            suggestions={[
              "I keep starting and quitting",
              "I don't feel like showing up today",
              "I'm scared I'll fail again",
            ]}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
