/**
 * @redbtn/redtutorial — shared types.
 *
 * The engine is headless and framework-free; the React layer
 * (TutorialProvider / useTutorial / TutorialOverlay) sits on top.
 */

/* ------------------------------------------------------------------ */
/* Targets                                                             */
/* ------------------------------------------------------------------ */

/** A React-style ref object ({ current: Element | null }) — typed loosely so the core stays framework-free. */
export interface RefLike<T = Element> {
  readonly current: T | null;
}

/**
 * How a step points at the element it spotlights:
 * - CSS selector string (recommended — survives re-renders)
 * - a function returning the element
 * - a ref-like object ({ current })
 * Omit entirely for a centered "modal" step with no spotlight.
 */
export type TutorialTarget = string | (() => Element | null) | RefLike;

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

export type TutorialPlacement = 'auto' | 'top' | 'bottom' | 'left' | 'right';

/** What to do when a step's target element can't be found in time. */
export type MissingTargetBehavior = 'skip' | 'pause' | 'stop';

/** Auto-advance conditions — when met, the engine moves to the next step. */
export type AdvanceOn =
  /** A DOM event on the step target (or another selector). E.g. { event: 'click' }. */
  | { event: string; selector?: string }
  /** An element matching this selector appears in the DOM. */
  | { selector: string }
  /** The route/path (reported via notifyRoute / TutorialProvider `path`) matches. */
  | { route: string | RegExp }
  /** A custom app event emitted through tutorial.emit(name). */
  | { emitted: string };

/** Preconditions evaluated before a step is shown. */
export interface StepWaitFor {
  /** Wait until an element matching this selector exists. */
  selector?: string;
  /** Wait until the current route matches. */
  route?: string | RegExp;
  /** Max time to wait (ms). Default 8000. */
  timeoutMs?: number;
}

export interface TutorialStepContext {
  tutorialId: string;
  stepId: string;
  stepIndex: number;
  /** The resolved target element, when there is one. */
  element: Element | null;
}

export interface TutorialStep {
  /** Unique within the tutorial. Used for resume + branching + segments. */
  id: string;
  /** Element to spotlight. Omit for a centered modal step. */
  target?: TutorialTarget;
  title?: string;
  /** Plain string body. (The React layer also accepts rich `render` overrides at the provider level.) */
  body?: string;
  /** Preferred tooltip side. Default 'auto' (largest available space, flips to fit). */
  placement?: TutorialPlacement;
  /** Extra px of breathing room around the spotlighted element. Default 6. */
  spotlightPadding?: number;
  /** Corner radius of the spotlight cutout. Default 8. */
  spotlightRadius?: number;
  /**
   * If true, the spotlighted element stays clickable/interactive
   * (the rest of the page is still shielded). Default false.
   */
  allowInteraction?: boolean;
  /** Auto-advance when this condition is met (in addition to the Next button). */
  advanceOn?: AdvanceOn;
  /** Hide the Next button (use with advanceOn for "do the thing to continue" steps). */
  hideNext?: boolean;
  /** Preconditions to wait for before showing the step. */
  waitFor?: StepWaitFor;
  /** What to do if the target never appears. Default: the tutorial's `onMissingTarget`, else 'skip'. */
  onMissingTarget?: MissingTargetBehavior;
  /**
   * Branching — id of the step to go to on Next, or a function returning one.
   * Return null/undefined to fall through to the next sequential step.
   */
  next?: string | ((ctx: TutorialStepContext) => string | null | undefined);
  /** Lifecycle hooks. */
  onEnter?: (ctx: TutorialStepContext) => void;
  onExit?: (ctx: TutorialStepContext) => void;
  /** Per-step button labels. */
  nextLabel?: string;
  backLabel?: string;
  /** Allow the user to go back from this step. Default true (when not the first step). */
  canBack?: boolean;
  /** Scroll the target into view when the step shows. Default true. */
  scrollIntoView?: boolean;
}

/* ------------------------------------------------------------------ */
/* Triggers                                                            */
/* ------------------------------------------------------------------ */

export type TutorialTrigger =
  /** Only starts via tutorial.start(id). */
  | { type: 'manual' }
  /** Starts as soon as the engine is ready (storage loaded). */
  | { type: 'mount'; delayMs?: number }
  /** Starts when the reported route matches. */
  | { type: 'route'; match: string | RegExp; delayMs?: number }
  /** Starts when an element matching the selector appears. */
  | { type: 'selector'; selector: string; delayMs?: number }
  /** Starts when the app calls tutorial.emit(name). */
  | { type: 'event'; name: string; delayMs?: number };

/* ------------------------------------------------------------------ */
/* Segments                                                            */
/* ------------------------------------------------------------------ */

/**
 * A named slice of a tutorial that can run on its own — e.g. show only the
 * "nutrition" steps when the user first opens the nutrition screen, instead
 * of forcing the full front-to-back tour.
 */
export interface TutorialSegment {
  /** Ordered step ids (must exist in the tutorial's steps). */
  steps: string[];
  /** Contextual trigger(s) for just this segment. */
  trigger?: TutorialTrigger | TutorialTrigger[];
  /** Re-run even if the segment was completed. Default false. */
  repeat?: boolean;
}

/* ------------------------------------------------------------------ */
/* Tutorial definition                                                 */
/* ------------------------------------------------------------------ */

export interface TutorialDefinition {
  /** Globally unique id, e.g. 'become-onboarding'. */
  id: string;
  /**
   * Bump when the tutorial changes enough that completed users should see
   * it again. Progress is kept per (id, version). Default 1.
   */
  version?: number;
  title?: string;
  steps: TutorialStep[];
  /** Trigger(s) for the full tutorial. Default: manual only. */
  trigger?: TutorialTrigger | TutorialTrigger[];
  /** Named segments for contextual, partial playback. */
  segments?: Record<string, TutorialSegment>;
  /** Don't auto-trigger again once completed or dismissed. Default true. */
  once?: boolean;
  /** When several tutorials want to trigger at once, highest wins. Default 0. */
  priority?: number;
  /** Default missing-target behavior for steps. Default 'skip'. */
  onMissingTarget?: MissingTargetBehavior;
  /** Show the "Skip tour" affordance. Default true. */
  canSkip?: boolean;
  /** Labels for the default UI. */
  skipLabel?: string;
  doneLabel?: string;
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

export type TutorialStatus = 'in-progress' | 'completed' | 'dismissed';

export interface TutorialProgressEntry {
  status: TutorialStatus;
  /** Step id to resume at (for in-progress). */
  stepId?: string;
  /** Which segment was running, if any. */
  segment?: string;
  /** The definition version this entry refers to. */
  version: number;
  /** Completed/dismissed segments, keyed by segment name. */
  segments?: Record<string, Exclude<TutorialStatus, 'in-progress'>>;
  updatedAt: number;
}

export interface TutorialProgressState {
  /** Global on/off switch (user preference). */
  enabled: boolean;
  tutorials: Record<string, TutorialProgressEntry>;
}

/**
 * Pluggable persistence. Supply an API-backed adapter to make progress
 * ACCOUNT-based (synced across devices); the library ships localStorage,
 * in-memory, and fetch adapters.
 */
export interface TutorialStorageAdapter {
  get(): Promise<TutorialProgressState | null> | TutorialProgressState | null;
  set(state: TutorialProgressState): Promise<void> | void;
}

/* ------------------------------------------------------------------ */
/* Engine surface                                                      */
/* ------------------------------------------------------------------ */

export interface StartOptions {
  /** Start at this step id. */
  stepId?: string;
  /** Run only this named segment. */
  segment?: string;
  /** Start even if completed/dismissed (does not clear stored status until finished). */
  force?: boolean;
}

export interface ActiveTutorialSnapshot {
  tutorial: TutorialDefinition;
  step: TutorialStep;
  /** Index within the currently running order (full tutorial or segment). */
  stepIndex: number;
  stepCount: number;
  segment: string | null;
  /** Resolved spotlight element (null for modal steps / while waiting). */
  element: Element | null;
  /** True while waitFor / target resolution is pending. */
  waiting: boolean;
  isFirst: boolean;
  isLast: boolean;
}

export interface EngineSnapshot {
  /** True once persisted progress has loaded. */
  ready: boolean;
  /** Global on/off (persisted). */
  enabled: boolean;
  active: ActiveTutorialSnapshot | null;
}

export interface TutorialEngineOptions {
  storage?: TutorialStorageAdapter;
  /** Resume an in-progress tutorial automatically once ready. Default true. */
  resume?: boolean;
  /** Global default when storage has no `enabled` yet. Default true. */
  enabledByDefault?: boolean;
  /** Debounce for storage writes (ms). Default 300. */
  saveDebounceMs?: number;
  /** Default timeout waiting for step targets (ms). Default 8000. */
  targetTimeoutMs?: number;
  debug?: boolean;
}
