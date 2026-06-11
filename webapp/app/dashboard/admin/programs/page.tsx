'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import PageTransition from '@/components/PageTransition'

interface ProgramListItem {
  _id?: string
  program_id: string
  name: string
  description?: string
  duration_weeks: number
  training_days_per_week: number
  goal: string
  target_user: string
  tags?: string[]
  phases?: unknown[]
}

const PAGE_SIZE = 12

export default function AdminProgramsPage() {
  const router = useRouter()
  const [programs, setPrograms] = useState<ProgramListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [confirmDelete, setConfirmDelete] = useState<ProgramListItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const token = localStorage.getItem('token')
      try {
        const res = await fetch('/api/programs', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (res.ok && !cancelled) {
          const data = (await res.json()) as ProgramListItem[]
          setPrograms(Array.isArray(data) ? data : [])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Debounced search input
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setSearch(searchInput.trim().toLowerCase())
      setPage(1)
    }, 200)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchInput])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const filtered = useMemo(() => {
    if (!search) return programs
    return programs.filter((p) => {
      const haystack = `${p.name} ${p.description ?? ''} ${p.goal ?? ''} ${(p.tags ?? []).join(
        ' '
      )}`.toLowerCase()
      return haystack.includes(search)
    })
  }, [programs, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  async function handleDelete(p: ProgramListItem) {
    setDeleting(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/programs/${encodeURIComponent(p.program_id)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (res.ok) {
        setPrograms((prev) => prev.filter((x) => x.program_id !== p.program_id))
        setToast({ msg: `Deleted "${p.name}"`, type: 'success' })
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
              This permanently removes the program. Users currently enrolled keep their progress
              records, but the program itself will no longer be browsable.
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
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Programs</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Author and manage all training programs
          </p>
        </div>
        <Link
          href="/dashboard/admin/programs/new"
          className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-900"
        >
          <Plus className="h-4 w-4" />
          New Program
        </Link>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          placeholder="Search by name, goal, tags…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-4 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:ring-2 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:ring-zinc-100"
        />
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 py-16 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {search ? 'No programs match your search.' : 'No programs yet — create your first one.'}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((p) => (
            <div
              key={p.program_id}
              className="group relative rounded-2xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    {p.name}
                  </h2>
                  {p.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {p.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {p.duration_weeks}w
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {p.training_days_per_week}/wk
                    </span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {p.target_user}
                    </span>
                    {p.phases && (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {p.phases.length} phase{p.phases.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-zinc-400 dark:text-zinc-500">
                    {p.program_id}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() =>
                      router.push(
                        `/dashboard/admin/programs/${encodeURIComponent(p.program_id)}/edit`
                      )
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(p)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
          >
            Prev
          </button>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
          >
            Next
          </button>
        </div>
      )}
    </PageTransition>
  )
}
