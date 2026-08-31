// Client-side handoff for launching a quick session into the live workout
// engine. The live route is the existing [programId]/workout/live with the
// sentinel programId `quick`; the DraftSession is too big for a query string, so
// we stash it in sessionStorage keyed by a freshly-minted sessionId and pass
// only the id in the URL. The live client reads it back, runs the workout, and
// saves with kind:'quick' + that sessionId.

import type { DraftExercise, DraftSession } from './types'

export const QUICK_PROGRAM_ID = 'quick'

const KEY_PREFIX = 'quick_session_'

export interface StoredQuickSession extends DraftSession {
  sessionId: string
  /** Explicit lifecycle state. Automatic titles can sound meaningful, so the
   * title text alone cannot tell whether the member chose a name. */
  needsName?: boolean
  /** Server log this repeat was copied from. Kept separate from sessionId so
   *  completing the repeat cannot overwrite the historical workout. */
  sourceSessionId?: string
  /** Carried over from a favorited source session so repeating it doesn't
   *  silently drop the star — see openQuickSession call sites. */
  favorite?: boolean
}

interface StashQuickSessionOptions {
  sourceSessionId?: string
  needsName?: boolean
  favorite?: boolean
}

function genId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch {
    /* fall through */
  }
  // Fallback id — sessionStorage-scoped, collision risk is negligible here.
  return `qs_${Math.abs(hashStr(String(typeof performance !== 'undefined' ? performance.now() : 0)))}_${KEY_PREFIX.length}`
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

/** Persist a draft session and return its sessionId (used in the live URL). */
export function stashQuickSession(session: DraftSession, options?: StashQuickSessionOptions): string {
  const sessionId = genId()
  const payload: StoredQuickSession = {
    ...session,
    sessionId,
    ...(options?.needsName !== undefined ? { needsName: options.needsName } : {}),
    ...(options?.sourceSessionId ? { sourceSessionId: options.sourceSessionId } : {}),
    ...(options?.favorite ? { favorite: true } : {}),
  }
  try {
    // localStorage (not sessionStorage) so a generated session survives closing
    // the live view / tab and can be re-opened from its overview — it used to
    // vanish on close with no way back in.
    localStorage.setItem(KEY_PREFIX + sessionId, JSON.stringify(payload))
  } catch {
    /* storage full / unavailable — the live client falls back gracefully */
  }
  return sessionId
}

/**
 * Persist a draft under a SPECIFIC id (used to resume/start a planned session by
 * its existing sessionId, so completing it updates the same log — consuming the
 * plan — rather than creating a new one).
 */
export function stashQuickSessionWithId(
  session: DraftSession,
  sessionId: string,
  options?: Pick<StashQuickSessionOptions, 'needsName'>,
): string {
  const payload: StoredQuickSession = {
    ...session,
    sessionId,
    ...(options?.needsName !== undefined ? { needsName: options.needsName } : {}),
  }
  try {
    localStorage.setItem(KEY_PREFIX + sessionId, JSON.stringify(payload))
  } catch {
    /* storage unavailable — live client falls back gracefully */
  }
  return sessionId
}

/**
 * Persist an exercise swap into the stashed quick session so BOTH the Track and Live
 * views (which build their exercise list from this stash on load) reflect the swap.
 * Replaces the exercise identity at exIdx, preserving its sets/reps/rest prescription.
 */
export function swapQuickSessionExercise(
  sessionId: string,
  exIdx: number,
  next: {
    name: string
    exerciseSlug?: string
    trackingType?: string
    primaryMuscles?: string[]
    /** Always passed by the caller (possibly []) so a swap fully replaces the
     *  old exercise's catalog metadata rather than leaving stale values —
     *  e.g. swapping a dumbbell row for a bodyweight one must drop `equipment`,
     *  not just skip setting the new one. */
    equipment?: string[]
    laterality?: string
    movementPatterns?: string[]
  },
): void {
  const s = readQuickSession(sessionId)
  if (!s || !Array.isArray(s.exercises) || !s.exercises[exIdx]) return
  const exercises = s.exercises.map((ex, i) => {
    if (i !== exIdx) return ex
    const patched = { ...ex, name: next.name }
    if (next.exerciseSlug !== undefined) patched.exerciseSlug = next.exerciseSlug
    if (next.trackingType) patched.trackingType = next.trackingType
    if (next.primaryMuscles) patched.primaryMuscles = next.primaryMuscles
    if (next.equipment !== undefined) patched.equipment = next.equipment
    if (next.laterality !== undefined) patched.laterality = next.laterality
    if (next.movementPatterns !== undefined) patched.movementPatterns = next.movementPatterns
    return patched
  })
  stashQuickSessionWithId({ ...(s as DraftSession), exercises }, sessionId)
}

/** Read back a stashed session by id (null if missing/corrupt). */
export function readQuickSession(sessionId: string): StoredQuickSession | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + sessionId)
      // Back-compat: older drafts were stashed in sessionStorage.
      ?? (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(KEY_PREFIX + sessionId) : null)
    if (!raw) return null
    return JSON.parse(raw) as StoredQuickSession
  } catch {
    return null
  }
}

/**
 * Overwrite a stashed session's title/exercises in place, keeping its id.
 *
 * Backs the overview's edit mode. Kept separate from stashQuickSessionWithId so
 * the intent reads at the call site — this is "the user changed this session",
 * not "start this plan".
 */
export function updateQuickSession(
  sessionId: string,
  patch: { title?: string; exercises?: DraftExercise[] },
): StoredQuickSession | null {
  const current = readQuickSession(sessionId)
  if (!current) return null
  const next: StoredQuickSession = {
    ...current,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    // Saving a non-empty title in the editor is an explicit naming action.
    ...(patch.title !== undefined ? { needsName: !patch.title.trim() } : {}),
    ...(patch.exercises !== undefined ? { exercises: patch.exercises } : {}),
  }
  try {
    localStorage.setItem(KEY_PREFIX + sessionId, JSON.stringify(next))
  } catch {
    /* storage unavailable — the caller still gets the updated object back */
  }
  return next
}

/** Remove a stashed session (call once it's completed). */
export function clearQuickSession(sessionId: string): void {
  try { localStorage.removeItem(KEY_PREFIX + sessionId) } catch { /* ignore */ }
  try { sessionStorage.removeItem(KEY_PREFIX + sessionId) } catch { /* ignore */ }
}

/**
 * The overview ("regular view") URL for a stashed quick session.
 *
 * `saved` marks a session that already exists server-side under this exact
 * sessionId (a planned session). The overview uses it to decide whether editing
 * should write back to that log — for an unsaved draft it must not, or the edit
 * would insert a stray log nobody asked for.
 *
 * `date` (a local YYYY-MM-DD) pre-fills the overview's Log/Plan date — used
 * when the session was started from a specific day on the Calendar, so the
 * user isn't left to re-pick a date the app already knew.
 */
export function quickSessionOverviewHref(
  sessionId: string,
  opts?: { saved?: boolean; started?: boolean; date?: string },
): string {
  const q = [
    `session=${encodeURIComponent(sessionId)}`,
    ...(opts?.saved ? ['saved=1'] : []),
    ...(opts?.started ? ['started=1'] : []),
    ...(opts?.date ? [`date=${encodeURIComponent(opts.date)}`] : []),
  ].join('&')
  return `/dashboard/workout/quick-session?${q}`
}

/** The live route URL for a stashed quick session. */
export function quickSessionLiveHref(sessionId: string): string {
  return `/dashboard/workout/${QUICK_PROGRAM_ID}/workout/live?session=${encodeURIComponent(sessionId)}`
}

/** The Track (form) route URL for a stashed quick session — the non-immersive,
 *  per-set logging view, mirroring a program's workout form. Shares progress with
 *  the live view via lib/quickSession/progress. */
export function quickSessionTrackHref(sessionId: string): string {
  return `/dashboard/workout/${QUICK_PROGRAM_ID}/workout?session=${encodeURIComponent(sessionId)}`
}
