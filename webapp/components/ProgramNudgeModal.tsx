"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Dumbbell, ArrowRight, Compass } from "lucide-react"
import Link from "next/link"
import { useLockScroll } from "@/lib/useLockScroll"

// ── Backoff helpers (exported so DashboardClient can use them) ─────────────────

export const NUDGE_KEY = "become_program_nudge"

export interface NudgeState {
  dismissCount: number
  lastDismissedAt: string
}

export function shouldShowNudge(state: NudgeState | null): boolean {
  if (!state) return true
  const daysSince =
    (Date.now() - new Date(state.lastDismissedAt).getTime()) / 86_400_000
  // 1 day → 2 days → 4 days → 8 days → 16 days (capped)
  const daysToWait = Math.min(Math.pow(2, state.dismissCount - 1), 16)
  return daysSince >= daysToWait
}

export function recordNudgeDismiss(current: NudgeState | null): NudgeState {
  return {
    dismissCount: (current?.dismissCount ?? 0) + 1,
    lastDismissedAt: new Date().toISOString(),
  }
}

// ── Goal-specific copy ─────────────────────────────────────────────────────────

type FitnessGoal =
  | "lose_weight"
  | "gain_muscle"
  | "maintain"
  | "improve_performance"
  | "general_health"

const GOAL_COPY: Record<FitnessGoal, { headline: string; sub: string }> = {
  lose_weight: {
    headline: "Ready to build your fat loss plan?",
    sub: "A structured program will get you there faster than going it alone.",
  },
  gain_muscle: {
    headline: "Ready to build serious muscle?",
    sub: "Progressive overload needs a plan. Let's find yours.",
  },
  maintain: {
    headline: "Keep what you've built.",
    sub: "A maintenance program keeps your results without burning you out.",
  },
  improve_performance: {
    headline: "Ready to train with purpose?",
    sub: "Performance gains come from structured work. Let's map it out.",
  },
  general_health: {
    headline: "Start building the habit.",
    sub: "A program gives you structure so healthy movement becomes automatic.",
  },
}

const DEFAULT_COPY = {
  headline: "Ready to start a training program?",
  sub: "A structured plan gets you from where you are to where you want to be.",
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  fitnessGoal?: FitnessGoal | null
  onExplore: () => void  // "Explore first" — dismiss with backoff
}

export default function ProgramNudgeModal({ open, fitnessGoal, onExplore }: Props) {
  useLockScroll(open)

  const copy = fitnessGoal ? (GOAL_COPY[fitnessGoal] ?? DEFAULT_COPY) : DEFAULT_COPY

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50"
            onClick={onExplore}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="relative z-10 w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 p-5 sm:p-6 shadow-2xl"
          >
            {/* Icon */}
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 dark:bg-white">
              <Dumbbell className="h-7 w-7 text-white dark:text-zinc-900" />
            </div>

            {/* Copy */}
            <h2 className="text-center text-xl font-bold text-zinc-900 dark:text-white">
              {copy.headline}
            </h2>
            <p className="mt-2 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {copy.sub}
            </p>

            {/* CTAs */}
            <div className="mt-6 space-y-3">
              <Link
                href="/dashboard/programming"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3.5 text-sm font-bold text-white transition-colors hover:bg-black dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                onClick={onExplore} // clear modal on navigate too
              >
                Find My Program
                <ArrowRight className="h-4 w-4" />
              </Link>

              <button
                onClick={onExplore}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 py-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <Compass className="h-4 w-4" />
                Explore first
              </button>
            </div>

            {/* Dismissal context */}
            <p className="mt-4 text-center text-xs text-zinc-400 dark:text-zinc-600">
              You can always start a program later from Programming
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
