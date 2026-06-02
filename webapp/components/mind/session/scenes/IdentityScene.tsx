'use client'

// Identity scene — affirm who you're becoming. The statement reveals one word at
// a time, with natural pauses, so you read it instead of skimming; only once it's
// fully landed does "Hold to affirm" appear. Press and HOLD to fill the ring;
// release early and it resets. Filling it locks the statement in. Interactive,
// not click-and-read. Renders inside the player's black full-screen stage.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import type { SceneProps } from '@/lib/mind/moves'
import RevealText from '../RevealText'

const HOLD_MS = 1600
const RADIUS = 54
const CIRC = 2 * Math.PI * RADIUS

export default function IdentityScene({ move, onDone }: SceneProps) {
  const [progress, setProgress] = useState(0) // 0..1
  const [affirmed, setAffirmed] = useState(false)
  const [ready, setReady] = useState(false) // statement fully revealed → can affirm
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const affirmedRef = useRef(false)

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    startRef.current = null
  }, [])

  const release = useCallback(() => {
    if (affirmedRef.current) return
    stop()
    setProgress(0)
  }, [stop])

  const tick = useCallback(
    (now: number) => {
      if (startRef.current === null) startRef.current = now
      const elapsed = now - startRef.current
      const pct = Math.min(1, elapsed / HOLD_MS)
      setProgress(pct)
      if (pct >= 1) {
        affirmedRef.current = true
        setAffirmed(true)
        stop()
        setTimeout(onDone, 700)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    },
    [onDone, stop],
  )

  const press = useCallback(() => {
    if (affirmedRef.current) return
    startRef.current = null
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  useEffect(() => () => stop(), [stop])

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <p className="text-xs uppercase tracking-widest text-white/40">{move.title}</p>
      <RevealText
        text={`“${move.statement}”`}
        onComplete={() => setReady(true)}
        className="mt-6 max-w-sm text-2xl font-bold leading-snug text-white"
      />

      {/* Reserve the action space so the statement doesn't jump when it appears. */}
      <div className="mt-12 flex h-56 flex-col items-center justify-start">
        <AnimatePresence>
          {ready && (
            <motion.div
              key="affirm"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="flex flex-col items-center"
            >
              <button
                onPointerDown={press}
                onPointerUp={release}
                onPointerLeave={release}
                onPointerCancel={release}
                aria-label="Hold to affirm"
                className="relative flex h-32 w-32 touch-none select-none items-center justify-center rounded-full"
              >
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
                  <circle
                    cx="60"
                    cy="60"
                    r={RADIUS}
                    fill="none"
                    stroke={affirmed ? '#4ade80' : 'url(#affirmGrad)'}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={CIRC}
                    strokeDashoffset={CIRC * (1 - progress)}
                  />
                  <defs>
                    <linearGradient id="affirmGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#a78bfa" />
                      <stop offset="100%" stopColor="#4ade80" />
                    </linearGradient>
                  </defs>
                </svg>
                <motion.span
                  animate={{ scale: affirmed ? 1 : 1 + progress * 0.08 }}
                  className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full bg-white/10"
                >
                  {affirmed ? (
                    <Check className="h-9 w-9 text-green-400" strokeWidth={3} />
                  ) : (
                    <span className="px-2 text-xs font-semibold text-white/80">Hold to affirm</span>
                  )}
                </motion.span>
              </button>
              <p className="mt-6 text-sm text-white/40">{affirmed ? 'Locked in.' : 'Press and hold'}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
