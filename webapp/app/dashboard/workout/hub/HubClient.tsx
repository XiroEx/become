'use client'

// Unified Workout hub — one page, three deep-linkable tabs:
//   Exercises (custom exercise library) · Sessions (quick sessions + builder) ·
//   Programs (my custom programs). The Workout page's header buttons route here
//   with ?tab=exercises / ?tab=programs. Only the active tab's panel is mounted,
//   so the embedded clients' fetches don't all fire at once.

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Dumbbell, Zap, Sparkles, Calendar, Clock, Plus } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import { Card, EmptyState } from '@/components/ui'
import ExerciseLibraryClient from '../library/ExerciseLibraryClient'
import MyProgramsClient from '../../programs/mine/MyProgramsClient'
import SessionBuilder from '@/components/SessionBuilder'
import { BackButton } from '@/components/ui/BackButton'

type TabKey = 'exercises' | 'sessions' | 'programs'

const TABS: { key: TabKey; label: string; icon: typeof Dumbbell }[] = [
  { key: 'exercises', label: 'Exercises', icon: Dumbbell },
  { key: 'sessions', label: 'Sessions', icon: Zap },
  { key: 'programs', label: 'Programs', icon: Sparkles },
]

function isTabKey(value: string | null): value is TabKey {
  return value === 'exercises' || value === 'sessions' || value === 'programs'
}

// ─── Sessions tab ──────────────────────────────────────────────────────────────

interface SessionLog {
  kind: 'program' | 'quick'
  title: string
  focus?: string
  date: string
  duration?: number
  exerciseCount: number
  sessionId?: string
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((startOfToday.getTime() - startOfDay.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

function SessionsTab() {
  const [sessions, setSessions] = useState<SessionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [building, setBuilding] = useState(false)

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
          setSessions((data.logs ?? []).filter((l) => l.kind === 'quick'))
        }
      } catch (error) {
        console.error('Error loading sessions:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="pb-6">
      {/* Header + create toggle (mirrors the Exercises tab) */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Your sessions</h2>
        {!building && (
          <button
            onClick={() => setBuilding(true)}
            className="flex h-9 items-center gap-1.5 rounded-full bg-green-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700 active:bg-green-800"
          >
            <Plus className="h-4 w-4" />
            Build
          </button>
        )}
      </div>

      {/* Inline builder (revealed on demand) */}
      {building && (
        <div className="mb-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Build a session</h3>
            <button
              onClick={() => setBuilding(false)}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>
          <SessionBuilder onLaunch={() => setBuilding(false)} />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<Zap className="h-7 w-7" />}
          title="No sessions yet"
          description={building ? 'Add exercises above to build one.' : 'Tap Build to create your first session.'}
        />
      ) : (
        <div className="space-y-3">
          {sessions.map((log, i) => (
            <Card
              key={`${log.sessionId ?? log.date}-${i}`}
              accent="info"
              className="flex items-center gap-3"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                  {log.title}
                </h3>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(log.date)}
                  </span>
                  <span>
                    {log.exerciseCount} {log.exerciseCount === 1 ? 'exercise' : 'exercises'}
                  </span>
                  {log.duration ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {log.duration} min
                    </span>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Hub ───────────────────────────────────────────────────────────────────────

export default function HubClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const paramTab = searchParams.get('tab')

  const [tab, setTab] = useState<TabKey>(isTabKey(paramTab) ? paramTab : 'exercises')

  // Keep local state in sync with back/forward navigation.
  useEffect(() => {
    if (isTabKey(paramTab) && paramTab !== tab) {
      setTab(paramTab)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramTab])

  const selectTab = (key: TabKey) => {
    setTab(key)
    router.replace(`/dashboard/workout/hub?tab=${key}`, { scroll: false })
  }

  const tabs = useMemo(() => TABS, [])

  return (
    <PageTransition className="pb-6">
      <header className="mb-4 flex items-center gap-3">
        <BackButton />
        <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white sm:text-3xl">
          My Workout
        </h1>
      </header>

      {/* Segmented tab control */}
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => selectTab(t.key)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                active
                  ? 'bg-green-500 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Active panel only */}
      {tab === 'exercises' && <ExerciseLibraryClient embedded />}
      {tab === 'sessions' && <SessionsTab />}
      {tab === 'programs' && <MyProgramsClient embedded />}
    </PageTransition>
  )
}
