'use client'

// The immersive, full-screen Mind session player. Plays a composed chain of
// moves one scene at a time (intro → moves → payoff), like the live-workout
// view. Black cinematic stage, top progress, exit affordance. Scene components
// are dumb and fulfill SceneProps; this orchestrator owns sequencing, the live
// state-check answer (which resolves the breath protocol), and completion (which
// posts to /api/mind/session to award the daily XP once).

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ArrowLeft, ArrowRight, Sparkles, Check, Flame, ChevronUp, Loader2 } from 'lucide-react'
import type { MindState } from '@/lib/mindContent'
import { CHAPTERS, SYSTEM_INFO } from '@/lib/mindXP'
import { recommendSegment } from '@/lib/mind/recommendSegment'
import {
  BREATH_PROTOCOLS,
  breathForState,
  type MindSessionPlan,
  type BreathProtocol,
  type SessionAnswer,
} from '@/lib/mind/moves'
import StateCheckScene from './scenes/StateCheckScene'
import BreathScene from './scenes/BreathScene'
import IdentityScene from './scenes/IdentityScene'
import ChallengeScene from './scenes/ChallengeScene'
import WinScene from './scenes/WinScene'
import MissionScene from './scenes/MissionScene'
import VisionScene from './scenes/VisionScene'
import PatternScene from './scenes/PatternScene'
import SocialScene from './scenes/SocialScene'
import MirrorScene from './scenes/MirrorScene'
import ChoiceScene from './scenes/ChoiceScene'
import TypeScene from './scenes/TypeScene'
import SpeakScene from './scenes/SpeakScene'
import AssembleScene from './scenes/AssembleScene'
import ComposeScene from './scenes/ComposeScene'
import ContrastScene from './scenes/ContrastScene'

interface CompleteResult {
  xpAwarded: number
  completions?: number
  readyToLevelUp: boolean
  streak?: number
  /** Banked toward the lifetime Becoming score this rep (incl. training reps). */
  banked?: number
  /** Lifetime Becoming score after this rep. */
  xpBank?: number
  /** Daily progression XP is spent — this was a training rep (still banks score). */
  trainingMode?: boolean
}

interface LevelUpResult {
  chapter: number
  newlyUnlocked: string[]
  currentChapter: { name?: string; theme?: string }
}

export interface SessionPlayerProps {
  plan: MindSessionPlan
  /** Called when the user exits/finishes — the home should refetch + close. */
  onExit: () => void
  /** Admin lab: when true, completing does NOT post to /api/mind/session (no XP,
   *  streak, recency) and scenes skip their own writes. For testing modalities. */
  preview?: boolean
  /** Admin lab: seed the live state so breath-for-state + the regulate amplify
   *  swap can be exercised without first playing a state-check. */
  initialLiveState?: MindState | null
  /** Public shared view: render read-only (implies preview — no writes) and, on
   *  ANY attempt to advance/interact, call onRequireAuth instead of progressing
   *  so the recipient is prompted to sign in to Become to continue. */
  gated?: boolean
  onRequireAuth?: () => void
  /** Systems the user has unlocked — scopes the post-session "next segment" CTA
   *  to what they can actually open. Defaults to all seven. */
  unlockedSystems?: string[]
}

type Stage = 'intro' | 'move' | 'payoff' | 'levelup'

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}`,
  }
}

export default function SessionPlayer({ plan, onExit, preview = false, initialLiveState = null, gated = false, onRequireAuth, unlockedSystems }: SessionPlayerProps) {
  const router = useRouter()
  // Gated (public share) runs are always read-only — never write progress.
  preview = preview || gated
  const [stage, setStage] = useState<Stage>('intro')
  const [index, setIndex] = useState(0)
  const [liveState, setLiveState] = useState<MindState | null>(initialLiveState)
  const [result, setResult] = useState<CompleteResult | null>(null)
  const [levelUp, setLevelUp] = useState<LevelUpResult | null>(null)
  const [advancing, setAdvancing] = useState(false)

  const total = plan.moves.length
  const rawMove = plan.moves[index]
  // State-adaptive swap: a positive check-in ('locked_in') turns the regulate
  // beat from a breath into its amplify alternative — no forced breathing when
  // you're already on. Negative/off states keep the realignment breath.
  const move =
    rawMove?.altPositive && liveState === 'locked_in' ? rawMove.altPositive : rawMove

  // The reflective answers the user gave this session (a picked choice, etc.),
  // deduped by question. Persisted to MindJournal on completion so the NEXT
  // session can build on what they actually said — the same memory the arsenal
  // flows use.
  const answersRef = useRef<SessionAnswer[]>([])

  const complete = useCallback(async () => {
    setStage('payoff')
    // Admin lab preview: show the payoff but never write (no XP/streak/recency).
    if (preview) {
      setResult({ xpAwarded: 0, readyToLevelUp: false })
      return
    }
    // Remember this session's answers (best-effort) so tomorrow's session builds
    // on them instead of asking from scratch.
    if (answersRef.current.length) {
      const lines = answersRef.current.map((x) => ({ prompt: x.q, answer: x.a }))
      void fetch('/api/mind/journal', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ system: 'session', kind: 'session', title: plan.intro.title, lines }),
      }).catch(() => {})
    }
    try {
      // Report the EFFECTIVE kinds the player actually showed — so a locked-in
      // amplify (breath swapped out) isn't recorded as breath. Drives recency
      // (breath spacing) accurately on the server.
      const effectiveKinds = plan.moves.map((m) =>
        m.altPositive && liveState === 'locked_in' ? m.altPositive.kind : m.kind,
      )
      const res = await fetch('/api/mind/session', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          tz: new Date().getTimezoneOffset(),
          moves: effectiveKinds.map((kind) => ({ kind })),
        }),
      })
      if (res.ok) {
        const data = (await res.json()) as CompleteResult
        setResult(data)
      }
    } catch {
      /* payoff still shows; XP is best-effort */
    }
  }, [plan.moves, liveState, preview, plan.intro.title])

  const next = useCallback((answer?: SessionAnswer) => {
    // Capture a real reflection (keep the latest per question, so re-answering
    // after a back overwrites instead of duplicating).
    if (answer?.a) {
      const arr = answersRef.current
      const at = arr.findIndex((x) => x.q === answer.q)
      if (at >= 0) arr[at] = answer
      else arr.push(answer)
    }
    // Public share: any attempt to advance prompts sign-in instead of progressing.
    if (gated) { onRequireAuth?.(); return }
    if (index >= total - 1) {
      void complete()
    } else {
      setIndex((i) => i + 1)
    }
  }, [gated, onRequireAuth, index, total, complete])

  // Step back one move (or back to the intro from the first move). Re-mounts the
  // prior scene fresh — like the arsenal flows' back button — so the user can
  // revisit / redo a beat instead of being locked forward.
  const back = useCallback(() => {
    if (stage !== 'move') return
    if (index <= 0) { setStage('intro'); return }
    setIndex((i) => Math.max(0, i - 1))
  }, [stage, index])
  const canGoBack = stage === 'move' && !gated

  const handleLevelUp = useCallback(async () => {
    if (advancing) return
    setAdvancing(true)
    try {
      const res = await fetch('/api/mind/progress/levelup', { method: 'POST', headers: authHeaders() })
      if (res.ok) {
        setLevelUp((await res.json()) as LevelUpResult)
        setStage('levelup')
      } else {
        onExit() // gracefully bail if it can't advance
      }
    } catch {
      onExit()
    } finally {
      setAdvancing(false)
    }
  }, [advancing, onExit])

  // The segment to send them to when the session ends — chosen from how they
  // checked in and what today's session leaned on.
  const nextFocus = useMemo(
    () => recommendSegment({ state: liveState, moveKinds: plan.moves.map((m) => m.kind), unlocked: unlockedSystems }),
    [liveState, plan.moves, unlockedSystems],
  )

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
      {/* Top bar: exit + back + progress segments */}
      <div className="flex items-center gap-3 px-4 pt-3">
        <button
          onClick={onExit}
          aria-label="Exit session"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
        >
          <X className="h-4 w-4" />
        </button>
        {canGoBack && (
          <button
            onClick={back}
            aria-label="Previous move"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
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
                <StateCheckScene move={move} onState={setLiveState} onDone={next} preview={preview} />
              )}
              {move.kind === 'breath' && (
                <BreathScene move={move} protocol={resolvedProtocol} onDone={next} />
              )}
              {move.kind === 'identity' && <IdentityScene move={move} onDone={next} />}
              {move.kind === 'challenge' && <ChallengeScene move={move} onDone={next} preview={preview} />}
              {move.kind === 'win' && <WinScene move={move} onDone={next} preview={preview} />}
              {move.kind === 'mission' && <MissionScene move={move} onDone={next} />}
              {move.kind === 'vision' && <VisionScene move={move} onDone={next} />}
              {move.kind === 'antisabotage' && <PatternScene move={move} onDone={next} />}
              {move.kind === 'social' && <SocialScene move={move} onDone={next} />}
              {move.kind === 'mirror' && <MirrorScene move={move} onDone={next} />}
              {move.kind === 'choice' && <ChoiceScene move={move} onDone={next} />}
              {move.kind === 'type' && <TypeScene move={move} onDone={next} />}
              {move.kind === 'speak' && <SpeakScene move={move} onDone={next} />}
              {move.kind === 'assemble' && <AssembleScene move={move} onDone={next} />}
              {move.kind === 'compose' && <ComposeScene move={move} onDone={next} />}
              {/* Non-affirm registers — acknowledge/interrogative reuse the choice UI. */}
              {move.kind === 'acknowledge' && <ChoiceScene move={move} onDone={next} />}
              {move.kind === 'interrogative' && <ChoiceScene move={move} onDone={next} />}
              {move.kind === 'contrast' && <ContrastScene move={move} onDone={next} />}
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
                {result && (result.completions ?? 1) > 1 ? 'Another rep in.' : 'You showed up.'}
              </h1>
              <p className="mt-2 text-white/60">
                {result && result.xpAwarded === 0
                  ? "You've maxed today's XP — but reps still count."
                  : "That's how it's built — one rep at a time."}
              </p>
              {result && result.xpAwarded > 0 ? (
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="mt-5 rounded-full bg-white/10 px-4 py-1.5 text-sm font-bold text-green-300"
                >
                  +{result.xpAwarded} XP
                </motion.p>
              ) : result && result.trainingMode && (result.banked ?? 0) > 0 ? (
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="mt-5 rounded-full bg-white/10 px-4 py-1.5 text-sm font-bold text-violet-300"
                >
                  Training · +{result.banked} banked
                </motion.p>
              ) : null}
              {result && typeof result.xpBank === 'number' && result.xpBank > 0 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.55 }}
                  className="mt-3 text-xs font-medium uppercase tracking-widest text-white/40"
                >
                  Becoming score {result.xpBank.toLocaleString()}
                </motion.p>
              )}
              {result && typeof result.streak === 'number' && result.streak > 1 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-orange-300"
                >
                  <Flame className="h-4 w-4" />
                  {result.streak}-day streak
                </motion.p>
              )}

              {result?.readyToLevelUp ? (
                <>
                  <button
                    onClick={handleLevelUp}
                    disabled={advancing}
                    className="mt-10 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 py-4 text-base font-bold text-black transition-transform active:scale-95 disabled:opacity-70"
                  >
                    {advancing ? <Loader2 className="h-5 w-5 animate-spin" /> : <ChevronUp className="h-5 w-5" strokeWidth={3} />}
                    Unlock next chapter
                  </button>
                  <button onClick={onExit} className="mt-3 text-sm font-medium text-white/50 transition-colors hover:text-white">
                    Later
                  </button>
                </>
              ) : (
                <>
                  {/* Post-session bridge: send them to the ONE arsenal segment that
                      fits how they came in + what today leaned on. */}
                  <button
                    onClick={() => router.push(`/dashboard/mind/${nextFocus.systemId}`)}
                    className="mt-10 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95"
                  >
                    Next: {nextFocus.label}
                    <ArrowRight className="h-5 w-5" />
                  </button>
                  <p className="mt-2.5 max-w-xs text-xs leading-relaxed text-white/50">{nextFocus.reason}</p>
                  <button onClick={onExit} className="mt-4 text-sm font-medium text-white/50 transition-colors hover:text-white">
                    Done for now
                  </button>
                </>
              )}
            </motion.div>
          )}

          {stage === 'levelup' && levelUp && (
            <motion.div
              key="levelup"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex h-full w-full flex-col items-center justify-center px-6 text-center"
            >
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300"
              >
                Chapter {levelUp.chapter} unlocked
              </motion.p>
              <motion.h1
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.15 }}
                className="mt-3 bg-gradient-to-br from-amber-200 to-amber-400 bg-clip-text text-4xl font-extrabold text-transparent"
              >
                {levelUp.currentChapter?.name ?? CHAPTERS[levelUp.chapter - 1]?.name}
              </motion.h1>
              <p className="mt-3 max-w-xs text-white/60">
                {levelUp.currentChapter?.theme ?? CHAPTERS[levelUp.chapter - 1]?.theme}
              </p>

              {levelUp.newlyUnlocked.length > 0 && (
                <div className="mt-8 w-full max-w-xs">
                  <p className="mb-3 text-xs uppercase tracking-widest text-white/40">New tools</p>
                  <div className="space-y-2">
                    {levelUp.newlyUnlocked.map((id, i) => (
                      <motion.div
                        key={id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + i * 0.12 }}
                        className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold"
                      >
                        <Sparkles className="h-4 w-4 text-amber-300" />
                        {SYSTEM_INFO[id]?.label ?? id}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={onExit}
                className="mt-10 w-full max-w-xs rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95"
              >
                Enter
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
