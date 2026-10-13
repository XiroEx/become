'use client'

// Discipline scene — today's challenge. Fetches the server-generated daily
// challenge, lets the user complete it (grants +20 XP via /api/mind/discipline)
// or skip. Renders inside the player's black full-screen stage.

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sword, Check, ArrowRight, Loader2 } from 'lucide-react'
import type { SceneProps } from '@/lib/mind/moves'

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}`,
  }
}

export default function ChallengeScene({ move, onDone, preview }: SceneProps) {
  const [text, setText] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [justDone, setJustDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/mind/discipline?tz=${new Date().getTimezoneOffset()}`, { headers: authHeaders() })
        if (res.ok) {
          const data = (await res.json()) as { challenge?: { challenge?: string; completed?: boolean } }
          if (!cancelled) {
            setText(data.challenge?.challenge ?? 'Do one hard thing today, on purpose.')
            setCompleted(!!data.challenge?.completed)
          }
        } else if (!cancelled) {
          setText('Do one hard thing today, on purpose.')
        }
      } catch {
        if (!cancelled) setText('Do one hard thing today, on purpose.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const markDone = async () => {
    if (submitting || completed) return
    setSubmitting(true)
    if (!preview) {
      try {
        await fetch('/api/mind/discipline', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ action: 'complete', tz: new Date().getTimezoneOffset() }),
        })
      } catch {
        /* best-effort */
      }
    }
    setJustDone(true)
    setTimeout(() => onDone({ q: "Today's hard thing", a: text ?? '' }), 1100)
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15">
        <Sword className="h-6 w-6 text-red-300" />
      </span>
      <p className="text-xs uppercase tracking-widest text-white/40">{move.title}</p>

      {loading ? (
        <Loader2 className="mt-8 h-6 w-6 animate-spin text-white/40" />
      ) : (
        <AnimatePresence mode="wait">
          {justDone ? (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mt-6 flex flex-col items-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-amber-500">
                <Check className="h-8 w-8" strokeWidth={3} />
              </span>
              <p className="mt-4 text-lg font-bold">That&apos;s a rep.</p>
              <p className="mt-1 text-sm text-green-300">+20 XP</p>
            </motion.div>
          ) : (
            <motion.div key="task" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex w-full max-w-sm flex-col items-center">
              <p className="mt-5 text-xl font-semibold leading-relaxed text-white">{text}</p>
              {completed ? (
                <>
                  <p className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-green-300">
                    <Check className="h-4 w-4" /> Already done today
                  </p>
                  <button onClick={() => onDone()} className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95">
                    Continue <ArrowRight className="h-5 w-5" />
                  </button>
                </>
              ) : (
                <div className="mt-9 flex w-full flex-col gap-3">
                  <button
                    onClick={markDone}
                    disabled={submitting}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95 disabled:opacity-60"
                  >
                    {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                    I did it
                  </button>
                  <button onClick={() => onDone()} className="text-sm font-medium text-white/40 transition-colors hover:text-white/70">
                    Not today
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  )
}
