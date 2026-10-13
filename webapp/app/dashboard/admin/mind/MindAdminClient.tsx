'use client'

// Admin: set/reset your OWN Mind level, chapter and XP for retesting the journey.
//
// Level and chapter are DERIVED, not stored — level comes from levelXp, chapter
// from mainSessionCount. This screen shows both the derived value and the counter
// behind it, so when something looks stuck you can see which one disagrees
// instead of guessing.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Brain, RefreshCw, Loader2, FlaskConical, ChevronRight, RotateCcw, Lock, Unlock } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import { Card, Toast } from '@/components/ui'
import { useToast } from '@/hooks/useToast'
import { BackButton } from '@/components/ui/BackButton'
import { CHAPTERS } from '@/lib/mindXP'
import { invalidateMindSession } from '@/lib/mind/sessionCache'

interface Snapshot {
  chapter: number
  level: number
  levelProgress?: { level: number; intoLevel: number; span: number; pct: number; xpToNext: number }
  storedChapter: number
  mainSessionCount: number
  sessionsIntoChapter?: { done: number; needed: number; toNext: number }
  levelXp: number
  xp: number
  xpBank: number
  introducedSystems: string[]
  mainSessionAvailable: boolean
  lastMainSessionAt: number | null
  nextMainSessionAt: number | null
  dateKey: string
  completedToday: boolean
  completionsToday: number
  totalSessionDays: number
}

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}`,
  }
}

function relTime(ms: number | null): string {
  if (!ms) return 'never'
  const diff = Date.now() - ms
  if (diff < 0) return `in ${Math.ceil(-diff / 60_000)}m`
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-zinc-900/60">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</p>
      <p className="text-lg font-extrabold tabular-nums text-zinc-900 dark:text-white">{value}</p>
      {hint && <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{hint}</p>}
    </div>
  )
}

export default function MindAdminClient() {
  const { toast, showToast } = useToast()
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [chapter, setChapter] = useState(1)
  const [level, setLevel] = useState(1)
  const [xp, setXp] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const adopt = useCallback((d: Snapshot) => {
    setSnap(d)
    setChapter(d.chapter ?? 1)
    setLevel(d.level ?? 1)
    setXp(d.xp ?? 0)
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/mind-progress?tz=${new Date().getTimezoneOffset()}`, {
        headers: authHeaders(),
      })
      if (res.ok) adopt((await res.json()) as Snapshot)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [adopt])

  useEffect(() => {
    load()
  }, [load])

  const apply = async (
    body: { chapter?: number; level?: number; xp?: number; reset?: boolean; resetDailySession?: boolean },
    successMessage: string,
  ) => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/mind-progress', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ...body, tz: new Date().getTimezoneOffset() }),
      })
      const d = await res.json()
      if (res.ok) {
        adopt(d as Snapshot)
        // The composed session is cached in localStorage for 8h — drop it so the
        // next Mind open builds a fresh one against the new state.
        invalidateMindSession()
        showToast(successMessage, 'success')
      } else {
        showToast(d.error || 'Failed', 'error')
      }
    } catch {
      showToast('Network error', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageTransition className="pb-6">
      <header className="mb-5 flex items-center gap-3">
        <BackButton fallbackHref="/dashboard/admin" />
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-zinc-900 dark:text-white">
          <Brain className="h-6 w-6 text-violet-500" />
          Mind progress
        </h1>
      </header>
      <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400">
        Set or reset your own level, chapter and XP, or replay today&apos;s main session.
      </p>

      <Link
        href="/dashboard/admin/mind/lab"
        className="mb-5 flex items-center justify-between rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3.5 transition-colors hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:hover:bg-violet-500/20"
      >
        <span className="flex items-center gap-3">
          <FlaskConical className="h-5 w-5 text-violet-500" />
          <span>
            <span className="block text-sm font-semibold text-zinc-900 dark:text-white">Open Mind Lab</span>
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">Test every modality + browse all content (no writes)</span>
          </span>
        </span>
        <ChevronRight className="h-4 w-4 text-zinc-400" />
      </Link>

      {loading || !snap ? (
        <div className="h-40 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
      ) : (
        <div className="space-y-5">
          {/* ── Live state ── */}
          <Card className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              Live state
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                label="Level"
                value={snap.level}
                hint={snap.levelProgress ? `${snap.levelProgress.intoLevel}/${snap.levelProgress.span} into it` : undefined}
              />
              <Stat
                label="Chapter"
                value={snap.chapter}
                hint={snap.sessionsIntoChapter ? `${snap.sessionsIntoChapter.done}/${snap.sessionsIntoChapter.needed} sessions` : undefined}
              />
              <Stat label="Level XP" value={snap.levelXp} hint="drives level" />
              <Stat label="Main sessions" value={snap.mainSessionCount} hint="drives chapter" />
              <Stat label="XP" value={snap.xp} />
              <Stat label="Becoming" value={snap.xpBank} hint="lifetime bank" />
              <Stat label="Session days" value={snap.totalSessionDays} />
              <Stat label="Tools introduced" value={snap.introducedSystems.length} />
            </div>

            {/* The two things that gate today's main session. */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <div
                className={`flex flex-1 items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold ${
                  snap.mainSessionAvailable
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                }`}
              >
                {snap.mainSessionAvailable ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                {snap.mainSessionAvailable
                  ? 'Main session available'
                  : `On cooldown — unlocks ${relTime(snap.nextMainSessionAt)}`}
              </div>
              <div className="flex flex-1 items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2.5 text-xs font-medium text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400">
                {snap.dateKey}:{' '}
                {snap.completedToday ? `done ×${snap.completionsToday}` : 'not done yet'}
                <span className="ml-auto text-zinc-400">last: {relTime(snap.lastMainSessionAt)}</span>
              </div>
            </div>
          </Card>

          {/* ── Replay today ── */}
          <Card className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">Replay today&apos;s main session</p>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Clears the 20h cooldown and today&apos;s session record so the main session is playable
                again. Level, chapter and XP are left alone.
              </p>
            </div>
            <button
              onClick={() => apply({ resetDailySession: true }, "Today's session reset — go play it")}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60 dark:border-amber-500/40 dark:text-amber-400 dark:hover:bg-amber-500/10"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Reset today&apos;s session
            </button>
          </Card>

          {/* ── Set values ── */}
          <Card className="space-y-5">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Chapter
              </label>
              <div className="flex flex-wrap gap-2">
                {CHAPTERS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setChapter(c.id)}
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                      chapter === c.id
                        ? 'bg-violet-500 text-white'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {c.id}. {c.name}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                Also sets completed main sessions to {(chapter - 1) * 10}, which is what actually
                unlocks the chapter. Tools above the new chapter get re-locked.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Level
                </label>
                <input
                  type="number"
                  min={1}
                  value={level}
                  onChange={(e) => setLevel(Math.max(1, parseInt(e.target.value || '1', 10)))}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  XP
                </label>
                <input
                  type="number"
                  min={0}
                  value={xp}
                  onChange={(e) => setXp(Math.max(0, parseInt(e.target.value || '0', 10)))}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                />
              </div>
            </div>

            <button
              onClick={() => apply({ chapter, level, xp }, `Set Level ${level} · Ch.${chapter}`)}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Apply
            </button>
          </Card>

          {/* ── Full reset ── */}
          <Card className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">Full reset</p>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Back to a brand-new account: level 1, chapter 1, all XP and counters zeroed, tool
                intros re-locked, the cooldown cleared and every session day deleted. Your check-ins,
                journal and vision are kept.
              </p>
            </div>
            <button
              onClick={() => apply({ reset: true }, 'Mind progress fully reset')}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
            >
              <RefreshCw className="h-4 w-4" />
              Reset everything to Level 1 / Ch.1
            </button>
          </Card>
        </div>
      )}
      <Toast toast={toast} />
    </PageTransition>
  )
}
