"use client"

// Floating "liquid glass" bottom nav — an Instagram-style detached pill:
// not edge-attached, frosted/translucent capsule floating above the safe area,
// active tab highlighted with its own inner pill. Reacts to scrolling: while
// the app's scroll container is moving the pill condenses (scales down);
// when scrolling stops it grows back.
//
// The dashboard shell scrolls inside <main id="app-scroll"> (not the window),
// so the scroll listener attaches there. z-40 keeps it under every overlay
// (sheets z-[200], mind session z-[100]) but above page content.

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, Brain, Home, UtensilsCrossed, UsersRound } from 'lucide-react'

export default function BottomNav() {
  const pathname = usePathname()
  const [unreadCount, setUnreadCount] = useState(0)
  const [condensed, setCondensed] = useState(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isActive = (path: string) => pathname?.startsWith(path)
  const communityActive =
    pathname?.startsWith('/dashboard/community') ||
    pathname?.startsWith('/dashboard/chat') ||
    pathname?.startsWith('/dashboard/groups') ||
    pathname?.startsWith('/dashboard/events')

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
    const initial = setTimeout(fetchUnread, 0)
    const interval = setInterval(fetchUnread, 10000)
    return () => {
      clearTimeout(initial)
      clearInterval(interval)
    }
  }, [fetchUnread])

  // Condense while the app scroll container is actively scrolling; expand
  // ~200ms after the last scroll event. Re-resolved per route so the listener
  // survives layout remounts.
  useEffect(() => {
    const el = document.getElementById('app-scroll')
    if (!el) return
    const onScroll = () => {
      setCondensed(true)
      if (idleTimer.current) clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => setCondensed(false), 200)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
  }, [pathname])

  const displayedUnreadCount = communityActive ? 0 : unreadCount

  const tabs: Array<{
    href: string
    label: string
    active: boolean
    Icon: typeof Home
    badge?: number
  }> = [
    { href: '/dashboard/workout', label: 'Workout', active: !!isActive('/dashboard/workout'), Icon: ClipboardList },
    { href: '/dashboard/mind', label: 'Mind', active: !!isActive('/dashboard/mind'), Icon: Brain },
    { href: '/dashboard', label: 'Home', active: pathname === '/dashboard', Icon: Home },
    { href: '/dashboard/nutrition', label: 'Nutrition', active: !!isActive('/dashboard/nutrition'), Icon: UtensilsCrossed },
    { href: '/dashboard/community', label: 'Community', active: !!communityActive, Icon: UsersRound, badge: displayedUnreadCount },
  ]

  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)' }}
    >
      <ul
        className={`pointer-events-auto flex items-center gap-1 rounded-full border border-zinc-200/70 bg-white/80 px-2 py-1.5 shadow-lg shadow-black/10 backdrop-blur-xl transition-transform duration-300 ease-out dark:border-white/10 dark:bg-zinc-900/80 dark:shadow-black/40 ${
          condensed ? 'scale-[0.88]' : 'scale-100'
        }`}
        style={{ transformOrigin: 'center bottom' }}
      >
        {tabs.map(({ href, label, active, Icon, badge }) => (
          <li key={href}>
            <Link
              href={href}
              aria-label={label}
              title={label}
              className={`relative flex h-11 w-12 items-center justify-center rounded-full transition-colors sm:w-14 ${
                active
                  ? 'bg-zinc-900/10 text-black dark:bg-white/15 dark:text-white'
                  : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 2} />
              {(badge ?? 0) > 0 && (
                <span className="absolute right-1 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-green-500 px-1 text-[10px] font-bold leading-none text-white">
                  {badge! > 99 ? '99+' : badge}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
