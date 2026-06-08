'use client'

// Composes useSpeechRecognition + the pure matcher into the piece the affirm
// scenes (and the Mind Lab tester) consume: per-word matched flags for live
// karaoke highlight, a running ratio, and a one-shot `passed` once the ratio
// crosses the threshold. Matched flags are STICKY — interim-result flicker never
// un-lights a word that was already spoken.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSpeechRecognition } from './useSpeechRecognition'
import { matchSpeech, normalizeWords } from '@/lib/mind/speechMatch'

export interface UseSpeechMatch {
  supported: boolean
  api: 'SpeechRecognition' | 'webkitSpeechRecognition' | null
  listening: boolean
  error: string | null
  transcript: string
  /** Sticky per-word matched flags, aligned to the target's normalized words. */
  matched: boolean[]
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
    matched, targetWords, matchedCount, ratio, passed,
    start, stop, reset,
  }
}
