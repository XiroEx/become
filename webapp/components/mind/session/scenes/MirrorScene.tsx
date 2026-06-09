'use client'

// Mirror scene — look at yourself while you say it out loud. Opens the front
// camera (mirrored) with the statement overlaid; live speech recognition lights
// the words up as you speak and locks in once you've said enough. Where speech
// isn't supported it degrades to press-and-hold to affirm; if the camera is
// denied it still works without video. Renders inside the player's black stage.

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Camera, Mic } from 'lucide-react'
import type { SceneProps } from '@/lib/mind/moves'
import WriteAffirm from './WriteAffirm'
import { useSpeechMatch } from '@/hooks/useSpeechMatch'

const HOLD_MS = 1800
const RADIUS = 52
const CIRC = 2 * Math.PI * RADIUS

type CamState = 'pending' | 'on' | 'off'

export default function MirrorScene({ move, onDone }: SceneProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cam, setCam] = useState<CamState>('pending')
  const [writeMode, setWriteMode] = useState(false)
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)
  const doneRef = useRef(false)

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    setDone(true)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setTimeout(onDone, 1000)
  }, [onDone])

  // Live speech recognition (uses its own mic capture, separate from the
  // video-only camera stream below, so the two don't contend for the mic).
  const statement = move.statement ?? ''
  const sm = useSpeechMatch(statement, { threshold: 0.6, onPassed: finish })
  const words = statement.split(/\s+/).filter(Boolean)
  const showHighlight = started || done
  const micBlocked = sm.error === 'not-allowed' || sm.error === 'service-not-allowed'

  // Request the front camera (best-effort, video only).
  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) { if (!cancelled) setCam('off'); return }
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        setCam('on')
      } catch {
        if (!cancelled) setCam('off')
      }
    }
    start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  // Attach the stream once the <video> is mounted.
  useEffect(() => {
    if (cam !== 'on') return
    const v = videoRef.current
    const s = streamRef.current
    if (!v || !s) return
    v.srcObject = s
    v.play().catch(() => {})
  }, [cam])

  // ── Hold-to-affirm fallback (speech unsupported / mic blocked) ──
  const [progress, setProgress] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const stopHold = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    startRef.current = null
  }, [])
  const release = useCallback(() => {
    if (doneRef.current) return
    stopHold()
    setProgress(0)
  }, [stopHold])
  const tick = useCallback((now: number) => {
    if (startRef.current === null) startRef.current = now
    const pct = Math.min(1, (now - startRef.current) / HOLD_MS)
    setProgress(pct)
    if (pct >= 1) { stopHold(); finish(); return }
    rafRef.current = requestAnimationFrame(tick)
  }, [finish, stopHold])
  const press = useCallback(() => {
    if (doneRef.current) return
    startRef.current = null
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])
  useEffect(() => () => stopHold(), [stopHold])

  if (writeMode) return <WriteAffirm statement={statement} onDone={onDone} />

  const begin = () => { setStarted(true); sm.start() }
  const useSpeech = sm.supported && !micBlocked

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-6 text-center">
      {/* Camera background (mirrored) */}
      {cam === 'on' && (
        <video ref={videoRef} playsInline autoPlay muted
          className="absolute inset-0 h-full w-full -scale-x-100 object-cover opacity-90" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/15 to-black/75" />

      {/* Foreground */}
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
        <p className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-white/60">
          <Camera className="h-3.5 w-3.5" />
          {cam === 'on' ? 'Look at yourself' : 'Mirror'}
        </p>

        <p className="mt-5 text-2xl font-bold leading-snug drop-shadow-lg">
          &ldquo;
          {words.map((w, i) => {
            const status = sm.statuses[i] ?? 'pending'
            const color = !showHighlight
              ? 'text-white'
              : status === 'matched' ? 'text-green-400'
              : status === 'missed' ? 'text-amber-400'
              : 'text-white/30'
            return (
              <span key={i} className={`transition-colors duration-100 ${color}`}>
                {w}{i < words.length - 1 ? ' ' : ''}
              </span>
            )
          })}
          &rdquo;
        </p>
        {cam === 'off' && <p className="mt-3 text-xs text-white/50">Camera off — say it anyway.</p>}

        {/* ── Done ── */}
        {done ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-10 flex flex-col items-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/20 backdrop-blur-sm">
              <Check className="h-10 w-10 text-green-400" strokeWidth={3} />
            </span>
            <p className="mt-4 text-sm font-semibold text-green-400">Locked in.</p>
          </motion.div>
        ) : useSpeech ? (
          !started ? (
            // Tap to start speaking
            <div className="mt-10 flex flex-col items-center">
              <button onClick={begin} aria-label="Start"
                className="flex h-28 w-28 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm transition-transform active:scale-95">
                <Mic className="h-10 w-10 text-white" />
              </button>
              <p className="mt-6 text-sm text-white/60">Tap, then say it out loud</p>
            </div>
          ) : (
            // Listening
            <div className="mt-10 flex flex-col items-center">
              <span className="relative flex h-28 w-28 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
                <motion.span aria-hidden className="absolute inset-0 rounded-full bg-violet-400/25"
                  animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0.15, 0.5] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} />
                <Mic className="relative z-10 h-10 w-10 text-violet-200" />
              </span>
              <p className="mt-6 text-sm text-white/60">Say it like you mean it…</p>
              <button onClick={finish} className="mt-4 text-sm font-medium text-white/50 transition-colors hover:text-white/80">
                Lock it in anyway
              </button>
            </div>
          )
        ) : (
          // ── Hold-to-affirm fallback ──
          <>
            <button
              onPointerDown={press}
              onPointerUp={release}
              onPointerLeave={release}
              onPointerCancel={release}
              aria-label="Hold to affirm"
              className="relative mt-10 flex h-32 w-32 touch-none select-none items-center justify-center rounded-full"
            >
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="6" />
                <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - progress)} />
              </svg>
              <motion.span animate={{ scale: 1 + progress * 0.08 }}
                className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full bg-white/15 px-2 text-xs font-semibold text-white backdrop-blur-sm">
                Hold to affirm
              </motion.span>
            </button>
            <p className="mt-6 text-sm text-white/60">{micBlocked ? 'Mic blocked — affirm it anyway.' : 'Say it like you mean it.'}</p>
          </>
        )}

        {!done && (
          <button onClick={() => setWriteMode(true)} className="mt-5 text-xs font-medium text-white/50 underline-offset-2 hover:text-white/80 hover:underline">
            Write instead
          </button>
        )}
      </div>
    </div>
  )
}
