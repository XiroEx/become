import type { StoredQuickSession } from './store'

type RenameFetch = (
  input: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>

interface PersistSourceRenameOptions {
  session: StoredQuickSession
  title: string
  token?: string | null
  fetcher?: RenameFetch
}

/**
 * Persist the name of a historical quick session that was reopened as a safe
 * repeat. The repeat deliberately has a new sessionId; sourceSessionId points
 * back to the log whose title the member is editing.
 *
 * This endpoint changes only the title. It must not send the repeat's new id,
 * completion state, or empty draft sets over the historical workout.
 */
export async function persistSourceQuickSessionRename({
  session,
  title,
  token,
  fetcher = fetch,
}: PersistSourceRenameOptions): Promise<boolean> {
  const nextTitle = title.trim()
  if (!session.sourceSessionId || nextTitle === session.title.trim()) return false

  const res = await fetcher('/api/workouts/session', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ id: session.sourceSessionId, title: nextTitle }),
  })

  if (!res.ok) {
    let message = 'Failed to rename session'
    try {
      const data = await res.json() as { error?: unknown }
      if (typeof data.error === 'string' && data.error) message = data.error
    } catch {
      // Keep the stable fallback when the server did not return JSON.
    }
    throw new Error(message)
  }

  return true
}
