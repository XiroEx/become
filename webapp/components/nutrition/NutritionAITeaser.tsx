'use client'

// Nutrition AI entry point — LIVE. Opens a real nutrition consultant chat
// backed by the become-ai graph (nutrition.consultant, freeform). Tapping the
// card opens CoachChat; if the graph is unavailable the route still returns an
// on-brand fallback, so the conversation never dead-ends.
// Mirrors components/mind/MindCoachTeaser.tsx exactly.

import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Sparkles, ChevronRight } from 'lucide-react'
import CoachChat from '@/components/ai/CoachChat'

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
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">
              Your nutrition consultant
            </p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              Meal plans, macro help, and real answers for your goals.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400" />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <CoachChat
            endpoint="/api/ai/nutrition/consultant"
            domain="nutrition"
            persistKey="nutrition-consultant"
            runLabel="Consultant is replying"
            title="Your nutrition consultant"
            subtitle="Grounded in your goals and logs"
            accentFrom="from-emerald-500"
            accentTo="to-teal-500"
            greeting="Hey — I'm here to help you eat in a way that actually works for you. What are you trying to figure out? Macro targets, what to eat before a workout, how to hit your protein without losing your mind — ask anything."
            placeholder="Ask about your nutrition…"
            suggestions={[
              "Plan my dinner around 40g protein",
              "Is my day on track?",
              "Quick high-protein snacks",
            ]}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
