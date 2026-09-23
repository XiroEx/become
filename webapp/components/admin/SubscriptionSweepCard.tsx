'use client'

/**
 * "Did the thing that takes Plus away actually run, and what did it do?"
 *
 * The tier resweep (`/api/cron/resweep-tiers`, scheduled from
 * `.github/workflows/resweep-subscription-tiers.yml`) is the only writer that
 * can move a member's tier with no Stripe event behind it, so what it changed
 * has to be readable by a person, in the app, without a shell.
 *
 * It reads `/api/admin/billing/resweep` and nothing else. No trigger button:
 * the schedule is the one place this runs from.
 *
 * "No changes recorded" is the healthy state and says so, because a run that
 * changes nothing deliberately leaves no row — an empty list here must not read
 * as "the job is broken".
 */

import { useEffect, useState } from 'react'
import { CreditCard } from 'lucide-react'

interface SweepChange {
  userId: string
  from: 'free' | 'plus' | null
  to: 'free' | 'plus'
  status: string
  periodEnd: string | null
}

interface SweepRun {
  id: string
  ranAt: string
  source: 'cron' | 'manual'
  channel: string | null
  candidates: number
  planned: number
  matched: number
  modified: number
  downgrades: number
  upgrades: number
  durationMs: number
  changes: SweepChange[]
}

interface SweepReport {
  pending: number
  lastChangeAt: string | null
  runs: SweepRun[]
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function SubscriptionSweepCard() {
  const [report, setReport] = useState<SweepReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const token = localStorage.getItem('token')
      if (!token) {
        // No token, no read — say so rather than spinning forever.
        setFailed(true)
        setLoading(false)
        return
      }
      try {
        const res = await fetch('/api/admin/billing/resweep', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('failed')
        const data = (await res.json()) as SweepReport
        if (!cancelled) setReport(data)
      } catch {
        if (!cancelled) setFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Subscription sweep
        </h2>
      </div>

      {loading && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading…</p>
      )}

      {!loading && failed && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Could not read the sweep history.
        </p>
      )}

      {!loading && !failed && report && (
        <>
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            Runs every 6 hours against production and re-derives Plus from the stored
            subscription. {report.pending === 0
              ? 'No expired billing rows waiting.'
              : `${report.pending} expired billing row${report.pending === 1 ? '' : 's'} waiting.`}
          </p>

          {report.runs.length === 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              No changes recorded yet — a run that changes nothing writes nothing.
            </p>
          ) : (
            <ul className="space-y-2">
              {report.runs.map((run) => (
                <li
                  key={run.id}
                  className="rounded-xl border border-zinc-100 p-3 dark:border-zinc-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                      {formatWhen(run.ranAt)}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {run.modified} changed
                      {run.downgrades > 0 ? ` · ${run.downgrades} → free` : ''}
                      {run.upgrades > 0 ? ` · ${run.upgrades} → plus` : ''}
                    </span>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {run.changes.map((change) => (
                      <li
                        key={`${run.id}-${change.userId}`}
                        className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400"
                      >
                        {change.userId} · {change.status} · {change.from ?? '—'} →{' '}
                        {change.to}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
