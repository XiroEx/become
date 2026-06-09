'use client'

// Composes useSpeechRecognition + the pure matcher into the piece the affirm
// scenes (and the Mind Lab tester) consume: per-word matched flags for live
// karaoke highlight, a running ratio, and a one-shot `passed` once the ratio
// crosses the threshold. Matched flags are STICKY — interim-result flicker never
// un-lights a word that was already spoken.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSpeechRecognition } from './useSpeechRecognition'
import { matchSpeech, normalizeWords } from '@/lib/mind/speechMatch'

/** Per-word visual state for optimistic highlighting:
 * - `matched`: spoken (green). Once `passed`, the whole line reads matched.
 * - `missed`: behind the spoken frontier but never caught (amber) — skipped/flubbed.
 * - `pending`: not reached yet (dim). */
export type WordStatus = 'matched' | 'missed' | 'pending'

export interface UseSpeechMatch {
  supported: boolean
  api: 'SpeechRecognition' | 'webkitSpeechRecognition' | null
  listening: boolean
  error: string | null
  transcript: string
  /** Sticky per-word matched flags, aligned to the target's normalized words. */
  matched: boolean[]
  /** Optimistic per-word status, aligned to the target's normalized words. */
  statuses: WordStatus[]
  /** The target's normalized words (same length as `matched`). */
  targetWords: string[]
  matchedCount: number
  ratio: number
  passed: boolean
  start: () => void
  stop: () => void
  reset: () => void
}

export function useSpeechMatch(
  target: string,
  opts?: { threshold?: number; lang?: string; onPassed?: () => void },
): UseSpeechMatch {
  const threshold = opts?.threshold ?? 0.7
  const { supported, api, listening, transcript, error, start, stop, reset: resetRec } =
    useSpeechRecognition({ lang: opts?.lang })

  const targetWords = normalizeWords(target)
  const [matched, setMatched] = useState<boolean[]>(() => targetWords.map(() => false))
  const passedRef = useRef(false)
  const onPassedRef = useRef(opts?.onPassed)
  onPassedRef.current = opts?.onPassed

  // Reset sticky state whenever the target changes.
  useEffect(() => {
    setMatched(normalizeWords(target).map(() => false))
    passedRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  // Fold each new transcript into the sticky matched flags (OR — never un-light).
  useEffect(() => {
    if (!transcript) return
    const r = matchSpeech(target, transcript)
    setMatched((prev) => r.matched.map((m, i) => m || prev[i] || false))
  }, [transcript, target])

  const matchedCount = matched.reduce((n, m) => n + (m ? 1 : 0), 0)
  const ratio = matched.length ? matchedCount / matched.length : 0
  const passed = ratio >= threshold && matched.length > 0

  // Optimistic statuses: green up to the furthest spoken word PLUS a look-ahead
  // glow of the next couple words (so the highlight leads your voice instead of
  // trailing it); amber only for words genuinely skipped BEHIND the frontier; dim
  // for words still out ahead. Once passed, the whole line reads matched.
  const LOOKAHEAD = 2
  const frontier = matched.reduce((acc, m, i) => (m ? i : acc), -1)
  const glowTo = frontier >= 0 ? frontier + LOOKAHEAD : -1
  const statuses: WordStatus[] = matched.map((m, i) => {
    if (passed || m) return 'matched'
    if (i > frontier && i <= glowTo) return 'matched' // optimistic look-ahead
    if (i < frontier) return 'missed' // skipped behind the frontier
    return 'pending'
  })

  // Fire onPassed once when we cross the threshold.
  useEffect(() => {
    if (passed && !passedRef.current) {
      passedRef.current = true
      onPassedRef.current?.()
    }
  }, [passed])

  const reset = useCallback(() => {
    resetRec()
    setMatched(normalizeWords(target).map(() => false))
    passedRef.current = false
  }, [resetRec, target])

  return {
    supported, api, listening, error, transcript,
    matched, statuses, targetWords, matchedCount, ratio, passed,
    start, stop, reset,
  }
}
