import { View } from "react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { LiveSetRow, type LiveSetState } from "@/components/live/LiveSetRow";
import { FramedVideo } from "@/components/FramedVideo";
import {
  getBellWeightInfo,
  setUnitLabel,
  type WorkoutStep,
} from "@become/core";
import type {
  LiveGrid,
  LiveWorkoutExercise,
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
  onRequestSwap?: (slug: string) => void;
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
  onRequestSwap,
  testID,
}: LiveStepViewProps) {
  const total = workoutFlow.length;
  const safeIndex = Math.min(Math.max(stepIndex, 0), Math.max(total - 1, 0));
  const step = workoutFlow[safeIndex];
  const exercise = step ? exercises[step.exerciseIndex] : undefined;

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

  return (
    <View testID={`${testID}-live`} style={{ gap: 12 }}>
      <Text
        testID={`${testID}-live-step`}
        className="text-muted-foreground text-xs font-semibold"
      >
        {`Step ${safeIndex + 1} of ${total}`}
      </Text>

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
        <LiveSetRow
          setIndex={step.setIndex}
          bell={bell}
          exerciseName={exercise.name}
          state={current}
          prefill={exercise.prefill?.[step.setIndex] ?? null}
          trackingType={exercise.trackingType}
          testID={`${testID}-live-${exercise.slug}-set-${step.setIndex}`}
          onChange={(next) => onSetChange(step.exerciseIndex, step.setIndex, next)}
        />
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
