'use client'

// Scaffold for the endgame: the generative AI coach. The real engine plugs into
// the MoveEngine seam later (composeSession). For now this is a visible "coming
// soon" entry that sets expectations — a teaser card on the Mind home that opens
// a sheet explaining what's coming, with a disabled input (future chat hook).

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, ChevronRight, X, Wand2, Route, MessageCircle } from 'lucide-react'

const CAPABILITIES = [
  { Icon: Route, title: 'Built around you', body: 'Your daily moves, sequenced from how you actually feel and where you are.' },
  { Icon: Wand2, title: 'Written for you', body: 'Challenges, affirmations, and prompts in your language — not a static library.' },
  { Icon: MessageCircle, title: 'Responds to you', body: 'Reflect in a scene and it answers — guidance, not a wall of text.' },
]

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
            <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
              Sessions that adapt to you
              <span className="rounded-full bg-violet-600/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:bg-violet-500/20 dark:text-violet-300">
                Coming soon
              </span>
            </p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              Shaped around your mood, wins, and mission.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400" />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="fixed inset-x-0 bottom-0 z-[201] max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-900"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 1rem)' }}
            >
              <div className="flex justify-center pt-3">
                <div className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              </div>
              <div className="flex items-center justify-between px-5 pb-2 pt-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-green-500 text-white">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Sessions that adapt to you</h2>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-5 px-5 pt-2">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Right now your sessions are built from a deep, structured playbook. Soon they&apos;ll shape
                  themselves around <span className="font-semibold text-zinc-900 dark:text-white">you</span> —
                  your mood, your wins, your mission — and grow with you.
                </p>

                <div className="space-y-3">
                  {CAPABILITIES.map(({ Icon, title, body }) => (
                    <div key={title} className="flex gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{body}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Future chat hook — disabled */}
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    Coming soon
                  </p>
                  <textarea
                    disabled
                    rows={2}
                    placeholder="Note what you're working through…"
                    className="w-full cursor-not-allowed resize-none rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-400 placeholder-zinc-400 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-500"
                  />
                </div>

                <button
                  onClick={() => setOpen(false)}
                  className="w-full rounded-2xl bg-zinc-900 py-3.5 text-sm font-bold text-white dark:bg-white dark:text-black"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
