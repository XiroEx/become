'use client'

// Vision scene — see your future self. Reads the user's own Vision (identity
// statement + dimensions) and has them take it in. If no vision is set yet, it
// nudges them to build one. Renders inside the player's black full-screen stage.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, ArrowRight, Loader2, Check } from 'lucide-react'
import type { SceneProps } from '@/lib/mind/moves'
import RevealText from '../RevealText'

interface Vision {
  identityStatement?: string
  habits?: string
  mind?: string
  body?: string
  relationships?: string
  environment?: string
  completedAt?: string
}

const DIM_LABELS: { key: keyof Vision; label: string }[] = [
  { key: 'habits', label: 'Habits' },
  { key: 'mind', label: 'Mind' },
  { key: 'body', label: 'Body' },
  { key: 'relationships', label: 'Relationships' },
  { key: 'environment', label: 'Environment' },
]

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}` }
}

export default function VisionScene({ move, onDone }: SceneProps) {
  const [vision, setVision] = useState<Vision | null>(null)
  const [loading, setLoading] = useState(true)
  const [locked, setLocked] = useState(false)
  const [ready, setReady] = useState(false) // statement fully revealed → can lock in

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/mind/vision', { headers: authHeaders() })
        if (res.ok) {
          const data = (await res.json()) as { vision?: Vision | null }
          if (!cancelled) setVision(data.vision ?? null)
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const hasVision = !!(vision && (vision.completedAt || vision.identityStatement))
  const statement = vision?.identityStatement || move.statement
  const dims = DIM_LABELS.filter((d) => (vision?.[d.key] as string | undefined)?.trim())

  // Reveal speed: keep the comfortable default for short visions, but ramp it
  // faster the longer the statement gets (so a 6+ sentence vision doesn't crawl).
  // RevealText `speed` is a delay multiplier — <1 is faster.
  const sentenceCount = (statement || '').split(/[.!?]+/).filter((s) => s.trim()).length
  const revealSpeed = sentenceCount > 3 ? Math.max(0.45, 1 - (sentenceCount - 3) * 0.15) : 1

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    )
  }

  if (!hasVision) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
        <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15">
          <Sparkles className="h-6 w-6 text-amber-300" />
        </span>
        <h1 className="text-2xl font-extrabold">Paint your vision</h1>
        <p className="mt-2 max-w-xs text-white/50">A picture of your best self, clear enough to pull you forward.</p>
        <Link
          href="/dashboard/mind/vision"
          className="mt-8 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-white/10 py-3.5 text-sm font-semibold text-white"
        >
          Build your vision <ArrowRight className="h-4 w-4" />
        </Link>
        <button onClick={() => onDone()} className="mt-3 text-sm font-medium text-white/40 transition-colors hover:text-white/70">
          Skip
        </button>
      </div>
    )
  }

  const lockIn = () => {
    if (locked) return
    setLocked(true)
    // Report the vision they locked in. Every other core beat reports something;
    // without this, an `envision` day could collect nothing at all and the closing
    // reflection had nothing to read, so it silently did not render.
    setTimeout(() => onDone(statement ? { q: 'The future self I locked in on', a: statement } : undefined), 900)
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15">
        <Sparkles className="h-6 w-6 text-amber-300" />
      </span>
      <p className="text-xs uppercase tracking-widest text-white/40">See your future self</p>
      {statement ? (
        <RevealText
          text={`“${statement}”`}
          onComplete={() => setReady(true)}
          speed={revealSpeed}
          className="mt-4 max-w-sm text-2xl font-bold leading-snug text-white"
        />
      ) : null}

      <AnimatePresence>
        {(ready || !statement) && (
          <motion.div
            key="vision-action"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="flex w-full flex-col items-center"
          >
            {dims.length > 0 && (
              <div className="mt-6 w-full max-w-sm space-y-1.5 text-left">
                {dims.slice(0, 3).map((d) => (
                  <p key={d.key} className="text-sm text-white/55">
                    <span className="font-semibold text-white/80">{d.label}:</span> {vision?.[d.key] as string}
                  </p>
                ))}
              </div>
            )}

            <button
              onClick={lockIn}
              className={`mt-10 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold transition-colors active:scale-95 ${
                locked ? 'bg-gradient-to-r from-amber-500 to-green-500 text-white' : 'bg-white text-black'
              }`}
            >
              <Check className="h-5 w-5" strokeWidth={3} />
              {locked ? "That's who I'm becoming." : 'I can see it'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
