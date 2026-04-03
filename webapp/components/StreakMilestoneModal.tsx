"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useLockScroll } from "@/lib/useLockScroll";

const MILESTONE_LABELS: Record<number, string> = {
  3: "3-Day Streak",
  7: "1-Week Streak",
  14: "2-Week Streak",
  30: "1-Month Streak",
  50: "50-Day Streak",
  100: "100-Day Streak",
  200: "200-Day Streak",
  365: "1-Year Streak",
};

const MILESTONE_MESSAGES: Record<number, string> = {
  3: "Three days straight. Momentum is building.",
  7: "A full week. Most people quit before this.",
  14: "Two weeks. You're forming a real habit now.",
  30: "One month. This is who you are now.",
  50: "50 days. Undeniable consistency.",
  100: "100 days. You're built different.",
  200: "200 days. You're an inspiration.",
  365: "One full year. Legendary.",
};

interface Props {
  milestone: number | null;
  streakDays: number;
  onClose: () => void;
}

export default function StreakMilestoneModal({ milestone, streakDays, onClose }: Props) {
  useLockScroll(!!milestone);

  if (!milestone) return null;

  const label = MILESTONE_LABELS[milestone] || `${milestone}-Day Streak`;
  const message = MILESTONE_MESSAGES[milestone] || "You're on a serious run. Keep going.";

  return (
    <AnimatePresence>
      {milestone && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-4 pb-6"
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
            className="relative w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden text-center"
          >
            {/* Glow top bar */}
            <div className="h-1 w-full bg-gradient-to-r from-yellow-500 via-orange-400 to-yellow-500" />

            <div className="px-6 py-8">
              {/* Fire animation */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.3, 1] }}
                transition={{ duration: 0.5, times: [0, 0.6, 1] }}
                className="text-6xl mb-4 select-none"
              >
                🔥
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-2xl font-bold text-yellow-400 mb-1"
              >
                {label}!
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-5xl font-black text-white mb-2"
              >
                {streakDays}
              </motion.p>
              <p className="text-sm text-zinc-400 mb-4">days in a row</p>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-zinc-300 text-sm mb-6 leading-relaxed"
              >
                {message}
              </motion.p>

              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                onClick={onClose}
                className="w-full rounded-full bg-yellow-500 py-3.5 text-base font-bold text-black hover:bg-yellow-400 transition-colors"
              >
                Let&apos;s Keep Going
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
