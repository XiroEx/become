"use client";

import * as React from "react";
import Link from "next/link";
import { Card } from "./Card";
import { cn } from "@/lib/cn";

export type StatTileAccent =
  | "green"
  | "blue"
  | "amber"
  | "red"
  | "purple"
  | "zinc";

/**
 * Static class map — Tailwind JIT only picks up class names that appear
 * verbatim in source. Do NOT collapse this to template strings.
 */
const ACCENT_BADGE_CLASSES: Record<StatTileAccent, string> = {
  green: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  red: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  purple:
    "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  zinc: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

export type StatTileSize = "1x1" | "2x1";

export type StatTileProps = {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  accent?: StatTileAccent;
  /** When provided, renders the tile as a `next/link`. */
  href?: string;
  /** Optional footer rendered below the icon row (e.g. progress bar). */
  footer?: React.ReactNode;
  /** Optional inline supplemental info (e.g. ❄ freeze count after the label). */
  labelExtra?: React.ReactNode;
  /**
   * Grid footprint. `1x1` = square (icon-row over footer). `2x1` = wide: a
   * larger badge on the left, label + big value stacked, and the footer given
   * the full width to breathe. Both fill the fixed-height grid cell exactly.
   */
  size?: StatTileSize;
  className?: string;
};

/**
 * Compact stat tile used across the dashboard grid (Day Streak, This Week,
 * Goal, Calories, Water, Weight, Total Workouts…). Wraps the `Card` primitive.
 *
 * Two deliberately-different layouts:
 *  - SQUARE (1x1): icon-badge + label + value on top, optional footer (progress
 *    bar + caption) beneath. Vertically centered as a group.
 *  - WIDE (2x1): a bigger badge anchored left, label + an enlarged value, and
 *    the footer stretched across the full width below — uses the extra
 *    horizontal room instead of just being a stretched square.
 *
 * The footer slot (progress bar + caption) is shared by both; callers pass the
 * same node and it adapts. Everything is `h-full` so it fills the grid cell.
 */
export function StatTile({
  icon,
  label,
  value,
  accent = "zinc",
  href,
  footer,
  labelExtra,
  size = "1x1",
  className,
}: StatTileProps) {
  const wide = size === "2x1";

  const body = wide ? (
    // WIDE: two columns that fill the whole tile. Left = identity (badge +
    // label + big value). Right = the footer (progress bar + caption) stretched
    // across the remaining width and vertically centered — so the horizontal
    // space is actually used instead of leaving the right half empty.
    <div className="flex h-full items-center gap-4">
      <div className="flex min-w-0 shrink-0 items-center gap-3">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            ACCENT_BADGE_CLASSES[accent],
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {label}
            {labelExtra}
          </div>
          <div className="text-3xl font-extrabold tracking-tight leading-none text-zinc-900 dark:text-white">
            {value}
          </div>
        </div>
      </div>
      {footer ? <div className="min-w-0 flex-1">{footer}</div> : null}
    </div>
  ) : (
    <div className="flex h-full flex-col justify-center gap-1.5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            ACCENT_BADGE_CLASSES[accent],
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {label}
            {labelExtra}
          </div>
          <div className="text-2xl font-extrabold tracking-tight leading-none text-zinc-900 dark:text-white">
            {value}
          </div>
        </div>
      </div>
      {footer}
    </div>
  );

  if (href) {
    return (
      <Card
        as={Link}
        href={href}
        variant="compact"
        className={cn(
          "block h-full transition-colors hover:border-zinc-300 dark:hover:border-zinc-700",
          className,
        )}
      >
        {body}
      </Card>
    );
  }

  return (
    <Card variant="compact" className={cn("h-full", className)}>
      {body}
    </Card>
  );
}

export default StatTile;
