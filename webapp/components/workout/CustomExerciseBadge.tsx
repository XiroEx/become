"use client";

/**
 * The marker that tells you an exercise is one you made, not one from the
 * catalog. Custom exercises are merged into the same search results and lists
 * as catalog ones, so without a badge there is no way to tell which is which —
 * and no way to notice that the one you just created actually showed up.
 *
 * `Sparkles` rather than a person icon: these are also the exercises that
 * carry your own uploaded demo, so the "yours / new" reading is the useful one.
 */

import { Sparkles } from 'lucide-react';

export interface CustomExerciseBadgeProps {
  /** `chip` sits in a tag row; `inline` sits next to a name in a list row. */
  variant?: 'chip' | 'inline';
  className?: string;
}

export default function CustomExerciseBadge({
  variant = 'chip',
  className,
}: CustomExerciseBadgeProps) {
  if (variant === 'inline') {
    return (
      <span
        title="Your custom exercise"
        aria-label="Your custom exercise"
        className={`inline-flex shrink-0 items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-300 ${className ?? ''}`}
      >
        <Sparkles className="h-2.5 w-2.5" strokeWidth={2} />
        Yours
      </span>
    );
  }

  return (
    <span
      title="Your custom exercise"
      className={`inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-300 ${className ?? ''}`}
    >
      <Sparkles className="h-3 w-3" strokeWidth={2} />
      Custom
    </span>
  );
}
