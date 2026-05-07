"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Primary CTA — usually a Link or Button. */
  action?: React.ReactNode;
  className?: string;
};

/**
 * Standardized dashed-border empty state. Replaces the variant cocktail of
 * `rounded-2xl py-16` / `rounded-lg py-16` we had across Programs, My
 * Programs, Recipes, and Nutrition. See UI_CONSISTENCY_PLAN.md §4.4.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900",
        className,
      )}
    >
      {icon ? (
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {icon}
        </span>
      ) : null}
      <h3 className="mt-4 text-base font-semibold text-zinc-900 dark:text-white">
        {title}
      </h3>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export default EmptyState;
