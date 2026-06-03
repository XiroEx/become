'use client'

// Speak scene — say the declaration out loud. Hold the orb to record (a live
// waveform reacts to your voice), release and it plays YOUR voice back to you.
// No speech recognition (that's flaky cross-platform) — the power is in saying it
// and hearing yourself. Degrades gracefully to a "say it, then hold" beat when
// the mic is unavailable or denied. Renders inside the player's black stage.

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Mic, Check, Play, RotateCcw } from 'lucide-react'
import type { SceneProps } from '@/lib/mind/moves'
import WriteAffirm from './WriteAffirm'

type Phase = 'idle' | 'recording' | 'review' | 'fallback' | 'fallback-hold'
const MIN_RECORD_MS = 900
const FALLBACK_HOLD_MS = 2600

const BARS = 5

export default function SpeakScene({ move, onDone }: SceneProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [writeMode, setWriteMode] = useState(false) // "prefer to write it?" escape
  const [level, setLevel] = useState(0) // 0..1 live mic level
  const [holdPct, setHoldPct] = useState(0) // fallback hold progress

  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const acRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const holdRafRef = useRef<number | null>(null)
  const holdStartRef = useRef<number | null>(null)

  const supported =
    typeof window !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder !== 'undefined'

  const stopMeter = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }, [])

  const teardown = useCallback(() => {
    stopMeter()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    acRef.current?.close().catch(() => {})
    acRef.current = null
  }, [stopMeter])

  useEffect(() => {
    return () => {
      teardown()
      if (holdRafRef.current !== null) cancelAnimationFrame(holdRafRef.current)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      audioRef.current?.pause()
    }
  }, [teardown])

  const startRec = useCallback(async () => {
    if (phase !== 'idle' && phase !== 'review') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Live level meter via an analyser.
      const AC: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ac = new AC()
      acRef.current = ac
      const src = ac.createMediaStreamSource(stream)
      const analyser = ac.createAnalyser()
      analyser.fftSize = 256
      src.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const loop = () => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 3.2))
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)

      chunksRef.current = []
      const rec = new MediaRecorder(stream)
      recRef.current = rec
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        stopMeter()
        setLevel(0)
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        const url = URL.createObjectURL(blob)
        urlRef.current = url
        const audio = new Audio(url)
        audioRef.current = audio
        setPhase('review')
        audio.play().catch(() => {})
        teardown()
      }
      rec.start()
      startedAtRef.current = performance.now()
      setPhase('recording')
    } catch {
      teardown()
      setPhase('fallback')
    }
  }, [phase, stopMeter, teardown])

  const stopRec = useCallback(() => {
    if (phase !== 'recording') return
    const held = performance.now() - startedAtRef.current
    const rec = recRef.current
    if (!rec) {
      teardown()
      setPhase('idle')
      return
    }
    if (held < MIN_RECORD_MS) {
      // Too short to count — discard and reset.
      try {
        rec.ondataavailable = null
        rec.onstop = null
        rec.stop()
      } catch {
        /* ignore */
      }
      teardown()
      chunksRef.current = []
      setLevel(0)
      setPhase('idle')
      return
    }
    try {
      rec.stop()
    } catch {
      teardown()
      setPhase('idle')
    }
  }, [phase, teardown])

  const replay = useCallback(() => {
    audioRef.current?.play().catch(() => {})
  }, [])

  const recordAgain = useCallback(() => {
    audioRef.current?.pause()
    setPhase('idle')
  }, [])

  // ── Fallback hold (no mic): hold while you say it out loud. ──
  const beginFallbackHold = useCallback(() => {
    setPhase('fallback-hold')
    holdStartRef.current = null
    const tick = (now: number) => {
      if (holdStartRef.current === null) holdStartRef.current = now
      const pct = Math.min(1, (now - holdStartRef.current) / FALLBACK_HOLD_MS)
      setHoldPct(pct)
      if (pct >= 1) {
        setTimeout(onDone, 500)
        return
      }
      holdRafRef.current = requestAnimationFrame(tick)
    }
    holdRafRef.current = requestAnimationFrame(tick)
  }, [onDone])

  const endFallbackHold = useCallback(() => {
    if (holdPct >= 1) return
    if (holdRafRef.current !== null) cancelAnimationFrame(holdRafRef.current)
    holdRafRef.current = null
    holdStartRef.current = null
    setHoldPct(0)
    setPhase('fallback')
  }, [holdPct])

  const recording = phase === 'recording'
  const scale = recording ? 1 + level * 0.22 : 1

  // "Prefer to write it?" — release the mic and switch to the typed alternative.
  const goWrite = () => {
    teardown()
    audioRef.current?.pause()
    setWriteMode(true)
  }
  if (writeMode) return <WriteAffirm statement={move.statement} onDone={onDone} />

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-white/40">
        <Mic className="h-3.5 w-3.5" />
        {move.title}
      </p>
      <p className="mt-5 max-w-sm text-2xl font-bold leading-snug text-white">&ldquo;{move.statement}&rdquo;</p>

      {/* ── Review: you can hear yourself back ── */}
      {phase === 'review' ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-10 flex w-full max-w-xs flex-col items-center">
          <p className="text-sm text-white/60">That&apos;s your voice. Believe it.</p>
          <button
            onClick={replay}
            className="mt-5 flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white/90 transition-colors hover:bg-white/20"
          >
            <Play className="h-4 w-4 fill-current" /> Hear it again
          </button>
          <button
            onClick={onDone}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95"
          >
            <Check className="h-5 w-5" strokeWidth={3} /> Lock it in
          </button>
          <button onClick={recordAgain} className="mt-3 flex items-center gap-1.5 text-sm font-medium text-white/40 transition-colors hover:text-white/70">
            <RotateCcw className="h-4 w-4" /> Say it again
          </button>
        </motion.div>
      ) : phase === 'fallback' || phase === 'fallback-hold' ? (
        // ── No-mic fallback: hold while you say it ──
        <div className="mt-12 flex flex-col items-center">
          <button
            onPointerDown={beginFallbackHold}
            onPointerUp={endFallbackHold}
            onPointerLeave={endFallbackHold}
            onPointerCancel={endFallbackHold}
            aria-label="Hold while you say it"
            className="relative flex h-32 w-32 touch-none select-none items-center justify-center rounded-full"
          >
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="#4ade80"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 54}
                strokeDashoffset={2 * Math.PI * 54 * (1 - holdPct)}
              />
            </svg>
            <span className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full bg-white/10 px-2 text-xs font-semibold text-white/80">
              Hold &amp; say it
            </span>
          </button>
          <p className="mt-6 max-w-xs text-sm text-white/40">Mic off — say it out loud and hold the circle.</p>
        </div>
      ) : (
        // ── Idle / recording: hold-to-record orb with a live waveform ──
        <div className="mt-12 flex flex-col items-center">
          <button
            onPointerDown={() => void startRec()}
            onPointerUp={stopRec}
            onPointerLeave={stopRec}
            onPointerCancel={stopRec}
            aria-label="Hold to record"
            className="relative flex h-36 w-36 touch-none select-none items-center justify-center rounded-full"
          >
            {/* Pulsing recording halo */}
            {recording && (
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full bg-red-500/20"
                animate={{ scale: 1 + level * 0.5, opacity: 0.4 + level * 0.4 }}
                transition={{ duration: 0.08 }}
              />
            )}
            <motion.span
              animate={{ scale }}
              transition={{ duration: 0.08 }}
              className={`relative z-10 flex h-28 w-28 items-center justify-center rounded-full ${
                recording ? 'bg-gradient-to-br from-red-500/50 to-rose-500/30 ring-2 ring-red-400/60' : 'bg-white/10'
              }`}
            >
              {recording ? (
                // Live waveform bars
                <span className="flex items-end gap-1">
                  {Array.from({ length: BARS }).map((_, i) => {
                    const mid = Math.abs(i - (BARS - 1) / 2)
                    const h = 8 + level * 34 * (1 - mid * 0.22)
                    return <span key={i} className="w-1.5 rounded-full bg-white" style={{ height: `${h}px` }} />
                  })}
                </span>
              ) : (
                <Mic className="h-9 w-9 text-white/80" />
              )}
            </motion.span>
          </button>
          <p className="mt-6 text-sm text-white/40">{recording ? 'Keep going… release when done' : 'Hold to record'}</p>
          {!supported && phase === 'idle' && (
            <button onClick={() => setPhase('fallback')} className="mt-3 text-xs font-medium text-white/40 underline-offset-2 hover:underline">
              No mic? Say it out loud instead
            </button>
          )}
          {phase === 'idle' && (
            <button onClick={goWrite} className="mt-3 text-xs font-medium text-white/40 underline-offset-2 hover:underline">
              Prefer to write it?
            </button>
          )}
        </div>
      )}
    </div>
  )
}
