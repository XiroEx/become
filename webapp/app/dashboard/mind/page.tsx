'use client'

import { useState, useEffect } from 'react'
import PageTransition from '@/components/PageTransition'
import HomeTab from '@/components/mind/HomeTab'
import StateShiftTab from '@/components/mind/StateShiftTab'
import SelfImageTab from '@/components/mind/SelfImageTab'
import MissionTab from '@/components/mind/MissionTab'
import DisciplineTab from '@/components/mind/DisciplineTab'
import AntiSabotageTab from '@/components/mind/AntiSabotageTab'
import SocialTab from '@/components/mind/SocialTab'
import {
  Zap,
  Wind,
  Eye,
  BookOpen,
  Sword,
  Shield,
  Users,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type TabId = 'home' | 'state-shift' | 'self-image' | 'mission' | 'discipline' | 'anti-sabotage' | 'social'

interface Tab {
  id: TabId
  label: string
  shortLabel: string
  Icon: React.ElementType
}

const TABS: Tab[] = [
  { id: 'home',          label: 'Home',         shortLabel: 'Home',    Icon: Zap },
  { id: 'state-shift',   label: 'State Shift',  shortLabel: 'State',   Icon: Wind },
  { id: 'self-image',    label: 'Self-Image',   shortLabel: 'Self',    Icon: Eye },
  { id: 'mission',       label: 'Mission',      shortLabel: 'Mission', Icon: BookOpen },
  { id: 'discipline',    label: 'Discipline',   shortLabel: 'Grind',   Icon: Sword },
  { id: 'anti-sabotage', label: 'Anti-Sabotage',shortLabel: 'Shield',  Icon: Shield },
  { id: 'social',        label: 'Social',       shortLabel: 'Social',  Icon: Users },
]

// ---------------------------------------------------------------------------
// MAIN PAGE
// ---------------------------------------------------------------------------

export default function MindPage() {
  const [activeTab, setActiveTab] = useState<TabId>('home')
  const [streak, setStreak] = useState(0)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    fetch('/api/streak', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.streakDays != null) setStreak(data.streakDays) })
      .catch(() => {})
  }, [])

  return (
    <PageTransition className="flex flex-col">
      {/* Page header */}
      <header className="mb-4 sm:mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">Mindset</h1>
        <p className="text-zinc-500 dark:text-zinc-400">Your mental edge. Build it daily.</p>
      </header>

      {/* Scrollable tab bar */}
      <div className="sticky top-0 z-10 -mx-3 mb-5 px-3 pb-3 pt-1 sm:-mx-6 sm:px-6 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md">
        <div className="flex gap-1 overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/80 p-1 scrollbar-hide">
          {TABS.map((tab) => {
            const { Icon } = tab
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all sm:text-sm ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                <span>{tab.shortLabel}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="min-h-0 flex-1">
        {activeTab === 'home' && (
          <HomeTab onNavigateTab={(tab) => setActiveTab(tab as TabId)} streak={streak} />
        )}
        {activeTab === 'state-shift' && <StateShiftTab />}
        {activeTab === 'self-image' && <SelfImageTab streak={streak} />}
        {activeTab === 'mission' && <MissionTab />}
        {activeTab === 'discipline' && <DisciplineTab />}
        {activeTab === 'anti-sabotage' && <AntiSabotageTab />}
        {activeTab === 'social' && <SocialTab />}
      </div>
    </PageTransition>
  )
}
