'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Wind, Timer, Play, Pause, RotateCcw, CheckCircle2, X, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { getPiecesBySection, type ContentPiece } from '@/lib/mindContent'
import HorizontalScroll from '@/components/mind/HorizontalScroll'
import { Card, type CardAccent } from '@/components/ui'

// ─── Breathing protocols ───────────────────────────────────────────────────────

interface BreathPhase {
  label: string
  durationMs: number
  instruction: string
}

interface Protocol {
  id: string
  name: string
  tagline: string
  bestFor: string
  /** Tailwind text color for the icon badge */
  iconColor: string
  /** Tailwind bg for the icon badge container */
  iconBg: string
  /** Status accent for the Card primitive (left stripe) */
  cardAccent: CardAccent
  phases: BreathPhase[]
  rounds: number
}

const PROTOCOLS: Protocol[] = [
  {
    id: 'physiological',
    name: 'Physiological Sigh',
    tagline: 'Stanford neuroscience',
    bestFor: 'Instant stress relief',
    iconColor: 'text-emerald-500',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    cardAccent: 'success',
    rounds: 3,
    phases: [
      { label: 'Inhale', durationMs: 2000, instruction: 'Breathe in through your nose' },
      { label: 'Inhale+', durationMs: 1000, instruction: 'Small extra sniff — fill lungs completely' },
      { label: 'Exhale', durationMs: 6000, instruction: 'Long slow exhale through mouth — fully empty' },
    ],
  },
  {
    id: 'box',
    name: 'Box Breathing',
    tagline: 'Navy SEAL standard',
    bestFor: 'Stress & pre-performance',
    iconColor: 'text-blue-500',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    cardAccent: 'info',
    rounds: 4,
    phases: [
      { label: 'Inhale', durationMs: 4000, instruction: 'Breathe in slowly through your nose' },
      { label: 'Hold', durationMs: 4000, instruction: 'Hold — lungs full' },
      { label: 'Exhale', durationMs: 4000, instruction: 'Breathe out slowly through your mouth' },
      { label: 'Hold', durationMs: 4000, instruction: 'Hold — lungs empty' },
    ],
  },
  {
    id: '478',
    name: '4-7-8',
    tagline: 'Dr. Andrew Weil',
    bestFor: 'Deep calm & sleep',
    iconColor: 'text-violet-500',
    iconBg: 'bg-violet-100 dark:bg-violet-900/30',
    cardAccent: 'warning',
    rounds: 4,
    phases: [
      { label: 'Inhale', durationMs: 4000, instruction: 'Breathe in quietly through your nose' },
      { label: 'Hold', durationMs: 7000, instruction: 'Hold your breath' },
      { label: 'Exhale', durationMs: 8000, instruction: 'Exhale completely through your mouth' },
    ],
  },
]

// ─── Focus durations ───────────────────────────────────────────────────────────

const FOCUS_DURATIONS = [
  { label: '5m', seconds: 5 * 60 },
  { label: '10m', seconds: 10 * 60 },
  { label: '25m', seconds: 25 * 60 },
  { label: '45m', seconds: 45 * 60 },
]

// ─── Protocol modal ────────────────────────────────────────────────────────────

function ProtocolModal({ piece, onClose }: { piece: ContentPiece; onClose: () => void }) {
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full rounded-t-2xl bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 px-5 pt-5 pb-10"
        >
          {/* Handle */}
          <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />

          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-1">
                {piece.source}
              </p>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{piece.title}</h2>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-5 rounded-2xl bg-zinc-50 dark:bg-zinc-800 px-5 py-4">
            <p className="text-base font-semibold italic text-zinc-700 dark:text-zinc-200 leading-snug">
              &ldquo;{piece.mantra}&rdquo;
            </p>
          </div>

          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {piece.instruction}
          </p>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

// ─── Breath session (full screen) ──────────────────────────────────────────────

function BreathSession({ protocol, onClose }: { protocol: Protocol; onClose: () => void }) {
  const [round, setRound] = useState(1)
  const [phaseIdx, setPhaseIdx] = useState(0)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAt = useRef<number>(Date.now())

  const currentPhase = protocol.phases[phaseIdx]

  useEffect(() => {
    startedAt.current = Date.now()
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt.current
      const p = Math.min(elapsed / currentPhase.durationMs, 1)
      setProgress(p)
      if (p >= 1) {
        clearInterval(intervalRef.current!)
        const nextPhase = phaseIdx + 1
        if (nextPhase < protocol.phases.length) {
          setPhaseIdx(nextPhase)
        } else {
          const nextRound = round + 1
          if (nextRound <= protocol.rounds) {
            setRound(nextRound)
            setPhaseIdx(0)
          } else {
            setDone(true)
          }
        }
        setProgress(0)
      }
    }, 50)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [phaseIdx, round, currentPhase?.durationMs, protocol.phases.length, protocol.rounds])

  const circumference = 2 * Math.PI * 56
  const dashOffset = circumference * (1 - progress)

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950">
        <CheckCircle2 className="mb-4 h-16 w-16 text-emerald-500" />
        <p className="mb-2 text-2xl font-bold text-white">Done.</p>
        <p className="mb-8 text-zinc-400">{protocol.rounds} rounds complete</p>
        <button
          onClick={onClose}
          className="rounded-2xl bg-white px-8 py-3 font-semibold text-zinc-900"
        >
          Finish
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950 px-6">
      <button
        onClick={onClose}
        className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-zinc-200"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-zinc-500">
        {protocol.name}
      </p>
      <p className="mb-8 text-sm text-zinc-600">Round {round} of {protocol.rounds}</p>
      <div className="relative my-4">
        <svg width="140" height="140" className="-rotate-90">
          <circle cx="70" cy="70" r="56" fill="none" stroke="#27272a" strokeWidth="8" />
          <circle
            cx="70"
            cy="70"
            r="56"
            fill="none"
            stroke="white"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 50ms linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-bold text-white">{currentPhase?.label}</p>
        </div>
      </div>
      <p className="mt-6 max-w-xs text-center text-sm text-zinc-400 leading-relaxed">
        {currentPhase?.instruction}
      </p>
    </div>
  )
}

// ─── Focus timer ───────────────────────────────────────────────────────────────

function FocusRow() {
  const [selectedSeconds, setSelectedSeconds] = useState(25 * 60)
  const [remaining, setRemaining] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = useCallback(() => { setDone(false); setRunning(true) }, [])
  const pause = useCallback(() => setRunning(false), [])
  const reset = useCallback(() => {
    setRunning(false); setDone(false); setRemaining(selectedSeconds)
  }, [selectedSeconds])

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) { setRunning(false); setDone(true); return 0 }
          return r - 1
        })
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running])

  function selectDuration(s: number) {
    setSelectedSeconds(s); setRemaining(s); setRunning(false); setDone(false)
  }

  const mins = Math.floor(remaining / 60).toString().padStart(2, '0')
  const secs = (remaining % 60).toString().padStart(2, '0')
  const progress = running || done ? 1 - remaining / selectedSeconds : 0

  return (
    <Card className="shrink-0">
      <div className="mb-2.5 flex items-center gap-1.5">
        <Timer className="h-3.5 w-3.5 text-zinc-400" />
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Focus Mode</p>
      </div>
      <div className="flex items-center gap-2">
        {/* Duration pills */}
        <div className="flex flex-1 gap-1.5">
          {FOCUS_DURATIONS.map((d) => (
            <button
              key={d.label}
              onClick={() => selectDuration(d.seconds)}
              disabled={running}
              className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all disabled:pointer-events-none ${
                selectedSeconds === d.seconds
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        {/* Timer display + control */}
        <div className="flex shrink-0 items-center gap-1.5">
          {(running || (remaining < selectedSeconds && !done)) && (
            <span className="w-12 text-center text-sm font-bold tabular-nums text-zinc-900 dark:text-white">
              {mins}:{secs}
            </span>
          )}
          {done ? (
            <button
              onClick={reset}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500"
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
          ) : running ? (
            <button
              onClick={pause}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
            >
              <Pause className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={start}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-zinc-900 dark:bg-white px-3 text-xs font-bold text-white dark:text-zinc-900"
            >
              <Play className="h-3.5 w-3.5" />
              {remaining < selectedSeconds ? 'Resume' : 'Start'}
            </button>
          )}
          {remaining < selectedSeconds && !running && !done && (
            <button
              onClick={reset}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {/* Progress bar */}
      {(running || done || remaining < selectedSeconds) && (
        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-zinc-900 dark:bg-white transition-all duration-1000"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
    </Card>
  )
}

// ─── Main tab ──────────────────────────────────────────────────────────────────

const QUICK_PROTOCOLS = getPiecesBySection('state-shift')

export default function StateShiftTab() {
  const [activeSession, setActiveSession] = useState<Protocol | null>(null)
  const [activeProtocol, setActiveProtocol] = useState<ContentPiece | null>(null)

  return (
    <>
      {/* Full-screen breath session overlay */}
      {activeSession && (
        <BreathSession protocol={activeSession} onClose={() => setActiveSession(null)} />
      )}

      {/* Protocol detail bottom sheet */}
      {activeProtocol && (
        <ProtocolModal piece={activeProtocol} onClose={() => setActiveProtocol(null)} />
      )}

      <div className="flex h-full flex-col gap-4 overflow-hidden">

        {/* ── Hero: fastest reset ──────────────────────────────────────── */}
        <Card
          as="button"
          variant="hero"
          onClick={() => setActiveSession(PROTOCOLS[0])}
          className="group relative shrink-0 overflow-hidden bg-zinc-900 dark:bg-zinc-800 border-zinc-800 dark:border-zinc-700 text-left"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent pointer-events-none" />
          <div className="relative">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-emerald-500">
              Fastest Reset Available
            </p>
            <p className="text-xl font-bold text-white leading-tight mb-1">
              Physiological Sigh
            </p>
            <p className="text-sm text-zinc-400 mb-4">
              Double inhale + long exhale. 3 cycles. Proven to drop stress in 60 seconds.
            </p>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5">
                <Wind className="h-4 w-4 text-white" />
                <span className="text-sm font-bold text-white">Start Now</span>
              </div>
              <span className="text-xs text-zinc-500">~60 seconds</span>
            </div>
          </div>
        </Card>

        {/* ── Protocols ───────────────────────────────────────────────── */}
        <div className="shrink-0">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Mental Protocols
          </p>
          <HorizontalScroll>
            {QUICK_PROTOCOLS.map((p) => (
              <Card
                key={p.id}
                as="button"
                onClick={() => setActiveProtocol(p)}
                className="flex w-[200px] shrink-0 flex-col justify-between text-left"
              >
                <div>
                  <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 mb-1.5">{p.source}</p>
                  <p className="text-sm font-bold text-zinc-900 dark:text-white leading-snug">{p.title}</p>
                </div>
                <div className="mt-3 flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                  <span>Read</span>
                  <ChevronRight className="h-3 w-3" />
                </div>
              </Card>
            ))}
          </HorizontalScroll>
        </div>

        {/* ── Breathwork ──────────────────────────────────────────────── */}
        <div className="shrink-0">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Guided Breathwork
          </p>
          <HorizontalScroll>
            {PROTOCOLS.map((p) => (
              <Card
                key={p.id}
                as="button"
                accent={p.cardAccent}
                onClick={() => setActiveSession(p)}
                className="flex w-[170px] shrink-0 flex-col gap-3 text-left"
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${p.iconBg}`}>
                  <Wind className={`h-4 w-4 ${p.iconColor}`} />
                </div>
                <div>
                  <p className={`text-sm font-bold ${p.iconColor} leading-tight`}>{p.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{p.tagline}</p>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-500">{p.rounds} rounds · {p.bestFor}</p>
              </Card>
            ))}
          </HorizontalScroll>
        </div>

        {/* ── Focus timer ──────────────────────────────────────────────── */}
        <FocusRow />

      </div>
    </>
  )
}
