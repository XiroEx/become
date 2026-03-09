"use client"
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, Brain, Home, UtensilsCrossed, MessageCircle } from 'lucide-react'

export default function BottomNav() {
  const pathname = usePathname()
  const [unreadCount, setUnreadCount] = useState(0)

  const isActive = (path: string) => pathname?.startsWith(path)

  const fetchUnread = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      if (!token) return
      const res = await fetch('/api/chat/unread', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setUnreadCount(data.unreadCount || 0)
      }
    } catch {
      // Silently fail
    }
  }, [])

  useEffect(() => {
    fetchUnread()
    const interval = setInterval(fetchUnread, 10000)
    return () => clearInterval(interval)
  }, [fetchUnread])

  // Clear badge when on chat page
  useEffect(() => {
    if (pathname?.startsWith('/dashboard/chat')) {
      setUnreadCount(0)
    }
  }, [pathname])

  return (
    <nav
      className="shrink-0 border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      <ul className="mx-auto flex max-w-2xl items-center justify-around px-2 pt-1.5 pb-0 sm:px-4 sm:pt-2 sm:pb-0">
        <li className="flex-1">
          <Link
            href="/dashboard/programming"
            className={`flex flex-col items-center gap-0.5 pt-1 pb-0.5 text-[10px] font-medium transition-colors sm:text-xs ${
              isActive('/dashboard/programming')
                ? 'text-black dark:text-white'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <ClipboardList className="h-5 w-5" />
            Programs
          </Link>
        </li>
        <li className="flex-1">
          <Link
            href="/dashboard/mind"
            className={`flex flex-col items-center gap-0.5 pt-1 pb-0.5 text-[10px] font-medium transition-colors sm:text-xs ${
              isActive('/dashboard/mind')
                ? 'text-black dark:text-white'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <Brain className="h-5 w-5" />
            Mind
          </Link>
        </li>
        <li className="flex-1">
          <Link
            href="/dashboard"
            className={`flex flex-col items-center gap-0.5 pt-1 pb-0.5 text-[10px] font-medium transition-colors sm:text-xs ${
              pathname === '/dashboard'
                ? 'text-black dark:text-white'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <Home className="h-5 w-5" />
            Home
          </Link>
        </li>
        <li className="flex-1">
          <Link
            href="/dashboard/nutrition"
            className={`flex flex-col items-center gap-0.5 pt-1 pb-0.5 text-[10px] font-medium transition-colors sm:text-xs ${
              isActive('/dashboard/nutrition')
                ? 'text-black dark:text-white'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <UtensilsCrossed className="h-5 w-5" />
            Nutrition
          </Link>
        </li>
        <li className="flex-1">
          <Link
            href="/dashboard/chat"
            className={`relative flex flex-col items-center gap-0.5 pt-1 pb-0.5 text-[10px] font-medium transition-colors sm:text-xs ${
              isActive('/dashboard/chat')
                ? 'text-black dark:text-white'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <div className="relative">
              <MessageCircle className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-green-500 px-1 text-[10px] font-bold leading-none text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            Chat
          </Link>
        </li>
      </ul>
    </nav>
  )
}
