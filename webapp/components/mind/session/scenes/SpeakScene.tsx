'use client'

// Speak scene — say the declaration out loud and watch it come true on screen.
// Uses live speech recognition (Web Speech API via useSpeechMatch): the words
// light up optimistically as you speak, and it locks in once you've said enough.
// Where speech isn't supported it degrades to a "hold while you say it" beat, and
// "write instead" is always available. Renders inside the player's black stage.

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Mic, Check } from 'lucide-react'
import type { SceneProps } from '@/lib/mind/moves'
import WriteAffirm from './WriteAffirm'
import { useSpeechMatch } from '@/hooks/useSpeechMatch'

// You have to actually say (nearly) the whole line — combined with the
// reached-the-end gate in useSpeechMatch, this stops it locking in "correct"
// while you're still mid-sentence. "Lock it in anyway" remains for mis-hears.
const PASS = 0.85
const FALLBACK_HOLD_MS = 2600

export default function SpeakScene({ move, onDone }: SceneProps) {
  const [writeMode, setWriteMode] = useState(false)
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)
  const doneRef = useRef(false)

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    setDone(true)
    setTimeout(onDone, 1100)
  }, [onDone])

  const statement = move.statement ?? ''
  const sm = useSpeechMatch(statement, { threshold: PASS, onPassed: finish })
  const words = statement.split(/\s+/).filter(Boolean)
  const showHighlight = started || done

  const begin = () => {
    setStarted(true)
    sm.start()
  }

  // ── No-speech fallback: hold while you say it out loud ──
  const [holdPct, setHoldPct] = useState(0)
  const holdRaf = useRef<number | null>(null)
  const holdStart = useRef<number | null>(null)
  const beginHold = useCallback(() => {
    holdStart.current = null
    const tick = (now: number) => {
      if (holdStart.current === null) holdStart.current = now
      const pct = Math.min(1, (now - holdStart.current) / FALLBACK_HOLD_MS)
      setHoldPct(pct)
      if (pct >= 1) { finish(); return }
      holdRaf.current = requestAnimationFrame(tick)
    }
    holdRaf.current = requestAnimationFrame(tick)
  }, [finish])
  const endHold = useCallback(() => {
    if (holdPct >= 1) return
    if (holdRaf.current !== null) cancelAnimationFrame(holdRaf.current)
    holdRaf.current = null
    holdStart.current = null
    setHoldPct(0)
  }, [holdPct])
  useEffect(() => () => { if (holdRaf.current !== null) cancelAnimationFrame(holdRaf.current) }, [])

  if (writeMode) return <WriteAffirm statement={statement} onDone={onDone} />

  const micBlocked = sm.error === 'not-allowed' || sm.error === 'service-not-allowed'

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-white/40">
        <Mic className="h-3.5 w-3.5" />
        {move.title}
      </p>

      {/* Statement — plain until you start, then optimistic highlight */}
      <p className="mt-6 max-w-sm text-2xl font-bold leading-snug text-white">
        &ldquo;
        {words.map((w, i) => {
          const status = sm.statuses[i] ?? 'pending'
          const color = !showHighlight
            ? 'text-white'
            : status === 'matched' ? 'text-green-400'
            : status === 'missed' ? 'text-amber-400'
            : 'text-white/25'
          return (
            <span key={i} className={`transition-colors duration-100 ${color}`}>
              {w}{i < words.length - 1 ? ' ' : ''}
            </span>
          )
        })}
        &rdquo;
      </p>

      {/* ── Done ── */}
      {done ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-12 flex flex-col items-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/15">
            <Check className="h-10 w-10 text-green-400" strokeWidth={3} />
          </span>
          <p className="mt-5 text-sm font-semibold text-green-400">Locked in.</p>
        </motion.div>
      ) : !sm.supported || micBlocked ? (
        // ── Fallback: hold while you say it ──
        <div className="mt-12 flex flex-col items-center">
          <button
            onPointerDown={beginHold}
            onPointerUp={endHold}
            onPointerLeave={endHold}
            onPointerCancel={endHold}
            aria-label="Hold while you say it"
            className="relative flex h-32 w-32 touch-none select-none items-center justify-center rounded-full"
          >
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
              <circle cx="60" cy="60" r="54" fill="none" stroke="#4ade80" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 54} strokeDashoffset={2 * Math.PI * 54 * (1 - holdPct)} />
            </svg>
            <span className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full bg-white/10 px-2 text-xs font-semibold text-white/80">
              Hold &amp; say it
            </span>
          </button>
          <p className="mt-6 max-w-xs text-sm text-white/40">
            {micBlocked ? 'Mic blocked — say it out loud and hold the circle.' : 'Say it out loud and hold the circle.'}
          </p>
          <button onClick={() => setWriteMode(true)} className="mt-4 text-xs font-medium text-white/40 underline-offset-2 hover:underline">
            Prefer to write it?
          </button>
        </div>
      ) : !started ? (
        // ── Idle: tap to start ──
        <div className="mt-12 flex flex-col items-center">
          <button
            onClick={begin}
            aria-label="Start"
            className="flex h-28 w-28 items-center justify-center rounded-full bg-white/10 transition-transform active:scale-95"
          >
            <Mic className="h-10 w-10 text-white/80" />
          </button>
          <p className="mt-6 text-sm text-white/40">Tap, then say it out loud</p>
          <button onClick={() => setWriteMode(true)} className="mt-4 text-xs font-medium text-white/40 underline-offset-2 hover:underline">
            Prefer to write it?
          </button>
        </div>
      ) : (
        // ── Listening ──
        <div className="mt-12 flex flex-col items-center">
          <span className="relative flex h-28 w-28 items-center justify-center rounded-full bg-white/10">
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full bg-violet-500/20"
              animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0.15, 0.5] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            />
            <Mic className="relative z-10 h-10 w-10 text-violet-300" />
          </span>
          <p className="mt-6 text-sm text-white/40">Say it like you mean it…</p>
          <button onClick={finish} className="mt-5 text-sm font-medium text-white/40 transition-colors hover:text-white/70">
            Lock it in anyway
          </button>
        </div>
      )}
    </div>
  )
}
