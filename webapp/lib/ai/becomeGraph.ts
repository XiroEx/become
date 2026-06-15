// Become AI graph client — the SINGLE seam between the webapp and the `become-ai`
// redbtn graph. Every AI feature in the app (mind sessions, coaching chat,
// workout/program generation, nutrition consultant, plate/product vision) routes
// through one graph: caller passes a `task` discriminator + `context`; the graph
// dispatches by task family (structured | freeform | vision) and returns one
// normalized contract.
//
// SERVER-ONLY. This reads BECOME_AI_WEBHOOK_SECRET / BECOME_AI_READBACK_TOKEN
// from the environment and MUST NEVER be imported into a client bundle. The call
// is async on the graph side (POST queues a run → poll the run by id for the
// terminal result), so latency is ~30–40s per task; callers always keep a
// deterministic fallback (the graph is best-effort — a 2B model can occasionally
// drift on complex structured output).
//
// Import ONLY from server code (API route handlers). The secret + read-back
// token are non-NEXT_PUBLIC env vars, so they never reach a client bundle.

// ─── Task registry (the 12 wired paths) ──────────────────────────────────────

export type BecomeTask =
  // freeform
  | 'mind.coachReply'
  | 'mind.generateContent'
  | 'nutrition.consultant'
  | 'consultant.training'
  | 'consultant.mindset'
  | 'consultant.nutrition'
  // structured
  | 'mind.composeSession'
  | 'mind.generateFlow'
  | 'workout.generateSession'
  | 'workout.generateProgram'
  // vision (stub today — graph returns vision_not_yet_available)
  | 'nutrition.plateEstimate'
  | 'nutrition.productFind'

export interface BecomeResponse {
  ok: boolean
  task: string
  result?: unknown | null
  text?: string | null
}

export type RunBecomeResult =
  | { ok: true; result?: unknown; text?: string }
  | { ok: false; error: string }

export interface RunBecomeOptions {
  /** Overrides the registry schema for a structured task. */
  outputSchema?: unknown
  /** Vision: base64 image (data URL or raw). Routes to the vision runner. */
  image?: string
  /** Multi-turn isolation for chat-style freeform tasks. */
  conversationId?: string
  /** Total budget for the whole call (trigger + poll). Default 120s. */
  timeoutMs?: number
  /** Poll cadence while waiting for the run to finish. Default 800ms. */
  pollIntervalMs?: number
}

const BASE = process.env.BECOME_AI_BASE_URL ?? 'https://app.redbtn.io'
const WEBHOOK_ID = process.env.BECOME_AI_WEBHOOK_ID ?? 'LzbTW8D6DA9z'

/** True when the deployment is configured to reach the graph at all. */
export function becomeAiConfigured(): boolean {
  return Boolean(process.env.BECOME_AI_WEBHOOK_SECRET && process.env.BECOME_AI_READBACK_TOKEN)
}

interface RunState {
  status: string
  output?: { data?: Record<string, unknown> }
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'error'])

/**
 * Invoke the Become AI graph and return its normalized result. Never throws —
 * always resolves to `{ ok: true, ... }` or `{ ok: false, error }` so callers
 * can branch to a deterministic fallback. The secret + read-back token stay
 * server-side and are never returned.
 */
export async function runBecomeTask(
  task: BecomeTask,
  context: string | Record<string, unknown>,
  opts: RunBecomeOptions = {},
): Promise<RunBecomeResult> {
  const secret = process.env.BECOME_AI_WEBHOOK_SECRET
  const readToken = process.env.BECOME_AI_READBACK_TOKEN
  if (!secret) return { ok: false, error: 'missing_webhook_secret' }
  if (!readToken) return { ok: false, error: 'missing_readback_token' }

  const timeoutMs = opts.timeoutMs ?? 120_000
  const pollIntervalMs = opts.pollIntervalMs ?? 800
  const deadline = Date.now() + timeoutMs

  try {
    // 1. Trigger the run (secret-gated webhook). Returns immediately with a runId.
    const triggerRes = await fetch(
      `${BASE}/api/v1/webhooks/${WEBHOOK_ID}?secret=${encodeURIComponent(secret)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task,
          context,
          ...(opts.outputSchema ? { outputSchema: opts.outputSchema } : {}),
          ...(opts.image ? { image: opts.image } : {}),
          ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      },
    )
    if (!triggerRes.ok) return { ok: false, error: `trigger_http_${triggerRes.status}` }
    const trigger = (await triggerRes.json()) as { ok?: boolean; runId?: string }
    if (!trigger.runId) return { ok: false, error: 'no_run_id' }

    // 2. Poll the run until terminal (read-back is owner-authed via the PAT).
    while (Date.now() < deadline) {
      await sleep(pollIntervalMs)
      let stateRes: Response
      try {
        stateRes = await fetch(`${BASE}/api/runs/${trigger.runId}`, {
          headers: { Authorization: `Bearer ${readToken}` },
          signal: AbortSignal.timeout(10_000),
        })
      } catch {
        continue // transient read error — keep polling until the deadline
      }
      if (!stateRes.ok) continue
      const state = (await stateRes.json()) as RunState
      if (!TERMINAL.has(state.status)) continue

      if (state.status !== 'completed') return { ok: false, error: `run_${state.status}` }
      const data = state.output?.data ?? {}
      const br = (data.becomeResponse ?? data.result) as BecomeResponse | undefined
      if (br && br.ok) {
        return {
          ok: true,
          result: br.result ?? (data.taskResult as unknown) ?? undefined,
          text: br.text ?? (data.responseText as string) ?? undefined,
        }
      }
      return {
        ok: false,
        error: (br as { error?: string } | undefined)?.error ?? 'task_failed',
      }
    }
    return { ok: false, error: 'timeout' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown_error' }
  }
}

/**
 * Structured-task helper: runs the task and returns the parsed `result` typed as
 * T, or null on any failure (caller falls back to deterministic). Validates that
 * a result object actually came back.
 */
export async function runStructuredTask<T>(
  task: BecomeTask,
  context: string | Record<string, unknown>,
  opts: RunBecomeOptions = {},
): Promise<T | null> {
  const res = await runBecomeTask(task, context, opts)
  if (!res.ok || res.result == null || typeof res.result !== 'object') return null
  return res.result as T
}

/**
 * Freeform-task helper: runs the task and returns the reply text, or null on any
 * failure.
 */
export async function runFreeformTask(
  task: BecomeTask,
  context: string | Record<string, unknown>,
  opts: RunBecomeOptions = {},
): Promise<string | null> {
  const res = await runBecomeTask(task, context, opts)
  if (!res.ok || !res.text || !res.text.trim()) return null
  return res.text.trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
