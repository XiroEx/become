'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Search, Video, VideoOff, AlertTriangle } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import { describeExerciseIssues, type ExerciseIssue } from '@/lib/exerciseAudit'

interface ExerciseListItem {
  _id?: string
  slug: string
  name: string
  category: string
  mechanics?: string
  primaryMuscles?: string[]
  equipment?: string[]
  bodyRegion?: string
  movementPatterns?: string[]
  isActive?: boolean
  videoUrl?: string | null
  instructions?: string[]
}

type IssueFilter = '' | 'duplicate' | 'noVideo' | 'broken'

/**
 * Row-level "why is this flagged" reasons, computed from the fields the
 * list already fetched — no extra request. On the Duplicates tab every row
 * is a duplicate by definition (that's what put it in the response), but
 * the list doesn't know the colliding name without a full-catalog
 * cross-reference (that's what /api/admin/exercises/[slug]/issues is for,
 * shown on the edit page instead).
 */
function rowIssues(ex: ExerciseListItem, activeIssueTab: IssueFilter): ExerciseIssue[] {
  const issues = describeExerciseIssues(ex)
  if (activeIssueTab === 'duplicate' && !issues.some((i) => i.type === 'duplicate')) {
    issues.push({ type: 'duplicate', message: 'Duplicate name — matches another exercise in the catalog' })
  }
  return issues
}

const ISSUE_TABS: { key: IssueFilter; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'duplicate', label: 'Duplicates' },
  { key: 'noVideo', label: 'No Video' },
  { key: 'broken', label: 'Broken' },
]

const CATEGORIES = [
  '',
  'strength',
  'power',
  'cardio',
  'plyometric',
  'calisthenics',
  'olympic',
  'strongman',
  'flexibility',
  'mobility',
  'warmup',
  'cooldown',
  'conditioning',
  'protocol',
] as const

const MOVEMENT_PATTERNS = [
  '',
  'squat',
  'hinge',
  'lunge',
  'horizontal_push',
  'horizontal_pull',
  'vertical_push',
  'vertical_pull',
  'carry',
  'rotation',
  'anti_rotation',
  'anti_extension',
  'anti_lateral_flexion',
  'knee_extension',
  'knee_flexion',
  'hip_extension',
  'horizontal_adduction',
  'shoulder_abduction',
  'shoulder_flexion',
  'elbow_flexion',
  'elbow_extension',
  'ankle_flexion',
  'scapular_retraction',
  'triple_extension',
  'gait',
  'n/a',
] as const

export default function AdminExercisesPage() {
  const router = useRouter()
  const [exercises, setExercises] = useState<ExerciseListItem[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('')
  const [movement, setMovement] = useState<string>('')
  const [confirmDelete, setConfirmDelete] = useState<ExerciseListItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pendingReviewCount, setPendingReviewCount] = useState(0)
  const [issue, setIssue] = useState<IssueFilter>('')
  const [issueCounts, setIssueCounts] = useState<{ duplicate: number; noVideo: number; broken: number }>({
    duplicate: 0,
    noVideo: 0,
    broken: 0,
  })

  useEffect(() => {
    const token = localStorage.getItem('token')
    fetch('/api/admin/exercises/review', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data) setPendingReviewCount(data.submissions?.length ?? 0) })
      .catch(() => {})
    fetch('/api/admin/exercises/audit-counts', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data) setIssueCounts(data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 250)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchInput])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const token = localStorage.getItem('token')
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: '50',
        })
        if (search) params.set('q', search)
        if (category) params.set('category', category)
        if (movement) params.set('movement', movement)
        if (issue) params.set('issue', issue)
        const res = await fetch(`/api/exercises?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (res.ok && !cancelled) {
          const data = (await res.json()) as {
            exercises: ExerciseListItem[]
            total: number
            pages: number
          }
          setExercises(data.exercises ?? [])
          setTotal(data.total ?? 0)
          setPages(data.pages ?? 1)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [page, search, category, movement, issue])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  async function handleDelete(ex: ExerciseListItem) {
    setDeleting(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/exercises/${encodeURIComponent(ex.slug)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (res.ok) {
        setExercises((prev) => prev.filter((x) => x.slug !== ex.slug))
        setToast({ msg: `Deleted "${ex.name}"`, type: 'success' })
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setToast({ msg: data.error ?? 'Delete failed', type: 'error' })
      }
    } catch {
      setToast({ msg: 'Network error', type: 'error' })
    } finally {
      setDeleting(false)
      setConfirmDelete(null)
    }
  }

  return (
    <PageTransition>
      {toast && (
        <div
          className={`fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-lg ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-zinc-900">
            <h3 className="mb-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Delete &quot;{confirmDelete.name}&quot;?
            </h3>
            <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
              Programs that reference this exercise by slug will show it as missing.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="flex-1 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Exercises</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {total} exercise{total === 1 ? '' : 's'} in the library
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/admin/exercises/review"
            className="relative flex items-center gap-1.5 rounded-xl border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Review submissions
            {pendingReviewCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">
                {pendingReviewCount}
              </span>
            )}
          </Link>
          <Link
            href="/dashboard/admin/exercises/new"
            className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-900"
          >
            <Plus className="h-4 w-4" />
            New Exercise
          </Link>
        </div>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <div className="relative sm:col-span-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by name, slug, or alias…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-4 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:ring-zinc-100"
          />
        </div>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value)
            setPage(1)
          }}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c === '' ? 'All categories' : c}
            </option>
          ))}
        </select>
        <select
          value={movement}
          onChange={(e) => {
            setMovement(e.target.value)
            setPage(1)
          }}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:col-span-2"
        >
          {MOVEMENT_PATTERNS.map((m) => (
            <option key={m} value={m}>
              {m === '' ? 'All movement patterns' : m}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {ISSUE_TABS.map((tab) => {
          const count = tab.key ? issueCounts[tab.key] : null
          const active = issue === tab.key
          return (
            <button
              key={tab.key || 'all'}
              onClick={() => {
                setIssue(tab.key)
                setPage(1)
              }}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
              }`}
            >
              {tab.label}
              {count !== null && count > 0 && (
                <span
                  className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] ${
                    active ? 'bg-white/20' : 'bg-amber-500 text-white'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
          ))}
        </div>
      ) : exercises.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 py-16 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No exercises match your filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          {exercises.map((ex, i) => {
            const issues = rowIssues(ex, issue)
            return (
            <div
              key={ex.slug}
              className={`flex items-center gap-3 px-3 py-3 ${
                i > 0 ? 'border-t border-zinc-100 dark:border-zinc-800' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                    {ex.name}
                  </span>
                  {ex.videoUrl ? (
                    <Video
                      className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                      strokeWidth={1.75}
                      aria-label="Has video"
                    >
                      <title>Has video</title>
                    </Video>
                  ) : (
                    <VideoOff
                      className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-600"
                      strokeWidth={1.75}
                      aria-label="No video"
                    >
                      <title>No video</title>
                    </VideoOff>
                  )}
                  <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {ex.category}
                  </span>
                  {ex.mechanics && ex.mechanics !== 'n/a' && (
                    <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      {ex.mechanics}
                    </span>
                  )}
                  {ex.isActive === false && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-800 dark:bg-amber-900 dark:text-amber-300">
                      inactive
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {ex.slug}
                  {ex.primaryMuscles && ex.primaryMuscles.length > 0
                    ? ` · ${ex.primaryMuscles.join(', ')}`
                    : ''}
                  {ex.equipment && ex.equipment.length > 0
                    ? ` · ${ex.equipment.join(', ')}`
                    : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {issues.length > 0 && (
                  <button
                    onClick={() =>
                      router.push(
                        `/dashboard/admin/exercises/${encodeURIComponent(ex.slug)}/edit`
                      )
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950"
                    title={`Flagged: ${issues.map((iss) => iss.message).join('; ')} — click to edit`}
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() =>
                    router.push(
                      `/dashboard/admin/exercises/${encodeURIComponent(ex.slug)}/edit`
                    )
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setConfirmDelete(ex)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            )
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
          >
            Prev
          </button>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Page {page} of {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
          >
            Next
          </button>
        </div>
      )}
    </PageTransition>
  )
}
