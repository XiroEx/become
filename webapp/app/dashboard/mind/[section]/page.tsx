'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import StateShiftTab from '@/components/mind/StateShiftTab'
import SelfImageTab from '@/components/mind/SelfImageTab'
import MissionTab from '@/components/mind/MissionTab'
import DisciplineTab from '@/components/mind/DisciplineTab'
import AntiSabotageTab from '@/components/mind/AntiSabotageTab'
import SocialTab from '@/components/mind/SocialTab'

const SECTION_LABELS: Record<string, string> = {
  'state-shift': 'State Shift',
  'self-image': 'Self-Image',
  'mission': 'Mission',
  'discipline': 'Discipline',
  'anti-sabotage': 'Anti-Sabotage',
  'social': 'Social',
}

const VALID_SECTIONS = new Set(Object.keys(SECTION_LABELS))

export default function MindSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params)
  const router = useRouter()
  const [streak, setStreak] = useState(0)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    fetch('/api/streak', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.streakDays != null) setStreak(data.streakDays) })
      .catch(() => {})
  }, [])

  if (!VALID_SECTIONS.has(section)) {
    router.replace('/dashboard/mind')
    return null
  }

  const label = SECTION_LABELS[section]

  return (
    <PageTransition className="flex flex-col">
      <header className="mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard/mind')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white">{label}</h1>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {section === 'state-shift'   && <StateShiftTab />}
        {section === 'self-image'    && <SelfImageTab streak={streak} />}
        {section === 'mission'       && <MissionTab />}
        {section === 'discipline'    && <DisciplineTab />}
        {section === 'anti-sabotage' && <AntiSabotageTab />}
        {section === 'social'        && <SocialTab />}
      </div>
    </PageTransition>
  )
}
