'use client'

// Reveals a line of text one word at a time, with longer, natural pauses after
// punctuation, so an affirmation / vision lands with meaning instead of being
// skimmed past. Calls onComplete once the final word has landed — text-forward
// scenes (Identity, Vision) use that to gate their action until it's been read.
// Renders inline so the line still wraps naturally.

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'

const WORD_MS = 360

// Extra beat after a word, by its trailing punctuation — a full stop / ellipsis
// lands harder than a comma, a comma harder than nothing.
function pauseAfter(word: string): number {
  if (/[.…!?]+["”'’)]?$/.test(word)) return 650
  if (/[,;:]+["”'’)]?$/.test(word)) return 340
  return 0
}

export default function RevealText({
  text,
  onComplete,
  className = '',
}: {
  text: string
  onComplete?: () => void
  className?: string
}) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text])
  const [shown, setShown] = useState(0)

  // Restart the reveal if the line changes.
  useEffect(() => {
    setShown(0)
  }, [text])

  useEffect(() => {
    if (shown >= words.length) {
      if (shown > 0) onComplete?.()
      return
    }
    const justShown = shown > 0 ? words[shown - 1] : ''
    const delay = shown === 0 ? 320 : WORD_MS + pauseAfter(justShown)
    const t = setTimeout(() => setShown((n) => n + 1), delay)
    return () => clearTimeout(t)
    // onComplete intentionally omitted — fires once when the line finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, words])

  return (
    <p className={className}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          initial={false}
          animate={{ opacity: i < shown ? 1 : 0.14 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          {w}
          {i < words.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </p>
  )
}
