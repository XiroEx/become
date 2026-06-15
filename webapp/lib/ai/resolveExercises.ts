// Resolve AI-generated exercise NAMES to real library exercises (by slug).
//
// Anti-slop rule: an AI exercise name that doesn't match the library is DROPPED,
// never turned into a synthetic slug. A fake slug renders a tile with no video /
// no metadata — which looks broken. Better to show only real, fully-backed
// exercises and fall back to the deterministic generator when too few resolve.
// Also dedupes (the model sometimes repeats a lift) and clamps sets/reps/rest.

import type { DraftExercise } from '@/lib/quickSession/types'

export interface AiExerciseIn {
  name?: string
  sets?: number
  reps?: string | number
  rest?: string
}

export interface ResolveResult {
  exercises: DraftExercise[]
  matched: number
  dropped: number
}

const REPS_FALLBACK = '8-12'

function clampSets(s?: number): number {
  return typeof s === 'number' && s > 0 ? Math.min(8, Math.round(s)) : 3
}
function cleanReps(r?: string | number): string {
  if (r === undefined || r === null) return REPS_FALLBACK
  const s = String(r).trim()
  return s ? s.slice(0, 16) : REPS_FALLBACK
}
function cleanRest(r?: string): string | undefined {
  if (!r) return undefined
  const s = String(r).trim()
  return s ? s.slice(0, 16) : undefined
}

interface SearchItem { slug?: string; name?: string; trackingType?: string }

/**
 * Resolve a list of AI exercises. Returns only the ones that matched a real
 * library exercise (deduped by slug), plus counts so the caller can decide
 * whether to fall back to the deterministic generator.
 */
export async function resolveAiExercises(
  aiExercises: AiExerciseIn[],
  headers: HeadersInit,
): Promise<ResolveResult> {
  const settled = await Promise.allSettled(
    (aiExercises ?? []).map(async (ai): Promise<DraftExercise | null> => {
      const name = (ai.name ?? '').trim()
      if (!name) return null
      try {
        const res = await fetch(`/api/exercises/search?q=${encodeURIComponent(name)}&limit=3`, { headers })
        if (!res.ok) return null
        const data = (await res.json()) as { exercises?: SearchItem[] }
        const m = data.exercises?.[0]
        if (!m?.slug) return null // no real match → drop (no synthetic slug)
        const rest = cleanRest(ai.rest)
        return {
          exerciseSlug: m.slug,
          name: m.name || name,
          trackingType: m.trackingType || 'reps_weight',
          sets: clampSets(ai.sets),
          reps: cleanReps(ai.reps),
          ...(rest ? { rest } : {}),
        }
      } catch {
        return null
      }
    }),
  )

  const resolved = settled.map((r) => (r.status === 'fulfilled' ? r.value : null))
  const dropped = resolved.filter((x) => x === null).length

  // Dedupe by slug — the model sometimes lists the same lift twice.
  const seen = new Set<string>()
  const exercises: DraftExercise[] = []
  for (const e of resolved) {
    if (e && !seen.has(e.exerciseSlug)) {
      seen.add(e.exerciseSlug)
      exercises.push(e)
    }
  }
  return { exercises, matched: exercises.length, dropped }
}

/** Minimum real exercises before an AI session/day is worth showing. */
export const MIN_RESOLVED_EXERCISES = 3
