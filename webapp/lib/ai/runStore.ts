// Durable AI run store — the app-level owner of every in-flight generation.
//
// THE PROBLEM IT SOLVES: graph runs take ~30-40s. If the poll lives inside a
// component, closing the modal / navigating away throws away the runId and the
// result is lost even though the run finished server-side. This store owns the
// polling at the app level: a run started here keeps going regardless of which
// screen is mounted, its runId + final result are persisted to localStorage
// (redbtn only retains run state for ~1h, so we capture the result the moment it
// lands), and any component can (re)subscribe to a run by id — so you can leave a
// generation, go elsewhere, come back, and it's either still cooking or done and
// waiting for you.
//
// Reconnect strategy (grounded in the redbtn run API): short-poll GET
// /api/ai/run/<runId>. It's a single Redis read, effectively unthrottled, and
// survives the ~15s edge proxy cap (each request is sub-second). SSE isn't usable
// from this origin (EventSource can't send our Bearer PAT), so polling is the
// durable backbone.

export type RunStatus = 'pending' | 'done' | 'error'

export interface RunRecord {
  runId: string
  endpoint: string
  kind: string
  label: string
  status: RunStatus
  result?: unknown
  text?: string
  error?: string
  startedAt: number
  updatedAt: number
  /** Surface-specific payload (e.g. conversation key, focus) for reattachment. */
  meta?: Record<string, unknown>
  /** Background runs (e.g. mind session pre-composition) — tracked + persisted
   *  but kept OUT of the global activity indicator so they don't toast. */
  silent?: boolean
}

const LS_KEY = 'become.ai.runs.v1'
const PRUNE_MS = 2 * 60 * 60 * 1000 // drop records older than 2h
const POLL_MS = 2000
const RUN_TIMEOUT_MS = 180_000

type Listener = () => void

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}`,
  }
}

const isBrowser = typeof window !== 'undefined'

class RunStore {
  private runs = new Map<string, RunRecord>()
  private listeners = new Set<Listener>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private snapshotCache: RunRecord[] = []
  private dirty = true

  constructor() {
    if (isBrowser) {
      this.load()
      // Resume any run that was mid-flight when the app was last closed.
      for (const r of this.runs.values()) {
        if (r.status === 'pending') this.poll(r.runId)
      }
      this.prune()
    }
  }

  // ── Subscription (for useSyncExternalStore) ────────────────────────────────
  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  getSnapshot = (): RunRecord[] => {
    if (this.dirty) {
      this.snapshotCache = Array.from(this.runs.values()).sort((a, b) => b.startedAt - a.startedAt)
      this.dirty = false
    }
    return this.snapshotCache
  }

  getServerSnapshot = (): RunRecord[] => EMPTY

  getRun(runId: string | null | undefined): RunRecord | undefined {
    return runId ? this.runs.get(runId) : undefined
  }

  /** Records still generating — drives the global activity indicator. */
  activeRuns(): RunRecord[] {
    return this.getSnapshot().filter((r) => r.status === 'pending')
  }

  private emit() {
    this.dirty = true
    this.persist()
    for (const l of this.listeners) l()
  }

  // ── Persistence ────────────────────────────────────────────────────────────
  private load() {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (!raw) return
      const arr = JSON.parse(raw) as RunRecord[]
      for (const r of arr) if (r && r.runId) this.runs.set(r.runId, r)
    } catch { /* ignore corrupt cache */ }
  }

  private persist() {
    if (!isBrowser) return
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(Array.from(this.runs.values())))
    } catch { /* quota / disabled — non-fatal */ }
  }

  private prune() {
    const now = Date.now()
    let changed = false
    for (const [id, r] of this.runs) {
      if (now - r.startedAt > PRUNE_MS) { this.runs.delete(id); changed = true }
    }
    if (changed) this.emit()
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  /**
   * Trigger a generation. Returns the runId (or a synthetic id for an immediate
   * response). The run is tracked + persisted; the caller can subscribe by id.
   * Returns null only if the POST itself fails outright.
   */
  async start(
    endpoint: string,
    body: Record<string, unknown>,
    opts: { kind: string; label: string; meta?: Record<string, unknown>; silent?: boolean },
  ): Promise<string | null> {
    let started: { runId?: string; ok?: boolean; reply?: string; text?: string; result?: unknown; unavailable?: boolean; fallback?: boolean } | null = null
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
      started = await res.json().catch(() => null)
    } catch {
      return null
    }
    if (!started) return null

    const now = Date.now()
    // Immediate response (vision stub / fallback / inline result) → store as terminal.
    if (!started.runId) {
      const id = `imm_${now}_${Math.floor(now % 100000)}`
      this.runs.set(id, {
        runId: id, endpoint, kind: opts.kind, label: opts.label,
        status: started.ok ? 'done' : 'error',
        result: started.result, text: started.text ?? started.reply,
        error: started.ok ? undefined : (started.unavailable ? 'unavailable' : 'fallback'),
        startedAt: now, updatedAt: now, meta: opts.meta, silent: opts.silent,
      })
      this.emit()
      return id
    }

    const rec: RunRecord = {
      runId: started.runId, endpoint, kind: opts.kind, label: opts.label,
      status: 'pending', startedAt: now, updatedAt: now, meta: opts.meta, silent: opts.silent,
    }
    this.runs.set(rec.runId, rec)
    this.emit()
    this.poll(rec.runId)
    return rec.runId
  }

  /** Start a run and resolve when it finishes (still durable + tracked meanwhile). */
  async startAndWait(
    endpoint: string,
    body: Record<string, unknown>,
    opts: { kind: string; label: string; meta?: Record<string, unknown>; silent?: boolean },
  ): Promise<RunRecord | null> {
    const id = await this.start(endpoint, body, opts)
    if (!id) return null
    return this.waitFor(id)
  }

  /** Resolve when a tracked run reaches a terminal state. */
  waitFor(runId: string): Promise<RunRecord | null> {
    const existing = this.runs.get(runId)
    if (existing && existing.status !== 'pending') return Promise.resolve(existing)
    return new Promise((resolve) => {
      const unsub = this.subscribe(() => {
        const r = this.runs.get(runId)
        if (!r) { unsub(); resolve(null) }
        else if (r.status !== 'pending') { unsub(); resolve(r) }
      })
    })
  }

  private poll(runId: string) {
    if (this.timers.has(runId)) return // already polling
    const tick = async () => {
      const rec = this.runs.get(runId)
      if (!rec || rec.status !== 'pending') { this.clearTimer(runId); return }
      if (Date.now() - rec.startedAt > RUN_TIMEOUT_MS) {
        this.update(runId, { status: 'error', error: 'timeout' })
        this.clearTimer(runId)
        return
      }
      try {
        const res = await fetch(`/api/ai/run/${encodeURIComponent(runId)}`, { headers: authHeaders() })
        const snap = await res.json().catch(() => null) as
          | { status?: string; ok?: boolean; result?: unknown; text?: string; error?: string } | null
        if (snap && snap.status && snap.status !== 'pending') {
          if (snap.status === 'failed') this.update(runId, { status: 'error', error: snap.error ?? 'run_failed' })
          else this.update(runId, { status: snap.ok ? 'done' : 'error', result: snap.result, text: snap.text, error: snap.ok ? undefined : (snap.error ?? 'task_failed') })
          this.clearTimer(runId)
          return
        }
      } catch { /* transient — keep polling */ }
      this.timers.set(runId, setTimeout(tick, POLL_MS))
    }
    this.timers.set(runId, setTimeout(tick, POLL_MS))
  }

  private clearTimer(runId: string) {
    const t = this.timers.get(runId)
    if (t) { clearTimeout(t); this.timers.delete(runId) }
  }

  private update(runId: string, patch: Partial<RunRecord>) {
    const r = this.runs.get(runId)
    if (!r) return
    this.runs.set(runId, { ...r, ...patch, updatedAt: Date.now() })
    this.emit()
  }

  /** Forget a run once its result has been consumed by the UI. */
  remove(runId: string) {
    this.clearTimer(runId)
    if (this.runs.delete(runId)) this.emit()
  }
}

const EMPTY: RunRecord[] = []

// Singleton across the app (HMR-safe in dev).
const g = globalThis as unknown as { __becomeRunStore?: RunStore }
export const runStore: RunStore = g.__becomeRunStore ?? (g.__becomeRunStore = new RunStore())
