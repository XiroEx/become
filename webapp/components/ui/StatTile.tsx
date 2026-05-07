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

export type StatTileProps = {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  accent?: StatTileAccent;
  /** When provided, renders the tile as a `next/link`. */
  href?: string;
  className?: string;
};

/**
 * Compact stat tile used in dashboard 2x2 grid (Day Streak, Mood, Weekly,
 * Goal). Wraps the `Card` primitive with `compact` variant. See
 * UI_CONSISTENCY_PLAN.md §4.3.
 */
export function StatTile({
  icon,
  label,
  value,
  accent = "zinc",
  href,
  className,
}: StatTileProps) {
  const body = (
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
        <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
        <div className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
          {value}
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Card
        as={Link}
        href={href}
        variant="compact"
        className={cn(
          "block transition-colors hover:border-zinc-300 dark:hover:border-zinc-700",
          className,
        )}
      >
        {body}
      </Card>
    );
  }

  return (
    <Card variant="compact" className={className}>
      {body}
    </Card>
  );
}

export default StatTile;
