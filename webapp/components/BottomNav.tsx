"use client"
import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, Brain, Home, UtensilsCrossed, MessageCircle } from 'lucide-react'

export default function BottomNav() {
  const pathname = usePathname()

  const isActive = (path: string) => pathname?.startsWith(path)

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 bg-white backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/80">
      <ul className="mx-auto flex max-w-2xl items-center justify-around px-4 py-3">
        <li className="flex-1">
          <Link 
            href="/dashboard/programming" 
            className={`flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors ${
              isActive('/dashboard/programming') 
                ? 'text-black dark:text-white' 
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <ClipboardList className="h-6 w-6" />
            Programs
          </Link>
        </li>
        <li className="flex-1">
          <Link 
            href="/dashboard/mind" 
            className={`flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors ${
              isActive('/dashboard/mind') 
                ? 'text-black dark:text-white' 
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <Brain className="h-6 w-6" />
            Mind
          </Link>
        </li>
        <li className="flex-1">
          <Link 
            href="/dashboard" 
            className={`flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors ${
              pathname === '/dashboard' 
                ? 'text-black dark:text-white' 
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <Home className="h-6 w-6" />
            Home
          </Link>
        </li>
        <li className="flex-1">
          <Link 
            href="/dashboard/nutrition" 
            className={`flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors ${
              isActive('/dashboard/nutrition') 
                ? 'text-black dark:text-white' 
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <UtensilsCrossed className="h-6 w-6" />
            Nutrition
          </Link>
        </li>
        <li className="flex-1">
          <Link 
            href="/dashboard/chat" 
            className={`flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors ${
              isActive('/dashboard/chat') 
                ? 'text-black dark:text-white' 
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <MessageCircle className="h-6 w-6" />
            Chat
          </Link>
        </li>
      </ul>
    </nav>
  )
}
