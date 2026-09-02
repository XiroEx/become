// Client entry point for running an AI task. This now delegates to the DURABLE
// run store (lib/ai/runStore.ts): the generation is owned at the app level, so it
// keeps going — and shows in the global activity indicator — even if the calling
// component unmounts. runAiTask still resolves with the final result for callers
// that stay mounted; callers that need reopen/reconnect should use the store
// directly (runStore.start + useAiRun) so they can reattach by runId.

import { runStore } from './runStore'
import type { GatePayload } from '@/lib/entitlementsClient'

export interface AiTaskResult {
  ok: boolean
  result?: unknown
  text?: string
  reply?: string
  unavailable?: boolean
  fallback?: boolean
  error?: string
  /** Set (with `error: 'entitlement'`) when a tier/allowance gate refused the
   *  run. Callers raise the upgrade sheet from this instead of retrying or
   *  falling through to a deterministic path that will be refused too. */
  gate?: GatePayload
  /** The signed follow-up ticket minted for THIS outcome. Send it back as
   *  `allowanceTicket` when refining this same outcome (a correction), so the
   *  refinement spends a bounded follow-up rather than a fresh unit. */
  allowanceTicket?: string
}

// Friendly labels for the global "generating…" indicator, by endpoint.
const ENDPOINT_LABELS: Array<[RegExp, string]> = [
  [/\/consultant$/, 'Coach is replying'],
  [/\/mind\/coach$/, 'Coach is replying'],
  [/\/mind\/generate$/, 'Writing for you'],
  [/\/mind\/session$/, 'Composing your session'],
  [/\/mind\/flow$/, 'Building your flow'],
  [/\/workout\/session$/, 'Generating your session'],
  [/\/workout\/program$/, 'Generating your program'],
  [/\/workout\/import$/, 'Reading your program'],
  [/\/nutrition\/consultant$/, 'Consultant is replying'],
  [/\/nutrition\/plate$/, 'Reading your plate'],
  [/\/nutrition\/product$/, 'Looking that up'],
]

function labelFor(endpoint: string): string {
  for (const [re, label] of ENDPOINT_LABELS) if (re.test(endpoint)) return label
  return 'Generating'
}

function kindFor(endpoint: string): string {
  return endpoint.replace('/api/ai/', '').replace(/\//g, '.')
}

/**
 * Run an AI task end-to-end and resolve with the normalized result, or
 * { ok:false } on failure/timeout. The run is tracked durably regardless of the
 * caller's lifetime.
 */
export async function runAiTask(
  endpoint: string,
  body: Record<string, unknown>,
  opts: { label?: string; meta?: Record<string, unknown>; silent?: boolean } = {},
): Promise<AiTaskResult> {
  const rec = await runStore.startAndWait(endpoint, body, {
    kind: kindFor(endpoint),
    label: opts.label ?? labelFor(endpoint),
    meta: opts.meta,
    silent: opts.silent,
  })
  if (!rec) return { ok: false, error: 'start_failed' }
  return {
    ok: rec.status === 'done',
    result: rec.result,
    text: rec.text,
    reply: rec.text,
    unavailable: rec.error === 'unavailable',
    fallback: rec.error === 'fallback',
    error: rec.status === 'done' ? undefined : rec.error,
    gate: rec.gate,
    allowanceTicket: rec.allowanceTicket,
  }
}
