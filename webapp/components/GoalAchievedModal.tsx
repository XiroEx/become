"use client"

// The congratulations screen the app never had. A member hitting their goal
// weight used to get the same flat "At target" chip as every other day —
// this is the moment that actually says so, with the work it took to get
// there. Fires once per goal (lib/goals/reached.ts stamps reachedTargetAt so
// re-opening the app or logging another weigh-in inside the band doesn't
// re-trigger it).

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy } from "lucide-react";
import { useLockScroll } from "@/lib/useLockScroll";
import { ConfettiBurst } from "@/components/WorkoutSummary";
import type { GoalReached } from "@/lib/goals/reached";

interface Props {
  reached: GoalReached | null;
  onClose: () => void;
}

function fmt(n: number, unit: string): string {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${s} ${unit}`;
}

export default function GoalAchievedModal({ reached, onClose }: Props) {
  useLockScroll(!!reached);

  if (!reached) return null;

  const verb = reached.direction === 'lose' ? 'lost' : 'gained';
  const days = reached.days;
  const timeline = days > 0
    ? `${fmt(reached.totalChange, reached.unit)} ${verb} in ${days} day${days === 1 ? '' : 's'}.`
    : `${fmt(reached.totalChange, reached.unit)} ${verb}.`;

  return (
    <AnimatePresence>
      {reached && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-100 flex items-end sm:items-center justify-center px-4 pb-6"
          data-testid="goal-achieved-modal"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ y: 80, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 80, opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 22, stiffness: 320 }}
            className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 text-center shadow-2xl"
          >
            <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500" />
            <ConfettiBurst />

            <div className="px-6 py-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.3, 1] }}
                transition={{ duration: 0.5, times: [0, 0.6, 1] }}
                className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 ring-4 ring-emerald-500/30"
              >
                <Trophy className="h-10 w-10 text-emerald-400" />
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mb-1 text-2xl font-bold text-emerald-400"
              >
                Goal Reached!
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mb-2 text-5xl font-black text-white"
              >
                {fmt(reached.currentWeight, reached.unit)}
              </motion.p>
              <p className="mb-4 text-sm text-zinc-400">
                {fmt(reached.startWeight, reached.unit)} &rarr; {fmt(reached.targetWeight, reached.unit)} &middot; {timeline}
              </p>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mb-6 text-sm leading-relaxed text-zinc-300"
              >
                That&apos;s every meal logged, every workout shown up for. You put in the work — this is what it looks like when it pays off.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="flex flex-col gap-2"
              >
                <Link
                  href="/dashboard/nutrition/goals"
                  onClick={onClose}
                  className="w-full rounded-full bg-emerald-500 py-3.5 text-base font-bold text-black transition-colors hover:bg-emerald-400"
                >
                  Set Your Next Goal
                </Link>
                <button
                  onClick={onClose}
                  className="w-full rounded-full py-2.5 text-sm font-semibold text-zinc-400 transition-colors hover:text-white"
                >
                  Keep going
                </button>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
