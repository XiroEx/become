'use client'

// Focused Sessions — the "More" destination. Each unlocked system launches a
// SHORT, DYNAMIC themed session (varies every time) in the immersive player.
// The daily ritual stays primary; this is the "need a state shift? here's a
// session for that" library.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Wind, Sparkles, Eye, BookOpen, Sword, Shield, Users, Lock, ChevronRight, Play,
  type LucideIcon,
} from 'lucide-react'
import PageTransition from '@/components/PageTransition'
import { Card } from '@/components/ui'
import { BackButton } from '@/components/ui/BackButton'
import { SYSTEM_INFO, getUnlockedSystems } from '@/lib/mindXP'
import { composeThemedSession, systemHasScene } from '@/lib/mind/composeSession'
import type { MindSessionPlan, SessionContext } from '@/lib/mind/moves'
import SessionPlayer from '@/components/mind/session/SessionPlayer'
import { useEntitlements } from '@/hooks/useEntitlements'
import UpgradeSheet from '@/components/UpgradeSheet'
import { syntheticGate, type GatePayload } from '@/lib/entitlementsClient'

const ICONS: Record<string, LucideIcon> = { Wind, Sparkles, Eye, BookOpen, Sword, Shield, Users }

function dayOfYear(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000)
}

export default function ArsenalClient() {
  const [chapter, setChapter] = useState(1)
  const [unlocked, setUnlocked] = useState<string[]>([])
  const [identityStatement, setIdentityStatement] = useState<string | null>(null)
  const [missionAction, setMissionAction] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [gate, setGate] = useState<GatePayload | null>(null)
  const { data: entitlements, feature } = useEntitlements()
  const visionPlusLocked =
    entitlements?.enforced === true && feature('vision')?.allowed === false
  const [activePlan, setActivePlan] = useState<MindSessionPlan | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const token = localStorage.getItem('token')
        if (!token) {
          setLoading(false)
          return
        }
        const h = { Authorization: `Bearer ${token}` }
        const [progressRes, missionRes] = await Promise.all([
          fetch('/api/mind/progress', { headers: h }),
          fetch('/api/mind/mission', { headers: h }),
        ])
        if (progressRes.ok) {
          const data = await progressRes.json()
          const ch = data.chapter ?? 1
          setChapter(ch)
          setUnlocked(data.unlockedSystems ?? getUnlockedSystems(ch))
          setIdentityStatement(data.vision?.identityStatement ?? null)
        }
        if (missionRes.ok) {
          const m = await missionRes.json()
          setMissionAction(m?.mission?.dailyAction ?? null)
        }
      } catch (error) {
        console.error('Error loading arsenal:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const ctx = useMemo<SessionContext>(
    () => ({
      chapter,
      unlockedSystems: unlocked,
      recentState: null,
      missionAction,
      identityStatement,
      dayOfYear: dayOfYear(),
    }),
    [chapter, unlocked, missionAction, identityStatement],
  )

  const launch = (systemId: string) => {
    const plan = composeThemedSession(systemId, ctx)
    if (plan) setActivePlan(plan)
  }

  if (activePlan) {
    return <SessionPlayer plan={activePlan} onExit={() => setActivePlan(null)} />
  }

  const allIds = Object.keys(SYSTEM_INFO)
  const lockedIds = allIds.filter((id) => !unlocked.includes(id))

  return (
    <PageTransition className="pb-6">
      <UpgradeSheet open={!!gate} gate={gate} onClose={() => setGate(null)} />
      <header className="mb-2 flex items-center gap-3">
        <BackButton fallbackHref="/dashboard/mind" />
        <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white sm:text-3xl">Your Arsenal</h1>
      </header>
      <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400">
        Need a reset? Vision work? Pick a focus — each one&apos;s a short, fresh session.
      </p>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
          ))}
        </div>
      ) : (
        <>
          {/* data-tour anchors the onboarding tour (lib/tutorials/sections/mind.ts) */}
          <div className="space-y-3" data-tour="arsenal-systems">
            {unlocked.map((id) => {
              const info = SYSTEM_INFO[id]
              if (!info) return null
              const Icon = ICONS[info.iconName] ?? Sparkles
              const playable = systemHasScene(id)

              const inner = (
                <Card className="flex items-center gap-3 transition-colors duration-200 hover:border-zinc-300 dark:hover:border-zinc-700">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${info.iconBg}`}>
                    <Icon className={`h-5 w-5 ${info.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">{info.label}</h3>
                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{info.hook}</p>
                  </div>
                  {playable && (
                    <button
                      type="button"
                      aria-label="Start focused session"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); launch(id) }}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white transition-transform hover:scale-105 active:scale-95 dark:bg-white dark:text-black"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </button>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                </Card>
              )

              // The CARD opens the system's full dashboard (meditations,
              // journaling, habits, goals — the deep tools). The play button
              // alone launches the quick focused session.
              return (
                <Link key={id} href={`/dashboard/mind/${id}`} className="block">
                  {inner}
                </Link>
              )
            })}
          </div>

          {lockedIds.length > 0 && (
            <>
              <p className="mb-3 mt-7 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Locked
              </p>
              <div className="space-y-3" data-tour="arsenal-locked">
                {lockedIds.map((id) => {
                  const info = SYSTEM_INFO[id]
                  // Vision is locked by PLAN, not by chapter — see the same
                  // note in components/mind/TrainingGrounds.tsx.
                  const planLocked = id === 'vision' && visionPlusLocked
                  const Wrapper = planLocked ? 'button' : 'div'
                  return (
                    <Wrapper
                      key={id}
                      {...(planLocked ? { type: 'button' as const, onClick: () => setGate(syntheticGate('vision')) } : {})}
                      className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-left opacity-70 dark:border-zinc-800 dark:bg-zinc-900/40"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-200 dark:bg-zinc-800">
                        <Lock className="h-5 w-5 text-zinc-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">{info.label}</h3>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">
                          {planLocked ? 'Plus' : `Unlocks in Chapter ${info.chapter}`}
                        </p>
                      </div>
                    </Wrapper>
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
