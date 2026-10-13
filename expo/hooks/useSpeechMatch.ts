import { useCallback, useEffect, useRef, useState } from "react";
import { matchSpeech, normalizeWords } from "@become/core";
import { useSpeechRecognition } from "./useSpeechRecognition";

/** Per-word visual state for optimistic highlighting:
 * - `matched`: spoken (green). Once `passed`, the whole line reads matched.
 * - `missed`: behind the spoken frontier but never caught (amber) — skipped/flubbed.
 * - `pending`: not reached yet (dim).
 */
export type WordStatus = "matched" | "missed" | "pending";

export interface UseSpeechMatch {
  supported: boolean;
  api: "SpeechRecognition" | "webkitSpeechRecognition" | null;
  listening: boolean;
  error: string | null;
  transcript: string;
  /** Sticky per-word matched flags, aligned to the target's normalized words. */
  matched: boolean[];
  /** Optimistic per-word status, aligned to the target's normalized words. */
  statuses: WordStatus[];
  /** The target's normalized words (same length as `matched`). */
  targetWords: string[];
  matchedCount: number;
  ratio: number;
  passed: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useSpeechMatch(
  target: string,
  opts?: { threshold?: number; lang?: string; onPassed?: () => void },
): UseSpeechMatch {
  const threshold = opts?.threshold ?? 0.7;
  const targetWords = normalizeWords(target);

  const {
    supported,
    api,
    listening,
    transcript,
    error,
    start,
    stop,
    reset: resetRec,
  } = useSpeechRecognition({
    lang: opts?.lang,
    contextualStrings: targetWords,
  });

  const [matched, setMatched] = useState<boolean[]>(() =>
    targetWords.map(() => false),
  );
  const passedRef = useRef(false);
  const onPassedRef = useRef(opts?.onPassed);

  useEffect(() => {
    onPassedRef.current = opts?.onPassed;
  });

  // Reset sticky state whenever the target changes
  const [prevTarget, setPrevTarget] = useState(target);
  if (target !== prevTarget) {
    setPrevTarget(target);
    setMatched(targetWords.map(() => false));
  }

  // Fold each new transcript into sticky matched flags (OR — never un-light).
  useEffect(() => {
    if (!transcript) return;
    const r = matchSpeech(target, transcript);
    // Syncs sticky per-word matches from incoming native speech recognition transcript updates
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMatched((prev) => r.matched.map((m, i) => m || prev[i] || false));
  }, [transcript, target]);

  const matchedCount = matched.reduce((n, m) => n + (m ? 1 : 0), 0);
  const ratio = matched.length ? matchedCount / matched.length : 0;
  const frontier = matched.reduce((acc, m, i) => (m ? i : acc), -1);

  // Pass needs BOTH most of the words said AND the speaker to have actually
  // reached the END of the line — otherwise it "finishes" mid-sentence.
  const tail = matched.length > 6 ? 2 : 1;
  const reachedEnd = matched.length > 0 && frontier >= matched.length - tail;
  const passed = matched.length > 0 && ratio >= threshold && reachedEnd;

  // Optimistic statuses: green up to the furthest spoken word PLUS a look-ahead
  // glow of the next couple words; amber only for words genuinely skipped BEHIND the frontier;
  // dim for words still out ahead. Once passed, the whole line reads matched.
  const LOOKAHEAD = 2;
  const glowTo = frontier >= 0 ? frontier + LOOKAHEAD : -1;
  const statuses: WordStatus[] = matched.map((m, i) => {
    if (passed || m) return "matched";
    if (i > frontier && i <= glowTo) return "matched";
    if (i < frontier) return "missed";
    return "pending";
  });

  // Fire onPassed once when we cross the threshold.
  useEffect(() => {
    if (passed && !passedRef.current) {
      passedRef.current = true;
      onPassedRef.current?.();
    }
  }, [passed]);

  const reset = useCallback(() => {
    resetRec();
    setMatched(normalizeWords(target).map(() => false));
    passedRef.current = false;
  }, [resetRec, target]);

  return {
    supported,
    api,
    listening,
    error,
    transcript,
    matched,
    statuses,
    targetWords,
    matchedCount,
    ratio,
    passed,
    start,
    stop,
    reset,
  };
}
