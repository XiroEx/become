'use client'

// Admin: set/reset your OWN Mind chapter + XP for retesting the journey.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Brain, RefreshCw, Loader2, FlaskConical, ChevronRight } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import { Card, Toast } from '@/components/ui'
import { useToast } from '@/hooks/useToast'
import { BackButton } from '@/components/ui/BackButton'
import { CHAPTERS, CHAPTER_XP_THRESHOLDS } from '@/lib/mindXP'

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}`,
  }
}

export default function MindAdminClient() {
  const { toast, showToast } = useToast()
  const [chapter, setChapter] = useState(1)
  const [xp, setXp] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const res = await fetch('/api/admin/mind-progress', { headers: authHeaders() })
      if (res.ok) {
        const d = await res.json()
        setChapter(d.chapter ?? 1)
        setXp(d.xp ?? 0)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const apply = async (body: { chapter?: number; xp?: number; reset?: boolean }) => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/mind-progress', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (res.ok) {
        setChapter(d.chapter ?? 1)
        setXp(d.xp ?? 0)
        showToast(body.reset ? 'Mind progress reset' : 'Applied', 'success')
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
          Mind XP
        </h1>
      </header>
      <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400">
        Set or reset your own Mind chapter + XP for retesting.
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

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
      ) : (
        <Card className="space-y-5">
          {/* Chapter */}
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
          </div>

          {/* XP */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              XP (next chapter at {CHAPTER_XP_THRESHOLDS[chapter] ?? '—'})
            </label>
            <input
              type="number"
              min={0}
              value={xp}
              onChange={(e) => setXp(Math.max(0, parseInt(e.target.value || '0', 10)))}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => apply({ chapter, xp })}
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Apply
            </button>
            <button
              onClick={() => apply({ reset: true })}
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
            >
              <RefreshCw className="h-4 w-4" />
              Reset to Ch.1 / 0 XP
            </button>
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Reset also clears today&apos;s session so the daily flow + streak start fresh.
          </p>
        </Card>
      )}
      <Toast toast={toast} />
    </PageTransition>
  )
}
