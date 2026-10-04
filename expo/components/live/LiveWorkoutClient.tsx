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
import type { VideoFramingOverride } from "@/lib/videoFraming";
import type { VideoTrimOverride } from "@/lib/videoTrim";
import { useRestTimer } from "@/lib/live/useRestTimer";
import { RestTimerBar } from "@/components/live/RestTimerBar";
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
  // by the two views for the same reason the grid is.
  const rest = useRestTimer({
    setIntervalImpl: restTimerSetInterval,
    clearIntervalImpl: restTimerClearInterval,
  });

  // Re-seed when the workout identity or the restored snapshot changes (e.g. a
  // cache load resolves after mount). Canonical identity-change-driven reset;
  // the lint rule guards against unnecessary cascades, not necessary ones.
  useEffect(() => {
    const seeded = initialGrid(workout.exercises, restoredGrid);
    gridRef.current = seeded;
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

      const updated = applySetUpdate(
        gridRef.current,
        ex.slug,
        setIndex,
        resolved,
      );
      gridRef.current = updated;
      setGrid(updated);
      onGridChange?.(updated);
      rememberAfterEdit(exerciseIndex, setIndex, resolved.completed);
      if (justCompleted) {
        // The web's rest rule: only the round's LAST exercise starts the
        // bar. `rest.start` is the only thing gated — the timer is NP-082's.
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
    const current: LiveSetState = prev ?? {
      reps: null,
      weight: null,
      durationSec: null,
      distance: null,
      completed: false,
    };
    // Exactly what was typed — blank stays blank. `handleSetChange` would
    // re-ask `isSetFilled` and refuse to tick an empty set; the web's
    // Complete button always completes, so this path always does.
    const resolved: LiveSetState = { ...current, completed: true };
    const updated = applySetUpdate(gridRef.current, ex.slug, step.setIndex, resolved);
    gridRef.current = updated;
    setGrid(updated);
    onGridChange?.(updated);
    // The web's rest rule, same as the checkbox path: only the round's
    // last exercise starts the bar — including on the last step, where the
    // finish flow opens AND the bar runs behind it (the web's `completeSet`
    // saves, advances to the summary, and leaves the rest running).
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
          />
        ) : (
          <LiveStepView
            testID={testID}
            exercises={workout.exercises}
            grid={grid}
            workoutFlow={workoutFlow}
            stepIndex={liveStepIndex}
            onStepChange={handleStepChange}
            onSetChange={handleSetChange}
            onCompleteStep={handleCompleteStep}
            onRequestSwap={onRequestSwap}
          />
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
