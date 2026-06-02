'use client'

// Breath scene — an animated breathing pacer. Opens with a brief "get ready"
// intro (name + what it's for + Start) so it never drops you mid-breath, then
// runs the protocol with a pause/resume + skip. Renders inside the player's
// black full-screen stage.

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Wind, Play, Pause, ArrowRight } from 'lucide-react'
import { BREATH_PROTOCOLS, type SceneProps } from '@/lib/mind/moves'

const SMALL = 0.55
const LARGE = 1

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  )
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

  const [started, setStarted] = useState(false)
  const [paused, setPaused] = useState(false)
  const [round, setRound] = useState(1)
  const [phaseIdx, setPhaseIdx] = useState(0)
  const [done, setDone] = useState(false)
  const doneRef = useRef(false)

  const phase = p.phases[phaseIdx]

  // Step through phases on a timer — only while started, not paused, not done.
  useEffect(() => {
    if (!started || paused || done) return
    const t = setTimeout(() => {
      const lastPhase = phaseIdx >= p.phases.length - 1
      if (!lastPhase) {
        setPhaseIdx((i) => i + 1)
      } else if (round < p.rounds) {
        setRound((r) => r + 1)
        setPhaseIdx(0)
      } else {
        setDone(true)
      }
    }, phase.durationMs)
    return () => clearTimeout(t)
  }, [started, paused, phaseIdx, round, phase.durationMs, p.phases.length, p.rounds, done])

  useEffect(() => {
    if (!done || doneRef.current) return
    doneRef.current = true
    const t = setTimeout(onDone, 900)
    return () => clearTimeout(t)
  }, [done, onDone])

  // ── Intro / "get ready" ──
  if (!started) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
        <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/30 to-green-500/30">
          <Wind className="h-7 w-7 text-white/80" />
        </span>
        <p className="text-xs uppercase tracking-widest text-white/40">Breathe</p>
        <h1 className="mt-2 text-3xl font-extrabold">{p.name}</h1>
        <p className="mt-2 max-w-xs text-white/60">{p.bestFor}</p>
        <p className="mt-5 text-xs uppercase tracking-widest text-white/40">{p.rounds} rounds · follow the circle</p>
        <button
          onClick={() => setStarted(true)}
          className="mt-9 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95"
        >
          <Play className="h-5 w-5 fill-current" />
          Start
        </button>
        <button onClick={onDone} className="mt-3 text-sm font-medium text-white/40 transition-colors hover:text-white/70">
          Skip
        </button>
      </div>
    )
  }

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <p className="mb-1 text-xs uppercase tracking-widest text-white/40">{p.name}</p>
      <p className="mb-10 text-sm text-white/40">
        {done ? `${p.rounds} rounds complete` : `Round ${round} of ${p.rounds}`}
      </p>

      <div className="relative flex h-64 w-64 items-center justify-center">
        <motion.div
          className="absolute h-64 w-64 rounded-full bg-gradient-to-br from-violet-500/30 to-green-500/30"
          animate={{ scale: done ? 0.7 : reduce ? 0.8 : phaseScales[phaseIdx] }}
          transition={{ duration: paused || reduce ? 0 : phase.durationMs / 1000, ease: 'easeInOut' }}
        />
        <div className="absolute h-40 w-40 rounded-full border border-white/15" />
        <div className="relative z-10 flex flex-col items-center">
          <span className="text-2xl font-bold">{done ? 'Nice.' : paused ? 'Paused' : phase.label}</span>
          {!done && !paused && <span className="mt-1 max-w-[10rem] text-xs text-white/50">{phase.instruction}</span>}
        </div>
      </div>

      {/* Controls */}
      {!done && (
        <div className="absolute bottom-8 flex w-full items-center justify-center gap-6">
          <button
            onClick={() => setPaused((v) => !v)}
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/20"
          >
            {paused ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4" />}
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button onClick={onDone} className="flex items-center gap-1 text-sm font-medium text-white/40 transition-colors hover:text-white/70">
            Skip
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
