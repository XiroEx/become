'use client'

// Session history — a chronological list of every completed workout, program
// and quick (ad-hoc) alike, with filter toggles. Fed by GET /api/workouts/logs
// (no programId → history mode).

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Dumbbell, Sparkles, Clock, Calendar, History as HistoryIcon } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import { Card, EmptyState } from '@/components/ui'

interface SessionLog {
  kind: 'program' | 'quick'
  title: string
  focus?: string
  programId?: string
  programName?: string
  day?: string
  phase?: number
  sessionId?: string
  completed: boolean
  date: string
  duration?: number
  exerciseCount: number
  completedSets: number
}

type FilterKey = 'all' | 'program' | 'quick'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'program', label: 'Programs' },
  { key: 'quick', label: 'Quick' },
]

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((startOfToday.getTime() - startOfDay.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

export default function HistoryClient() {
  const [logs, setLogs] = useState<SessionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('all')

  useEffect(() => {
    async function load() {
      try {
        const token = localStorage.getItem('token')
        if (!token) {
          setLoading(false)
          return
        }
        const res = await fetch('/api/workouts/logs', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = (await res.json()) as { logs?: SessionLog[] }
          setLogs(data.logs ?? [])
        }
      } catch (error) {
        console.error('Error loading session history:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const counts = useMemo(
    () => ({
      all: logs.length,
      program: logs.filter((l) => l.kind === 'program').length,
      quick: logs.filter((l) => l.kind === 'quick').length,
    }),
    [logs],
  )

  const filtered = useMemo(
    () => (filter === 'all' ? logs : logs.filter((l) => l.kind === filter)),
    [logs, filter],
  )

  return (
    <PageTransition className="pb-6">
      <header className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-zinc-900 dark:text-white sm:text-3xl">
          <HistoryIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
          History
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Every session you&apos;ve completed — programs and quick workouts.
        </p>
      </header>

      {/* Filter toggles */}
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              filter === f.key
                ? 'bg-green-500 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }`}
          >
            {f.label}
            <span
              className={`rounded-full px-1.5 text-xs ${
                filter === f.key ? 'bg-white/25' : 'bg-zinc-200 dark:bg-zinc-700'
              }`}
            >
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Dumbbell className="h-7 w-7" />}
          title="No sessions yet"
          description={
            filter === 'quick'
              ? 'Start a Quick Session and it will show up here.'
              : filter === 'program'
                ? 'Complete a program workout and it will show up here.'
                : 'Your completed workouts will appear here.'
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((log, i) => {
            const isQuick = log.kind === 'quick'
            const Inner = (
              <Card
                accent={isQuick ? 'info' : 'success'}
                className="flex items-center gap-3 transition-colors duration-200 hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    isQuick
                      ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                      : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                  }`}
                >
                  {isQuick ? <Sparkles className="h-5 w-5" /> : <Dumbbell className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                      {log.title}
                    </h3>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        isQuick
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                          : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      }`}
                    >
                      {isQuick ? 'Quick' : 'Program'}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(log.date)}
                    </span>
                    <span>{log.exerciseCount} {log.exerciseCount === 1 ? 'exercise' : 'exercises'}</span>
                    {log.duration ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {log.duration} min
                      </span>
                    ) : null}
                  </div>
                </div>
              </Card>
            )
            // Program sessions deep-link to their program; quick sessions have
            // nowhere to navigate yet, so they render as a static card.
            return log.kind === 'program' && log.programId ? (
              <Link key={`${log.sessionId ?? log.date}-${i}`} href={`/dashboard/programming/${log.programId}`} className="block">
                {Inner}
              </Link>
            ) : (
              <div key={`${log.sessionId ?? log.date}-${i}`}>{Inner}</div>
            )
          })}
        </div>
      )}
    </PageTransition>
  )
}
