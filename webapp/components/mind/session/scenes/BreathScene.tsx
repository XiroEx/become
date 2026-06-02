'use client'

// Breath scene — an animated breathing pacer. Opens with a "get ready" intro
// (name + what it's for) offering Start (full protocol) and Preview (one demo
// round, then back to the intro) so it never drops you mid-breath. Runs with
// pause/resume + skip. Renders inside the player's black full-screen stage.

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Wind, Play, Pause, Eye, ArrowRight } from 'lucide-react'
import { BREATH_PROTOCOLS, type SceneProps } from '@/lib/mind/moves'

const SMALL = 0.55
const LARGE = 1

type Mode = 'ready' | 'preview' | 'run'

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

  const [mode, setMode] = useState<Mode>('ready')
  const [paused, setPaused] = useState(false)
  const [round, setRound] = useState(1)
  const [phaseIdx, setPhaseIdx] = useState(0)
  const [done, setDone] = useState(false)
  const doneRef = useRef(false)

  const phase = p.phases[phaseIdx]
  const isPreview = mode === 'preview'

  const begin = (m: 'preview' | 'run') => {
    setRound(1)
    setPhaseIdx(0)
    setPaused(false)
    setDone(false)
    doneRef.current = false
    setMode(m)
  }

  // Step through phases on a timer — only while running/previewing, not paused.
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
        // Preview is one round — return to the intro.
        setMode('ready')
        setRound(1)
        setPhaseIdx(0)
      } else {
        setDone(true)
      }
    }, phase.durationMs)
    return () => clearTimeout(t)
  }, [mode, isPreview, paused, phaseIdx, round, phase.durationMs, p.phases.length, p.rounds, done])

  // Finish shortly after the last real round completes.
  useEffect(() => {
    if (!done || doneRef.current) return
    doneRef.current = true
    const t = setTimeout(onDone, 900)
    return () => clearTimeout(t)
  }, [done, onDone])

  // ── Intro / "get ready" ──
  if (mode === 'ready') {
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
          onClick={() => begin('run')}
          className="mt-9 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95"
        >
          <Play className="h-5 w-5 fill-current" />
          Start
        </button>
        <button
          onClick={() => begin('preview')}
          className="mt-3 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl border border-white/15 py-3 text-sm font-semibold text-white/80 transition-colors hover:bg-white/5"
        >
          <Eye className="h-4 w-4" />
          Preview one round
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
        {isPreview ? 'Preview' : done ? `${p.rounds} rounds complete` : `Round ${round} of ${p.rounds}`}
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
          {isPreview ? (
            <button
              onClick={() => { setMode('ready'); setRound(1); setPhaseIdx(0); setPaused(false) }}
              className="flex items-center gap-1 text-sm font-medium text-white/40 transition-colors hover:text-white/70"
            >
              Back
            </button>
          ) : (
            <button onClick={onDone} className="flex items-center gap-1 text-sm font-medium text-white/40 transition-colors hover:text-white/70">
              Skip
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
