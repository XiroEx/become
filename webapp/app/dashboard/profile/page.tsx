'use client'

// The profile one-pager — your identity card. Avatar + icon customizer, name,
// fitness focus, member-since, and headline progress. Account/fitness/notification
// SETTINGS now live at /dashboard/settings. Earned cosmetics (frames, titles,
// badges) and the public shareable card layer in via redReward in a later phase.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import PageTransition from '@/components/PageTransition'
import { BackButton } from '@/components/ui/BackButton'
import Avatar from '@/components/Avatar'
import IconPicker from '@/components/profile/IconPicker'
import PlanRow from '@/components/profile/PlanRow'
import { getToken } from '@/lib/clientAuth'
import { Settings, ChevronRight, Sparkles, Loader2 } from 'lucide-react'
import type { FitnessGoal } from '@/models/User'

const GOAL_LABELS: Record<FitnessGoal, string> = {
  lose_weight: 'Losing weight',
  gain_muscle: 'Gaining muscle',
  maintain: 'Maintaining',
  improve_performance: 'Improving performance',
  general_health: 'General health',
}

interface ProfileData {
  name: string
  email: string
  profileIcon: string | null
  avatarUrl: string | null
  createdAt: string | null
  profile?: { fitnessGoal?: FitnessGoal }
}

interface MindData {
  chapter: number
  xp: number
  xpProgress: { needed: number; current: number; pct: number } | null
  currentChapter?: { name?: string; theme?: string }
}

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${getToken() ?? ''}` }
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [mind, setMind] = useState<MindData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [pRes, mRes] = await Promise.all([
        fetch('/api/profile', { headers: authHeaders() }),
        fetch('/api/mind/progress', { headers: authHeaders() }),
      ])
      if (pRes.ok) setProfile(await pRes.json())
      if (mRes.ok) setMind(await mRes.json())
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <PageTransition className="flex h-full items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </PageTransition>
    )
  }

  const goal = profile?.profile?.fitnessGoal
  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null
  const chapterName = mind?.currentChapter?.name
  const pct = mind?.xpProgress?.pct ?? null

  return (
    <PageTransition className="space-y-5 pb-10">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">Profile</h1>
        </div>
        <Link
          href="/dashboard/settings"
          aria-label="Settings"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          <Settings className="h-4 w-4" />
        </Link>
      </header>

      {/* Identity hero */}
      <section data-tour="profile-identity" className="flex flex-col items-center rounded-2xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <Avatar icon={profile?.profileIcon} imageUrl={profile?.avatarUrl} size={96} />
        <h2 className="mt-4 text-xl font-bold text-zinc-900 dark:text-white">{profile?.name}</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{profile?.email}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {goal && (
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {GOAL_LABELS[goal]}
            </span>
          )}
          {memberSince && (
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              Since {memberSince}
            </span>
          )}
        </div>
      </section>

      {/* Mindset progress */}
      {mind && (
        <section data-tour="profile-mind" className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-500" />
              <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                Chapter {mind.chapter}{chapterName ? ` · ${chapterName}` : ''}
              </span>
            </div>
            <span className="text-sm font-bold text-violet-600 dark:text-violet-300">{mind.xp} XP</span>
          </div>
          {pct !== null && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-green-400 transition-all"
                style={{ width: `${Math.round(pct * 100)}%` }}
              />
            </div>
          )}
          {mind.currentChapter?.theme && (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{mind.currentChapter.theme}</p>
          )}
        </section>
      )}

      {/* Icon customizer */}
      <IconPicker />

      {/* Plan — renders nothing until enforcement is on. */}
      <PlanRow />

      {/* Settings link */}
      <Link
        href="/dashboard/settings"
        className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-5 py-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
      >
        <span className="flex items-center gap-3">
          <Settings className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
          <span className="text-sm font-medium text-zinc-900 dark:text-white">Account &amp; preferences</span>
        </span>
        <ChevronRight className="h-4 w-4 text-zinc-400" />
      </Link>
    </PageTransition>
  )
}
