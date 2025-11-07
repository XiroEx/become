"use client"
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

export default function BottomNav() {
  const [loggedIn, setLoggedIn] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const t = localStorage.getItem('token')
    setLoggedIn(!!t)
  }, [])

  function handleLogout() {
    localStorage.removeItem('token')
    setLoggedIn(false)
    router.push('/login')
  }

  if (!loggedIn) return null

  const isActive = (path: string) => pathname?.startsWith(path)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 bg-white backdrop-blur-xl supports-backdrop-filter:bg-white/80">
      <ul className="mx-auto flex max-w-2xl items-center justify-around px-4 py-3">
        <li className="flex-1">
          <Link 
            href="/dashboard/programming" 
            className={`flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors ${
              isActive('/dashboard/programming') 
                ? 'text-black' 
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Programs
          </Link>
        </li>
        <li className="flex-1">
          <Link 
            href="/dashboard/nutrition" 
            className={`flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors ${
              isActive('/dashboard/nutrition') 
                ? 'text-black' 
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Nutrition
          </Link>
        </li>
        <li className="flex-1">
          <Link 
            href="/dashboard/chat" 
            className={`flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors ${
              isActive('/dashboard/chat') 
                ? 'text-black' 
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Chat
          </Link>
        </li>
        <li className="flex-1">
          <Link 
            href="/dashboard/progress" 
            className={`flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors ${
              isActive('/dashboard/progress') 
                ? 'text-black' 
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Progress
          </Link>
        </li>
        <li className="flex-1">
          <button 
            onClick={handleLogout} 
            className="flex w-full cursor-pointer flex-col items-center gap-1 py-2 text-xs font-medium text-red-600 transition-colors hover:text-red-700"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </li>
      </ul>
    </nav>
  )
}
