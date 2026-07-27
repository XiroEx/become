'use client'

// Breath scene — an animated breathing pacer.
//  • Ready screen: name, what it's for, a full description, and a visual phase
//    breakdown (each phase as a colored pill), with Start / Preview / Skip.
//  • Active screen: a progress ring that sweeps through EVERY phase (so holds
//    never feel frozen), per-phase color, an ambient rotating glow, a live
//    countdown, plus Pause/Resume, Restart, and Skip.
// Renders inside the player's black full-screen stage.

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Wind, Play, Pause, Eye, ArrowRight, ArrowDown, ArrowUp, Minus, RotateCcw, Check } from 'lucide-react'
import { BREATH_PROTOCOLS, type BreathPhase, type SceneProps } from '@/lib/mind/moves'

const SMALL = 0.55
const LARGE = 1
const RING_R = 46
const RING_C = 2 * Math.PI * RING_R

type Mode = 'ready' | 'preview' | 'run'
type Kind = 'in' | 'out' | 'hold'

function kindOf(label: string): Kind {
  if (/inhale/i.test(label)) return 'in'
  if (/exhale/i.test(label)) return 'out'
  return 'hold'
}

// Per-phase visual language.
const PHASE_STYLE: Record<Kind, { ring: string; orb: string; chip: string; Icon: typeof ArrowDown }> = {
  in: { ring: '#a78bfa', orb: 'from-violet-500/45 to-indigo-500/25', chip: 'text-violet-300', Icon: ArrowUp },
  hold: { ring: '#60a5fa', orb: 'from-indigo-500/40 to-blue-500/25', chip: 'text-blue-300', Icon: Minus },
  out: { ring: '#4ade80', orb: 'from-emerald-500/45 to-green-500/25', chip: 'text-green-300', Icon: ArrowDown },
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  )
}

function secs(ms: number): string {
  const s = ms / 1000
  return Number.isInteger(s) ? `${s}s` : `${s.toFixed(1)}s`
}

export default function BreathScene({ move, protocol, onDone }: SceneProps) {
  const p = protocol ?? BREATH_PROTOCOLS.sigh
  const reduce = useMemo(prefersReducedMotion, [])

  const phaseScales = useMemo(() => {
    let prev = SMALL
    return p.phases.map((ph) => {
      if (/inhale/i.test(ph.label)) prev = LARGE
      else if (/exhale/i.test(ph.label)) prev = SMALL
      return prev
    })
  }, [p])

  const [mode, setMode] = useState<Mode>('ready')
  const [paused, setPaused] = useState(false)
  const [round, setRound] = useState(1)
  const [phaseIdx, setPhaseIdx] = useState(0)
  const [progress, setProgress] = useState(0) // 0..1 within the current phase
  const [done, setDone] = useState(false)
  const doneRef = useRef(false)

  const phase: BreathPhase = p.phases[phaseIdx]
  const kind = kindOf(phase.label)
  const style = PHASE_STYLE[kind]
  const isPreview = mode === 'preview'

  const begin = (m: 'preview' | 'run') => {
    setRound(1)
    setPhaseIdx(0)
    setProgress(0)
    setPaused(false)
    setDone(false)
    doneRef.current = false
    setMode(m)
  }

  // Phase stepper (advances phases/rounds).
  useEffect(() => {
    if (mode === 'ready' || paused || done) return
    const t = setTimeout(() => {
      const lastPhase = phaseIdx >= p.phases.length - 1
      if (!lastPhase) {
        setPhaseIdx((i) => i + 1)
        return
      }
      const totalRounds = isPreview ? 1 : p.rounds
      if (round < totalRounds) {
        setRound((r) => r + 1)
        setPhaseIdx(0)
      } else if (isPreview) {
        setMode('ready')
        setRound(1)
        setPhaseIdx(0)
      } else {
        setDone(true)
      }
    }, phase.durationMs)
    return () => clearTimeout(t)
  }, [mode, isPreview, paused, phaseIdx, round, phase.durationMs, p.phases.length, p.rounds, done])

  // Smooth in-phase progress (drives the ring + countdown) so holds keep moving.
  useEffect(() => {
    if (mode === 'ready' || paused || done) return
    let raf = 0
    let start: number | null = null
    setProgress(0)
    const step = (now: number) => {
      if (start === null) start = now
      const pct = Math.min(1, (now - start) / phase.durationMs)
      setProgress(pct)
      if (pct < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [mode, paused, phaseIdx, round, phase.durationMs, done])

  // Finish shortly after the last real round completes.
  useEffect(() => {
    if (!done || doneRef.current) return
    doneRef.current = true
    const t = setTimeout(onDone, 1900) // let the completion visual land
    return () => clearTimeout(t)
  }, [done, onDone])

  const secondsLeft = Math.max(1, Math.ceil((1 - progress) * (phase.durationMs / 1000)))

  // ── Ready / "get ready" ──
  if (mode === 'ready') {
    return (
      <div className="flex h-full w-full flex-col overflow-y-auto px-6 py-8">
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center text-center">
          <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/30 to-green-500/30">
            <Wind className="h-7 w-7 text-white/80" />
          </span>
          <h1 className="text-3xl font-extrabold">{p.name}</h1>
          <p className="mx-auto mt-2 w-fit rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/70">
            {p.bestFor}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-white/60">{p.description}</p>

          {/* Phase rhythm breakdown */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {p.phases.map((ph, i) => {
              const k = kindOf(ph.label)
              const st = PHASE_STYLE[k]
              const PIcon = st.Icon
              return (
                <span
                  key={i}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80"
                >
                  <PIcon className={`h-3.5 w-3.5 ${st.chip}`} />
                  {ph.label} · {secs(ph.durationMs)}
                </span>
              )
            })}
          </div>
          <p className="mt-3 text-xs uppercase tracking-widest text-white/40">{p.rounds} rounds</p>

          <button
            onClick={() => begin('run')}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95"
          >
            <Play className="h-5 w-5 fill-current" />
            Start
          </button>
          <button
            onClick={() => begin('preview')}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 py-3 text-sm font-semibold text-white/80 transition-colors hover:bg-white/5"
          >
            <Eye className="h-4 w-4" />
            Preview one round
          </button>
          <button onClick={() => onDone()} className="mt-3 text-sm font-medium text-white/40 transition-colors hover:text-white/70">
            Skip
          </button>
        </div>
      </div>
    )
  }

  return (
    // Three flex regions (header / orb / controls) so the orb sits at the TRUE
    // vertical center of the stage — the header and controls balance each other.
    <div className="relative flex h-full w-full flex-col items-center px-6 text-center">
      {/* Header — anchored just above the orb */}
      <div className="flex flex-1 flex-col items-center justify-end pb-8">
        <p className="text-xs uppercase tracking-widest text-white/40">{p.name}</p>
        <p className="mt-1 text-sm text-white/40">
          {isPreview ? 'Preview' : done ? `${p.rounds} rounds complete` : `Round ${round} of ${p.rounds}`}
        </p>
      </div>

      {/* Orb / completion visual — centered */}
      <div className="relative flex h-72 w-72 shrink-0 items-center justify-center">
        {done ? (
          <>
            {/* Expanding success burst */}
            {!reduce && (
              <motion.div
                aria-hidden
                className="absolute h-56 w-56 rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(74,222,128,0.35), transparent 70%)' }}
                initial={{ scale: 0.4, opacity: 0.9 }}
                animate={{ scale: 1.7, opacity: 0 }}
                transition={{ duration: 1.4, ease: 'easeOut' }}
              />
            )}
            <motion.div
              initial={{ scale: 0, rotate: -18 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 15 }}
              className="relative z-10 flex h-36 w-36 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/40 to-green-500/15 ring-1 ring-green-400/40"
            >
              <Check className="h-16 w-16 text-green-300" strokeWidth={2.5} />
            </motion.div>
            <motion.span
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="absolute -bottom-3 text-lg font-bold text-white"
            >
              Nice.
            </motion.span>
          </>
        ) : (
          <>
            {/* Ambient rotating glow — keeps the scene alive even during holds */}
            {!reduce && (
              <motion.div
                aria-hidden
                className="absolute h-64 w-64 rounded-full opacity-50 blur-2xl"
                style={{ background: `conic-gradient(from 0deg, ${style.ring}55, transparent 60%, ${style.ring}55)` }}
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, ease: 'linear', duration: 10 }}
              />
            )}

            {/* Breathing orb (scales for inhale/exhale, steady on holds) */}
            <motion.div
              className={`absolute h-56 w-56 rounded-full bg-gradient-to-br ${style.orb}`}
              animate={{ scale: reduce ? 0.8 : phaseScales[phaseIdx] }}
              transition={{ duration: paused || reduce ? 0 : phase.durationMs / 1000, ease: 'easeInOut' }}
            />

            {/* Progress ring — sweeps through the current phase (incl. holds) */}
            <svg className="absolute h-72 w-72 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={RING_R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
              <circle
                cx="50"
                cy="50"
                r={RING_R}
                fill="none"
                stroke={style.ring}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - (paused ? 0 : progress))}
                style={{ transition: 'stroke 0.6s ease' }}
              />
            </svg>

            {/* Center text */}
            <div className="relative z-10 flex flex-col items-center">
              <span className="text-2xl font-bold">{paused ? 'Paused' : phase.label}</span>
              {!paused && (
                <>
                  <span className="mt-1 text-3xl font-extrabold tabular-nums text-white/90">{secondsLeft}</span>
                  <span className="mt-1 max-w-[10rem] text-xs text-white/50">{phase.instruction}</span>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Controls — anchored just below the orb */}
      <div className="flex flex-1 flex-col items-center justify-start pt-8">
        {!done && (
          <div className="flex w-full flex-col items-center gap-3">
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPaused((v) => !v)}
                className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/20"
              >
                {paused ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4" />}
                {paused ? 'Resume' : 'Pause'}
              </button>
              <button
                onClick={() => begin(isPreview ? 'preview' : 'run')}
                className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/20"
              >
                <RotateCcw className="h-4 w-4" />
                Restart
              </button>
            </div>
            {isPreview ? (
              <button
                onClick={() => { setMode('ready'); setRound(1); setPhaseIdx(0); setPaused(false); setProgress(0) }}
                className="text-sm font-medium text-white/40 transition-colors hover:text-white/70"
              >
                Back
              </button>
            ) : (
              <button onClick={() => onDone()} className="flex items-center gap-1 text-sm font-medium text-white/40 transition-colors hover:text-white/70">
                Skip
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
