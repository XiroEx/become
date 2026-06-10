'use client'

// Scaffold for the Become AI engine's nutrition surface. The real engine (one
// redbtn graph powering every AI feature) plugs into the seams in
// lib/nutrition/aiSeams.ts later. Until then this is the visible "coming soon"
// entry — a teaser card on the nutrition page that opens a sheet listing the
// three capabilities. Mirrors components/mind/MindCoachTeaser.tsx.

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, ChevronRight, X, Camera, ScanSearch, MessageCircle } from 'lucide-react'

const CAPABILITIES = [
  { Icon: Camera, title: 'Snap your plate', body: 'Point the camera at your food — estimated foods and macros, ready to log.' },
  { Icon: ScanSearch, title: 'Find any product', body: 'Name it or photograph the label — nutrition facts found for you.' },
  { Icon: MessageCircle, title: 'Your nutrition consultant', body: 'Meal plans and real answers, grounded in your goals and your actual logs.' },
]

export default function NutritionAITeaser() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 text-left transition-transform active:scale-[0.99] dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-teal-500/10"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
              Nutrition that understands you
              <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300">
                Coming soon
              </span>
            </p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              Snap a plate, find any product, plan your week.
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
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}
              className="fixed inset-x-0 bottom-0 z-[201] rounded-t-3xl bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] dark:bg-zinc-900"
            >
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <p className="flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-white">
                    <Sparkles className="h-5 w-5 text-emerald-500" />
                    The nutrition copilot
                  </p>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Part of the Become AI engine — in the works now.
                  </p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                {CAPABILITIES.map(({ Icon, title, body }) => (
                  <div key={title} className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</p>
                      <p className="text-xs leading-snug text-zinc-500 dark:text-zinc-400">{body}</p>
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-5 text-xs text-zinc-400 dark:text-zinc-500">
                Everything you log today makes it smarter on day one.
              </p>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
