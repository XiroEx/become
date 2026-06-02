'use client'

// The Arsenal — the user's unlocked Mind tools (the repeatable systems). This
// is the "More" destination from the daily session home: the daily ritual is
// primary; this library is one tap away. Unlocked systems link to the existing
// section pages; still-locked systems show what's coming.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Wind, Sparkles, Eye, BookOpen, Sword, Shield, Users, Lock, ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import { Card } from '@/components/ui'
import { BackButton } from '@/components/ui/BackButton'
import { SYSTEM_INFO, getUnlockedSystems } from '@/lib/mindXP'

const ICONS: Record<string, LucideIcon> = {
  Wind, Sparkles, Eye, BookOpen, Sword, Shield, Users,
}

export default function ArsenalClient() {
  const [chapter, setChapter] = useState(1)
  const [unlocked, setUnlocked] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const token = localStorage.getItem('token')
        if (!token) {
          setLoading(false)
          return
        }
        const res = await fetch('/api/mind/progress', { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) {
          const data = (await res.json()) as { chapter?: number; unlockedSystems?: string[] }
          const ch = data.chapter ?? 1
          setChapter(ch)
          setUnlocked(data.unlockedSystems ?? getUnlockedSystems(ch))
        }
      } catch (error) {
        console.error('Error loading arsenal:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const allIds = Object.keys(SYSTEM_INFO)
  const lockedIds = allIds.filter((id) => !unlocked.includes(id))

  return (
    <PageTransition className="pb-6">
      <header className="mb-2 flex items-center gap-3">
        <BackButton fallbackHref="/dashboard/mind" />
        <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white sm:text-3xl">Your Arsenal</h1>
      </header>
      <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400">
        Everything you&apos;ve unlocked. Use any of it, anytime.
      </p>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
          ))}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {unlocked.map((id) => {
              const info = SYSTEM_INFO[id]
              if (!info) return null
              const Icon = ICONS[info.iconName] ?? Sparkles
              return (
                <Link key={id} href={`/dashboard/mind/${id}`} className="block">
                  <Card className="flex items-center gap-3 transition-colors duration-200 hover:border-zinc-300 dark:hover:border-zinc-700">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${info.iconBg}`}>
                      <Icon className={`h-5 w-5 ${info.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">{info.label}</h3>
                      <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{info.hook}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                  </Card>
                </Link>
              )
            })}
          </div>

          {lockedIds.length > 0 && (
            <>
              <p className="mb-3 mt-7 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Locked
              </p>
              <div className="space-y-3">
                {lockedIds.map((id) => {
                  const info = SYSTEM_INFO[id]
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 opacity-70 dark:border-zinc-800 dark:bg-zinc-900/40"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-200 dark:bg-zinc-800">
                        <Lock className="h-5 w-5 text-zinc-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">{info.label}</h3>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">Unlocks in Chapter {info.chapter}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </PageTransition>
  )
}
