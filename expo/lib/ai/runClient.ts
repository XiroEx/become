/**
 * ─── NATIVE AI RUN CLIENT: START, POLL, ALLOWANCE TICKET, AND REFUSALS ───────
 *
 * App-level owner of every in-flight AI run (NP-038).
 *
 * THE THREE REFUSALS (NP-010 parity):
 *   1. ai-consent  → 403 `reason: 'ai_consent_required'` (App Store 5.1.2(i)).
 *                    Checked BEFORE the plan gate. Opens the consent sheet (NP-046).
 *                    Silent runs never raise UI.
 *   2. plan-gate   → 403 with `feature` + `requiresTier`. Opens the upgrade sheet (NP-052)
 *                    rendering `gate.error` verbatim. Silent runs never raise UI.
 *   3. rate-limited → 429 spend ceiling or cooldown. Shows a plain try-again-later line
 *                    and NEVER raises an upsell sheet.
 *
 * RULES THAT TRAVEL:
 *   • POST exactly once per member action and never retry it (the route charges on entry).
 *   • Only the poll retries on transient errors.
 *   • Polling (`GET /api/ai/run/{runId}`) never charges.
 *   • The signed follow-up ticket (`allowance.ticket`) rides the POST body and belongs
 *     strictly to the outcome it came with.
 *   • Runs are persisted durably under `become.ai.runs.v1` so backgrounding or
 *     restarting the app resumes polling.
 */

import { useSyncExternalStore } from "react";
import { AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createApiClient,
  classifyApiResponse,
  type PlanGate,
  AiStartEnvelopeSchema,
  AiPollSnapshotSchema,
  AiAllowanceSchema,
  StartEnvelopeSchema,
  PollSnapshotSchema,
  AllowanceSchema,
  type AiStartEnvelope,
  type AiPollSnapshot,
  type AiAllowance,
  type StartEnvelope,
  type PollSnapshot,
  type Allowance,
} from "@become/api-client";
import { raiseAiConsentPrompt } from "@/lib/ai/aiConsentPrompt";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { messageFor } from "@/lib/errors";
import { sessionStore } from "@/lib/auth/secureStoreToken";
import { WEBAPP_BASE_URL } from "@/lib/config";
import type { AsyncStorageLike } from "@/lib/query/persistor";

export {
  AiStartEnvelopeSchema,
  AiPollSnapshotSchema,
  AiAllowanceSchema,
  StartEnvelopeSchema,
  PollSnapshotSchema,
  AllowanceSchema,
  type AiStartEnvelope,
  type AiPollSnapshot,
  type AiAllowance,
  type StartEnvelope,
  type PollSnapshot,
  type Allowance,
};

export type RunStatus = "pending" | "done" | "error";

export interface RunRecord {
  runId: string;
  endpoint: string;
  kind: string;
  label: string;
  status: RunStatus;
  result?: unknown;
  text?: string;
  reply?: string;
  error?: string;
  /** POST status when the run never started (only set for a refusal or failure). */
  httpStatus?: number;
  /** The verbatim 403 body when an entitlement gate refused the run. */
  gate?: PlanGate;
  /**
   * The signed follow-up ticket the route minted for THIS outcome
   * (`allowance.ticket` in the POST body). Hand it back as `allowanceTicket`
   * on a request that REFINES this outcome — a plate correction — and the
   * server spends a bounded follow-up instead of a fresh unit.
   */
  allowanceTicket?: string;
  startedAt: number;
  updatedAt: number;
  /** Surface-specific payload for reattachment. */
  meta?: Record<string, unknown>;
  /** Background runs kept OUT of the global activity indicator. */
  silent?: boolean;
}

export interface StartOptions {
  kind?: string;
  label?: string;
  meta?: Record<string, unknown>;
  silent?: boolean;
  allowanceTicket?: string;
}

export interface AiTaskResult {
  ok: boolean;
  result?: unknown;
  text?: string;
  reply?: string;
  unavailable?: boolean;
  fallback?: boolean;
  error?: string;
  gate?: PlanGate;
  allowanceTicket?: string;
}

export interface RunClientConfig {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  storage: AsyncStorageLike;
  now: () => number;
  pollMs: number;
  timeoutMs: number;
}

export const LS_KEY = "become.ai.runs.v1";
export const POLL_MS = 2000;
export const RUN_TIMEOUT_MS = 180_000;
export const PRUNE_MS = 2 * 60 * 60 * 1000; // 2 hours
const EMPTY: RunRecord[] = [];

const ENDPOINT_LABELS: [RegExp, string][] = [
  [/\/consultant$/, "Coach is replying"],
  [/\/mind\/coach$/, "Coach is replying"],
  [/\/mind\/generate$/, "Writing for you"],
  [/\/mind\/session$/, "Composing your session"],
  [/\/mind\/flow$/, "Building your flow"],
  [/\/workout\/session$/, "Generating your session"],
  [/\/workout\/program$/, "Generating your program"],
  [/\/workout\/import$/, "Reading your program"],
  [/\/nutrition\/consultant$/, "Consultant is replying"],
  [/\/nutrition\/plate$/, "Reading your plate"],
  [/\/nutrition\/product$/, "Looking that up"],
];

export function labelFor(endpoint: string): string {
  for (const [re, label] of ENDPOINT_LABELS) {
    if (re.test(endpoint)) return label;
  }
  return "Generating";
}

export function kindFor(endpoint: string): string {
  return endpoint.replace("/api/ai/", "").replace(/\//g, ".");
}

type Listener = () => void;

export class RunStore {
  private runs = new Map<string, RunRecord>();
  private listeners = new Set<Listener>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private snapshotCache: RunRecord[] = [];
  private dirty = true;
  private config: RunClientConfig;
  private appStateSubscription: { remove: () => void } | null = null;
  private isLoaded = false;
  private loadPromise: Promise<void> | null = null;

  constructor(configOverrides?: Partial<RunClientConfig>) {
    this.config = {
      baseUrl: WEBAPP_BASE_URL,
      getToken: async () => {
        try {
          return await sessionStore.get();
        } catch {
          return null;
        }
      },
      fetchImpl: globalThis.fetch,
      storage: AsyncStorage,
      now: () => Date.now(),
      pollMs: POLL_MS,
      timeoutMs: RUN_TIMEOUT_MS,
      ...configOverrides,
    };

    if (typeof AppState !== "undefined" && AppState?.addEventListener) {
      try {
        const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
          if (state === "active") {
            this.resumePendingRuns(true);
          }
        });
        this.appStateSubscription = sub ?? null;
      } catch {
        // Safe in headless / test environments
      }
    }

    this.loadPromise = this.load();
  }

  configure(next: Partial<RunClientConfig>): void {
    this.config = { ...this.config, ...next };
  }

  async awaitLoaded(): Promise<void> {
    if (this.isLoaded) return;
    if (this.loadPromise) await this.loadPromise;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): RunRecord[] => {
    if (this.dirty) {
      this.snapshotCache = Array.from(this.runs.values()).sort(
        (a, b) => b.startedAt - a.startedAt,
      );
      this.dirty = false;
    }
    return this.snapshotCache;
  };

  getServerSnapshot = (): RunRecord[] => EMPTY;

  getRun(runId: string | null | undefined): RunRecord | undefined {
    return runId ? this.runs.get(runId) : undefined;
  }

  activeRuns(): RunRecord[] {
    return this.getSnapshot().filter((r) => r.status === "pending" && !r.silent);
  }

  private emit(persist = true): void {
    this.dirty = true;
    if (persist) {
      void this.persist();
    }
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Listener error must not break the store
      }
    }
  }

  private async load(): Promise<void> {
    try {
      const raw = await this.config.storage.getItem(LS_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as RunRecord[];
        if (Array.isArray(arr)) {
          for (const r of arr) {
            if (r && r.runId && !this.runs.has(r.runId)) {
              this.runs.set(r.runId, r);
            }
          }
          this.emit(false);
          for (const r of this.runs.values()) {
            if (r.status === "pending") {
              this.poll(r.runId);
            }
          }
          this.prune();
        }
      }
    } catch {
      // Ignore corrupt storage
    } finally {
      this.isLoaded = true;
    }
  }

  private async persist(): Promise<void> {
    try {
      const arr = Array.from(this.runs.values());
      await this.config.storage.setItem(LS_KEY, JSON.stringify(arr));
    } catch {
      // Storage quota or error is non-fatal
    }
  }

  private prune(): void {
    const now = this.config.now();
    let changed = false;
    for (const [id, r] of this.runs) {
      if (now - r.startedAt > PRUNE_MS) {
        this.runs.delete(id);
        this.clearTimer(id);
        changed = true;
      }
    }
    if (changed) {
      this.emit(true);
    }
  }

  private update(runId: string, patch: Partial<RunRecord>): void {
    const r = this.runs.get(runId);
    if (!r) return;
    this.runs.set(runId, { ...r, ...patch, updatedAt: this.config.now() });
    this.emit(true);
  }

  private clearTimer(runId: string): void {
    const t = this.timers.get(runId);
    if (t) {
      clearTimeout(t);
      this.timers.delete(runId);
    }
  }

  resumePendingRuns(immediate = false): void {
    for (const r of this.runs.values()) {
      if (r.status === "pending") {
        if (immediate) {
          this.clearTimer(r.runId);
          this.poll(r.runId, true);
        } else if (!this.timers.has(r.runId)) {
          this.poll(r.runId, false);
        }
      }
    }
  }

  private poll(runId: string, immediate = false): void {
    if (this.timers.has(runId)) {
      if (!immediate) return;
      this.clearTimer(runId);
    }

    const tick = async () => {
      this.timers.delete(runId);
      const rec = this.runs.get(runId);
      if (!rec || rec.status !== "pending") return;

      if (this.config.now() - rec.startedAt > this.config.timeoutMs) {
        this.update(runId, { status: "error", error: "timeout" });
        return;
      }

      try {
        const client = createApiClient({
          baseUrl: this.config.baseUrl,
          getToken: async () => (await this.config.getToken()) ?? undefined,
          fetchImpl: this.config.fetchImpl,
        });

        // Polling GET /api/ai/run/{runId} never charges
        const res = await client.raw(`/api/ai/run/${encodeURIComponent(runId)}`, {
          method: "GET",
        });

        if (res.status === 404) {
          const snap = (await res.json().catch(() => null)) as AiPollSnapshot | null;
          this.update(runId, {
            status: "error",
            error: snap?.error ?? "not_found",
          });
          return;
        }

        if (res.ok) {
          const snap = (await res.json().catch(() => null)) as AiPollSnapshot | null;
          if (snap && snap.status && snap.status !== "pending") {
            if (snap.status === "failed") {
              this.update(runId, {
                status: "error",
                error: snap.error ?? "run_failed",
              });
            } else {
              this.update(runId, {
                status: snap.ok !== false ? "done" : "error",
                result: snap.result,
                text: snap.text,
                reply: snap.text,
                error: snap.ok !== false ? undefined : (snap.error ?? "task_failed"),
              });
            }
            return;
          }
        }
      } catch {
        // Transient network error: keep polling
      }

      const timer = setTimeout(tick, this.config.pollMs);
      this.timers.set(runId, timer);
    };

    if (immediate) {
      void tick();
    } else {
      const timer = setTimeout(tick, this.config.pollMs);
      this.timers.set(runId, timer);
    }
  }

  /**
   * Trigger a generation. Returns the runId (or synthetic id for immediate responses).
   * POSTs exactly ONCE through the shared client and never retries.
   */
  async start(
    endpoint: string,
    body: Record<string, unknown>,
    opts: StartOptions = {},
  ): Promise<string | null> {
    await this.awaitLoaded();

    const now = this.config.now();
    const kind = opts.kind ?? kindFor(endpoint);
    const label = opts.label ?? labelFor(endpoint);

    const finalBody =
      opts.allowanceTicket !== undefined && body.allowanceTicket === undefined
        ? { ...body, allowanceTicket: opts.allowanceTicket }
        : body;

    let httpStatus = 0;
    let started: Record<string, unknown> | null = null;
    let resHeaders: { get: (name: string) => string | null } | null = null;

    try {
      const client = createApiClient({
        baseUrl: this.config.baseUrl,
        getToken: async () => (await this.config.getToken()) ?? undefined,
        fetchImpl: this.config.fetchImpl,
      });

      // POST exactly ONCE per member action
      const res = await client.raw(endpoint, {
        method: "POST",
        body: finalBody,
      });

      httpStatus = res.status;
      resHeaders = res.headers;
      const text = await res.text().catch(() => "");
      try {
        started = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      } catch {
        started = null;
      }
    } catch {
      return null;
    }

    const retryAfter = resHeaders?.get("Retry-After") ?? null;
    const classification = classifyApiResponse(httpStatus, started, { retryAfter });

    // 1. Consent refusal: 403 reason: 'ai_consent_required'.
    // Checked BEFORE the plan gate. Opens the consent sheet for member-started runs.
    if (classification.kind === "ai-consent") {
      if (!opts.silent) {
        raiseAiConsentPrompt(classification);
      }
      const id = `imm_${now}_consent`;
      this.runs.set(id, {
        runId: id,
        endpoint,
        kind,
        label,
        status: "error",
        error: "ai_consent",
        httpStatus,
        startedAt: now,
        updatedAt: now,
        meta: opts.meta,
        silent: true,
      });
      this.emit();
      return id;
    }

    // 2. Plan gate: 403 with feature + requiresTier.
    // Opens the upgrade sheet with the server's sentence.
    if (classification.kind === "plan-gate") {
      if (!opts.silent) {
        showUpgradeSheet(classification.gate);
      }
      const id = `imm_${now}_gate`;
      this.runs.set(id, {
        runId: id,
        endpoint,
        kind,
        label,
        status: "error",
        error: "entitlement",
        httpStatus,
        gate: classification.gate,
        startedAt: now,
        updatedAt: now,
        meta: opts.meta,
        silent: true,
      });
      this.emit();
      return id;
    }

    // 3. Rate limited: 429 spend ceiling or cooldown.
    // Shows a plain try-again-later line and NEVER opens an upsell sheet.
    if (classification.kind === "rate-limited") {
      const line = messageFor(classification);
      const id = `imm_${now}_ratelimit`;
      this.runs.set(id, {
        runId: id,
        endpoint,
        kind,
        label,
        status: "error",
        error: "rate_limited",
        text: line,
        reply: line,
        httpStatus,
        startedAt: now,
        updatedAt: now,
        meta: opts.meta,
        silent: opts.silent,
      });
      this.emit();
      return id;
    }

    // Any other 4xx/5xx status
    if (httpStatus >= 400) {
      const id = `imm_${now}_error`;
      const line = messageFor(classification);
      this.runs.set(id, {
        runId: id,
        endpoint,
        kind,
        label,
        status: "error",
        error: started?.unavailable
          ? "unavailable"
          : started?.fallback
            ? "fallback"
            : "task_failed",
        text:
          typeof started?.text === "string"
            ? started.text
            : typeof started?.reply === "string"
              ? started.reply
              : line,
        reply:
          typeof started?.reply === "string"
            ? started.reply
            : typeof started?.text === "string"
              ? started.text
              : line,
        httpStatus,
        startedAt: now,
        updatedAt: now,
        meta: opts.meta,
        silent: opts.silent,
      });
      this.emit();
      return id;
    }

    if (!started) return null;

    // Follow-up ticket captured from POST body
    const allowanceTicket =
      typeof (started.allowance as { ticket?: unknown })?.ticket === "string"
        ? (started.allowance as { ticket: string }).ticket
        : undefined;

    // Immediate response without runId
    if (!started.runId) {
      const id = `imm_${now}_${Math.floor(now % 100000)}`;
      const isOk = Boolean(started.ok);
      const text =
        typeof started.text === "string"
          ? started.text
          : typeof started.reply === "string"
            ? started.reply
            : undefined;
      const error = isOk
        ? undefined
        : started.unavailable
          ? "unavailable"
          : started.fallback
            ? "fallback"
            : started.error
              ? String(started.error)
              : "fallback";

      this.runs.set(id, {
        runId: id,
        endpoint,
        kind,
        label,
        status: isOk ? "done" : "error",
        result: started.result,
        text,
        reply: typeof started.reply === "string" ? started.reply : text,
        error,
        startedAt: now,
        updatedAt: now,
        meta: opts.meta,
        silent: opts.silent,
        allowanceTicket,
        httpStatus,
      });
      this.emit();
      return id;
    }

    // Async background run: track and poll
    const runId = String(started.runId);
    const rec: RunRecord = {
      runId,
      endpoint,
      kind,
      label,
      status: "pending",
      startedAt: now,
      updatedAt: now,
      meta: opts.meta,
      silent: opts.silent,
      allowanceTicket,
    };
    this.runs.set(runId, rec);
    this.emit();
    this.poll(runId);
    return runId;
  }

  waitFor(runId: string): Promise<RunRecord | null> {
    const existing = this.runs.get(runId);
    if (existing && existing.status !== "pending") {
      return Promise.resolve(existing);
    }
    return new Promise((resolve) => {
      const unsub = this.subscribe(() => {
        const r = this.runs.get(runId);
        if (!r) {
          unsub();
          resolve(null);
        } else if (r.status !== "pending") {
          unsub();
          resolve(r);
        }
      });
    });
  }

  async startAndWait(
    endpoint: string,
    body: Record<string, unknown>,
    opts: StartOptions = {},
  ): Promise<RunRecord | null> {
    const id = await this.start(endpoint, body, opts);
    if (!id) return null;
    return this.waitFor(id);
  }

  remove(runId: string): void {
    this.clearTimer(runId);
    if (this.runs.delete(runId)) {
      this.emit();
    }
  }

  reset(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.runs.clear();
    this.dirty = true;
    this.snapshotCache = [];
    this.emit(false);
  }

  destroy(): void {
    this.reset();
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }
}

// Global singleton instance
export const runStore = new RunStore();

export function configureAiRunClient(config: Partial<RunClientConfig>): void {
  runStore.configure(config);
}

export function resetAiRunStore(): void {
  runStore.reset();
}

/** Trigger a generation through the global runStore. */
export async function start(
  endpoint: string,
  body: Record<string, unknown>,
  opts?: StartOptions,
): Promise<string | null> {
  return runStore.start(endpoint, body, opts);
}

/**
 * Run an AI task end-to-end and resolve with normalized AiTaskResult.
 * The run is tracked durably across component lifecycles and backgrounding.
 */
export async function runAiTask(
  endpoint: string,
  body: Record<string, unknown>,
  opts: {
    label?: string;
    meta?: Record<string, unknown>;
    silent?: boolean;
    allowanceTicket?: string;
  } = {},
): Promise<AiTaskResult> {
  const rec = await runStore.startAndWait(endpoint, body, {
    kind: kindFor(endpoint),
    label: opts.label ?? labelFor(endpoint),
    meta: opts.meta,
    silent: opts.silent,
    allowanceTicket: opts.allowanceTicket,
  });
  if (!rec) return { ok: false, error: "start_failed" };
  return {
    ok: rec.status === "done",
    result: rec.result,
    text: rec.text,
    reply: rec.reply ?? rec.text,
    unavailable: rec.error === "unavailable",
    fallback: rec.error === "fallback",
    error: rec.status === "done" ? undefined : rec.error,
    gate: rec.gate,
    allowanceTicket: rec.allowanceTicket,
  };
}

/** All tracked runs (newest first). */
export function useAiRuns(): RunRecord[] {
  return useSyncExternalStore(
    runStore.subscribe,
    runStore.getSnapshot,
    runStore.getServerSnapshot,
  );
}

/** Just the in-flight runs — drives the global activity indicator. */
export function useActiveAiRuns(): RunRecord[] {
  const all = useAiRuns();
  return all.filter((r) => r.status === "pending" && !r.silent);
}

/**
 * A single run by id (or undefined), or runner controller when called with 0 arguments.
 * Re-renders as the run progresses.
 */
export function useAiRun(runId: string | null | undefined): RunRecord | undefined;
export function useAiRun(): {
  start: typeof start;
  runAiTask: typeof runAiTask;
  runs: RunRecord[];
  activeRuns: RunRecord[];
};
export function useAiRun(runId?: string | null): any {
  const all = useAiRuns();
  if (arguments.length === 0) {
    return {
      start,
      runAiTask,
      runs: all,
      activeRuns: all.filter((r) => r.status === "pending" && !r.silent),
    };
  }
  return runId ? all.find((r) => r.runId === runId) : undefined;
}
