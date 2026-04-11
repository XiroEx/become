'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import MindHub, { type SectionId } from '@/components/mind/MindHub'
import StateShiftTab from '@/components/mind/StateShiftTab'
import SelfImageTab from '@/components/mind/SelfImageTab'
import MissionTab from '@/components/mind/MissionTab'
import DisciplineTab from '@/components/mind/DisciplineTab'
import AntiSabotageTab from '@/components/mind/AntiSabotageTab'
import SocialTab from '@/components/mind/SocialTab'

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const SECTION_LABELS: Record<SectionId, string> = {
  'home': 'Mindset',
  'state-shift': 'State Shift',
  'self-image': 'Self-Image',
  'mission': 'Mission',
  'discipline': 'Discipline',
  'anti-sabotage': 'Anti-Sabotage',
  'social': 'Social',
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MindPage() {
  const [section, setSection] = useState<SectionId>('home')
  const [streak, setStreak] = useState(0)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    fetch('/api/streak', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.streakDays != null) setStreak(data.streakDays) })
      .catch(() => {})
  }, [])

  const isHome = section === 'home'

  return (
    <PageTransition className="flex flex-col">
      {/* Header — collapses when inside a section */}
      <header className="mb-5">
        {isHome ? (
          <>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">Mindset</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              The mind is the muscle. Train it like one.
            </p>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSection('home')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white">
              {SECTION_LABELS[section]}
            </h1>
          </div>
        )}
      </header>

      {/* Content */}
      <div className="min-h-0 flex-1">
        {section === 'home' && (
          <MindHub onNavigate={setSection} streak={streak} />
        )}
        {section === 'state-shift' && <StateShiftTab />}
        {section === 'self-image' && <SelfImageTab streak={streak} />}
        {section === 'mission' && <MissionTab />}
        {section === 'discipline' && <DisciplineTab />}
        {section === 'anti-sabotage' && <AntiSabotageTab />}
        {section === 'social' && <SocialTab />}
      </div>
    </PageTransition>
  )
}
