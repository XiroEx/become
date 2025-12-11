"use client"
import React, { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { User, LogOut } from 'lucide-react'

const appName = process.env.NEXT_PUBLIC_APP_NAME || "Jon Don Fit";

export default function TopNav() {
  const [isOpen, setIsOpen] = useState(false)
  const [userName, setUserName] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    // Decode the JWT to get user info
    const token = localStorage.getItem('token')
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        setUserName(payload.email?.split('@')[0] || 'User')
      } catch {
        setUserName('User')
      }
    }
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

  function handleLogout() {
    localStorage.removeItem('token')
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/80">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <h1 className="text-lg font-bold text-zinc-900 dark:text-white">{appName}</h1>
        
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            aria-label="User menu"
          >
            <User className="h-5 w-5" />
          </button>

          {isOpen && (
            <div className="absolute right-0 mt-2 w-48 origin-top-right rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
              {userName && (
                <div className="border-b border-zinc-100 px-4 py-2 dark:border-zinc-700">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">{userName}</p>
                </div>
              )}
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
  )
}
