'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, MoreHorizontal, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react'
import PageTransition from '@/components/PageTransition'

interface AdminUser {
  _id: string
  name: string
  email: string
  role: 'user' | 'trainer' | 'admin'
  onboardingCompleted?: boolean
  createdAt?: string
  totalWorkouts: number
  streakDays: number
  lastActivityDate?: string | null
}

type RoleFilter = '' | 'user' | 'trainer' | 'admin'

const ROLE_COLORS: Record<string, string> = {
  user: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300',
  trainer: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  admin: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
}

const INITIALS_BG: Record<string, string> = {
  user: 'bg-zinc-400',
  trainer: 'bg-blue-500',
  admin: 'bg-red-500',
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function relativeDate(dateStr?: string): string {
  if (!dateStr) return 'Unknown'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`
  return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? 's' : ''} ago`
}

interface ToastState {
  message: string
  type: 'success' | 'error'
}

interface MenuState {
  userId: string
  mode: 'main' | 'role'
}

interface ConfirmDeleteState {
  userId: string
  name: string
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDeleteState | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const fetchUsers = useCallback(
    async (searchVal: string, roleVal: RoleFilter, pageVal: number) => {
      setLoading(true)
      const token = localStorage.getItem('token')
      if (!token) return
      try {
        const params = new URLSearchParams({
          page: String(pageVal),
          limit: '20',
        })
        if (searchVal) params.set('search', searchVal)
        if (roleVal) params.set('role', roleVal)
        const res = await fetch(`/api/admin/users?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json() as { users: AdminUser[]; total: number; page: number; pages: number }
          setUsers(data.users)
          setTotalPages(data.pages)
        }
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    fetchUsers(search, roleFilter, page)
  }, [roleFilter, page]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setPage(1)
      fetchUsers(search, roleFilter, 1)
    }, 300)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null)
      }
    }
    if (menu) {
      document.addEventListener('mousedown', handleOutside)
    }
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [menu])

  async function patchUser(userId: string, body: Record<string, unknown>) {
    const token = localStorage.getItem('token')
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    return res
  }

  async function handleChangeRole(userId: string, role: 'user' | 'trainer' | 'admin') {
    setMenu(null)
    const res = await patchUser(userId, { role })
    if (res.ok) {
      setToast({ message: `Role updated to ${role}`, type: 'success' })
      setUsers((prev) =>
        prev.map((u) => (u._id === userId ? { ...u, role } : u))
      )
    } else {
      setToast({ message: 'Failed to update role', type: 'error' })
    }
  }

  async function handleResetOnboarding(userId: string) {
    setMenu(null)
    const res = await patchUser(userId, { onboardingCompleted: false })
    if (res.ok) {
      setToast({ message: 'Onboarding reset', type: 'success' })
      setUsers((prev) =>
        prev.map((u) => (u._id === userId ? { ...u, onboardingCompleted: false } : u))
      )
    } else {
      setToast({ message: 'Failed to reset onboarding', type: 'error' })
    }
  }

  async function handleDelete(userId: string) {
    setConfirmDelete(null)
    const token = localStorage.getItem('token')
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      setToast({ message: 'User deleted', type: 'success' })
      setUsers((prev) => prev.filter((u) => u._id !== userId))
    } else {
      setToast({ message: 'Failed to delete user', type: 'error' })
    }
  }

  const roleTabs: { label: string; value: RoleFilter }[] = [
    { label: 'All', value: '' },
    { label: 'Users', value: 'user' },
    { label: 'Trainers', value: 'trainer' },
    { label: 'Admins', value: 'admin' },
  ]

  return (
    <PageTransition>
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-lg ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-zinc-900">
            <h3 className="mb-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Delete {confirmDelete.name}?
            </h3>
            <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
              This cannot be undone. All their data will be permanently removed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete.userId)}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Users</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Manage all platform users</p>
      </div>

      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none ring-zinc-900 transition focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500 dark:ring-zinc-100"
        />
      </div>

      {/* Role filter tabs */}
      <div className="mb-4 flex gap-1">
        {roleTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setRoleFilter(tab.value)
              setPage(1)
            }}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              roleFilter === tab.value
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* User list */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800"
            />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="py-16 text-center text-sm text-zinc-400 dark:text-zinc-500">
          No users found
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {users.map((user) => (
            <div
              key={user._id}
              className="relative rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div
                className="flex cursor-pointer items-center gap-3"
                onClick={() => router.push(`/dashboard/admin/users/${user._id}`)}
              >
                {/* Avatar */}
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                    INITIALS_BG[user.role] ?? 'bg-zinc-400'
                  }`}
                >
                  {getInitials(user.name)}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
                      {user.name}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        ROLE_COLORS[user.role]
                      }`}
                    >
                      {user.role}
                    </span>
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        user.onboardingCompleted
                          ? 'bg-green-500'
                          : 'bg-amber-400'
                      }`}
                      title={user.onboardingCompleted ? 'Onboarding complete' : 'Onboarding pending'}
                    />
                  </div>
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{user.email}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    💪 {user.totalWorkouts} workouts &bull; 🔥 {user.streakDays}d streak
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    Joined {relativeDate(user.createdAt)}
                  </p>
                </div>

                {/* Chevron */}
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
              </div>

              {/* Three-dot menu button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setMenu(
                    menu?.userId === user._id ? null : { userId: user._id, mode: 'main' }
                  )
                }}
                className="absolute right-10 top-4 flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>

              {/* Context menu */}
              {menu?.userId === user._id && (
                <div
                  ref={menuRef}
                  className="absolute right-4 top-12 z-20 w-44 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
                >
                  {menu.mode === 'main' ? (
                    <>
                      <button
                        className="flex w-full items-center px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenu({ userId: user._id, mode: 'role' })
                        }}
                      >
                        Change Role
                      </button>
                      <button
                        className="flex w-full items-center px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleResetOnboarding(user._id)
                        }}
                      >
                        Reset Onboarding
                      </button>
                      <button
                        className="flex w-full items-center px-4 py-2 text-left text-sm text-red-600 hover:bg-zinc-50 dark:text-red-400 dark:hover:bg-zinc-700"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenu(null)
                          setConfirmDelete({ userId: user._id, name: user.name })
                        }}
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="border-b border-zinc-100 px-4 py-1.5 text-xs font-medium text-zinc-400 dark:border-zinc-700">
                        Select role
                      </p>
                      {(['user', 'trainer', 'admin'] as const).map((r) => (
                        <button
                          key={r}
                          className={`flex w-full items-center px-4 py-2 text-left text-sm capitalize hover:bg-zinc-50 dark:hover:bg-zinc-700 ${
                            user.role === r
                              ? 'font-medium text-zinc-900 dark:text-zinc-100'
                              : 'text-zinc-600 dark:text-zinc-400'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleChangeRole(user._id, r)
                          }}
                        >
                          {r}
                          {user.role === r && (
                            <span className="ml-auto text-xs text-zinc-400">current</span>
                          )}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </button>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
          >
            Next
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </PageTransition>
  )
}
