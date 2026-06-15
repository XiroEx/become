// Client-side helper for the async AI routes. POSTs a task route, which returns
// a runId immediately, then polls /api/ai/run/<runId> until the run finishes.
// Every individual request is short, so nothing trips the ~15s edge proxy cap
// even though the graph itself takes ~30–40s.
//
// Routes that answer immediately (the vision stubs, or a fallback when the graph
// can't be triggered) return a body with NO runId — those are passed straight
// back. Callers always keep a deterministic fallback for ok:false / null.

export interface AiTaskResult {
  ok: boolean
  /** Structured-task payload (mind plan, workout session/program, flow steps…). */
  result?: unknown
  /** Freeform reply text. */
  text?: string
  /** Present on immediate fallback/vision responses. */
  reply?: string
  unavailable?: boolean
  fallback?: boolean
  error?: string
}

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}`,
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Run an AI task end-to-end from the client. Returns the normalized result, or
 * { ok:false } on any failure/timeout (caller falls back deterministically).
 */
export async function runAiTask(
  endpoint: string,
  body: Record<string, unknown>,
  opts: { timeoutMs?: number; pollMs?: number; signal?: AbortSignal } = {},
): Promise<AiTaskResult> {
  const timeoutMs = opts.timeoutMs ?? 120_000
  const pollMs = opts.pollMs ?? 2_000
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: opts.signal,
    })
    const started = await res.json().catch(() => null) as
      | { runId?: string; ok?: boolean; reply?: string; unavailable?: boolean; fallback?: boolean; result?: unknown; text?: string }
      | null
    if (!started) return { ok: false, error: 'bad_response' }

    // Immediate response (no async run): vision stub, fallback, or inline result.
    if (!started.runId) {
      return {
        ok: !!started.ok,
        result: started.result,
        text: started.text,
        reply: started.reply,
        unavailable: started.unavailable,
        fallback: started.fallback,
      }
    }

    // Async: poll the run until terminal or timeout.
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      await sleep(pollMs)
      if (opts.signal?.aborted) return { ok: false, error: 'aborted' }
      let snap: { status?: string; ok?: boolean; result?: unknown; text?: string; error?: string } | null = null
      try {
        const r = await fetch(`/api/ai/run/${encodeURIComponent(started.runId)}`, {
          headers: authHeaders(),
          signal: opts.signal,
        })
        snap = await r.json().catch(() => null)
      } catch {
        continue // transient — keep polling
      }
      if (!snap || snap.status === 'pending') continue
      if (snap.status === 'failed') return { ok: false, error: snap.error ?? 'run_failed' }
      // completed
      return { ok: !!snap.ok, result: snap.result, text: snap.text, error: snap.error }
    }
    return { ok: false, error: 'timeout' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown_error' }
  }
}
