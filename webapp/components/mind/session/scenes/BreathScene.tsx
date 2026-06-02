'use client'

// Breath scene — an animated breathing pacer. A circle scales up on inhale,
// holds, scales down on exhale, stepping through the protocol's phases for N
// rounds. Renders inside the player's black full-screen stage.

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
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

  // Target scale per phase, carrying the current size forward through holds.
  const phaseScales = useMemo(() => {
    let prev = SMALL
    return p.phases.map((ph) => {
      if (/inhale/i.test(ph.label)) prev = LARGE
      else if (/exhale/i.test(ph.label)) prev = SMALL
      // "hold" keeps prev
      return prev
    })
  }, [p])

  const [round, setRound] = useState(1)
  const [phaseIdx, setPhaseIdx] = useState(0)
  const [done, setDone] = useState(false)
  const doneRef = useRef(false)

  const phase = p.phases[phaseIdx]

  // Step through phases on a timer.
  useEffect(() => {
    if (done) return
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
  }, [phaseIdx, round, phase.durationMs, p.phases.length, p.rounds, done])

  // Finish shortly after the last phase completes.
  useEffect(() => {
    if (!done || doneRef.current) return
    doneRef.current = true
    const t = setTimeout(onDone, 900)
    return () => clearTimeout(t)
  }, [done, onDone])

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <p className="mb-1 text-xs uppercase tracking-widest text-white/40">{p.name}</p>
      <p className="mb-10 text-sm text-white/40">
        {done ? `${p.rounds} rounds complete` : `Round ${round} of ${p.rounds}`}
      </p>

      {/* Pacer */}
      <div className="relative flex h-64 w-64 items-center justify-center">
        <motion.div
          className="absolute h-64 w-64 rounded-full bg-gradient-to-br from-violet-500/30 to-green-500/30"
          animate={{ scale: done ? 0.7 : reduce ? 0.8 : phaseScales[phaseIdx] }}
          transition={{ duration: reduce ? 0.3 : phase.durationMs / 1000, ease: 'easeInOut' }}
        />
        <div className="absolute h-40 w-40 rounded-full border border-white/15" />
        <div className="relative z-10 flex flex-col items-center">
          <span className="text-2xl font-bold">{done ? 'Nice.' : phase.label}</span>
          {!done && <span className="mt-1 max-w-[10rem] text-xs text-white/50">{phase.instruction}</span>}
        </div>
      </div>

      {move.subtitle && !done && <p className="mt-10 text-sm text-white/40">{move.subtitle}</p>}

      {!done && (
        <button
          onClick={onDone}
          className="absolute bottom-8 text-sm font-medium text-white/40 transition-colors hover:text-white/70"
        >
          Skip
        </button>
      )}
    </div>
  )
}
