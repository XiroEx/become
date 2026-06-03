'use client'

// "Write it instead" — the typed alternative to the spoken/mirror affirmation
// modalities (Duolingo-style "can't speak now?" escape). Shows the line and lets
// the user write it (or their own version) to internalize it, then lock it in.
// Gentle: any real text counts — this is an accessibility/preference fallback,
// not the strict active-recall of the Type scene.

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Keyboard, Check } from 'lucide-react'

export default function WriteAffirm({
  statement,
  onDone,
}: {
  statement?: string
  onDone: () => void
}) {
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const valid = text.trim().length >= 3

  const lock = () => {
    if (!valid || done) return
    setDone(true)
    setTimeout(onDone, 900)
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15">
        <Keyboard className="h-6 w-6 text-violet-300" />
      </span>

      <AnimatePresence mode="wait">
        {done ? (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-green-500">
              <Check className="h-8 w-8" strokeWidth={3} />
            </span>
            <p className="mt-4 text-lg font-bold">Written in.</p>
            <p className="mt-1 text-sm text-white/50">You meant it.</p>
          </motion.div>
        ) : (
          <motion.div key="entry" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex w-full max-w-sm flex-col items-center">
            {statement && <p className="text-xl font-bold leading-snug text-white">&ldquo;{statement}&rdquo;</p>}
            <p className="mt-3 text-sm text-white/50">Write it — own words are fine.</p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              rows={3}
              placeholder="Type it…"
              className="mt-5 w-full resize-none rounded-2xl border border-white/15 bg-white/5 p-4 text-center text-base text-white placeholder-white/30 focus:border-white/40 focus:outline-none"
            />
            <button
              onClick={lock}
              disabled={!valid}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95 disabled:opacity-40"
            >
              <Check className="h-5 w-5" strokeWidth={3} />
              Lock it in
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
