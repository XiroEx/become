"use client"
import React, { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { LogOut, MessageSquareText, Settings, ShieldCheck, UserRound, Bell } from 'lucide-react'
import FoodReportsPanel from './nutrition/FoodReportsPanel'
import FeedbackModal from './FeedbackModal'
import Avatar from './Avatar'
import { getToken } from '@/lib/clientAuth'
import { clearAllCache } from '@/lib/clientCache'

const appName = process.env.NEXT_PUBLIC_APP_NAME || "BECOME";

export default function TopNav() {
  const [isOpen, setIsOpen] = useState(false)
  const [userName, setUserName] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [profileIcon, setProfileIcon] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  // Unread food-report outcomes. A report that came back "no change" used to end
  // silently on our side; the member is the only one holding the packet, so they
  // need to know it landed and that they can push back with better photos.
  const [unread, setUnread] = useState(0)
  const [reportsOpen, setReportsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        setUserName(payload.email?.split('@')[0] || 'User')
        setIsAdmin(payload.role === 'admin')
      } catch {
        setUserName('User')
      }
    }
    // Pull the equipped profile icon for the avatar.
    ;(async () => {
      try {
        const res = await fetch('/api/profile', { headers: { Authorization: `Bearer ${getToken() ?? ''}` } })
        if (res.ok) {
          const data = await res.json()
          setProfileIcon(data.profileIcon ?? null)
          setAvatarUrl(data.avatarUrl ?? null)
        }
      } catch {
        /* fall back to default preset */
      }
    })()
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/nutrition/flags/mine', {
          headers: { Authorization: `Bearer ${getToken() ?? ''}` },
        })
        if (!res.ok || cancelled) return
        const data = await res.json()
        setUnread(data.unreadCount ?? 0)
      } catch {
        // A badge is not worth an error state.
      }
    }
    load()
    const clear = () => setUnread(0)
    window.addEventListener('become:reports-read', clear)
    // Reviews finish out of band, so poll gently rather than only on mount.
    const t = setInterval(load, 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(t)
      window.removeEventListener('become:reports-read', clear)
    }
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    localStorage.removeItem('token')
    // Clear cached dashboard data so the next user on this device can't see it.
    clearAllCache()
    router.push('/login')
  }

  return (
    <>
      <header
        className="relative z-10 shrink-0 border-b border-zinc-200 bg-white/80 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/80"
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between px-3 py-2 sm:px-6 sm:py-2.5">
          <h1 className="text-base font-bold text-zinc-900 dark:text-white sm:text-lg">{appName}</h1>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="relative flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-transparent transition-all hover:ring-zinc-200 dark:hover:ring-zinc-700"
              aria-label={unread > 0 ? `User menu, ${unread} unread report update${unread === 1 ? '' : 's'}` : 'User menu'}
            >
              <Avatar icon={profileIcon} imageUrl={avatarUrl} size={32} />
              {unread > 0 && (
                <span
                  data-testid="reports-badge"
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-zinc-900"
                >
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>

            <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 mt-2 w-48 origin-top-right rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
              >
                {userName && (
                  <div className="border-b border-zinc-100 px-4 py-2 dark:border-zinc-700">
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">{userName}</p>
                  </div>
                )}
                {isAdmin && (
                  <Link
                    href="/dashboard/admin"
                    onClick={() => setIsOpen(false)}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-violet-600 transition-colors hover:bg-zinc-50 dark:text-violet-400 dark:hover:bg-zinc-700"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Admin Panel
                  </Link>
                )}
                <Link
                  href="/dashboard/profile"
                  onClick={() => setIsOpen(false)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  <UserRound className="h-4 w-4" />
                  Profile
                </Link>
                <Link
                  href="/dashboard/settings"
                  onClick={() => setIsOpen(false)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
                <button
                  onClick={() => { setIsOpen(false); setReportsOpen(true) }}
                  data-testid="open-food-reports"
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  <Bell className="h-4 w-4" />
                  Food reports
                  {unread > 0 && (
                    <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{unread}</span>
                  )}
                </button>
                <button
                  onClick={() => {
                    setIsOpen(false)
                    setFeedbackOpen(true)
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  <MessageSquareText className="h-4 w-4" />
                  Send Feedback
                </button>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 transition-colors hover:bg-zinc-50 dark:text-red-400 dark:hover:bg-zinc-700"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <FoodReportsPanel open={reportsOpen} onClose={() => setReportsOpen(false)} />
      <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  )
}
