// Client-side handoff for launching a quick session into the live workout
// engine. The live route is the existing [programId]/workout/live with the
// sentinel programId `quick`; the DraftSession is too big for a query string, so
// we stash it in sessionStorage keyed by a freshly-minted sessionId and pass
// only the id in the URL. The live client reads it back, runs the workout, and
// saves with kind:'quick' + that sessionId.

import type { DraftSession } from './types'

export const QUICK_PROGRAM_ID = 'quick'

const KEY_PREFIX = 'quick_session_'

export interface StoredQuickSession extends DraftSession {
  sessionId: string
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
export function stashQuickSession(session: DraftSession): string {
  const sessionId = genId()
  const payload: StoredQuickSession = { ...session, sessionId }
  try {
    sessionStorage.setItem(KEY_PREFIX + sessionId, JSON.stringify(payload))
  } catch {
    /* storage full / unavailable — the live client falls back gracefully */
  }
  return sessionId
}

/** Read back a stashed session by id (null if missing/corrupt). */
export function readQuickSession(sessionId: string): StoredQuickSession | null {
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + sessionId)
    if (!raw) return null
    return JSON.parse(raw) as StoredQuickSession
  } catch {
    return null
  }
}

/** The live route URL for a stashed quick session. */
export function quickSessionLiveHref(sessionId: string): string {
  return `/dashboard/programming/${QUICK_PROGRAM_ID}/workout/live?session=${encodeURIComponent(sessionId)}`
}
