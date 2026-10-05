/**
 * ─── IMPORT FROM TEXT 3/4: THE SESSIONS-HUB → BUILDER HANDOFF (NP-243) ──────
 *
 * The Sessions hub's Import button (`sessions.tsx`) opens the paste sheet
 * (`PasteImportSheet.tsx`) in place; on a successful import it has nowhere
 * to put the resolved draft except a route param, and `router.push` params
 * must stay serializable — a `DraftExercise[]` is not something worth
 * round-tripping through a URL. This is a tiny in-memory relay instead, the
 * same shape as the quick-session stash (`@/lib/quickSession/store`) but
 * deliberately simpler: ONE pending draft, taken exactly once, so a cold
 * re-entry into the builder (deep link, reload) never replays a stale import.
 *
 * `sessions.tsx` calls `setImportedSessionDraft` right before
 * `router.push('/(tabs)/programming/quick/build')`; `quick/build.tsx` calls
 * `takeImportedSessionDraft` once on mount and passes the result straight
 * through as `SessionBuilder`'s `initialDraft` prop.
 */

import type { DraftExercise } from "@become/core";

export interface ImportedSessionDraft {
  title: string;
  exercises: DraftExercise[];
  /** Parsed names with no exact library match — shown so the member can add them by hand. */
  unresolved?: string[];
}

let pendingDraft: ImportedSessionDraft | null = null;

/** Stashes the resolved import, overwriting any draft never taken. */
export function setImportedSessionDraft(draft: ImportedSessionDraft): void {
  pendingDraft = draft;
}

/** Returns the pending draft and clears it — taken exactly once. */
export function takeImportedSessionDraft(): ImportedSessionDraft | null {
  const draft = pendingDraft;
  pendingDraft = null;
  return draft;
}
