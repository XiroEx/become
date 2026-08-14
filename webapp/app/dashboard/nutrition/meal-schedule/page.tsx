'use client'

// Meal Schedule — assign an optional time window to each meal tag.
//
// The windows do two things and nothing else:
//   1. Preselect a tag when the food picker opens.
//   2. Position a PLANNED meal on the day view, which has no time of its own.
//
// They never restrict logging. A member whose "Bed" window is 11pm-2am can still
// log Bed at 8pm; the picker just points out that it is outside the usual time
// and offers to file it at 11pm instead. That distinction is the whole design:
// this screen sets DEFAULTS, not rules.
//
// Leaving a tag blank is a first-class answer. Shift work means "Before Work"
// genuinely has no time, and forcing one would make every default wrong.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PageTransition from '@/components/PageTransition'
import { Card, Toast } from '@/components/ui'
import { useToast } from '@/hooks/useToast'
import { getToken } from '@/lib/clientAuth'
import { ArrowLeft, Loader2, X, Check, Plus } from 'lucide-react'
import {
  formatHHMM,
  parseHHMM,
  formatClockLabel,
  windowLength,
  suggestedWindowForTag,
  type TagWindow,
} from '@/lib/nutrition/mealSchedule'

function authHeaders(): HeadersInit {
  const t = getToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

function titleCase(tag: string): string {
  return tag.split(/[-_\s]+/).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ')
}

/** A row in the editor. `start`/`end` are "HH:MM" strings or '' for unscheduled. */
interface Row {
  tag: string
  start: string
  end: string
}

export default function MealSchedulePage() {
  const { toast, showToast } = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newTag, setNewTag] = useState('')

  const load = useCallback(async () => {
    try {
      const [schedRes, tagsRes] = await Promise.all([
        fetch('/api/nutrition/meal-schedule', { headers: authHeaders() }),
        fetch('/api/tags', { headers: authHeaders() }),
      ])
      const sched = schedRes.ok ? await schedRes.json().catch(() => ({})) : {}
      const tagsData = tagsRes.ok ? await tagsRes.json().catch(() => ({})) : {}

      const windows: TagWindow[] = Array.isArray(sched?.windows) ? sched.windows : []
      const byTag = new Map(windows.map(w => [w.tag.toLowerCase(), w]))

      // Every tag the member actually uses gets a row, whether or not it has a
      // window — otherwise scheduling a tag would require inventing it here.
      const known = new Set<string>()
      for (const t of (tagsData?.defaults ?? []) as string[]) known.add(String(t).toLowerCase())
      for (const t of (tagsData?.userTags ?? []) as string[]) known.add(String(t).toLowerCase())
      for (const t of byTag.keys()) known.add(t)

      const next: Row[] = Array.from(known).sort().map(tag => {
        const w = byTag.get(tag)
        return {
          tag,
          start: w ? formatHHMM(w.startMinutes) : '',
          end: w ? formatHHMM(w.endMinutes) : '',
        }
      })
      setRows(next)
    } catch {
      showToast('Could not load your schedule.', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { load() }, [load])

  const setRow = (tag: string, patch: Partial<Row>) => {
    setRows(prev => prev.map(r => (r.tag === tag ? { ...r, ...patch } : r)))
  }

  /** Rows the member has half-filled. Saving one end without the other is
   *  ambiguous, so it is surfaced before it silently becomes "unscheduled". */
  const incomplete = useMemo(
    () => rows.filter(r => (r.start && !r.end) || (!r.start && r.end)).map(r => r.tag),
    [rows],
  )
  /** A zero-length window would match the entire day in windowContains. */
  const zeroLength = useMemo(
    () => rows.filter(r => r.start && r.end && r.start === r.end).map(r => r.tag),
    [rows],
  )

  const save = async () => {
    if (saving) return
    if (zeroLength.length > 0) {
      showToast(`${titleCase(zeroLength[0])} starts and ends at the same time.`, 'error')
      return
    }
    if (incomplete.length > 0) {
      showToast(`${titleCase(incomplete[0])} needs both a start and an end.`, 'error')
      return
    }
    setSaving(true)
    try {
      const windows = rows
        .filter(r => r.start && r.end)
        .map(r => ({ tag: r.tag, startMinutes: parseHHMM(r.start), endMinutes: parseHHMM(r.end) }))
        .filter((w): w is { tag: string; startMinutes: number; endMinutes: number } =>
          w.startMinutes !== null && w.endMinutes !== null)

      const res = await fetch('/api/nutrition/meal-schedule', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ windows }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        showToast(d?.error || 'Could not save that.', 'error')
        return
      }
      showToast('Schedule saved.', 'success')
    } catch {
      showToast('Could not save that.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const addTag = () => {
    const tag = newTag.trim().toLowerCase()
    if (!tag) return
    if (rows.some(r => r.tag === tag)) {
      showToast('That tag is already listed.', 'error')
      return
    }
    const s = suggestedWindowForTag(tag)
    setRows(prev => [...prev, {
      tag,
      start: s ? formatHHMM(s.startMinutes) : '',
      end: s ? formatHHMM(s.endMinutes) : '',
    }].sort((a, b) => a.tag.localeCompare(b.tag)))
    setNewTag('')
  }

  const scheduledCount = rows.filter(r => r.start && r.end).length

  return (
    <PageTransition className="pb-24">
      <div className="space-y-4">
        <header className="flex items-center gap-3">
          <Link
            href="/dashboard/nutrition"
            aria-label="Back to nutrition"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Meal Schedule</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              When each meal usually happens
            </p>
          </div>
        </header>

        <Card variant="compact">
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
            These times only set <span className="font-semibold">defaults</span>. They pick which tag is
            selected when you open food search, and they place a planned meal in the right spot on your day.
            You can always log any tag at any time.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            Leave a meal blank if it does not have a set time. If your shift moves, &ldquo;Before Work&rdquo;
            is better left open than pinned to an hour that is usually wrong.
          </p>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {rows.map(row => {
                  const s = parseHHMM(row.start)
                  const e = parseHHMM(row.end)
                  const wraps = s !== null && e !== null && e <= s
                  const len = s !== null && e !== null
                    ? windowLength({ tag: row.tag, startMinutes: s, endMinutes: e })
                    : null
                  return (
                    <li key={row.tag} className="px-3 py-3">
                      {/* Name on its own line. A native <input type="time"> is wide
                          (it renders "11:00 PM" plus a picker glyph), and two of
                          them beside a label crushed the tag to "B." and "Befo..."
                          at phone width. */}
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900 dark:text-white">
                          {titleCase(row.tag)}
                        </span>
                        {(row.start || row.end) ? (
                          <button
                            type="button"
                            onClick={() => setRow(row.tag, { start: '', end: '' })}
                            aria-label={`Clear ${titleCase(row.tag)} schedule`}
                            className="flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
                          >
                            <X className="h-3 w-3" /> Clear
                          </button>
                        ) : (
                          <span className="shrink-0 text-[11px] text-zinc-400">Not scheduled</span>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <input
                          type="time"
                          value={row.start}
                          onChange={ev => setRow(row.tag, { start: ev.target.value })}
                          aria-label={`${titleCase(row.tag)} start time`}
                          data-testid={`start-${row.tag}`}
                          className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                        />
                        <span className="shrink-0 text-xs text-zinc-400">to</span>
                        <input
                          type="time"
                          value={row.end}
                          onChange={ev => setRow(row.tag, { end: ev.target.value })}
                          aria-label={`${titleCase(row.tag)} end time`}
                          data-testid={`end-${row.tag}`}
                          className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                        />
                      </div>
                      {wraps && len !== null && (
                        <p className="mt-1 text-[11px] text-blue-600 dark:text-blue-400">
                          Runs past midnight &mdash; {formatClockLabel(s!)} to {formatClockLabel(e!)}, {Math.round(len / 60 * 10) / 10}h
                        </p>
                      )}
                      {((row.start && !row.end) || (!row.start && row.end)) && (
                        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                          Needs both a start and an end, or clear it to leave this meal unscheduled.
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>

            <Card variant="compact">
              <label htmlFor="new-tag" className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Add a meal
              </label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="new-tag"
                  value={newTag}
                  onChange={ev => setNewTag(ev.target.value)}
                  onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); addTag() } }}
                  placeholder="e.g. Before Work"
                  data-testid="new-tag-input"
                  className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
                <button
                  type="button"
                  onClick={addTag}
                  disabled={!newTag.trim()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-black"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Save bar — clears the floating nav. */}
      {!loading && (
        <div className="fixed inset-x-0 bottom-20 z-30 px-4">
          <button
            onClick={save}
            disabled={saving}
            data-testid="save-schedule"
            className="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-lg transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? 'Saving…' : `Save schedule (${scheduledCount} scheduled)`}
          </button>
        </div>
      )}

      <Toast toast={toast} />
    </PageTransition>
  )
}
