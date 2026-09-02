'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import ToolIntroGate from '@/components/mind/ToolIntroGate'
import StateShiftDashboard from '@/components/mind/StateShiftDashboard'
import SelfImageDashboard from '@/components/mind/SelfImageDashboard'
import MissionDashboard from '@/components/mind/MissionDashboard'
import DisciplineDashboard from '@/components/mind/DisciplineDashboard'
import AntiSabotageDashboard from '@/components/mind/AntiSabotageDashboard'
import SocialDashboard from '@/components/mind/SocialDashboard'
import VisionDashboard from '@/components/mind/VisionDashboard'
import TierGate from '@/components/TierGate'

const SECTION_LABELS: Record<string, string> = {
  'state-shift': 'State Shift',
  'self-image': 'Self-Image',
  'mission': 'Mission',
  'discipline': 'Discipline',
  'anti-sabotage': 'Anti-Sabotage',
  'social': 'Social',
  'vision': 'Vision',
}

const VALID_SECTIONS = new Set(Object.keys(SECTION_LABELS))

export default function MindSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params)
  const router = useRouter()

  if (!VALID_SECTIONS.has(section)) {
    router.replace('/dashboard/mind')
    return null
  }

  const label = SECTION_LABELS[section]

  return (
    <PageTransition className="flex flex-col">
      {/* data-tour anchors the onboarding tour (lib/tutorials/sections/mind.ts) */}
      <header className="mb-5" data-tour="mind-section-header">
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

      <div className="min-h-0 flex-1" data-tour="mind-section-body">
        {/* First open of an unlocked tool runs its one-time onboarding intro. */}
        <ToolIntroGate system={section}>
          {section === 'state-shift'   && <StateShiftDashboard />}
          {section === 'self-image'    && <SelfImageDashboard />}
          {section === 'mission'       && <MissionDashboard />}
          {section === 'discipline'    && <DisciplineDashboard />}
          {section === 'anti-sabotage' && <AntiSabotageDashboard />}
          {section === 'social'        && <SocialDashboard />}
          {/* Vision is the one tool that is a plan feature rather than a
              chapter unlock. One wrap covers the whole surface — every action
              inside it would otherwise 403. */}
          {section === 'vision'        && (
            <TierGate
              feature="vision"
              description="Paint the future you across five domains, then check your alignment daily."
            >
              <VisionDashboard />
            </TierGate>
          )}
        </ToolIntroGate>
      </div>
    </PageTransition>
  )
}
