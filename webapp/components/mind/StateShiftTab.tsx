'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Wind, Timer, Play, Pause, RotateCcw, CheckCircle2, Zap } from 'lucide-react'
import { getPiecesBySection } from '@/lib/mindContent'

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
  color: string
  phases: BreathPhase[]
  rounds: number
}

const PROTOCOLS: Protocol[] = [
  {
    id: 'box',
    name: 'Box Breathing',
    tagline: 'Navy SEAL standard',
    bestFor: 'Stress, anxiety, pre-performance',
    color: 'text-blue-400',
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
    tagline: 'Dr. Andrew Weil method',
    bestFor: 'Deep calm, falling asleep',
    color: 'text-violet-400',
    rounds: 4,
    phases: [
      { label: 'Inhale', durationMs: 4000, instruction: 'Breathe in quietly through your nose' },
      { label: 'Hold', durationMs: 7000, instruction: 'Hold your breath' },
      { label: 'Exhale', durationMs: 8000, instruction: 'Exhale completely through your mouth' },
    ],
  },
  {
    id: 'physiological',
    name: 'Physiological Sigh',
    tagline: 'Stanford neuroscience',
    bestFor: 'Instant stress relief',
    color: 'text-emerald-400',
    rounds: 3,
    phases: [
      { label: 'Inhale', durationMs: 2000, instruction: 'Breathe in through your nose' },
      { label: 'Inhale+', durationMs: 1000, instruction: 'Small extra sniff to fill lungs completely' },
      { label: 'Exhale', durationMs: 6000, instruction: 'Long slow exhale through mouth — fully empty' },
    ],
  },
]

// ─── Focus timer ───────────────────────────────────────────────────────────────

const FOCUS_DURATIONS = [
  { label: '5 min', seconds: 5 * 60 },
  { label: '10 min', seconds: 10 * 60 },
  { label: '25 min', seconds: 25 * 60 },
  { label: '45 min', seconds: 45 * 60 },
]

function FocusTimer() {
  const [selectedSeconds, setSelectedSeconds] = useState(25 * 60)
  const [remaining, setRemaining] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = useCallback(() => {
    setDone(false)
    setRunning(true)
  }, [])

  const pause = useCallback(() => setRunning(false), [])

  const reset = useCallback(() => {
    setRunning(false)
    setDone(false)
    setRemaining(selectedSeconds)
  }, [selectedSeconds])

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            setRunning(false)
            setDone(true)
            return 0
          }
          return r - 1
        })
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running])

  function selectDuration(s: number) {
    setSelectedSeconds(s)
    setRemaining(s)
    setRunning(false)
    setDone(false)
  }

  const mins = Math.floor(remaining / 60).toString().padStart(2, '0')
  const secs = (remaining % 60).toString().padStart(2, '0')
  const progress = 1 - remaining / selectedSeconds

  const circumference = 2 * Math.PI * 52
  const dashOffset = circumference * (1 - progress)

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Timer className="h-4 w-4 text-zinc-500" />
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Focus Mode
        </p>
      </div>

      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-500">
        One task. One block of time. No interruptions.
      </p>

      {/* Duration selector */}
      <div className="mb-5 flex gap-2">
        {FOCUS_DURATIONS.map((d) => (
          <button
            key={d.label}
            onClick={() => selectDuration(d.seconds)}
            className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${
              selectedSeconds === d.seconds
                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Ring timer */}
      <div className="flex flex-col items-center">
        <div className="relative mb-5">
          <svg width="120" height="120" className="-rotate-90">
            <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="6" className="text-zinc-100 dark:text-zinc-800" />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="text-zinc-900 dark:text-white transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {done ? (
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            ) : (
              <span className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-white">
                {mins}:{secs}
              </span>
            )}
          </div>
        </div>

        {done ? (
          <div className="text-center">
            <p className="mb-3 text-sm font-semibold text-emerald-500">Session complete. Good work.</p>
            <button
              onClick={reset}
              className="flex items-center gap-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300"
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            {running ? (
              <button
                onClick={pause}
                className="flex items-center gap-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300"
              >
                <Pause className="h-4 w-4" /> Pause
              </button>
            ) : (
              <button
                onClick={start}
                className="flex items-center gap-2 rounded-xl bg-zinc-900 dark:bg-white px-5 py-2.5 text-sm font-semibold text-white dark:text-zinc-900"
              >
                <Play className="h-4 w-4" /> {remaining < selectedSeconds ? 'Resume' : 'Start'}
              </button>
            )}
            {remaining < selectedSeconds && !running && (
              <button
                onClick={reset}
                className="flex items-center gap-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-500"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Breathing session ─────────────────────────────────────────────────────────

interface BreathSessionProps {
  protocol: Protocol
  onClose: () => void
}

function BreathSession({ protocol, onClose }: BreathSessionProps) {
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
        <p className="mb-8 text-zinc-400">{protocol.rounds} rounds of {protocol.name}</p>
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
      <button onClick={onClose} className="absolute right-5 top-5 text-zinc-500 hover:text-zinc-300">
        ✕
      </button>
      <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-zinc-500">
        {protocol.name} · Round {round}/{protocol.rounds}
      </p>
      <div className="relative my-8">
        <svg width="130" height="130" className="-rotate-90">
          <circle cx="65" cy="65" r="56" fill="none" stroke="#27272a" strokeWidth="8" />
          <circle
            cx="65"
            cy="65"
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
          <p className="text-xl font-bold text-white">{currentPhase?.label}</p>
        </div>
      </div>
      <p className="text-center text-base text-zinc-300">{currentPhase?.instruction}</p>
    </div>
  )
}

// ─── Main tab ──────────────────────────────────────────────────────────────────

const QUICK_PROTOCOLS = getPiecesBySection('state-shift')

export default function StateShiftTab() {
  const [activeSession, setActiveSession] = useState<Protocol | null>(null)
  const [expandedProtocol, setExpandedProtocol] = useState<string | null>(null)

  if (activeSession) {
    return <BreathSession protocol={activeSession} onClose={() => setActiveSession(null)} />
  }

  return (
    <div className="space-y-5">
      {/* Named protocols from content library */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Zap className="h-4 w-4 text-zinc-500" />
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Protocols
          </p>
        </div>
        <p className="mb-4 text-sm text-zinc-500">
          Named resets — each one has a mantra and exact instruction. Use when you need to shift fast.
        </p>
        <div className="space-y-2">
          {QUICK_PROTOCOLS.map((p) => (
            <div key={p.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <button
                onClick={() => setExpandedProtocol(expandedProtocol === p.id ? null : p.id)}
                className="flex w-full items-center justify-between p-4 text-left"
              >
                <div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-white">{p.title}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{p.source}</p>
                </div>
                <span className="text-zinc-400 text-lg ml-2 shrink-0">{expandedProtocol === p.id ? '−' : '+'}</span>
              </button>
              {expandedProtocol === p.id && (
                <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 pb-4 pt-3 bg-zinc-50 dark:bg-zinc-800/30">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 italic mb-3">
                    &ldquo;{p.mantra}&rdquo;
                  </p>
                  <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{p.instruction}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Breathwork */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Wind className="h-4 w-4 text-zinc-500" />
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Breathwork
          </p>
        </div>
        <p className="mb-4 text-sm text-zinc-500">
          Guided breath sessions. The fastest physiological reset available to you.
        </p>
        <div className="space-y-3">
          {PROTOCOLS.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveSession(p)}
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-4 text-left transition-all hover:border-zinc-300 dark:hover:border-zinc-700"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className={`text-sm font-bold ${p.color}`}>{p.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{p.tagline}</p>
                </div>
                <span className="rounded-lg bg-zinc-100 dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-500">
                  {p.rounds} rounds
                </span>
              </div>
              <p className="mt-2 text-xs text-zinc-500">Best for: {p.bestFor}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Focus Mode */}
      <FocusTimer />
    </div>
  )
}
