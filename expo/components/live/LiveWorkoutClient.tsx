import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import type { LiveSetState } from "@/components/live/LiveSetRow";
import type { ExerciseGroupType } from "@/components/live/ExerciseGroupNav";
import {
  buildWorkoutFlow,
  isSetFilled,
  normalizeTracking,
  resolveStartStep,
  setUnitLabel,
  type WorkoutPosition,
} from "@become/core";
import { applySetUpdate, type KeyValueStore } from "@/lib/live/liveWorkoutCache";
import { writeWorkoutPosition, readWorkoutPosition } from "@/lib/live/workoutPosition";
import { skippedSetState } from "@/lib/live/liveSkip";
import { LiveExerciseSheet } from "@/components/live/LiveExerciseSheet";
import {
  LiveEditConfirmModal,
  LiveSkipModal,
} from "@/components/live/LiveSkipModals";
import type { VideoFramingOverride } from "@/lib/videoFraming";
import type { VideoTrimOverride } from "@/lib/videoTrim";
import { useRestTimer } from "@/lib/live/useRestTimer";
import { RestTimerBar } from "@/components/live/RestTimerBar";
import { prHaptic, setCompleteHaptic } from "@/lib/feedback/haptics";
import type {
  ExerciseHistoryEntry,
  ExercisePRSummary,
} from "@become/api-client";
import { TrackWorkoutView } from "@/components/live/TrackWorkoutView";
import { LiveStepView } from "@/components/live/LiveStepView";
import {
  WorkoutViewToggle,
  type WorkoutView,
} from "@/components/live/WorkoutViewToggle";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export type { WorkoutView };

/** exerciseSlug → ordered set states. Exposed for cache persistence. */
export type LiveGrid = Record<string, LiveSetState[]>;

export interface LiveWorkoutExercise {
  slug: string;
  name: string;
  sets: number;
  repsLabel?: string;
  notes?: string;
  /** Canonical Exercise trackingType — selects per-set inputs (reps/weight/duration/distance). */
  trackingType?: string | null;
  /**
   * Catalog metadata, hydrated by the web onto every program exercise
   * (`ProgramExerciseSchema`). It — not the name — decides whether the weight
   * box says "Weight per DB (lbs)" and whether a doubled total is claimed:
   * a Chest-Supported Row is dumbbell work and says so nowhere in its name,
   * while a Barbell Bench Press is aliased "Bench Press (DB/bar)" and is not.
   * See `getBellWeightInfo` in `@become/core`.
   */
  equipment?: string[];
  laterality?: string;
  movementPatterns?: string[];
  /** Grouping metadata — exercises sharing a groupId form a superset/circuit/etc. */
  groupId?: string;
  groupLabel?: string;
  groupType?: string;
  groupRounds?: number;
  /** Rest between sets in seconds (defaults to 90). */
  restSec?: number;
  /** Group-level rest between rounds (web `groupRest`, e.g. "60s"). */
  groupRest?: string;
  /** Last completed performance per set, used as prefill. */
  prefill?: (LiveSetState | null)[];
  addedAdHoc?: boolean;
  originalExerciseSlug?: string;
  swappedFromName?: string;
  category?: string;
  type?: string;
  role?: string;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  videoFraming?: VideoFramingOverride | null;
  videoTrim?: VideoTrimOverride | null;
}

export interface LiveWorkoutViewModel {
  programId: string;
  workoutTitle: string;
  exercises: LiveWorkoutExercise[];
  groupType?: ExerciseGroupType | null;
  groupRounds?: number;
}

export interface LiveWorkoutClientProps {
  workout: LiveWorkoutViewModel;
  /** Called any time a set transitions to completed=true. */
  onSetComplete?: (input: {
    exerciseSlug: string;
    setIndex: number;
    state: LiveSetState;
  }) => Promise<void> | void;
  /** Restore in-flight sets from a persisted snapshot (SecureStore cache). */
  restoredGrid?: LiveGrid | null;
  /** Fires on every set edit with the full new grid, for cache persistence. */
  onGridChange?: (grid: LiveGrid) => void;
  /** Fires when the user taps Complete Workout, with the final grid for the save POST. */
  onFinish?: (grid: LiveGrid) => void;
  /** Disables the finish button while the save is in flight. */
  finishing?: boolean;
  /** Save error to surface offline / failure state and offer Retry. */
  saveError?: Error | string | null;
  /**
   * True while the latest save is kept on the phone and will sync when the
   * connection returns. Renders the small "saved on this phone, will sync"
   * state — distinct from `saveError`, which is a refusal retrying cannot
   * fix. Retry replays the same queued payload.
   */
  pendingSync?: boolean;
  /** Open the swap picker for an exercise (route fetches alternatives). */
  onRequestSwap?: (slug: string) => void;
  /**
   * Which view to open on. The web lands on Track and offers Live from the
   * toggle, so that is the default here too.
   */
  initialView?: WorkoutView;
  /** Session notes, saved as `notes` on the workout log (web parity). */
  notes?: string;
  onNotesChange?: (notes: string) => void;
  /**
   * Storage scope for the remembered position — `programScope(programId, day)`
   * or `quickScope(sessionId)` from `@become/core`. Omitted, the position is
   * kept for this mount only (which is still enough to make the toggle work).
   */
  positionScope?: string;
  /** DI for the position store. Omitted, nothing is persisted. */
  positionStore?: KeyValueStore | null;
  /** Injected rest-timer interval impls for deterministic tests. */
  restTimerSetInterval?: typeof setInterval;
  restTimerClearInterval?: typeof clearInterval;
  /** Clock injection point for the rest timer (tests). Defaults to `Date.now`. */
  restTimerNow?: () => number;
  /** Rest-alert seam override for tests (production default talks to expo-notifications). */
  restAlertDeps?: import("@/lib/live/restAlert").RestAlertDeps;
  /** Fired when a rest countdown reaches zero. */
  onRestEnd?: () => void;
  /**
   * PR ids the save just reported (all-time records). Fires the PR haptic
   * once per new record — the celebration half of NP-082's haptics.
   */
  celebratedPrIds?: string[];
  /**
   * Best completed set per exercise NAME from a log before today
   * (`exerciseHistory[name]` on the web). Threaded from `useLiveWorkout`;
   * shown as the `Last:` reference on the Live step only.
   */
  exerciseHistory?: Record<string, ExerciseHistoryEntry>;
  /**
   * Persisted max-weight record per exercise NAME (`exercisePRs[name]` on
   * the web). Threaded from `useLiveWorkout`; drives the `PR:` line and
   * the NEW PR flag on the Live step only.
   */
  exercisePRs?: Record<string, ExercisePRSummary>;
  /**
   * In-workout hints keyed by lowercase exercise slug
   * (`useExerciseHints`, the web's `exerciseNudges`). Rendered under the
   * exercise header in BOTH views — beside the Last/PR lines in Live, in
   * the exercise card in Track. Omitted, no hint renders.
   */
  exerciseHints?: Record<string, { id: string; title: string; body: string }>;
  /** Dismiss a hint for `slug` on the account (the web's `dismissNudge`). */
  onDismissHint?: (slug: string) => void;
  /**
   * True when this workout resumed in-progress work (the server's open log
   * or a fresh on-device draft). Renders the web's resume indicator - a
   * small "Resuming where you left off" line under the progress count -
   * for the first seconds of the session.
   */
  resumed?: boolean;
  /**
   * Open the skip sheet when the primary button is pressed with blank
   * inputs (the web's `handleCompleteOrSkipSet`). Off, the button always
   * completes (NP-220's contract, and what its tests assert). On, a blank
   * step reads `Skip <unit>` and the press opens the skip sheet instead
   * of writing zeros silently. The route leaves it on; unit tests opt in
   * per case.
   */
  enableSkipFlow?: boolean;
  testID?: string;
}

const DEFAULT_REST_SEC = 90;

/**
 * Parse a web-style rest string ("90s", "3min", "120") into seconds — the
 * web live client's `parseRestTime`, verbatim.
 */
export function parseRestSeconds(rest: string | null | undefined): number {
  if (!rest) return 60;
  const match = rest.match(/(\d+)/);
  if (!match) return 60;
  const num = parseInt(match[1]!, 10);
  if (rest.includes("min")) return num * 60;
  return num;
}

/** Smart rest default by tracking type — the web live client's rule. */
function smartRestDefault(exercise?: LiveWorkoutExercise): string {
  const t = normalizeTracking(exercise?.trackingType ?? null);
  if (t === "reps_weight") return "3min";
  if (t === "reps_bodyweight" || t === "reps_only") return "90s";
  return "60s";
}

/**
 * Rest AFTER this step, in seconds — the web live client's `getRestDuration`
 * (line ~1283): no rest between exercises inside a round; after a round's
 * last exercise rest `groupRest || rest || smart default`. Ungrouped steps
 * rest their own `rest` (or the smart default). Only gates WHEN the existing
 * rest bar starts; the timer itself is NP-082's.
 */
export function restAfterStep(
  step: { groupId: string | null; isLastInRound: boolean },
  exercise?: LiveWorkoutExercise,
): number {
  if (step.groupId && !step.isLastInRound) return 0;
  if (step.groupId && step.isLastInRound) {
    return parseRestSeconds(
      exercise?.groupRest ??
        (exercise?.restSec != null ? `${exercise.restSec}s` : undefined) ??
        smartRestDefault(exercise),
    );
  }
  return parseRestSeconds(
    exercise?.restSec != null ? `${exercise.restSec}s` : smartRestDefault(exercise),
  );
}

/**
 * The group label for the current step — the web live client's
 * `supersetLabel`: the exercise's own `groupLabel` first, else the group
 * type + round number. Driven from the CURRENT EXERCISE (the route never
 * sets `workout.groupType`), so a superset block reads as one.
 */
export function groupLabelForStep(
  step: { groupId: string | null; roundNumber: number } | undefined,
  exercise?: LiveWorkoutExercise,
): string | null {
  if (!step?.groupId || !exercise) return null;
  const round = step.roundNumber + 1;
  if (exercise.groupLabel) return `${exercise.groupLabel} · ${round}`;
  const gtype = exercise.groupType?.toUpperCase() ?? "ROUND";
  return `${gtype} ${round}`;
}

/**
 * Total rounds for the current step's block: R = max(groupRounds, sets) —
 * the same max the shared `buildWorkoutFlow` walks, so the nav reads
 * "Round r of R" over exactly the rounds the member will walk.
 */
export function totalRoundsForStep(
  step: { groupId: string | null } | undefined,
  exercise: LiveWorkoutExercise | undefined,
  exercises: LiveWorkoutExercise[],
): number {
  if (!step?.groupId || !exercise) return 1;
  const members = exercises.filter((m) => m.groupId === step.groupId);
  const maxSets = Math.max(
    exercise.groupRounds ?? 0,
    ...members.map((m) => m.sets || 0),
  );
  return maxSets > 0 ? maxSets : 1;
}

/** The web live client's primary-action label for the current step. */
export function liveCompleteLabel(
  isLastStep: boolean,
  trackingType?: string | null,
): string {
  if (isLastStep) return "Finish Workout";
  if (normalizeTracking(trackingType ?? null) === "intervals") return "Done →";
  return `Complete ${setUnitLabel(trackingType ?? null, 1)} →`;
}

function initialGrid(
  exercises: LiveWorkoutExercise[],
  restored?: LiveGrid | null,
): LiveGrid {
  const grid: LiveGrid = {};
  for (const ex of exercises) {
    const saved = restored?.[ex.slug];
    grid[ex.slug] = Array.from({ length: ex.sets }, (_, i) => {
      // Prefer a restored in-flight set, falling back to prefill defaults. The
      // workout structure (set count) always wins, so a stale cache can't add
      // phantom sets.
      const restoredSet = saved?.[i];
      if (restoredSet) return { ...restoredSet };
      // Sets start blank; last time's numbers are a reference and are never
      // written into the inputs (the web stopped pre-filling because members
      // logged numbers they never lifted).
      return {
        weight: null,
        reps: null,
        durationSec: null,
        distance: null,
        speed: null,
        completed: false,
      };
    });
  }
  return grid;
}

/**
 * One set as the shared `isSetFilled` reads it — strings, the way the web's
 * inputs hand them over. Native keeps numbers in the grid, so this is the
 * translation and nothing more: no rounding, no coercion of a real 0.
 */
function typedSet(state: LiveSetState): {
  reps: string;
  weight: string;
  duration: string;
  distance: string;
  speed: string;
} {
  const s = (v: number | null | undefined) =>
    v === null || v === undefined ? "" : String(v);
  return {
    reps: s(state.reps),
    weight: s(state.weight),
    duration: s(state.durationSec),
    distance: s(state.distance),
    speed: s(state.speed),
  };
}

/** The sets of each exercise, by exercise index — what `resolveStartStep` reads. */
function setsByExercise(
  exercises: LiveWorkoutExercise[],
  grid: LiveGrid,
): LiveSetState[][] {
  return exercises.map((ex) => grid[ex.slug] ?? []);
}

/**
 * A set in words for the edit-confirm modal's Before / After boxes - the
 * web shows `weight lbs x reps` beside each. Timed work reads as its
 * duration; anything with neither reads as logged.
 */
function describeSet(state: LiveSetState, trackingType?: string | null): string {
  const num = (v: number | null | undefined) =>
    v === null || v === undefined ? null : String(v);
  const reps = num(state.reps);
  const weight = num(state.weight);
  if (reps !== null && weight !== null) return weight + " lbs x " + reps;
  if (reps !== null) return reps + " " + setUnitLabel(trackingType ?? null, 1).toLowerCase();
  if (weight !== null) return weight + " lbs";
  if (state.durationSec !== null && state.durationSec !== undefined)
    return String(state.durationSec) + "s";
  return "logged";
}

/**
 * Did the member change the numbers since the set was marked done? The
 * web's edit-confirm gate compares saved vs inputs field by field; native
 * compares the completion snapshot with the row. `completed` itself is
 * not compared — both sides are done by construction.
 */
function sameSetValues(a: LiveSetState, b: LiveSetState): boolean {
  return (
    (a.reps ?? null) === (b.reps ?? null) &&
    (a.weight ?? null) === (b.weight ?? null) &&
    (a.durationSec ?? null) === (b.durationSec ?? null) &&
    (a.distance ?? null) === (b.distance ?? null) &&
    (a.speed ?? null) === (b.speed ?? null)
  );
}

/**
 * ONE WORKOUT, TWO VIEWS (NP-087).
 *
 * Track (every exercise and every set on one screen) and Live (one set at a
 * time) are the same grid, the same rest timer, the same notes and the same
 * save — exactly as on the web, where `WorkoutFormClient` and the live client
 * share progress and a remembered position. Natively they are two renderings
 * of one component, so flipping is a state change rather than a reload and the
 * position never has to survive a round trip to be right.
 *
 * Two rules travel from the web with the views:
 *
 *  * A set ticks itself DONE the moment it holds what its tracking type asks
 *    for (`isSetFilled` — reps and weight for `reps_weight`, reps for
 *    bodyweight, duration for time, any of duration/distance for cardio;
 *    `none` is ticked by hand), and un-ticks if a required field is cleared.
 *    A manual tap on the checkbox is always obeyed.
 *  * Complete Workout appears only when EVERY set is done. It used to be an
 *    always-visible "Finish workout", which made a half-logged session one tap
 *    from being filed as a finished one.
 */
export function LiveWorkoutClient({
  workout,
  onSetComplete,
  restoredGrid,
  onGridChange,
  onFinish,
  finishing = false,
  saveError,
  pendingSync = false,
  onRequestSwap,
  initialView = "track",
  notes: notesProp,
  onNotesChange,
  positionScope,
  positionStore,
  restTimerSetInterval,
  restTimerClearInterval,
  restTimerNow,
  restAlertDeps,
  onRestEnd,
  celebratedPrIds,
  exerciseHistory,
  exercisePRs,
  exerciseHints,
  onDismissHint,
  resumed = false,
  enableSkipFlow = false,
  testID = "live-workout",
}: LiveWorkoutClientProps) {
  const { colors, tint } = useThemeTokens();
  const [grid, setGrid] = useState<LiveGrid>(() =>
    initialGrid(workout.exercises, restoredGrid),
  );
  // Mirror of the latest grid so that two edits within a single render cycle
  // compose instead of clobbering each other (the closure `grid` would be stale
  // for the second edit).
  const gridRef = useRef<LiveGrid>(grid);
  // What each completed set held the moment it was marked done (the web's
  // edit-confirm rule compares the saved values with the inputs: same
  // values re-save silently, changed values ask first). Keyed
  // `slug:setIndex`; cleared whenever the set becomes incomplete again.
  const completedSnapshot = useRef<Map<string, LiveSetState>>(new Map());
  // The mirror is maintained AFTER commit, never during render: writing a ref
  // while rendering is what `react-hooks/refs` reports, and under a re-render
  // that React throws away it leaves the ref holding a grid the UI never
  // showed. Every edit below assigns `gridRef.current` itself before calling
  // setGrid, so two edits inside one render cycle still compose; this effect
  // only has to cover the grid changes that do not come from an edit (mount and
  // the re-seed below).
  useEffect(() => {
    gridRef.current = grid;
  }, [grid]);
  const [round, setRound] = useState<number>(1);
  const totalRounds = workout.groupRounds ?? 1;
  const [view, setView] = useState<WorkoutView>(initialView);
  const [notes, setNotes] = useState<string>(notesProp ?? "");
  // The web shows its "Resuming" pill for 3s after a resume; native shows
  // the same line until it ages out. Timer-free: the flag arrives as a
  // prop and clears on the first edit, which is the first thing a resumed
  // member does.
  const [showResumed, setShowResumed] = useState(resumed);
  // The web live client's two overlays: the exercise list sheet (tap to
  // jump) and the skip confirmation modal (this set / this exercise).
  const [sheetOpen, setSheetOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  // Re-completing a finished step asks first (the web's edit-confirm
  // modal), showing Before → After. Held here so the modal can read the
  // saved values after the member has already typed the new ones.
  const [editConfirm, setEditConfirm] = useState<{
    exerciseIndex: number;
    setIndex: number;
    before: string;
    after: string;
  } | null>(null);

  /**
   * The interleaved rounds for every grouped block (NP-172): the same
   * `buildWorkoutFlow` the web live view runs, over the same consecutive
   * `groupId` runs the builder saves. `flowIndexByKey` maps each
   * `exerciseIndex:setIndex` to its position in the flow, so the rounds strip
   * under a block header can walk the member through the block round by round
   * instead of exercise by exercise — and so the Live view can step through
   * the workout in the order it actually runs.
   */
  const workoutFlow = useMemo(
    () =>
      buildWorkoutFlow(
        workout.exercises.map((ex) => ({
          name: ex.name,
          exerciseSlug: ex.slug,
          sets: ex.sets,
          ...(ex.groupId ? { groupId: ex.groupId } : {}),
          ...(ex.groupType ? { groupType: ex.groupType } : {}),
          ...(ex.groupLabel ? { groupLabel: ex.groupLabel } : {}),
          ...(ex.groupRounds ? { groupRounds: ex.groupRounds } : {}),
          ...(ex.groupRest ? { groupRest: ex.groupRest } : {}),
        })),
      ),
    [workout.exercises],
  );
  const flowIndexByKey = useMemo(() => {
    const map = new Map<string, number>();
    workoutFlow.forEach((step, flowIndex) => {
      map.set(`${step.exerciseIndex}:${step.setIndex}`, flowIndex);
    });
    return map;
  }, [workoutFlow]);

  // WHERE THE MEMBER IS — shared by the two views, which is the whole point of
  // remembering it. Held in state (the views are one component) and mirrored to
  // the device through `positionScope`, under the key the web writes.
  // Nothing RENDERS from it, so it is a ref and not state: it is read when the
  // other view opens and written on every move.
  const positionRef = useRef<WorkoutPosition | null>(null);
  const [liveStepIndex, setLiveStepIndex] = useState<number>(0);

  // Single rest countdown, (re)started whenever a set is completed, and shared
  // by the two views for the same reason the grid is. The timer stores
  // `endsAt` and derives what is left from the clock (NP-082), so a locked
  // phone shows the right remainder on return; the locked-phone alert is
  // scheduled only when notification permission is already granted.
  const rest = useRestTimer({
    setIntervalImpl: restTimerSetInterval,
    clearIntervalImpl: restTimerClearInterval,
    ...(restTimerNow !== undefined ? { now: restTimerNow } : {}),
    ...(restAlertDeps !== undefined ? { restAlertDeps } : {}),
    ...(onRestEnd !== undefined ? { onRestEnd } : {}),
  });

  // A new PR from the save feels like one: a heavy impact per record id the
  // screen has not celebrated yet. Ids (never the count) so a re-render with
  // the same records stays silent.
  const celebratedPrIdsRef = useRef<string[]>([]);
  useEffect(() => {
    if (!celebratedPrIds || celebratedPrIds.length === 0) return;
    const seen = new Set(celebratedPrIdsRef.current);
    const fresh = celebratedPrIds.filter((id) => !seen.has(id));
    if (fresh.length === 0) return;
    celebratedPrIdsRef.current = [...celebratedPrIdsRef.current, ...fresh];
    for (let i = 0; i < fresh.length; i++) prHaptic();
  }, [celebratedPrIds]);

  // Re-seed when the workout identity or the restored snapshot changes (e.g. a
  // cache load resolves after mount). Canonical identity-change-driven reset;
  // the lint rule guards against unnecessary cascades, not necessary ones.
  useEffect(() => {
    const seeded = initialGrid(workout.exercises, restoredGrid);
    gridRef.current = seeded;
    completedSnapshot.current = new Map();
    for (const ex of workout.exercises) {
      (seeded[ex.slug] ?? []).forEach((st, i) => {
        if (st.completed) completedSnapshot.current.set(ex.slug + ":" + i, { ...st });
      });
    }
    /* eslint-disable react-hooks/set-state-in-effect */
    setGrid(seeded);
    setRound(1);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [workout, restoredGrid]);

  // A position remembered on this device, for the workout this scope names.
  // It comes from storage — outside React — so it arrives in an effect; the
  // member's own first move always wins over it.
  useEffect(() => {
    if (!positionScope || !positionStore) return;
    let alive = true;
    void (async () => {
      const saved = await readWorkoutPosition(positionScope, positionStore);
      if (!alive || !saved || positionRef.current) return;
      positionRef.current = saved;
    })();
    return () => {
      alive = false;
    };
  }, [positionScope, positionStore]);

  const rememberPosition = useCallback(
    (exerciseIndex: number, setIndex: number) => {
      const next: WorkoutPosition = {
        exerciseIndex,
        setIndex,
        at: Date.now(),
      };
      positionRef.current = next;
      if (positionScope && positionStore) {
        void writeWorkoutPosition(
          positionScope,
          exerciseIndex,
          setIndex,
          positionStore,
          next.at,
        );
      }
    },
    [positionScope, positionStore],
  );

  /**
   * Where you are after touching a set.
   *
   * The web writes the set you last typed into. Native writes the same thing
   * with one refinement the shared `resolveStartStep` then honours verbatim:
   * once a set has TICKED ITSELF DONE you are no longer standing on it, you
   * are standing on the next one — so logging two sets in Track and flipping
   * to Live opens Live on the third set rather than back on the second. Untick
   * a set to redo it and the position is that set again, which is the case the
   * web's own test calls out ("you went back to redo it").
   */
  const rememberAfterEdit = useCallback(
    (exerciseIndex: number, setIndex: number, completed: boolean) => {
      if (completed) {
        const flowIndex = flowIndexByKey.get(`${exerciseIndex}:${setIndex}`);
        const nextStep =
          flowIndex === undefined ? undefined : workoutFlow[flowIndex + 1];
        if (nextStep) {
          rememberPosition(nextStep.exerciseIndex, nextStep.setIndex);
          return;
        }
      }
      rememberPosition(exerciseIndex, setIndex);
    },
    [flowIndexByKey, workoutFlow, rememberPosition],
  );

  const handleSetChange = useCallback(
    (exerciseIndex: number, setIndex: number, next: LiveSetState) => {
      const ex = workout.exercises[exerciseIndex];
      if (!ex) return;
      const prev = gridRef.current[ex.slug]?.[setIndex];
      // A tap on the checkbox is the member's own call and is always obeyed;
      // anything else re-asks `isSetFilled` whether the set is done.
      const manualToggle = !!prev && prev.completed !== next.completed;
      const resolved: LiveSetState = manualToggle
        ? next
        : { ...next, completed: isSetFilled(ex.trackingType, typedSet(next)) };
      const justCompleted = !prev?.completed && resolved.completed;
      const key = ex.slug + ":" + setIndex;
      if (manualToggle && !resolved.completed) {
        // The member explicitly reopened the set: forget what was done.
        completedSnapshot.current.delete(key);
      } else if (justCompleted && !completedSnapshot.current.has(key)) {
        // First completion records what was done; further typing into a
        // done set dirties it against this snapshot (the web's Before vs
        // inputs) instead of moving the goalposts.
        completedSnapshot.current.set(key, { ...resolved });
      }

      const updated = applySetUpdate(
        gridRef.current,
        ex.slug,
        setIndex,
        resolved,
      );
      gridRef.current = updated;
      setGrid(updated);
      setShowResumed(false);
      onGridChange?.(updated);
      rememberAfterEdit(exerciseIndex, setIndex, resolved.completed);
      if (justCompleted) {
        // The web's rest rule: only the round's LAST exercise starts the
        // bar. `rest.start` is the only thing gated — the timer is NP-082's.
        // The tap is the physical tick that the set landed.
        setCompleteHaptic();
        const flowIndex = flowIndexByKey.get(`${exerciseIndex}:${setIndex}`);
        const step = flowIndex === undefined ? undefined : workoutFlow[flowIndex];
        const restSec = step
          ? restAfterStep(step, ex)
          : (ex.restSec ?? DEFAULT_REST_SEC);
        if (restSec > 0) rest.start(restSec);
        void onSetComplete?.({
          exerciseSlug: ex.slug,
          setIndex,
          state: resolved,
        });
      }
    },
    [workout.exercises, workoutFlow, flowIndexByKey, onGridChange, onSetComplete, rememberAfterEdit, rest],
  );

  const handleStepChange = useCallback(
    (nextIndex: number) => {
      setLiveStepIndex(nextIndex);
      const step = workoutFlow[nextIndex];
      if (step) rememberPosition(step.exerciseIndex, step.setIndex);
    },
    [workoutFlow, rememberPosition],
  );

  /**
   * The web's primary action (`completeSet` / `advanceStep`): mark the
   * CURRENT step's set done with exactly what was typed — blank stays
   * blank, never last time's numbers — through the existing set-change
   * path, then move to the next step of `workoutFlow`. On the last step
   * there is nowhere to move to, so it enters the existing finish flow
   * (`onFinish`: the incomplete prompt and midnight choice from NP-085,
   * then the NP-086 summary). The checkbox tap stays the member's own
   * call for every other set; this button is the call for THIS one.
   */
  const handleCompleteStep = useCallback(() => {
    const step = workoutFlow[liveStepIndex];
    if (!step) return;
    const ex = workout.exercises[step.exerciseIndex];
    if (!ex) return;
    const isLastStep = liveStepIndex >= workoutFlow.length - 1;
    const prev = gridRef.current[ex.slug]?.[step.setIndex];
    const snap = completedSnapshot.current.get(ex.slug + ":" + step.setIndex);
    const changedSinceDone =
      !!prev?.completed && (!snap || !sameSetValues(snap, prev));
    if (changedSinceDone) {
      setEditConfirm({
        exerciseIndex: step.exerciseIndex,
        setIndex: step.setIndex,
        before: describeSet(prev, ex.trackingType),
        after: describeSet(
          {
            reps: prev.reps ?? null,
            weight: prev.weight ?? null,
            durationSec: prev.durationSec ?? null,
            distance: prev.distance ?? null,
            speed: prev.speed ?? null,
            completed: true,
          },
          ex.trackingType,
        ),
      });
      return;
    }
    const current: LiveSetState = prev ?? {
      reps: null,
      weight: null,
      durationSec: null,
      distance: null,
      speed: null,
      completed: false,
    };
    // Exactly what was typed — blank stays blank. `handleSetChange` would
    // re-ask `isSetFilled` and refuse to tick an empty set; the web's
    // Complete button always completes, so this path always does.
    const resolved: LiveSetState = { ...current, completed: true };
    const updated = applySetUpdate(gridRef.current, ex.slug, step.setIndex, resolved);
    gridRef.current = updated;
    completedSnapshot.current.set(ex.slug + ":" + step.setIndex, { ...resolved });
    setGrid(updated);
    onGridChange?.(updated);
    // The web's rest rule, same as the checkbox path: only the round's
    // last exercise starts the bar — including on the last step, where the
    // finish flow opens AND the bar runs behind it (the web's `completeSet`
    // saves, advances to the summary, and leaves the rest running).
    setCompleteHaptic();
    const restSec = restAfterStep(step, ex);
    if (restSec > 0) rest.start(restSec);
    void onSetComplete?.({
      exerciseSlug: ex.slug,
      setIndex: step.setIndex,
      state: resolved,
    });
    if (isLastStep) {
      rememberPosition(step.exerciseIndex, step.setIndex);
      onFinish?.(updated);
      return;
    }
    const nextStep = workoutFlow[liveStepIndex + 1];
    if (nextStep) {
      setLiveStepIndex(liveStepIndex + 1);
      rememberPosition(nextStep.exerciseIndex, nextStep.setIndex);
    }
  }, [
    workoutFlow,
    liveStepIndex,
    workout.exercises,
    onGridChange,
    onFinish,
    onSetComplete,
    rememberPosition,
    rest,
  ]);

  /**
   * Write one set through the existing set-change path - grid, cache,
   * position, rest and the debounced save - then move the Live step.
   * `advance` decides where the member stands afterwards: the next step,
   * a jump target, or the finish flow (null means finish).
   */
  const commitSetAndMove = useCallback(
    (
      exerciseIndex: number,
      setIndex: number,
      resolved: LiveSetState,
      advance: { exerciseIndex: number; setIndex: number } | null | undefined,
    ) => {
      const target = workout.exercises[exerciseIndex];
      if (!target) return;
      const updated = applySetUpdate(gridRef.current, target.slug, setIndex, resolved);
      gridRef.current = updated;
      completedSnapshot.current.set(target.slug + ":" + setIndex, { ...resolved });
      setGrid(updated);
      onGridChange?.(updated);
      const flowIndex = flowIndexByKey.get(exerciseIndex + ":" + setIndex);
      const atStep = flowIndex === undefined ? undefined : workoutFlow[flowIndex];
      const restSec = atStep
        ? restAfterStep(atStep, target)
        : (target.restSec ?? DEFAULT_REST_SEC);
      setCompleteHaptic();
      if (restSec > 0) rest.start(restSec);
      void onSetComplete?.({ exerciseSlug: target.slug, setIndex, state: resolved });
      if (advance === null) {
        rememberPosition(exerciseIndex, setIndex);
        onFinish?.(updated);
        return;
      }
      if (advance) {
        const at = flowIndexByKey.get(advance.exerciseIndex + ":" + advance.setIndex);
        if (at !== undefined) setLiveStepIndex(at);
        rememberPosition(advance.exerciseIndex, advance.setIndex);
      }
    },
    [workout.exercises, workoutFlow, flowIndexByKey, onGridChange, onFinish, onSetComplete, rememberPosition, rest],
  );

  /**
   * The web's `skipSet`: the current step's set is saved as completed with
   * reps 0 and weight 0 - the shape history, PR detection and the calendar
   * read as "skipped" rather than "unfinished" - then the flow advances
   * exactly as a completion does, including the finish flow on the last
   * step.
   */
  const handleSkipSet = useCallback(() => {
    const step = workoutFlow[liveStepIndex];
    if (!step) return;
    const isLastStep = liveStepIndex >= workoutFlow.length - 1;
    setSkipOpen(false);
    if (isLastStep) {
      commitSetAndMove(step.exerciseIndex, step.setIndex, skippedSetState(), null);
      return;
    }
    const nextStep = workoutFlow[liveStepIndex + 1];
    commitSetAndMove(step.exerciseIndex, step.setIndex, skippedSetState(), nextStep);
  }, [workoutFlow, liveStepIndex, commitSetAndMove]);

  /**
   * The web's `skipExercise`: every set of the current exercise is saved
   * as skipped (reps 0, weight 0, completed), then the member stands on
   * the next exercise - or enters the finish flow when the skipped
   * exercise was the last one with work left.
   */
  const handleSkipExercise = useCallback(() => {
    const step = workoutFlow[liveStepIndex];
    if (!step) return;
    const skippedExerciseIndex = step.exerciseIndex;
    const ex = workout.exercises[skippedExerciseIndex];
    if (!ex) return;
    setSkipOpen(false);
    let updated = gridRef.current;
    const count = updated[ex.slug]?.length ?? ex.sets;
    for (let i = 0; i < count; i++) {
      updated = applySetUpdate(updated, ex.slug, i, skippedSetState());
      completedSnapshot.current.set(ex.slug + ":" + i, skippedSetState());
    }
    let nextIdx = liveStepIndex + 1;
    while (
      nextIdx < workoutFlow.length &&
      workoutFlow[nextIdx]?.exerciseIndex === skippedExerciseIndex
    ) {
      nextIdx++;
    }
    gridRef.current = updated;
    setGrid(updated);
    onGridChange?.(updated);
    setCompleteHaptic();
    const restSec = restAfterStep(step, ex);
    if (restSec > 0) rest.start(restSec);
    void onSetComplete?.({ exerciseSlug: ex.slug, setIndex: step.setIndex, state: skippedSetState() });
    if (nextIdx >= workoutFlow.length) {
      rememberPosition(step.exerciseIndex, step.setIndex);
      onFinish?.(updated);
      return;
    }
    const nextStep = workoutFlow[nextIdx];
    if (nextStep) {
      setLiveStepIndex(nextIdx);
      rememberPosition(nextStep.exerciseIndex, nextStep.setIndex);
    }
  }, [workoutFlow, liveStepIndex, workout.exercises, onGridChange, onFinish, onSetComplete, rememberPosition, rest]);

  /**
   * Jump to an exercise: its first set that still needs doing (the web's
   * `goToExercise`). When everything of it is done, its first set - so
   * the member can review rather than landing nowhere.
   */
  const handleJumpToExercise = useCallback(
    (exerciseIndex: number) => {
      const target = workoutFlow.findIndex(
        (st) =>
          st.exerciseIndex === exerciseIndex &&
          !gridRef.current[workout.exercises[st.exerciseIndex]?.slug ?? ""]?.[st.setIndex]?.completed,
      );
      const at =
        target === -1
          ? workoutFlow.findIndex((st) => st.exerciseIndex === exerciseIndex)
          : target;
      if (at === -1) return;
      setSheetOpen(false);
      setLiveStepIndex(at);
      const landed = workoutFlow[at];
      if (landed) rememberPosition(landed.exerciseIndex, landed.setIndex);
    },
    [workoutFlow, workout.exercises, rememberPosition],
  );

  /** The edit-confirm modal's Save Changes: overwrite the finished set. */
  const handleConfirmEdit = useCallback(() => {
    if (!editConfirm) return;
    const ex = workout.exercises[editConfirm.exerciseIndex];
    if (!ex) {
      setEditConfirm(null);
      return;
    }
    const prev = gridRef.current[ex.slug]?.[editConfirm.setIndex];
    const resolved: LiveSetState = {
      reps: prev?.reps ?? null,
      weight: prev?.weight ?? null,
      durationSec: prev?.durationSec ?? null,
      distance: prev?.distance ?? null,
      speed: prev?.speed ?? null,
      completed: true,
    };
    const updated = applySetUpdate(gridRef.current, ex.slug, editConfirm.setIndex, resolved);
    const at = { exerciseIndex: editConfirm.exerciseIndex, setIndex: editConfirm.setIndex };
    completedSnapshot.current.set(ex.slug + ":" + at.setIndex, { ...resolved });
    setEditConfirm(null);
    gridRef.current = updated;
    setGrid(updated);
    onGridChange?.(updated);
    rememberPosition(at.exerciseIndex, at.setIndex);
    void onSetComplete?.({ exerciseSlug: ex.slug, setIndex: at.setIndex, state: resolved });
  }, [editConfirm, workout.exercises, onGridChange, onSetComplete, rememberPosition]);

  const handleViewChange = useCallback(
    (nextView: WorkoutView) => {
      if (nextView === "live") {
        // The shared rule, unchanged: the remembered position first, then the
        // first set that still needs doing, then the last step.
        setLiveStepIndex(
          resolveStartStep(
            workoutFlow,
            setsByExercise(workout.exercises, gridRef.current),
            positionRef.current,
          ),
        );
      }
      setView(nextView);
    },
    [workoutFlow, workout.exercises],
  );

  const handleNotesChange = useCallback(
    (value: string) => {
      setNotes(value);
      onNotesChange?.(value);
    },
    [onNotesChange],
  );

  // The web's `isSkipping` rule, read off the CURRENT Live step's inputs:
  // blank inputs mean the primary button offers to skip rather than
  // complete. Intervals never skip - there is nothing required to be
  // blank. On the last step the web finishes instead of asking.
  const liveStep = workoutFlow[liveStepIndex];
  const liveExercise = liveStep ? workout.exercises[liveStep.exerciseIndex] : undefined;
  // `grid` (state), never `gridRef`: refs cannot be read during render,
  // and the ref mirrors the state after every commit anyway. A step the
  // member has never typed into has no row yet — blank, like the web's
  // empty strings — except a set already restored as done, which is never
  // a skip candidate.
  const liveRow = liveStep && liveExercise
    ? grid[liveExercise.slug]?.[liveStep.setIndex]
    : undefined;
  const liveCurrent: LiveSetState | undefined = liveRow;
  const liveTracking = normalizeTracking(liveExercise?.trackingType ?? null);
  // The web's `isSkipping`, read off the step's inputs: blank means the
  // primary button offers to skip rather than complete. Intervals never
  // skip - there is nothing required to be blank - and a finished step
  // never skips either (it opens the edit-confirm modal instead).
  const isSkippingLive =
    !enableSkipFlow || liveCurrent?.completed
      ? false
      : liveTracking === "intervals"
        ? false
        : liveTracking === "reps_weight"
          ? (liveCurrent?.reps ?? null) === null &&
            (liveCurrent?.weight ?? null) === null
          : liveTracking === "time" || liveTracking === "time_distance"
            ? (liveCurrent?.durationSec ?? null) === null &&
              (liveCurrent?.distance ?? null) === null &&
              (liveCurrent?.speed ?? null) === null &&
              (liveCurrent?.reps ?? null) === null
            : (liveCurrent?.reps ?? null) === null;
  const skipStep = liveStep && liveExercise ? { exercise: liveExercise, setIndex: liveStep.setIndex } : null;
  const exerciseDoneFlags = workout.exercises.map((ex) =>
    (grid[ex.slug] ?? []).length > 0 && (grid[ex.slug] ?? []).every((st) => st.completed),
  );

  const totalSets = useMemo(
    () => workout.exercises.reduce((acc, ex) => acc + (grid[ex.slug]?.length ?? 0), 0),
    [workout.exercises, grid],
  );
  const completedSets = useMemo(
    () =>
      workout.exercises.reduce(
        (acc, ex) => acc + (grid[ex.slug] ?? []).filter((s) => s.completed).length,
        0,
      ),
    [workout.exercises, grid],
  );
  // The web's rule verbatim: the button exists at 100% and nowhere else.
  // Live has no separate Finish button — completing the last step IS the
  // finish (the web has no always-visible Complete Workout in Live either).
  const allSetsDone = totalSets > 0 && completedSets === totalSets;

  const finishButton =
    allSetsDone && view === "track" ? (
      <Button
        testID={`${testID}-finish`}
        variant="primary"
        disabled={finishing}
        onPress={() => onFinish?.(gridRef.current)}
      >
        {finishing ? "Saving…" : "Complete Workout! 🎉"}
      </Button>
    ) : null;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID={testID}
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <WorkoutViewToggle
          testID={`${testID}-view`}
          active={view}
          onChange={handleViewChange}
        />
        <Text testID={`${testID}-title`} className="text-foreground text-2xl font-bold">
          {workout.workoutTitle}
        </Text>
        <Text
          testID={`${testID}-progress`}
          className="text-muted-foreground text-xs"
        >
          {`${completedSets} of ${totalSets} sets done`}
        </Text>
        {showResumed ? (
          <Text
            testID={`${testID}-resume-indicator`}
            className="text-muted-foreground text-xs"
          >
            Resuming where you left off
          </Text>
        ) : null}

        {view === "track" ? (
          <TrackWorkoutView
            testID={testID}
            exercises={workout.exercises}
            grid={grid}
            workoutFlow={workoutFlow}
            flowIndexByKey={flowIndexByKey}
            groupType={workout.groupType}
            round={round}
            totalRounds={totalRounds}
            onRoundChange={setRound}
            onSetChange={handleSetChange}
            onRequestSwap={onRequestSwap}
            notes={notes}
            onNotesChange={handleNotesChange}
            showNotes={completedSets > 0}
            exerciseHints={exerciseHints}
            onDismissHint={onDismissHint}
          />
        ) : (
          <>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                testID={`${testID}-live-exercises`}
                variant="secondary"
                onPress={() => setSheetOpen(true)}
                accessibilityLabel="Open exercise list"
              >
                Exercises
              </Button>
            </View>
          </View>
          <LiveStepView
            testID={testID}
            exercises={workout.exercises}
            grid={grid}
            workoutFlow={workoutFlow}
            stepIndex={liveStepIndex}
            onStepChange={handleStepChange}
            onSetChange={handleSetChange}
            onCompleteStep={handleCompleteStep}
            onRequestSkip={enableSkipFlow ? () => setSkipOpen(true) : undefined}
            isSkipping={isSkippingLive}
            onRequestSwap={onRequestSwap}
            exerciseHistory={exerciseHistory}
            exercisePRs={exercisePRs}
            exerciseHints={exerciseHints}
            onDismissHint={onDismissHint}
          />
          <LiveExerciseSheet
            visible={sheetOpen}
            onClose={() => setSheetOpen(false)}
            exercises={workout.exercises}
            completed={exerciseDoneFlags}
            currentExerciseIndex={liveStep?.exerciseIndex ?? 0}
            onJump={handleJumpToExercise}
            testID={testID}
          />
          {skipStep ? (
            <LiveSkipModal
              visible={skipOpen}
              onClose={() => setSkipOpen(false)}
              onSkipSet={handleSkipSet}
              onSkipExercise={handleSkipExercise}
              exercise={skipStep.exercise}
              setIndex={skipStep.setIndex}
              testID={testID}
            />
          ) : null}
          <LiveEditConfirmModal
            visible={editConfirm !== null}
            onClose={() => setEditConfirm(null)}
            onConfirm={handleConfirmEdit}
            exerciseName={
              editConfirm ? workout.exercises[editConfirm.exerciseIndex]?.name : undefined
            }
            beforeLabel={editConfirm?.before}
            afterLabel={editConfirm?.after}
            testID={testID}
          />
          </>
        )}

        {rest.active && rest.remainingSec > 0 ? (
          <RestTimerBar
            testID={`${testID}-rest`}
            remainingSec={rest.remainingSec}
            totalSec={rest.totalSec}
            running={rest.running}
            onPause={rest.pause}
            onResume={rest.resume}
            onSkip={rest.skip}
          />
        ) : null}
        {pendingSync && !saveError ? (
          <View
            testID={`${testID}-pending-sync-banner`}
            style={{
              padding: 12,
              borderRadius: 8,
              backgroundColor: tint("primary", 0.12),
              gap: 8,
              marginTop: 12,
            }}
          >
            <Text
              testID={`${testID}-pending-sync-message`}
              className="text-foreground font-medium text-sm"
            >
              Saved on this phone — will sync when you&apos;re back online.
            </Text>
            <Button
              testID={`${testID}-retry`}
              variant="secondary"
              size="sm"
              onPress={() => onFinish?.(gridRef.current)}
            >
              Retry
            </Button>
          </View>
        ) : null}
        {saveError ? (
          <View
            testID={`${testID}-error-banner`}
            style={{
              padding: 12,
              borderRadius: 8,
              backgroundColor: tint("destructive", 0.15),
              gap: 8,
              marginTop: 12,
            }}
          >
            <Text
              testID={`${testID}-error-message`}
              className="text-destructive font-medium text-sm"
            >
              {typeof saveError === "string"
                ? saveError
                : "Couldn’t save workout. You appear to be offline."}
            </Text>
            <Button
              testID={`${testID}-retry`}
              variant="secondary"
              size="sm"
              onPress={() => onFinish?.(gridRef.current)}
            >
              Retry
            </Button>
          </View>
        ) : null}
        <View style={{ height: 24 }} />
        {finishButton}
      </ScrollView>
    </SafeAreaView>
  );
}
