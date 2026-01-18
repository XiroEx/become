"use client"
import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, Brain, Home, UtensilsCrossed, MessageCircle } from 'lucide-react'

export default function BottomNav() {
  const pathname = usePathname()

  const isActive = (path: string) => pathname?.startsWith(path)

  return (
    <nav 
      className="shrink-0 border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      <ul className="mx-auto flex max-w-2xl items-center justify-around px-2 py-1.5 sm:px-4 sm:py-2">
        <li className="flex-1">
          <Link 
            href="/dashboard/programming" 
            className={`flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium transition-colors sm:text-xs ${
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
            className={`flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium transition-colors sm:text-xs ${
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
            className={`flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium transition-colors sm:text-xs ${
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
            className={`flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium transition-colors sm:text-xs ${
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
            className={`flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium transition-colors sm:text-xs ${
              isActive('/dashboard/chat') 
                ? 'text-black dark:text-white' 
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <MessageCircle className="h-5 w-5" />
            Chat
          </Link>
        </li>
      </ul>
    </nav>
  )
}
