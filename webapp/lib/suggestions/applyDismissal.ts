// Pure dismissal upsert. Extracted from the API route so the idempotency
// rule (no duplicates; re-dismiss updates dismissedAt) can be unit-tested
// without spinning up MongoDB.

import type { DismissedSuggestion } from './types'

export interface ApplyDismissalResult {
  next: DismissedSuggestion[]
  wasUpdate: boolean
}

export function applyDismissal(
  existing: DismissedSuggestion[],
  id: string,
  now: Date,
): ApplyDismissalResult {
  const idx = existing.findIndex((d) => d.id === id)
  if (idx === -1) {
    return { next: [...existing, { id, dismissedAt: now }], wasUpdate: false }
  }
  // Idempotent: replace the existing entry's dismissedAt rather than appending.
  const next = existing.slice()
  next[idx] = { id, dismissedAt: now }
  return { next, wasUpdate: true }
}
