'use client'

// Win scene — bank one win. Logs to /api/mind/wins (evidence for the self-image
// system). Renders inside the player's black full-screen stage.

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Trophy, Check, Loader2 } from 'lucide-react'
import type { SceneProps } from '@/lib/mind/moves'

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}`,
  }
}

export default function WinScene({ move, onDone, preview }: SceneProps) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)
  const valid = text.trim().length >= 3

  const save = async () => {
    if (!valid || submitting) return
    setSubmitting(true)
    if (!preview) {
      try {
        await fetch('/api/mind/wins', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ win: text.trim(), tz: new Date().getTimezoneOffset() }),
        })
      } catch {
        /* best-effort */
      }
    }
    setSaved(true)
    setTimeout(onDone, 1100)
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15">
        <Trophy className="h-6 w-6 text-amber-300" />
      </span>

      <AnimatePresence mode="wait">
        {saved ? (
          <motion.div key="saved" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-green-500">
              <Check className="h-8 w-8" strokeWidth={3} />
            </span>
            <p className="mt-4 text-lg font-bold">Logged.</p>
            <p className="mt-1 text-sm text-white/50">That&apos;s evidence of who you&apos;re becoming.</p>
          </motion.div>
        ) : (
          <motion.div key="entry" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex w-full max-w-sm flex-col items-center">
            <h1 className="text-2xl font-extrabold">{move.title}</h1>
            <p className="mt-2 text-white/50">{move.prompt ?? 'Name one thing you did today.'}</p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              rows={3}
              placeholder="I…"
              className="mt-6 w-full resize-none rounded-2xl border border-white/15 bg-white/5 p-4 text-center text-base text-white placeholder-white/30 focus:border-white/40 focus:outline-none"
            />
            <button
              onClick={save}
              disabled={!valid || submitting}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95 disabled:opacity-40"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trophy className="h-5 w-5" />}
              Bank it
            </button>
            <button onClick={onDone} className="mt-3 text-sm font-medium text-white/40 transition-colors hover:text-white/70">
              Skip
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
