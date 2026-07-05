// Client helpers for opening a quick session from the calendar / history:
//  - continueQuickSession: rebuild the draft from its log and return the overview
//    href (stashed under its OWN sessionId, so finishing consumes the same log).

import { stashQuickSessionWithId, quickSessionOverviewHref } from './store'
import { isFocusKey, type DraftExercise } from './types'

interface SessionSet { reps?: number | null; duration?: number | null }
interface SessionExercise { name: string; exerciseSlug?: string; sets?: SessionSet[] }
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
      return {
        exerciseSlug: ex.exerciseSlug || '',
        name: ex.name,
        trackingType: isTime ? 'time' : 'reps',
        sets: ex.sets?.length || 1,
        reps: first?.reps != null ? String(first.reps) : '',
        ...(first?.duration != null ? { duration: String(first.duration) } : {}),
      }
    })
    stashQuickSessionWithId(
      { title: s.title || 'Quick Session', ...(isFocusKey(s.focus) ? { focus: s.focus } : {}), exercises },
      sessionId,
    )
    return quickSessionOverviewHref(sessionId)
  } catch {
    return null
  }
}
