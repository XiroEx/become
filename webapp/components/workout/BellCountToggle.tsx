"use client";

// One dumbbell or two — the member's own answer, while they log.
//
// Jon, 2026-09-18: "there are some exercises that I can do single if I wanted
// to and just keep it as one 1 dumbbell". `getBellWeightInfo` guesses per
// exercise and is usually right; this is how the member says otherwise. It is
// shown ONLY on a dumbbell/kettlebell exercise with a weight box, defaulted to
// that automatic answer (and to whatever they logged last time), and saved with
// the set as `ISetLog.bells` — see lib/workout/bellCount.ts.
//
// One component for both logging views so the control cannot drift between
// them: Live renders it on the active set's weight input, Track on each
// exercise. `tone` is the only difference — Live is white-on-dark video, Track
// is a light card.

import { bellCountLabel, type BellCount } from "@/lib/workout/bellCount";
import type { BellWeightInfo } from "@/lib/workout/dumbbellWeight";

const BELL_COUNTS: readonly BellCount[] = [1, 2];

const TONES = {
  live: {
    selected: "bg-white/30 text-white",
    unselected: "bg-white/10 text-white/50 hover:bg-white/20",
    label: "text-white/60",
  },
  track: {
    selected: "bg-green-600 text-white",
    unselected:
      "bg-zinc-200 text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600",
    label: "text-zinc-500 dark:text-zinc-400",
  },
} as const;

interface BellCountToggleProps {
  /** What this exercise is loaded with, from `getBellWeightInfo`. */
  info: BellWeightInfo;
  /** The count currently in effect (never null — see `resolveBellCount`). */
  value: BellCount;
  onChange: (count: BellCount) => void;
  tone?: keyof typeof TONES;
  /** Optional leading copy, e.g. "How many?". Omitted in Live, where the
   *  control sits directly under the "Weight per DB" input. */
  label?: string;
  className?: string;
  testId?: string;
}

export default function BellCountToggle({
  info,
  value,
  onChange,
  tone = "track",
  label,
  className = "",
  testId,
}: BellCountToggleProps) {
  // Barbells, machines, cables and bodyweight have no such question to answer.
  if (!info.style) return null;
  const styles = TONES[tone];
  const implement = info.style === "kettlebell" ? "kettlebells" : "dumbbells";

  return (
    <div
      role="group"
      aria-label={`How many ${implement}`}
      data-testid={testId || "bell-count-toggle"}
      className={`flex items-center gap-1.5 ${className}`.trim()}
    >
      {label && <span className={`text-xs ${styles.label}`}>{label}</span>}
      {BELL_COUNTS.map((count) => (
        <button
          key={count}
          type="button"
          aria-pressed={value === count}
          data-testid={testId ? `${testId}-${count}` : `bell-count-${count}`}
          onClick={(e) => {
            // Track renders this inside a card whose header toggles expansion.
            e.stopPropagation();
            onChange(count);
          }}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
            value === count ? styles.selected : styles.unselected
          }`}
        >
          {bellCountLabel(info, count)}
        </button>
      ))}
    </div>
  );
}
