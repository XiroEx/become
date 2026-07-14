"use client";

// A long list, kept short by default.
//
// Shows a small preview (4 by default), reveals more in steps, and can be
// snapped back to the preview — or closed entirely via the header. Re-opening
// (or changing `resetKey`) always returns to the preview, so a section can't
// silently stay 30 items tall from a previous visit.

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsibleSectionProps<T> {
  title: string;
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  keyFor: (item: T, index: number) => string;
  /** How many to show before "Show more". */
  previewCount?: number;
  /** How many more each "Show more" reveals. */
  step?: number;
  /** Wrapper class for the list container. */
  listClassName?: string;
  className?: string;
}

/**
 * To snap a section back to its preview (modal re-open, new search, filter
 * change), give it a `key` that changes — React remounts it with fresh state.
 * That's deliberately not a `resetKey` prop + effect: resetting state from an
 * effect is an extra render and trips react-hooks/set-state-in-effect.
 */
export default function CollapsibleSection<T>({
  title,
  items,
  renderItem,
  keyFor,
  previewCount = 4,
  step = 8,
  listClassName = "space-y-2",
  className = "",
}: CollapsibleSectionProps<T>) {
  const [visible, setVisible] = useState(previewCount);
  const [open, setOpen] = useState(true);

  if (items.length === 0) return null;

  const shown = open ? items.slice(0, visible) : [];
  const remaining = items.length - visible;
  const canShowMore = open && remaining > 0;
  const canCollapseList = open && visible > previewCount;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mb-2 flex w-full items-center justify-between text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          {title}
          <span className="ml-1.5 font-normal normal-case tracking-normal text-zinc-400 dark:text-zinc-600">
            ({items.length})
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform dark:text-zinc-500 ${open ? "" : "-rotate-90"}`}
        />
      </button>

      {open && <div className={listClassName}>{shown.map((item, i) => (
        <div key={keyFor(item, i)}>{renderItem(item, i)}</div>
      ))}</div>}

      {(canShowMore || canCollapseList) && (
        <div className="mt-2 flex items-center gap-2">
          {canShowMore && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + step)}
              className="flex-1 rounded-lg border border-zinc-200 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Show {Math.min(step, remaining)} more
              <span className="ml-1 font-normal text-zinc-400 dark:text-zinc-500">({remaining} left)</span>
            </button>
          )}
          {canCollapseList && (
            <button
              type="button"
              onClick={() => setVisible(previewCount)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-500 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Collapse
            </button>
          )}
        </div>
      )}
    </div>
  );
}
