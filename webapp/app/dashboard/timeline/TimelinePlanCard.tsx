"use client"

// ---------------------------------------------------------------------------
// TimelinePlanCard — renders an active MealPlan in the day / month-strip view.
//
// Visual contract (Plan §6.2):
//   • Mirrors TimelineLogCard's shell (rounded-xl, left-stripe tag accent) but
//     swaps the solid border for `border-dashed` so planned rows are visually
//     distinct from logged rows at a glance.
//   • A small "Planned" pill renders next to the tag chip — the tag picker
//     remains a button toggle into the day's filter set.
//   • Actions: Log it (PR 4 — wires in PR 4; here it renders as a disabled
//     primary CTA), Edit, Skip, Delete. Delete + Skip are optimistic per
//     §5.10; this component owns the optimistic-fade flag but defers the
//     network call + rollback to the parent.
//
// Props are sized to be friendly to the parent: callers pass async handlers,
// the card surfaces a small "saving" spinner state while a handler is in
// flight. Failure rollback is the parent's job (re-fetch + toast).
// ---------------------------------------------------------------------------

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarDays,
  ChefHat,
  ChevronDown,
  Loader2,
  Pencil,
  Repeat,
  SkipForward,
  Trash2,
  Sparkles,
} from 'lucide-react'
import type { IMealItem } from '@/models/Meal'
import type { MealPlan } from './planning'

interface TimelinePlanCardProps {
  plan: MealPlan
  // When true, the card uses tighter padding/typography (used inside the month
  // view's day strip).
  compact?: boolean
  // Whether the plan's date is today (affects which actions show / are
  // emphasised). Computed by the caller using `localDateFromPlannedIso`.
  isToday?: boolean
  onEditItem: (planId: string, item: IMealItem & { _id?: string }, planItems: (IMealItem & { _id?: string })[]) => void
  // Delete handler — when `seriesScope === 'series'`, the caller appends
  // ?series=true to the DELETE call (plan §7.2).
  onDeletePlan: (planId: string, seriesScope?: 'one' | 'series') => Promise<void>
  onSkipPlan: (planId: string) => Promise<void>
  onPromotePlan?: (planId: string) => Promise<void>
}

// Per-tag border-stripe color. Duplicated from page.tsx (same accent table)
// so the plan card stays self-contained; if the table ever drifts, the source
// of truth is the page-level lookup — sync them by hand.
const TAG_BORDER: Record<string, string> = {
  breakfast: '!border-l-amber-500 dark:!border-l-amber-400',
  lunch: '!border-l-orange-500 dark:!border-l-orange-400',
  dinner: '!border-l-indigo-500 dark:!border-l-indigo-400',
  snack: '!border-l-emerald-500 dark:!border-l-emerald-400',
  'pre-workout': '!border-l-purple-500 dark:!border-l-purple-400',
  'post-workout': '!border-l-rose-500 dark:!border-l-rose-400',
  brunch: '!border-l-yellow-500 dark:!border-l-yellow-400',
  dessert: '!border-l-pink-500 dark:!border-l-pink-400',
  'late-night': '!border-l-slate-500 dark:!border-l-slate-400',
}

function tagBorderClass(tag: string): string {
  return TAG_BORDER[tag.toLowerCase()] ?? '!border-l-zinc-300 dark:!border-l-zinc-700'
}

function titleCaseTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('-')
}

export default function TimelinePlanCard({
  plan,
  compact = false,
  isToday = false,
  onEditItem,
  onDeletePlan,
  onSkipPlan,
  onPromotePlan,
}: TimelinePlanCardProps) {
  const [expanded, setExpanded] = useState(false)
  // Optimistic deletion / skip state — set true at the moment the user clicks.
  // The parent owns the actual mutation + rollback; on rollback the parent
  // re-fetches, this component unmounts/remounts and the state resets.
  const [hidden, setHidden] = useState(false)
  const [faded, setFaded] = useState(plan.status === 'skipped')
  const [working, setWorking] = useState<'edit' | 'delete' | 'skip' | 'promote' | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  if (hidden) return null

  const expectedCals = Math.round(plan.expectedNutrition?.calories ?? 0)
  const itemCount = plan.items.length
  const firstItem = plan.items[0]
  const firstItemName = plan.mealName ?? (firstItem?.name ?? 'Planned meal')
  const remainder = Math.max(0, itemCount - 1)

  const handleDelete = async (scope: 'one' | 'series' = 'one') => {
    if (working) return
    setWorking('delete')
    setHidden(true)
    try {
      await onDeletePlan(plan._id, scope)
    } catch {
      // Parent re-fetches on failure; bring back the card.
      setHidden(false)
      setWorking(null)
    }
  }

  const handleSkip = async () => {
    if (working) return
    setWorking('skip')
    setFaded(true)
    try {
      await onSkipPlan(plan._id)
    } catch {
      setFaded(false)
    } finally {
      setWorking(null)
    }
  }

  const handlePromote = async () => {
    if (!onPromotePlan || working) return
    setWorking('promote')
    try {
      await onPromotePlan(plan._id)
    } finally {
      setWorking(null)
    }
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: faded ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22 }}
      className={`overflow-hidden rounded-xl border-y border-r border-l-[6px] border-dashed border-t-zinc-200 border-r-zinc-200 border-b-zinc-200 bg-white dark:border-t-zinc-800 dark:border-r-zinc-800 dark:border-b-zinc-800 dark:bg-zinc-900 ${tagBorderClass(plan.tag)}`}
    >
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className={`flex w-full items-center gap-2 text-left ${compact ? 'px-3 py-2' : 'px-3 py-2.5 sm:px-4 sm:py-3'}`}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse plan' : 'Expand plan'}
      >
        {/* Planned pill */}
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
          aria-label={`Planned for ${isToday ? 'today' : 'an upcoming day'}`}
        >
          <CalendarDays className="h-3 w-3" />
          Planned{isToday ? ' · Today' : ''}
        </span>

        <span className="shrink-0 text-zinc-300 dark:text-zinc-600">·</span>

        <span className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {titleCaseTag(plan.tag)}
        </span>

        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          <span className="truncate text-sm text-zinc-600 dark:text-zinc-300">
            {firstItemName}
            {remainder > 0 ? ` +${remainder}` : ''}
          </span>
        </div>

        <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold tabular-nums text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
          {expectedCals} cal
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${expanded ? '' : '-rotate-90'}`}
        />
      </button>

      {/* Sub-header: meal-template badge + notes + series indicator */}
      {(plan.mealName || plan.notes || plan.seriesId) && (
        <div className={`-mt-1 flex flex-wrap items-center gap-1.5 ${compact ? 'px-3 pb-2' : 'px-3 pb-2 sm:px-4'}`}>
          {plan.mealName && (
            <span className="inline-flex items-center gap-1 rounded-md bg-orange-100 px-1.5 py-0.5 text-[11px] font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
              <ChefHat className="h-3 w-3" />
              <span className="text-[10px] uppercase tracking-wider opacity-70">From</span>
              <span>·</span>
              <span className="normal-case tracking-normal">{plan.mealName}</span>
            </span>
          )}
          {plan.seriesId && (
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              <Repeat className="h-3 w-3" />
              Series
            </span>
          )}
          {plan.notes && (
            <span className="text-[11px] italic text-zinc-500 dark:text-zinc-400 truncate">
              {plan.notes}
            </span>
          )}
        </div>
      )}

      {/* Expanded body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-zinc-100 dark:border-zinc-800"
          >
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {plan.items.map((item, idx) => (
                <li key={item._id ?? idx} className={`flex items-center gap-3 ${compact ? 'px-3 py-2' : 'px-3 py-2.5 sm:px-4'}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`truncate font-medium text-zinc-900 dark:text-white ${compact ? 'text-xs' : 'text-sm'}`}>
                      {item.name}
                    </p>
                    <p className={`truncate text-zinc-500 dark:text-zinc-400 ${compact ? 'text-[10px]' : 'text-xs'}`}>
                      {item.brand ? `${item.brand} · ` : ''}
                      {item.servings !== 1 ? `${item.servings} servings` : '1 serving'} · {item.servingSize} {item.servingUnit}
                    </p>
                  </div>
                  <span className={`shrink-0 font-semibold tabular-nums text-zinc-700 dark:text-zinc-300 ${compact ? 'text-[11px]' : 'text-sm'}`}>
                    {Math.round((item.nutrition?.calories ?? 0) * (item.servings ?? 1))}
                  </span>
                  <button
                    type="button"
                    onClick={() => onEditItem(plan._id, item, plan.items)}
                    className={`flex shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 ${compact ? 'h-6 w-6' : 'h-7 w-7'}`}
                    aria-label={`Edit ${item.name}`}
                  >
                    <Pencil className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                  </button>
                </li>
              ))}
            </ul>

            {/* Action footer */}
            <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 px-3 py-2 dark:border-zinc-800 sm:px-4">
              {onPromotePlan && isToday && (
                <button
                  type="button"
                  onClick={handlePromote}
                  disabled={working !== null}
                  className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  aria-label="Promote plan to log"
                >
                  {working === 'promote' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Log it
                </button>
              )}

              <button
                type="button"
                onClick={handleSkip}
                disabled={working !== null || faded}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                aria-label="Skip plan"
              >
                {working === 'skip' ? <Loader2 className="h-3 w-3 animate-spin" /> : <SkipForward className="h-3 w-3" />}
                Skip
              </button>

              {confirmingDelete ? (
                <div className="ml-auto inline-flex flex-wrap items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-1.5 py-1 dark:border-red-900/40 dark:bg-red-900/20">
                  <span className="text-[11px] font-medium text-red-700 dark:text-red-300">
                    {plan.seriesId ? 'Delete:' : 'Delete?'}
                  </span>
                  {plan.seriesId ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDelete('one')}
                        disabled={working !== null}
                        className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-900/40"
                      >
                        This one
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete('series')}
                        disabled={working !== null}
                        className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-900/40"
                      >
                        Whole series
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDelete('one')}
                      disabled={working !== null}
                      className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-900/40"
                    >
                      Yes
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={working !== null}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  aria-label="Delete plan"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}
