'use client'

// Mirror scene — look at yourself while you affirm it. Opens the front camera
// (mirrored) with the statement overlaid; press-and-hold to lock it in. If the
// camera is unavailable or denied, it degrades gracefully to a no-video affirm.
// Renders inside the player's black full-screen stage.

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Camera } from 'lucide-react'
import type { SceneProps } from '@/lib/mind/moves'

const HOLD_MS = 1800
const RADIUS = 52
const CIRC = 2 * Math.PI * RADIUS

type CamState = 'pending' | 'on' | 'off'

export default function MirrorScene({ move, onDone }: SceneProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cam, setCam] = useState<CamState>('pending')

  const [progress, setProgress] = useState(0)
  const [affirmed, setAffirmed] = useState(false)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const affirmedRef = useRef(false)

  // Request the front camera (best-effort).
  useEffect(() => {
    let cancelled = false
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          if (!cancelled) setCam('off')
          return
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
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

  const stopHold = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    startRef.current = null
  }, [])

  const release = useCallback(() => {
    if (affirmedRef.current) return
    stopHold()
    setProgress(0)
  }, [stopHold])

  const tick = useCallback(
    (now: number) => {
      if (startRef.current === null) startRef.current = now
      const pct = Math.min(1, (now - startRef.current) / HOLD_MS)
      setProgress(pct)
      if (pct >= 1) {
        affirmedRef.current = true
        setAffirmed(true)
        stopHold()
        streamRef.current?.getTracks().forEach((t) => t.stop())
        setTimeout(onDone, 800)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    },
    [onDone, stopHold],
  )

  const press = useCallback(() => {
    if (affirmedRef.current) return
    startRef.current = null
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  useEffect(() => () => stopHold(), [stopHold])

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-6 text-center">
      {/* Camera background (mirrored) */}
      {cam === 'on' && (
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full -scale-x-100 object-cover opacity-60"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/70" />

      {/* Foreground */}
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
        <p className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-white/60">
          <Camera className="h-3.5 w-3.5" />
          {cam === 'on' ? 'Look at yourself' : 'Mirror'}
        </p>
        <p className="mt-5 text-2xl font-bold leading-snug text-white drop-shadow-lg">&ldquo;{move.statement}&rdquo;</p>
        {cam === 'off' && (
          <p className="mt-3 text-xs text-white/50">Camera off — affirm it anyway.</p>
        )}

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
            <circle
              cx="60"
              cy="60"
              r={RADIUS}
              fill="none"
              stroke={affirmed ? '#4ade80' : '#fff'}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - progress)}
            />
          </svg>
          <motion.span
            animate={{ scale: affirmed ? 1 : 1 + progress * 0.08 }}
            className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm"
          >
            {affirmed ? (
              <Check className="h-9 w-9 text-green-400" strokeWidth={3} />
            ) : (
              <span className="px-2 text-xs font-semibold text-white">Hold to affirm</span>
            )}
          </motion.span>
        </button>
        <p className="mt-6 text-sm text-white/60">{affirmed ? 'Locked in.' : 'Say it like you mean it.'}</p>
      </div>
    </div>
  )
}
