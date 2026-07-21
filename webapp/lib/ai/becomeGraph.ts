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
  | 'mindSuggestActions'
  | 'mind.generateFlow'
  | 'workout.generateSession'
  | 'workout.generateProgram'
  // vision (multimodal Gemini)
  | 'nutrition.plateEstimate'
  | 'nutrition.productFind'
  // structured text → plate estimate (describe a meal / correct a prior estimate)
  | 'nutrition.describeEstimate'

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
  /** Short-lived user token the graph forwards to the Become MCP/data tools so
   *  it can pull this user's data on demand (read-scoped). Lands in run state. */
  userToken?: string
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

export type RunStatus = 'pending' | 'completed' | 'failed'

export interface RunSnapshot {
  status: RunStatus
  ok?: boolean
  result?: unknown
  text?: string
  error?: string
}

/**
 * Trigger a graph run and return its runId IMMEDIATELY (~130–500ms). Used by the
 * async route pattern: the route triggers, returns the runId to the client, and
 * the client polls /api/ai/run/<runId> — so no single HTTP request is ever held
 * open long enough to hit the edge proxy's ~15s timeout. Never throws.
 */
export async function triggerBecomeTask(
  task: BecomeTask,
  context: string | Record<string, unknown>,
  opts: RunBecomeOptions = {},
): Promise<{ ok: true; runId: string } | { ok: false; error: string }> {
  const secret = process.env.BECOME_AI_WEBHOOK_SECRET
  if (!secret) return { ok: false, error: 'missing_webhook_secret' }
  try {
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
          ...(opts.userToken ? { userToken: opts.userToken } : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      },
    )
    if (!triggerRes.ok) return { ok: false, error: `trigger_http_${triggerRes.status}` }
    const trigger = (await triggerRes.json()) as { ok?: boolean; runId?: string }
    if (!trigger.runId) return { ok: false, error: 'no_run_id' }
    return { ok: true, runId: trigger.runId }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown_error' }
  }
}

/**
 * Read a single run's current state (~<1s). Returns 'pending' while the run is
 * in flight OR on any transient read error (the caller keeps polling against its
 * own deadline), 'completed' with the normalized result, or 'failed'.
 */
export async function fetchBecomeRun(runId: string): Promise<RunSnapshot> {
  const readToken = process.env.BECOME_AI_READBACK_TOKEN
  if (!readToken) return { status: 'failed', error: 'missing_readback_token' }
  try {
    const res = await fetch(`${BASE}/api/runs/${encodeURIComponent(runId)}`, {
      headers: { Authorization: `Bearer ${readToken}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return { status: 'pending' } // transient — keep polling
    const state = (await res.json()) as RunState
    if (!TERMINAL.has(state.status)) return { status: 'pending' }
    if (state.status !== 'completed') return { status: 'failed', error: `run_${state.status}` }
    const data = state.output?.data ?? {}
    const br = (data.becomeResponse ?? data.result) as BecomeResponse | undefined
    if (br && br.ok) {
      return {
        status: 'completed',
        ok: true,
        result: br.result ?? (data.taskResult as unknown) ?? undefined,
        text: br.text ?? (data.responseText as string) ?? undefined,
      }
    }
    return {
      status: 'completed',
      ok: false,
      error: (br as { error?: string } | undefined)?.error ?? 'task_failed',
    }
  } catch {
    return { status: 'pending' } // transient read error — keep polling
  }
}

/**
 * Blocking trigger→poll convenience. Holds the call until the run finishes, so
 * use it ONLY for fast tasks (the vision stubs return in ~5s, under the edge
 * timeout). Slow tasks MUST use the async trigger/fetch pattern instead. Never
 * throws — resolves to a fallback-friendly result.
 */
export async function runBecomeTask(
  task: BecomeTask,
  context: string | Record<string, unknown>,
  opts: RunBecomeOptions = {},
): Promise<RunBecomeResult> {
  const trig = await triggerBecomeTask(task, context, opts)
  if (!trig.ok) return { ok: false, error: trig.error }

  const deadline = Date.now() + (opts.timeoutMs ?? 120_000)
  const pollIntervalMs = opts.pollIntervalMs ?? 800
  while (Date.now() < deadline) {
    await sleep(pollIntervalMs)
    const s = await fetchBecomeRun(trig.runId)
    if (s.status === 'pending') continue
    if (s.status === 'failed') return { ok: false, error: s.error ?? 'run_failed' }
    if (s.ok) return { ok: true, result: s.result, text: s.text }
    return { ok: false, error: s.error ?? 'task_failed' }
  }
  return { ok: false, error: 'timeout' }
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
