'use client'

// React bindings for the durable AI run store. Components use these to reflect
// generation state that lives ABOVE them — so the same run renders consistently
// whether the user is on the originating screen, elsewhere in the app, or has
// just reopened a modal.

import { useSyncExternalStore } from 'react'
import { runStore, type RunRecord } from './runStore'

/** All tracked runs (newest first). */
export function useAiRuns(): RunRecord[] {
  return useSyncExternalStore(runStore.subscribe, runStore.getSnapshot, runStore.getServerSnapshot)
}

/** Just the in-flight runs — drives the global activity indicator. */
export function useActiveAiRuns(): RunRecord[] {
  const all = useAiRuns()
  return all.filter((r) => r.status === 'pending')
}

/** A single run by id (or undefined). Re-renders as it progresses. */
export function useAiRun(runId: string | null | undefined): RunRecord | undefined {
  const all = useAiRuns()
  return runId ? all.find((r) => r.runId === runId) : undefined
}
