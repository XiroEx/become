/**
 * TutorialEngine — the headless core.
 *
 * Framework-free state machine that owns the tutorial registry, trigger
 * evaluation (mount / route / selector / event / manual), step lifecycle
 * (waitFor → resolve target → advanceOn), persistence (pluggable adapter,
 * debounced), global enable/disable, and mid-tutorial resume.
 *
 * React (or anything else) subscribes via `subscribe()` + `getSnapshot()`.
 */

import { isBrowser, resolveTarget, routeMatches, scrollTargetIntoView, waitForTarget } from './dom';
import type { WaitHandle } from './dom';
import { emptyProgressState, parseProgressState } from './storage';
import type {
  ActiveTutorialSnapshot,
  EngineSnapshot,
  MissingTargetBehavior,
  StartOptions,
  TutorialDefinition,
  TutorialEngineOptions,
  TutorialProgressEntry,
  TutorialStep,
  TutorialStepContext,
  TutorialStorageAdapter,
  TutorialTrigger,
} from './types';

interface ActiveRun {
  tutorial: TutorialDefinition;
  order: TutorialStep[];
  index: number;
  segment: string | null;
  element: Element | null;
  waiting: boolean;
  /** Set while auto-resuming a persisted run; softens missing-target handling. */
  resuming: boolean;
  /** Per-step cleanups (advanceOn listeners, wait handles). */
  stepCleanups: Array<() => void>;
}

interface TriggerCandidate {
  def: TutorialDefinition;
  segment: string | null;
  trigger: TutorialTrigger;
}

const noopStorage: TutorialStorageAdapter = { get: () => null, set: () => {} };

export class TutorialEngine {
  private defs = new Map<string, TutorialDefinition>();
  private storage: TutorialStorageAdapter;
  private opts: Required<Pick<TutorialEngineOptions, 'resume' | 'enabledByDefault' | 'saveDebounceMs' | 'targetTimeoutMs'>> & {
    debug: boolean;
  };

  private state = emptyProgressState();
  private ready = false;
  private destroyed = false;

  private run: ActiveRun | null = null;
  private stepToken = 0;

  private currentPath: string | null = null;
  private routeWaiters: Array<{ match: string | RegExp; resolve: () => void }> = [];
  private emitWaiters = new Map<string, Set<() => void>>();
  /**
   * Tutorials paused this session (programmatically, via disable, or because a
   * resume attempt found no target). Prevents pause→auto-retrigger loops;
   * cleared on route change / re-enable so resume gets a fresh chance in a
   * new context.
   */
  private muted = new Set<string>();

  private listeners = new Set<() => void>();
  private snapshot: EngineSnapshot = { ready: false, enabled: true, active: null };

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingTimers = new Set<ReturnType<typeof setTimeout>>();
  private selectorObserver: MutationObserver | null = null;
  private selectorInterval: ReturnType<typeof setInterval> | null = null;
  private selectorCheckQueued = false;

  constructor(options: TutorialEngineOptions = {}) {
    this.storage = options.storage ?? noopStorage;
    this.opts = {
      resume: options.resume ?? true,
      enabledByDefault: options.enabledByDefault ?? true,
      saveDebounceMs: options.saveDebounceMs ?? 300,
      targetTimeoutMs: options.targetTimeoutMs ?? 8000,
      debug: options.debug ?? false,
    };
    this.state = emptyProgressState(this.opts.enabledByDefault);
    this.publish();
    void this.init();
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  private async init(): Promise<void> {
    try {
      const loaded = parseProgressState(await this.storage.get());
      if (this.destroyed) return;
      if (loaded) this.state = loaded;
    } catch (err) {
      this.log('storage.get failed; starting fresh', err);
    }
    this.ready = true;
    this.publish();
    this.evaluateTriggers('mount');
    if (this.opts.resume && !this.run) this.tryResume();
    this.ensureSelectorWatch();
  }

  destroy(): void {
    this.destroyed = true;
    this.clearRunSideEffects();
    this.run = null;
    this.listeners.clear();
    this.routeWaiters = [];
    this.emitWaiters.clear();
    for (const t of this.pendingTimers) clearTimeout(t);
    this.pendingTimers.clear();
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      void this.flushSave();
    }
    this.stopSelectorWatch();
  }

  /* ---------------------------------------------------------------- */
  /* Store interface (useSyncExternalStore-compatible)                 */
  /* ---------------------------------------------------------------- */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): EngineSnapshot => this.snapshot;

  private publish(): void {
    const run = this.run;
    const active: ActiveTutorialSnapshot | null = run
      ? {
          tutorial: run.tutorial,
          step: run.order[run.index],
          stepIndex: run.index,
          stepCount: run.order.length,
          segment: run.segment,
          element: run.element,
          waiting: run.waiting,
          isFirst: run.index === 0,
          isLast: run.index === run.order.length - 1,
        }
      : null;
    this.snapshot = { ready: this.ready, enabled: this.state.enabled, active };
    for (const l of [...this.listeners]) l();
  }

  /* ---------------------------------------------------------------- */
  /* Registry                                                          */
  /* ---------------------------------------------------------------- */

  register(def: TutorialDefinition): void {
    this.defs.set(def.id, def);
    if (this.ready) {
      this.evaluateTriggers('mount');
      this.evaluateTriggers('route');
      if (this.opts.resume && !this.run) this.tryResume();
    }
    this.ensureSelectorWatch();
  }

  unregister(id: string): void {
    this.defs.delete(id);
    if (this.run?.tutorial.id === id) this.pause();
    this.ensureSelectorWatch();
  }

  getDefinition(id: string): TutorialDefinition | undefined {
    return this.defs.get(id);
  }

  /* ---------------------------------------------------------------- */
  /* Public controls                                                   */
  /* ---------------------------------------------------------------- */

  /** Explicitly start a tutorial (or one of its segments). Always runs, even if completed. */
  start(id: string, options: StartOptions = {}): boolean {
    const def = this.defs.get(id);
    if (!def) {
      this.log(`start(${id}): unknown tutorial`);
      return false;
    }
    this.muted.delete(id);
    return this.beginRun(def, { ...options, force: options.force ?? true }, false);
  }

  /** Advance to the next step (honors branching). */
  next(): void {
    const run = this.run;
    if (!run || run.waiting) return;
    const step = run.order[run.index];
    this.exitStep(step);
    const target = this.resolveBranch(step);
    if (target != null) {
      const idx = run.order.findIndex((s) => s.id === target);
      if (idx >= 0) return void this.showStep(idx);
      this.log(`branch target '${target}' not in current order; falling through`);
    }
    if (run.index + 1 >= run.order.length) return this.complete();
    void this.showStep(run.index + 1);
  }

  back(): void {
    const run = this.run;
    if (!run || run.waiting || run.index === 0) return;
    this.exitStep(run.order[run.index]);
    void this.showStep(run.index - 1);
  }

  /** Dismiss ("skip tour") — marks the tutorial/segment dismissed so `once` triggers stop firing. */
  skip(): void {
    const run = this.run;
    if (!run) return;
    this.exitStep(run.order[run.index]);
    this.recordEnd('dismissed');
    this.endRun();
  }

  /** Alias for skip(). */
  dismiss(): void {
    this.skip();
  }

  /** Pause — keeps the tutorial in-progress (resumable) and hides the UI. */
  pause(): void {
    const run = this.run;
    if (!run) return;
    this.exitStep(run.order[run.index]);
    this.muted.add(run.tutorial.id);
    this.saveInProgress();
    this.endRun();
  }

  /** Stop and mark completed. */
  complete(): void {
    const run = this.run;
    if (!run) return;
    this.recordEnd('completed');
    this.endRun();
  }

  /** Global on/off. Persisted. Turning off pauses any active run. */
  setEnabled(enabled: boolean): void {
    if (this.state.enabled === enabled) return;
    this.state.enabled = enabled;
    if (!enabled && this.run) {
      this.pause();
    } else {
      this.queueSave();
      this.publish();
    }
    if (enabled) {
      this.muted.clear();
      this.evaluateTriggers('mount');
      this.evaluateTriggers('route');
      if (this.opts.resume && !this.run) this.tryResume();
    }
  }

  get enabled(): boolean {
    return this.state.enabled;
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** Progress status for a tutorial ('completed' | 'dismissed' | 'in-progress' | null). */
  getStatus(id: string): TutorialProgressEntry | null {
    return this.state.tutorials[id] ?? null;
  }

  isCompleted(id: string): boolean {
    const def = this.defs.get(id);
    const entry = this.state.tutorials[id];
    if (!entry) return false;
    const v = def?.version ?? entry.version;
    return entry.status === 'completed' && entry.version >= v;
  }

  /** Forget stored progress for one tutorial (it may auto-trigger again). */
  reset(id: string): void {
    if (!(id in this.state.tutorials)) return;
    delete this.state.tutorials[id];
    this.queueSave();
    this.publish();
  }

  /** Forget all stored progress (keeps the enabled flag). */
  resetAll(): void {
    this.state.tutorials = {};
    this.queueSave();
    this.publish();
  }

  /**
   * App → engine event bus. Fires `{ type: 'event' }` triggers and
   * `advanceOn: { emitted }` conditions.
   */
  emit(name: string): void {
    const waiters = this.emitWaiters.get(name);
    if (waiters) for (const w of [...waiters]) w();
    this.evaluateTriggers('event', name);
  }

  /**
   * Report route/path changes (framework-agnostic — call from your router).
   * Fires route triggers, waitFor.route, and advanceOn.route.
   */
  notifyRoute(path: string): void {
    if (this.currentPath === path) return;
    this.currentPath = path;
    this.muted.clear(); // new context — paused tours may retry here
    const waiters = this.routeWaiters;
    this.routeWaiters = waiters.filter((w) => {
      if (routeMatches(w.match, path)) {
        w.resolve();
        return false;
      }
      return true;
    });
    this.evaluateTriggers('route');
    if (this.ready && this.opts.resume && !this.run) this.tryResume();
  }

  get path(): string | null {
    return this.currentPath;
  }

  /* ---------------------------------------------------------------- */
  /* Trigger evaluation                                                */
  /* ---------------------------------------------------------------- */

  private triggersOf(def: TutorialDefinition, segment: string | null): TutorialTrigger[] {
    const raw = segment ? def.segments?.[segment]?.trigger : def.trigger;
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [raw];
  }

  private *allTriggerSources(): Generator<{ def: TutorialDefinition; segment: string | null }> {
    for (const def of this.defs.values()) {
      yield { def, segment: null };
      for (const seg of Object.keys(def.segments ?? {})) yield { def, segment: seg };
    }
  }

  private evaluateTriggers(kind: 'mount' | 'route' | 'event' | 'selector', eventName?: string): void {
    if (!this.ready || this.destroyed || !this.state.enabled || this.run) return;
    const candidates: TriggerCandidate[] = [];
    for (const { def, segment } of this.allTriggerSources()) {
      if (!this.isEligible(def, segment)) continue;
      for (const trigger of this.triggersOf(def, segment)) {
        if (trigger.type !== kind) continue;
        if (trigger.type === 'route' && !routeMatches(trigger.match, this.currentPath)) continue;
        if (trigger.type === 'event' && trigger.name !== eventName) continue;
        if (trigger.type === 'selector' && !this.selectorPresent(trigger.selector)) continue;
        candidates.push({ def, segment, trigger });
      }
    }
    if (!candidates.length) return;
    candidates.sort((a, b) => (b.def.priority ?? 0) - (a.def.priority ?? 0));
    const winner = candidates[0];
    const delay = 'delayMs' in winner.trigger ? winner.trigger.delayMs ?? 0 : 0;
    if (delay > 0) {
      const t = setTimeout(() => {
        this.pendingTimers.delete(t);
        if (this.run || !this.state.enabled || !this.isEligible(winner.def, winner.segment)) return;
        if (winner.trigger.type === 'route' && !routeMatches(winner.trigger.match, this.currentPath)) return;
        this.beginRun(winner.def, { segment: winner.segment ?? undefined }, true);
      }, delay);
      this.pendingTimers.add(t);
      return;
    }
    this.beginRun(winner.def, { segment: winner.segment ?? undefined }, true);
  }

  private selectorPresent(selector: string): boolean {
    if (!isBrowser()) return false;
    try {
      return !!document.querySelector(selector);
    } catch {
      return false;
    }
  }

  /** Is this tutorial/segment allowed to auto-trigger right now? */
  private isEligible(def: TutorialDefinition, segment: string | null): boolean {
    if (this.muted.has(def.id)) return false;
    const version = def.version ?? 1;
    const entry = this.state.tutorials[def.id];
    const fresh = !entry || entry.version < version;

    if (segment) {
      const segDef = def.segments?.[segment];
      if (!segDef) return false;
      if (segDef.repeat) return true;
      if (fresh) return true;
      if (def.once === false) return true;
      // Whole tutorial finished/dismissed at this version → segments stay quiet.
      if (entry!.status === 'completed' || entry!.status === 'dismissed') return false;
      return !entry!.segments?.[segment];
    }

    if (def.once === false) return true;
    if (fresh) return true;
    return entry!.status === 'in-progress';
  }

  /* ---------------------------------------------------------------- */
  /* Selector-trigger watching                                         */
  /* ---------------------------------------------------------------- */

  private hasPendingSelectorTriggers(): boolean {
    for (const { def, segment } of this.allTriggerSources()) {
      if (!this.isEligible(def, segment)) continue;
      if (this.triggersOf(def, segment).some((t) => t.type === 'selector')) return true;
    }
    return false;
  }

  private ensureSelectorWatch(): void {
    if (!isBrowser() || this.destroyed) return;
    if (!this.hasPendingSelectorTriggers()) return this.stopSelectorWatch();
    if (this.selectorObserver || this.selectorInterval) return;
    const check = () => {
      if (this.selectorCheckQueued) return;
      this.selectorCheckQueued = true;
      const t = setTimeout(() => {
        this.pendingTimers.delete(t);
        this.selectorCheckQueued = false;
        this.evaluateTriggers('selector');
        if (!this.hasPendingSelectorTriggers()) this.stopSelectorWatch();
      }, 120);
      this.pendingTimers.add(t);
    };
    try {
      this.selectorObserver = new MutationObserver(check);
      this.selectorObserver.observe(document.documentElement, { childList: true, subtree: true });
    } catch {
      /* fall through to polling */
    }
    this.selectorInterval = setInterval(check, 500);
    check();
  }

  private stopSelectorWatch(): void {
    this.selectorObserver?.disconnect();
    this.selectorObserver = null;
    if (this.selectorInterval) clearInterval(this.selectorInterval);
    this.selectorInterval = null;
  }

  /* ---------------------------------------------------------------- */
  /* Run lifecycle                                                     */
  /* ---------------------------------------------------------------- */

  private orderFor(def: TutorialDefinition, segment?: string): TutorialStep[] | null {
    if (!segment) return def.steps;
    const seg = def.segments?.[segment];
    if (!seg) return null;
    const byId = new Map(def.steps.map((s) => [s.id, s]));
    const steps = seg.steps.map((id) => byId.get(id)).filter((s): s is TutorialStep => !!s);
    return steps.length ? steps : null;
  }

  private beginRun(def: TutorialDefinition, options: StartOptions, auto: boolean): boolean {
    if (this.destroyed || !def.steps.length) return false;
    if (!options.force && !this.state.enabled) return false;
    if (this.run) {
      if (auto) return false;
      this.pause(); // explicit start preempts (pausing the old run keeps it resumable)
    }

    const segment = options.segment ?? null;
    const order = this.orderFor(def, segment ?? undefined);
    if (!order) {
      this.log(`beginRun(${def.id}): unknown/empty segment '${segment}'`);
      return false;
    }

    const entry = this.state.tutorials[def.id];
    const version = def.version ?? 1;
    let startIndex = 0;
    let resuming = false;
    if (options.stepId) {
      const idx = order.findIndex((s) => s.id === options.stepId);
      if (idx >= 0) startIndex = idx;
    } else if (
      entry &&
      entry.status === 'in-progress' &&
      entry.version === version &&
      (entry.segment ?? null) === segment &&
      entry.stepId
    ) {
      const idx = order.findIndex((s) => s.id === entry.stepId);
      if (idx >= 0) {
        startIndex = idx;
        resuming = auto;
      }
    }

    this.run = {
      tutorial: def,
      order,
      index: startIndex,
      segment,
      element: null,
      waiting: true,
      resuming,
      stepCleanups: [],
    };
    this.log(`run ${def.id}${segment ? `#${segment}` : ''} @ ${order[startIndex].id}${resuming ? ' (resume)' : ''}`);
    void this.showStep(startIndex);
    return true;
  }

  private tryResume(): void {
    let best: { def: TutorialDefinition; entry: TutorialProgressEntry } | null = null;
    for (const def of this.defs.values()) {
      if (this.muted.has(def.id)) continue;
      const entry = this.state.tutorials[def.id];
      if (!entry || entry.status !== 'in-progress') continue;
      // A segment-only history leaves status 'in-progress' with no stepId —
      // that's "waiting for other segments", not a resumable full run.
      if (!entry.stepId) continue;
      if (entry.version !== (def.version ?? 1)) continue;
      if (!best || (def.priority ?? 0) > (best.def.priority ?? 0)) best = { def, entry };
    }
    if (!best || !this.state.enabled) return;
    this.beginRun(best.def, { segment: best.entry.segment ?? undefined }, true);
  }

  private endRun(): void {
    this.clearRunSideEffects();
    this.run = null;
    this.publish();
    // Something else may be waiting its turn now.
    const t = setTimeout(() => {
      this.pendingTimers.delete(t);
      this.evaluateTriggers('mount');
      this.evaluateTriggers('route');
      this.ensureSelectorWatch();
    }, 0);
    this.pendingTimers.add(t);
  }

  private clearRunSideEffects(): void {
    if (!this.run) return;
    for (const c of this.run.stepCleanups.splice(0)) {
      try {
        c();
      } catch {
        /* ignore */
      }
    }
    this.stepToken++;
  }

  /* ---------------------------------------------------------------- */
  /* Step lifecycle                                                    */
  /* ---------------------------------------------------------------- */

  private stepContext(step: TutorialStep): TutorialStepContext {
    const run = this.run!;
    return {
      tutorialId: run.tutorial.id,
      stepId: step.id,
      stepIndex: run.index,
      element: run.element,
    };
  }

  private exitStep(step: TutorialStep): void {
    const run = this.run;
    if (!run) return;
    for (const c of run.stepCleanups.splice(0)) {
      try {
        c();
      } catch {
        /* ignore */
      }
    }
    try {
      step.onExit?.(this.stepContext(step));
    } catch (err) {
      this.log('onExit threw', err);
    }
  }

  private resolveBranch(step: TutorialStep): string | null {
    if (!step.next) return null;
    if (typeof step.next === 'string') return step.next;
    try {
      return step.next(this.stepContext(step)) ?? null;
    } catch (err) {
      this.log('next() branch threw', err);
      return null;
    }
  }

  private waitForRoute(match: string | RegExp, timeoutMs: number): { promise: Promise<boolean>; cancel: () => void } {
    if (routeMatches(match, this.currentPath)) {
      return { promise: Promise.resolve(true), cancel: () => {} };
    }
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let entry: { match: string | RegExp; resolve: () => void } | null = null;
    const promise = new Promise<boolean>((resolve) => {
      entry = {
        match,
        resolve: () => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          resolve(true);
        },
      };
      this.routeWaiters.push(entry);
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.routeWaiters = this.routeWaiters.filter((w) => w !== entry);
        resolve(false);
      }, timeoutMs);
    });
    return {
      promise,
      cancel: () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        this.routeWaiters = this.routeWaiters.filter((w) => w !== entry);
      },
    };
  }

  private async showStep(index: number): Promise<void> {
    const run = this.run;
    if (!run) return;
    const token = ++this.stepToken;
    const stale = () => this.destroyed || this.run !== run || this.stepToken !== token;

    run.index = index;
    run.element = null;
    run.waiting = true;
    this.publish();

    const step = run.order[index];
    const timeoutMs = step.waitFor?.timeoutMs ?? this.opts.targetTimeoutMs;

    // 1. waitFor.route
    if (step.waitFor?.route) {
      const waiter = this.waitForRoute(step.waitFor.route, timeoutMs);
      run.stepCleanups.push(waiter.cancel);
      const ok = await waiter.promise;
      if (stale()) return;
      if (!ok) return this.handleMissingTarget(step);
    }

    // 2. waitFor.selector
    if (step.waitFor?.selector) {
      const sel = step.waitFor.selector;
      const handle = waitForTarget(() => resolveTarget(sel), timeoutMs);
      run.stepCleanups.push(handle.cancel);
      const el = await handle.promise;
      if (stale()) return;
      if (!el) return this.handleMissingTarget(step);
    }

    // 3. Resolve the spotlight target.
    let element: Element | null = null;
    if (step.target) {
      element = resolveTarget(step.target);
      if (!element) {
        const handle: WaitHandle = waitForTarget(() => resolveTarget(step.target), timeoutMs);
        run.stepCleanups.push(handle.cancel);
        element = await handle.promise;
        if (stale()) return;
      }
      if (!element) return this.handleMissingTarget(step);
    }

    run.element = element;
    run.waiting = false;
    run.resuming = false;

    if (element && (step.scrollIntoView ?? true)) scrollTargetIntoView(element);

    try {
      step.onEnter?.(this.stepContext(step));
    } catch (err) {
      this.log('onEnter threw', err);
    }

    this.attachAdvanceOn(step, element);
    this.saveInProgress();
    this.publish();
  }

  private handleMissingTarget(step: TutorialStep): void {
    const run = this.run;
    if (!run) return;
    const behavior: MissingTargetBehavior = run.resuming
      ? 'pause'
      : step.onMissingTarget ?? run.tutorial.onMissingTarget ?? 'skip';
    this.log(`step '${step.id}' target missing → ${behavior}`);
    if (behavior === 'pause') return this.pause();
    if (behavior === 'stop') {
      this.recordEnd('dismissed');
      return this.endRun();
    }
    // skip forward; completing if this was the last step
    if (run.index + 1 >= run.order.length) return this.complete();
    void this.showStep(run.index + 1);
  }

  private attachAdvanceOn(step: TutorialStep, element: Element | null): void {
    const run = this.run;
    const adv = step.advanceOn;
    if (!run || !adv) return;
    const advance = () => {
      if (this.run === run && run.order[run.index] === step) this.next();
    };

    if ('event' in adv) {
      const selector = adv.selector ?? (typeof step.target === 'string' ? step.target : null);
      if (selector && isBrowser()) {
        // Delegated — survives re-renders of the target.
        const handler = (e: Event) => {
          const t = e.target as Element | null;
          if (t && typeof t.closest === 'function' && t.closest(selector)) advance();
        };
        document.addEventListener(adv.event, handler, true);
        run.stepCleanups.push(() => document.removeEventListener(adv.event, handler, true));
      } else if (element) {
        element.addEventListener(adv.event, advance);
        run.stepCleanups.push(() => element.removeEventListener(adv.event, advance));
      }
      return;
    }
    if ('selector' in adv) {
      const handle = waitForTarget(() => resolveTarget(adv.selector), Number.MAX_SAFE_INTEGER);
      run.stepCleanups.push(handle.cancel);
      void handle.promise.then((el) => el && advance());
      return;
    }
    if ('route' in adv) {
      const waiter = this.waitForRoute(adv.route, Number.MAX_SAFE_INTEGER);
      run.stepCleanups.push(waiter.cancel);
      void waiter.promise.then((ok) => ok && advance());
      return;
    }
    if ('emitted' in adv) {
      const set = this.emitWaiters.get(adv.emitted) ?? new Set();
      this.emitWaiters.set(adv.emitted, set);
      const fn = () => advance();
      set.add(fn);
      run.stepCleanups.push(() => set.delete(fn));
    }
  }

  /* ---------------------------------------------------------------- */
  /* Persistence                                                       */
  /* ---------------------------------------------------------------- */

  private saveInProgress(): void {
    const run = this.run;
    if (!run) return;
    const version = run.tutorial.version ?? 1;
    const prev = this.state.tutorials[run.tutorial.id];
    this.state.tutorials[run.tutorial.id] = {
      status: 'in-progress',
      stepId: run.order[run.index]?.id,
      segment: run.segment ?? undefined,
      version,
      segments: prev && prev.version === version ? prev.segments : undefined,
      updatedAt: Date.now(),
    };
    this.queueSave();
  }

  private recordEnd(status: 'completed' | 'dismissed'): void {
    const run = this.run;
    if (!run) return;
    const version = run.tutorial.version ?? 1;
    const prev = this.state.tutorials[run.tutorial.id];
    const prevSegments = prev && prev.version === version ? prev.segments : undefined;
    if (run.segment) {
      // Finishing a segment marks the segment; whole-tutorial status stays (or becomes in-progress-free).
      const base: TutorialProgressEntry =
        prev && prev.version === version && prev.status !== 'in-progress'
          ? { ...prev }
          : { status: 'in-progress', version, updatedAt: Date.now() };
      base.segments = { ...(prevSegments ?? {}), [run.segment]: status };
      base.version = version;
      base.updatedAt = Date.now();
      if (base.status === 'in-progress') {
        // Segment run finished — no full-run step to resume.
        delete base.stepId;
        delete base.segment;
        const segNames = Object.keys(run.tutorial.segments ?? {});
        const allDone = segNames.length > 0 && segNames.every((s) => base.segments?.[s]);
        if (allDone) base.status = 'completed';
      }
      this.state.tutorials[run.tutorial.id] = base;
    } else {
      this.state.tutorials[run.tutorial.id] = {
        status,
        version,
        segments: prevSegments,
        updatedAt: Date.now(),
      };
    }
    this.queueSave();
  }

  private queueSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flushSave();
    }, this.opts.saveDebounceMs);
  }

  /** Write-through immediately (also called on destroy). */
  async flushSave(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      await this.storage.set({
        enabled: this.state.enabled,
        tutorials: { ...this.state.tutorials },
      });
    } catch (err) {
      this.log('storage.set failed', err);
    }
  }

  /* ---------------------------------------------------------------- */

  private log(...args: unknown[]): void {
    if (this.opts.debug && typeof console !== 'undefined') {
      console.debug('[redtutorial]', ...args);
    }
  }
}
