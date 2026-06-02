'use client'

// The immersive, full-screen Mind session player. Plays a composed chain of
// moves one scene at a time (intro → moves → payoff), like the live-workout
// view. Black cinematic stage, top progress, exit affordance. Scene components
// are dumb and fulfill SceneProps; this orchestrator owns sequencing, the live
// state-check answer (which resolves the breath protocol), and completion (which
// posts to /api/mind/session to award the daily XP once).

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ArrowRight, Sparkles, Check } from 'lucide-react'
import type { MindState } from '@/lib/mindContent'
import {
  BREATH_PROTOCOLS,
  breathForState,
  type MindSessionPlan,
  type BreathProtocol,
} from '@/lib/mind/moves'
import StateCheckScene from './scenes/StateCheckScene'
import BreathScene from './scenes/BreathScene'
import IdentityScene from './scenes/IdentityScene'
import ChallengeScene from './scenes/ChallengeScene'
import WinScene from './scenes/WinScene'
import MissionScene from './scenes/MissionScene'

interface CompleteResult {
  xpAwarded: number
  alreadyComplete: boolean
  readyToLevelUp: boolean
}

export interface SessionPlayerProps {
  plan: MindSessionPlan
  /** Called when the user exits/finishes — the home should refetch + close. */
  onExit: () => void
}

type Stage = 'intro' | 'move' | 'payoff'

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}`,
  }
}

export default function SessionPlayer({ plan, onExit }: SessionPlayerProps) {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('intro')
  const [index, setIndex] = useState(0)
  const [liveState, setLiveState] = useState<MindState | null>(null)
  const [result, setResult] = useState<CompleteResult | null>(null)

  const total = plan.moves.length
  const move = plan.moves[index]

  const complete = useCallback(async () => {
    setStage('payoff')
    try {
      const res = await fetch('/api/mind/session', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          tz: new Date().getTimezoneOffset(),
          moves: plan.moves.map((m) => ({ kind: m.kind })),
        }),
      })
      if (res.ok) {
        const data = (await res.json()) as CompleteResult
        setResult(data)
      }
    } catch {
      /* payoff still shows; XP is best-effort */
    }
  }, [plan.moves])

  const next = useCallback(() => {
    if (index >= total - 1) {
      void complete()
    } else {
      setIndex((i) => i + 1)
    }
  }, [index, total, complete])

  // Resolve the breath protocol from the live state-check answer ('auto').
  const resolvedProtocol = useMemo<BreathProtocol | undefined>(() => {
    if (!move || move.kind !== 'breath') return undefined
    if (move.protocolId && move.protocolId !== 'auto' && BREATH_PROTOCOLS[move.protocolId]) {
      return BREATH_PROTOCOLS[move.protocolId]
    }
    return breathForState(liveState)
  }, [move, liveState])

  const filledSegments = stage === 'payoff' ? total : stage === 'move' ? index : 0

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black text-white"
      style={{ paddingTop: 'env(safe-area-inset-top,0px)', paddingBottom: 'env(safe-area-inset-bottom,0px)' }}
    >
      {/* Top bar: progress segments + exit */}
      <div className="flex items-center gap-3 px-4 pt-3">
        <button
          onClick={onExit}
          aria-label="Exit session"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex flex-1 gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
              <div
                className={`h-full rounded-full bg-gradient-to-r from-violet-400 to-green-400 transition-all duration-500 ${
                  i < filledSegments ? 'w-full' : i === filledSegments && stage === 'move' ? 'w-1/3' : 'w-0'
                }`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Stage */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {stage === 'intro' && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
              className="flex h-full w-full flex-col items-center justify-center px-6 text-center"
            >
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-green-500">
                <Sparkles className="h-7 w-7" />
              </span>
              <h1 className="text-3xl font-extrabold">{plan.intro.title}</h1>
              <p className="mt-3 max-w-xs text-white/60">{plan.intro.subtitle}</p>
              <p className="mt-6 text-xs uppercase tracking-widest text-white/40">
                {plan.moves.length} moves · ~3 min
              </p>
              <button
                onClick={() => setStage('move')}
                className="mt-10 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95"
              >
                Begin
                <ArrowRight className="h-5 w-5" />
              </button>
            </motion.div>
          )}

          {stage === 'move' && move && (
            <motion.div
              key={`move-${index}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.28 }}
              className="absolute inset-0"
            >
              {move.kind === 'state-check' && (
                <StateCheckScene move={move} onState={setLiveState} onDone={next} />
              )}
              {move.kind === 'breath' && (
                <BreathScene move={move} protocol={resolvedProtocol} onDone={next} />
              )}
              {move.kind === 'identity' && <IdentityScene move={move} onDone={next} />}
              {move.kind === 'challenge' && <ChallengeScene move={move} onDone={next} />}
              {move.kind === 'win' && <WinScene move={move} onDone={next} />}
              {move.kind === 'mission' && <MissionScene move={move} onDone={next} />}
            </motion.div>
          )}

          {stage === 'payoff' && (
            <motion.div
              key="payoff"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35 }}
              className="flex h-full w-full flex-col items-center justify-center px-6 text-center"
            >
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
                className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-green-500"
              >
                <Check className="h-10 w-10" strokeWidth={3} />
              </motion.span>
              <h1 className="text-2xl font-extrabold">
                {result && result.alreadyComplete ? 'Done again. Respect.' : 'You showed up.'}
              </h1>
              <p className="mt-2 text-white/60">
                {result && result.alreadyComplete
                  ? 'You already trained your mind today.'
                  : "That's how it's built — one rep at a time."}
              </p>
              {result && result.xpAwarded > 0 && (
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="mt-5 rounded-full bg-white/10 px-4 py-1.5 text-sm font-bold text-green-300"
                >
                  +{result.xpAwarded} XP
                </motion.p>
              )}
              {result?.readyToLevelUp && (
                <p className="mt-3 text-sm font-semibold text-amber-300">A new chapter is ready to unlock.</p>
              )}
              <button
                onClick={onExit}
                className="mt-10 w-full max-w-xs rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95"
              >
                Done
              </button>
              <button
                onClick={() => router.push('/dashboard/mind/arsenal')}
                className="mt-3 flex items-center gap-1 text-sm font-medium text-white/60 transition-colors hover:text-white"
              >
                Explore your arsenal
                <ArrowRight className="h-4 w-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
