// A client-generated id for ONE attempt at a program workout, sent on every
// save of that attempt so the server can recognise a save it has already
// applied. It is the program-workout analogue of the quick session's
// `sessionId`, and it is what makes a completing save safe to REPLAY: an
// offline queue (or a slow retry) can send it again after the member's local
// midnight, where neither of the server's date windows matches any more, and
// POST /api/workouts updates the same log instead of inserting a second
// completed one and running the completion side effects twice.
//
// Stored rather than held in component state on purpose: the Track view, the
// Live view and a page reload mid-workout are all the same attempt, and all
// three must send the same id.

import { IN_PROGRESS_WINDOW_MS } from '@/lib/dayWindow'

const KEY_PREFIX = 'workout_attempt_'

function storageKey(programId: string, day: string): string {
  return `${KEY_PREFIX}${programId}_${day}`
}

function genId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch {
    /* fall through */
  }
  return `wa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

interface StoredAttempt {
  id: string
  startedAt: number
}

function readStored(key: string): StoredAttempt | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredAttempt>
    if (typeof parsed?.id !== 'string' || !parsed.id) return null
    if (typeof parsed.startedAt !== 'number') return null
    return { id: parsed.id, startedAt: parsed.startedAt }
  } catch {
    return null
  }
}

/**
 * The id of the attempt in progress at `programId` / `day`, minting and
 * storing one when there is no fresh one. Stable across autosaves, the
 * completing save, a retry of it, a flip between Track and Live, and a reload.
 *
 * Bounded by the same rolling window the server continues an open log within
 * (IN_PROGRESS_WINDOW_MS): an id older than that belongs to an attempt the
 * server would no longer continue either, so reusing it could attach today's
 * workout to a stale log instead of starting a new one. A finished workout
 * clears its id outright — see clearWorkoutAttemptId.
 */
export function workoutAttemptId(programId: string, day: string, now: number = Date.now()): string {
  if (typeof window === 'undefined') return genId()
  const key = storageKey(programId, day)
  const stored = readStored(key)
  if (stored && now - stored.startedAt < IN_PROGRESS_WINDOW_MS) return stored.id

  const fresh: StoredAttempt = { id: genId(), startedAt: now }
  try {
    localStorage.setItem(key, JSON.stringify(fresh))
  } catch {
    /* storage full / disabled — the id still travels with this save */
  }
  return fresh.id
}

/**
 * Forget the attempt id for a program day. Called once the server has accepted
 * a COMPLETING save: the next workout on this day label is a new attempt and
 * must never reuse the finished one's id, or its first save would be read as a
 * replay and rewrite the previous log.
 */
export function clearWorkoutAttemptId(programId: string, day: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(storageKey(programId, day))
  } catch {
    /* ignore */
  }
}
