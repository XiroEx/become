"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Play, RotateCcw, CheckCircle2, SkipForward } from "lucide-react";

export interface StaleIncompleteData {
  day: string;
  phase: number;
  date: string;
  exercises: Array<{
    name: string;
    sets: Array<{ completed: boolean }>;
  }>;
  completedExerciseCount: number;
  totalExerciseCount: number;
}

interface Props {
  stale: StaleIncompleteData;
  programId: string;
  onResolve: (action: "continue" | "restart" | "count" | "skip", nextDay?: string | null, nextPhase?: number | null) => void;
}

export default function IncompleteWorkoutModal({ stale, programId, onResolve }: Props) {
  const [loading, setLoading] = useState<string | null>(null);

  const formattedDate = new Date(stale.date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const resolve = async (action: "continue" | "restart" | "count" | "skip") => {
    setLoading(action);
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const res = await fetch("/api/workouts/resolve-incomplete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          programId,
          day: stale.day,
          phase: stale.phase,
          action,
        }),
      });

      if (!res.ok) throw new Error("Failed to resolve");

      const data = await res.json();
      onResolve(action, data.nextDay, data.nextPhase);
    } catch {
      setLoading(null);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm px-4 pb-6"
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/40 px-5 py-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Unfinished workout from {formattedDate}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                {stale.day} &middot; {stale.completedExerciseCount} of {stale.totalExerciseCount} exercises logged
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="p-4 flex flex-col gap-2">
            <button
              onClick={() => resolve("continue")}
              disabled={!!loading}
              className="flex items-center gap-3 w-full rounded-xl px-4 py-3 text-left bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white transition-colors disabled:opacity-60"
            >
              <Play className="h-4 w-4 shrink-0" />
              <div>
                <p className="text-sm font-semibold leading-tight">
                  {loading === "continue" ? "Loading…" : "Continue where I left off"}
                </p>
                <p className="text-xs text-blue-200 mt-0.5">Pick up at the set I stopped on</p>
              </div>
            </button>

            <button
              onClick={() => resolve("restart")}
              disabled={!!loading}
              className="flex items-center gap-3 w-full rounded-xl px-4 py-3 text-left bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-100 transition-colors disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4 shrink-0" />
              <div>
                <p className="text-sm font-semibold leading-tight">
                  {loading === "restart" ? "Clearing…" : "Restart this day"}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Start {stale.day} fresh from scratch</p>
              </div>
            </button>

            <button
              onClick={() => resolve("count")}
              disabled={!!loading}
              className="flex items-center gap-3 w-full rounded-xl px-4 py-3 text-left bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-100 transition-colors disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
              <div>
                <p className="text-sm font-semibold leading-tight">
                  {loading === "count" ? "Counting…" : "Count it & move on"}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Mark as done, advance to next workout</p>
              </div>
            </button>

            <button
              onClick={() => resolve("skip")}
              disabled={!!loading}
              className="flex items-center gap-3 w-full rounded-xl px-4 py-3 text-left bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-100 transition-colors disabled:opacity-60"
            >
              <SkipForward className="h-4 w-4 shrink-0 text-zinc-400" />
              <div>
                <p className="text-sm font-semibold leading-tight">
                  {loading === "skip" ? "Skipping…" : "Move on without counting it"}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Skip this day, go to the next workout</p>
              </div>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
