'use client'

// Gate around each arsenal tool's dashboard:
//  1. LOCKED (chapter hasn't unlocked it) → bounce to the Mind hub.
//  2. UNLOCKED but NOT INTRODUCED → run the tool's one-time onboarding intro
//     (a real guided flow: the psychology, how it works, one micro-rep). On
//     completion: mark introduced + save the micro-rep to the journal (so the
//     AI builds on it), then reveal the dashboard.
//  3. INTRODUCED → straight to the dashboard.

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import GuidedFlow from '@/components/mind/system/GuidedFlow'
import { INTRO_FLOWS } from '@/lib/mind/introFlows'
import { getUnlockedSystems, SYSTEM_INFO } from '@/lib/mindXP'

// Per-tool accent (hex, matches each dashboard's signature color).
const ACCENTS: Record<string, string> = {
  'state-shift': '#06b6d4',
  'self-image': '#8b5cf6',
  'mission': '#3b82f6',
  'vision': '#10b981',
  'social': '#ec4899',
  'discipline': '#ef4444',
  'anti-sabotage': '#f97316',
}

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}`,
  }
}

type GateState = 'loading' | 'intro' | 'ready'

export default function ToolIntroGate({ system, children }: { system: string; children: ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<GateState>('loading')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/mind/progress', { headers: authHeaders() })
        if (!res.ok) { if (!cancelled) setState('ready'); return } // fail open
        const p = await res.json()
        if (cancelled) return
        const unlocked: string[] = p.unlockedSystems ?? getUnlockedSystems(p.chapter ?? 1)
        if (!unlocked.includes(system)) { router.replace('/dashboard/mind'); return }
        const introduced: string[] = p.introducedSystems ?? []
        setState(introduced.includes(system) && INTRO_FLOWS[system] ? 'ready' : INTRO_FLOWS[system] ? 'intro' : 'ready')
      } catch {
        if (!cancelled) setState('ready') // never brick the tool on a flaky fetch
      }
    })()
    return () => { cancelled = true }
  }, [system, router])

  if (state === 'loading') {
    return (
      <div className="space-y-3">
        <div className="h-24 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
        <div className="h-16 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
        <div className="h-16 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
      </div>
    )
  }

  if (state === 'intro') {
    const flow = INTRO_FLOWS[system]
    return (
      <GuidedFlow
        title={flow.title}
        steps={flow.steps}
        accent={ACCENTS[system] ?? '#8b5cf6'}
        doneText="Enter"
        onComplete={(answers) => {
          // Mark introduced + save the micro-rep (best-effort; never block entry).
          void fetch('/api/mind/progress/introduce', {
            method: 'POST', headers: authHeaders(), body: JSON.stringify({ system }),
          }).catch(() => {})
          if (answers.length) {
            void fetch('/api/mind/journal', {
              method: 'POST', headers: authHeaders(),
              body: JSON.stringify({
                system, kind: 'intro',
                title: `${SYSTEM_INFO[system]?.label ?? system} unlocked`,
                lines: answers.map((a) => ({ prompt: a.prompt, answer: a.answer })),
              }),
            }).catch(() => {})
          }
          setState('ready')
        }}
        onExit={() => router.replace('/dashboard/mind')}
      />
    )
  }

  return <>{children}</>
}
