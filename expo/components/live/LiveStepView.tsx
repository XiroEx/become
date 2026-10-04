import { useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { LiveSetRow, type LiveSetState } from "@/components/live/LiveSetRow";
import { LiveSetReference } from "@/components/live/LiveSetReference";
import { ExerciseHint } from "@/components/live/ExerciseHint";
import { FramedVideo } from "@/components/FramedVideo";
import {
  ExerciseGroupNav,
  type ExerciseGroupType,
} from "@/components/live/ExerciseGroupNav";
import {
  getBellWeightInfo,
  normalizeTracking,
  setUnitLabel,
  type WorkoutStep,
} from "@become/core";
import type {
  LiveGrid,
  LiveWorkoutExercise,
} from "@/components/live/LiveWorkoutClient";
import type {
  ExerciseHistoryEntry,
  ExercisePRSummary,
} from "@become/api-client";
import {
  groupLabelForStep,
  liveCompleteLabel,
  totalRoundsForStep,
} from "@/components/live/LiveWorkoutClient";

export interface LiveStepViewProps {
  exercises: LiveWorkoutExercise[];
  grid: LiveGrid;
  /** The interleaved order the member walks (`buildWorkoutFlow`). */
  workoutFlow: WorkoutStep[];
  /** Which step of that flow is on screen. */
  stepIndex: number;
  onStepChange: (stepIndex: number) => void;
  onSetChange: (
    exerciseIndex: number,
    setIndex: number,
    next: LiveSetState,
  ) => void;
  /**
   * The web's primary action (`completeSet` / `advanceStep`): mark the
   * current set done with exactly what was typed and move to the next
   * step of `workoutFlow`. Wired by `LiveWorkoutClient`; on the last step
   * it enters the existing finish flow (`onFinish`).
   */
  onCompleteStep?: () => void;
  onRequestSkip?: () => void;
  isSkipping?: boolean;
  onRequestSwap?: (slug: string) => void;
  /**
   * Best completed set per exercise NAME (`useLiveWorkout`'s
   * `exerciseHistory`). Shown as the `Last:` reference under the set —
   * a reference only, never prefill.
   */
  exerciseHistory?: Record<string, ExerciseHistoryEntry>;
  /**
   * Persisted max-weight record per exercise NAME (`useLiveWorkout`'s
   * `exercisePRs`). Drives the `PR:` line and the NEW PR flag.
   */
  exercisePRs?: Record<string, ExercisePRSummary>;
  /**
   * In-workout hints keyed by lowercase exercise slug (the web's
   * `exerciseNudges`). Rendered under the exercise header, beside the
   * Last/PR lines — a reference, never prefill. Only the CURRENT
   * exercise's hint shows (the web shows each hint only while its exercise
   * is current).
   */
  exerciseHints?: Record<string, { id: string; title: string; body: string }>;
  /** Dismiss the current exercise's hint on the account. */
  onDismissHint?: (slug: string) => void;
  testID: string;
}

/**
 * THE LIVE VIEW — one set at a time, in the order the workout runs.
 *
 * Web equivalent:
 * `webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`.
 *
 * It is the SAME grid Track edits — this view only chooses which row of it to
 * put in front of you — so flipping between the two never loses a number and
 * never re-logs finished work. Which set it opens on is `resolveStartStep`
 * from `@become/core`, the rule both apps share: the remembered position
 * first, then the first set that still needs doing.
 *
 * A grouped block is walked round by round rather than exercise by exercise,
 * because the flow it steps through is `buildWorkoutFlow` — the same one the
 * Track view labels its rows with.
 */
export function LiveStepView({
  exercises,
  grid,
  workoutFlow,
  stepIndex,
  onStepChange,
  onSetChange,
  onCompleteStep,
  onRequestSkip,
  isSkipping = false,
  onRequestSwap,
  exerciseHistory,
  exercisePRs,
  exerciseHints,
  onDismissHint,
  testID,
}: LiveStepViewProps) {
  const total = workoutFlow.length;
  const safeIndex = Math.min(Math.max(stepIndex, 0), Math.max(total - 1, 0));
  const step = workoutFlow[safeIndex];
  const exercise = step ? exercises[step.exerciseIndex] : undefined;
  const [inputsOpen, setInputsOpen] = useState(true);

  if (!step || !exercise) {
    return (
      <View testID={`${testID}-live`} style={{ gap: 12 }}>
        <Text
          testID={`${testID}-live-empty`}
          className="text-muted-foreground text-sm"
        >
          Nothing to log yet.
        </Text>
      </View>
    );
  }

  const sets = grid[exercise.slug] ?? [];
  const current: LiveSetState = sets[step.setIndex] ?? {
    reps: null,
    weight: null,
    durationSec: null,
    distance: null,
    speed: null,
    completed: false,
  };
  const unit = setUnitLabel(exercise.trackingType, 1);
  const bell = getBellWeightInfo(exercise);
  const isLastStep = safeIndex >= total - 1;
  // The group label comes from the CURRENT exercise — `workout.groupType`
  // is never set by the route, so `ExerciseGroupNav` would otherwise never
  // render. R = max(groupRounds, sets), the same max the flow walks.
  const groupLabel = groupLabelForStep(step, exercise);
  const groupType = ((): ExerciseGroupType | null => {
    const t = (exercise.groupType ?? "").toLowerCase();
    return t === "superset" ||
      t === "circuit" ||
      t === "triset" ||
      t === "giantset" ||
      t === "giant_set" ||
      t === "emom" ||
      t === "amrap"
      ? (t === "giant_set" ? "giantset" : (t as ExerciseGroupType))
      : groupLabel
        ? "superset"
        : null;
  })();
  const totalRounds = totalRoundsForStep(step, exercise, exercises);
  const currentRound = step.roundNumber + 1;
  const completeLabelBase = liveCompleteLabel(isLastStep, exercise.trackingType);
  const completeLabel = isLastStep
    ? completeLabelBase
    : isSkipping
      ? `Skip ${unit} →`
      : completeLabelBase;
  const isInterval = normalizeTracking(exercise.trackingType ?? null) === "intervals";

  return (
    <View testID={`${testID}-live`} style={{ gap: 12 }}>
      <Text
        testID={`${testID}-live-step`}
        className="text-muted-foreground text-xs font-semibold"
      >
        {`Step ${safeIndex + 1} of ${total}`}
      </Text>
      {groupLabel ? (
        <Text
          testID={`${testID}-live-group-label`}
          className="text-primary text-sm font-semibold"
        >
          {groupLabel}
        </Text>
      ) : null}
      {groupType ? (
        <ExerciseGroupNav
          testID={`${testID}-live-group-nav`}
          groupType={groupType}
          currentRound={currentRound}
          totalRounds={totalRounds}
          onPrev={() => onStepChange(Math.max(0, safeIndex - 1))}
          onNext={() => onStepChange(Math.min(total - 1, safeIndex + 1))}
        />
      ) : null}

      <Card
        testID={`${testID}-live-exercise-${exercise.slug}`}
        title={exercise.name}
        subtitle={`${unit} ${step.setIndex + 1} of ${exercise.sets}`}
      >
        <Text
          testID={`${testID}-live-set-label`}
          className="text-foreground text-base font-semibold mb-2"
        >
          {step.groupId
            ? `Round ${step.roundNumber + 1} · ${unit} ${step.setIndex + 1}`
            : `${unit} ${step.setIndex + 1} of ${exercise.sets}`}
        </Text>
        <FramedVideo
          src={exercise.videoUrl}
          surface="live"
          exerciseName={exercise.name}
          videoWidth={exercise.videoWidth}
          videoHeight={exercise.videoHeight}
          videoFraming={exercise.videoFraming}
          videoTrim={exercise.videoTrim}
          testID={`${testID}-live-${exercise.slug}-video`}
          className="mb-3"
        />
        {exercise.notes ? (
          <Text
            testID={`${testID}-live-${exercise.slug}-notes`}
            className="text-muted-foreground text-xs mb-2"
          >
            {exercise.notes}
          </Text>
        ) : null}
        {inputsOpen ? (
          <LiveSetRow
            setIndex={step.setIndex}
            bell={bell}
            exerciseName={exercise.name}
            equipment={exercise.equipment}
            showQuickPicks
            state={current}
            prefill={exercise.prefill?.[step.setIndex] ?? null}
            trackingType={exercise.trackingType}
            testID={`${testID}-live-${exercise.slug}-set-${step.setIndex}`}
            onChange={(next) => onSetChange(step.exerciseIndex, step.setIndex, next)}
          />
        ) : null}
        <Button
          testID={`${testID}-live-inputs-toggle`}
          variant="ghost"
          size="sm"
          onPress={() => setInputsOpen((open) => !open)}
          accessibilityLabel={inputsOpen ? "Hide inputs" : "Show inputs"}>
          {inputsOpen ? "Hide inputs" : "Show inputs"}
        </Button>
        {/* The web's history + PR row (Live only; Track is unchanged). */}
        <LiveSetReference
          exerciseName={exercise.name}
          trackingType={exercise.trackingType}
          history={exerciseHistory?.[exercise.name] ?? null}
          pr={exercisePRs?.[exercise.name] ?? null}
          typedWeight={current.weight}
          testID={`${testID}-live-${exercise.slug}-reference`}
        />
        {/* The web's contextual nudge for THIS exercise only
            (progression / plateau) — beside the Last/PR lines. */}
        {(() => {
          const hint = exerciseHints?.[exercise.slug.toLowerCase()];
          if (!hint) return null;
          return (
            <ExerciseHint
              hint={hint}
              exerciseSlug={exercise.slug}
              onDismiss={() => onDismissHint?.(exercise.slug.toLowerCase())}
              testID={`${testID}-live-${exercise.slug}-hint`}
            />
          );
        })()}
      </Card>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button
            testID={`${testID}-live-prev`}
            variant="secondary"
            disabled={safeIndex === 0}
            onPress={() => onStepChange(Math.max(0, safeIndex - 1))}
          >
            Previous
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button
            testID={`${testID}-live-next`}
            variant="secondary"
            disabled={safeIndex >= total - 1}
            onPress={() => onStepChange(Math.min(total - 1, safeIndex + 1))}
          >
            Next
          </Button>
        </View>
      </View>

      {/* The web's primary action: Complete <unit> → / Skip <unit> → /
          Done → / Finish Workout. Blank inputs open the skip sheet
          (`onRequestSkip`); otherwise the button always completes. */}
      <Button
        testID={`${testID}-live-complete`}
        variant="primary"
        onPress={() => (isSkipping && !isLastStep && onRequestSkip ? onRequestSkip() : onCompleteStep?.())}
        accessibilityHint={
          isInterval
            ? undefined
            : "Completes with exactly what was typed; blank stays blank"
        }
      >
        {completeLabel}
      </Button>

      <Button
        testID={`${testID}-live-swap`}
        variant="ghost"
        size="sm"
        onPress={() => onRequestSwap?.(exercise.slug)}
        accessibilityLabel={`Swap ${exercise.name}`}
      >
        Swap exercise
      </Button>
    </View>
  );
}
