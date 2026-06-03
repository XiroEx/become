"use client"
import React, { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogOut, MessageSquareText, Settings, ShieldCheck } from 'lucide-react'
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
              className="flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-transparent transition-all hover:ring-zinc-200 dark:hover:ring-zinc-700"
              aria-label="User menu"
            >
              <Avatar icon={profileIcon} imageUrl={avatarUrl} size={32} />
            </button>

            {isOpen && (
              <div className="absolute right-0 mt-2 w-48 origin-top-right rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
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
                  <Settings className="h-4 w-4" />
                  Profile &amp; Settings
                </Link>
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
              </div>
            )}
          </div>
        </div>
      </header>

      <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  )
}
