'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, X, Dumbbell } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import AdminVideoPreview from '@/app/dashboard/admin/exercises/_form/AdminVideoPreview'
import type { VideoFramingOverride } from '@/lib/videoFraming'
import type { VideoTrimOverride } from '@/lib/videoTrim'

interface Submission {
  slug: string
  name: string
  trackingType: string
  primaryMuscles?: string[]
  bodyRegion?: string
  category: string
  role?: string
  defaultSets?: number
  defaultReps?: string
  tags?: string[]
  videoUrl?: string | null
  videoWidth?: number | null
  videoHeight?: number | null
  videoFraming?: VideoFramingOverride | null
  videoTrim?: VideoTrimOverride | null
  submittedAt?: string | null
  submittedBy: { name: string | null; email: string | null } | null
  reviewNote?: string | null
}

export default function ExerciseReviewQueuePage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true);
  const [actingSlug, setActingSlug] = useState<string | null>(null)
  const [rejectingSlug, setRejectingSlug] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/admin/exercises/review', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setSubmissions(data.submissions || [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (slug: string, action: 'approve' | 'reject', note?: string) => {
    setActingSlug(slug)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/admin/exercises/review/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, note }),
      })
      if (res.ok) {
        setSubmissions(prev => prev.filter(s => s.slug !== slug))
        setRejectingSlug(null)
        setRejectNote('')
      }
    } finally {
      setActingSlug(null)
    }
  }

  return (
    <PageTransition className="mx-auto max-w-3xl px-3 pb-10 pt-4 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/dashboard/admin/exercises"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white">Universal Submissions</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Custom exercises members submitted, plus any auto-flagged as a likely duplicate. Approve to make one visible to everyone.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
        </div>
      ) : submissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
            <Dumbbell className="h-8 w-8 text-zinc-400 dark:text-zinc-500" />
          </div>
          <p className="text-base font-semibold text-zinc-700 dark:text-zinc-300">Nothing waiting on review</p>
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map((s) => (
            <div key={s.slug} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-start gap-3">
                {s.videoUrl ? (
                  <AdminVideoPreview
                    url={s.videoUrl}
                    size="sm"
                    videoWidth={s.videoWidth}
                    videoHeight={s.videoHeight}
                    videoFraming={s.videoFraming}
                    videoTrim={s.videoTrim}
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <Dumbbell className="h-5 w-5 text-zinc-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-zinc-900 dark:text-white">{s.name}</p>
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {s.category} · {s.role ?? 'accessory'}
                    {s.primaryMuscles?.length ? ` · ${s.primaryMuscles.join(', ')}` : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                    Submitted by {s.submittedBy?.name || s.submittedBy?.email || 'unknown user'}
                    {!s.videoUrl && ' · no video attached'}
                  </p>
                </div>
              </div>

              {s.reviewNote && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                  ⚠ {s.reviewNote}
                </p>
              )}

              {rejectingSlug === s.slug ? (
                <div className="mt-3 space-y-2">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Reason (optional) — shown to the submitter"
                    value={rejectNote}
                    onChange={e => setRejectNote(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setRejectingSlug(null); setRejectNote('') }}
                      className="flex-1 rounded-lg border border-zinc-300 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => act(s.slug, 'reject', rejectNote)}
                      disabled={actingSlug === s.slug}
                      className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Confirm reject
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => act(s.slug, 'approve')}
                    disabled={actingSlug === s.slug}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => setRejectingSlug(s.slug)}
                    disabled={actingSlug === s.slug}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/20"
                  >
                    <X className="h-4 w-4" />
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PageTransition>
  )
}
