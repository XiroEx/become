// Client helpers for opening a quick session from the calendar / history:
//  - continueQuickSession: rebuild the draft from its log and return the overview
//    href (stashed under its OWN sessionId, so finishing consumes the same log).

import { stashQuickSessionWithId, quickSessionOverviewHref } from './store'
import { isFocusKey, type DraftExercise } from './types'
import { normalizeTracking } from '@/lib/workout/tracking'

interface SessionSet { reps?: number | null; duration?: number | null }
interface SessionExercise {
  name: string
  exerciseSlug?: string
  trackingType?: string
  sets?: SessionSet[]
  groupId?: string
  groupType?: string
  groupLabel?: string
  groupRounds?: number
  addedAdHoc?: boolean
  prescription?: { sets?: number; reps?: string; duration?: string; rest?: string; trackingType?: string }
}
interface QuickSessionResponse {
  session?: {
    sessionId?: string
    title?: string
    focus?: string
    exercises?: SessionExercise[]
  }
}

export async function continueQuickSession(sessionId: string): Promise<string | null> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const res = await fetch(`/api/workouts/session?id=${encodeURIComponent(sessionId)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
    if (!res.ok) return null
    const data = (await res.json()) as QuickSessionResponse
    const s = data.session
    if (!s) return null
    const exercises: DraftExercise[] = (s.exercises ?? []).map((ex) => {
      const first = ex.sets?.[0]
      const isTime = !!first && first.duration != null && first.reps == null
      const p = ex.prescription
      return {
        exerciseSlug: ex.exerciseSlug || '',
        name: ex.name,
        // The endpoint resolves this now (prescription, else the catalog, else
        // what the sets imply) — inventing 'reps' here is what left a resumed
        // session with no weight box.
        trackingType: normalizeTracking(ex.trackingType || p?.trackingType || (isTime ? 'time' : undefined)),
        sets: p?.sets ?? (ex.sets?.length || 1),
        reps: p?.reps ?? (first?.reps != null ? String(first.reps) : ''),
        ...(p?.duration ? { duration: p.duration } : first?.duration != null ? { duration: String(first.duration) } : {}),
        ...(p?.rest ? { rest: p.rest } : {}),
        // A superset built mid-session is part of the session, not a detail of
        // one run of it — reopening has to bring it back.
        ...(ex.groupId ? { groupId: ex.groupId } : {}),
        ...(ex.groupType ? { groupType: ex.groupType } : {}),
        ...(ex.groupLabel ? { groupLabel: ex.groupLabel } : {}),
        ...(ex.groupRounds ? { groupRounds: ex.groupRounds } : {}),
        ...(ex.addedAdHoc ? { addedAdHoc: true } : {}),
      }
    })
    stashQuickSessionWithId(
      { title: s.title || 'Quick Session', ...(isFocusKey(s.focus) ? { focus: s.focus } : {}), exercises },
      sessionId,
    )
    // The draft uses the same id as this in-progress server log, so edits must
    // write back instead of stopping at localStorage.
    return quickSessionOverviewHref(sessionId, { saved: true })
  } catch {
    return null
  }
}
