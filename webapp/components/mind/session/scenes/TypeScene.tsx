'use client'

// Type scene — write the declaration out yourself, word for word. Active recall:
// as each word matches it lights up; you can't move on until the whole line is
// typed. Punctuation and case are forgiving. Renders inside the player's black
// full-screen stage.

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Keyboard, Check, ArrowRight } from 'lucide-react'
import type { SceneProps } from '@/lib/mind/moves'

// Normalize for comparison. Drop ALL apostrophes (straight ' AND curly ' that iOS
// auto-inserts) so "won't" / "won't" / "wont" all match — otherwise smart quotes
// silently broke the match and stranded the user. Then strip other punctuation.
function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[‘’ʼ'`]/g, '') // apostrophes → removed (unify variants)
    .replace(/[^\w\s]/g, ' ') // other punctuation → space
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

export default function TypeScene({ move, onDone }: SceneProps) {
  const statement = (move.statement ?? '').trim()
  const displayWords = useMemo(() => statement.split(/\s+/).filter(Boolean), [statement])
  const targetWords = useMemo(() => words(statement), [statement])

  const [text, setText] = useState('')
  const [locked, setLocked] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const advancedRef = useRef(false) // schedule the auto-advance exactly once

  // Count how many leading words match in order.
  const typed = useMemo(() => words(text), [text])
  const matched = useMemo(() => {
    let n = 0
    while (n < typed.length && n < targetWords.length && typed[n] === targetWords[n]) n++
    return n
  }, [typed, targetWords])

  const complete = matched === targetWords.length && typed.length === targetWords.length
  // A typed word that doesn't line up with the target (helps them self-correct).
  const hasError = typed.length > matched

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Auto-advance once the line is complete. Guarded by a ref + depending ONLY on
  // `complete` so setting `locked` doesn't re-run this effect and cancel the timer
  // (that bug stranded users on the "done" screen). Manual Continue below too.
  useEffect(() => {
    if (!complete || advancedRef.current) return
    advancedRef.current = true
    setLocked(true)
    const t = setTimeout(onDone, 1100)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete])

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15">
        <Keyboard className="h-6 w-6 text-violet-300" />
      </span>

      <AnimatePresence mode="wait">
        {locked ? (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-green-500">
              <Check className="h-8 w-8" strokeWidth={3} />
            </span>
            <p className="mt-4 text-lg font-bold">In your own hand.</p>
            <p className="mt-1 max-w-xs text-sm text-white/50">You wrote it. Now own it.</p>
            <button
              onClick={onDone}
              className="mt-8 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-bold text-black transition-transform active:scale-95"
            >
              Continue <ArrowRight className="h-5 w-5" />
            </button>
          </motion.div>
        ) : (
          <motion.div key="entry" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex w-full max-w-sm flex-col items-center">
            <p className="text-xs uppercase tracking-widest text-white/40">{move.title}</p>

            {/* The target line, lighting up word-by-word as it's typed correctly. */}
            <p className="mt-5 text-xl font-bold leading-snug">
              {displayWords.map((w, i) => (
                <span key={i} className={i < matched ? 'text-green-300' : 'text-white/25'}>
                  {w}
                  {i < displayWords.length - 1 ? ' ' : ''}
                </span>
              ))}
            </p>

            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder="Type it here…"
              className={`mt-6 w-full resize-none rounded-2xl border bg-white/5 p-4 text-center text-base text-white placeholder-white/30 focus:outline-none ${
                hasError ? 'border-red-400/50' : 'border-white/15 focus:border-white/40'
              }`}
            />
            <p className="mt-3 text-xs text-white/40">
              {hasError ? 'Almost — check the last word.' : `${matched} / ${targetWords.length}`}
            </p>
            <button onClick={onDone} className="mt-5 text-sm font-medium text-white/40 transition-colors hover:text-white/70">
              Skip
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
