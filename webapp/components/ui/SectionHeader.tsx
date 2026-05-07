"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export type SectionHeaderProps = {
  title: string;
  icon?: React.ReactNode;
  /** Right-aligned action (e.g. "View all" link or filter button). */
  action?: React.ReactNode;
  /** Optional secondary line under the title. */
  subtitle?: string;
  className?: string;
};

/**
 * Standard section title pattern used across all 4 routes. See
 * UI_CONSISTENCY_PLAN.md §4.2.
 */
export function SectionHeader({
  title,
  icon,
  action,
  subtitle,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "mb-3 flex items-center justify-between gap-2",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {icon ? (
            <span className="flex shrink-0 items-center text-zinc-500 dark:text-zinc-400">
              {icon}
            </span>
          ) : null}
          <h2 className="truncate text-lg font-semibold text-zinc-900 dark:text-white">
            {title}
          </h2>
        </div>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export default SectionHeader;
