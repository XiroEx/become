import { View } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { BottomSheet } from "@/components/BottomSheet";
import { setUnitLabel } from "@become/core";
import type { LiveWorkoutExercise } from "@/components/live/LiveWorkoutClient";

export interface LiveExerciseSheetProps {
  visible: boolean;
  onClose: () => void;
  exercises: LiveWorkoutExercise[];
  /** completed[i] is true when every set of exercise i is done. */
  completed: boolean[];
  currentExerciseIndex: number;
  /** Jump to the exercise's first incomplete set (the web's `goToExercise`). */
  onJump: (exerciseIndex: number) => void;
  testID: string;
}

/**
 * THE EXERCISE LIST SHEET — the web live client's `showExerciseList` panel.
 *
 * Web equivalent: the `EXERCISES` popover in
 * `webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`
 * (`Tap to jump · hold to move`). Native carries the tap-to-jump half: each
 * row opens its exercise's first set that still needs doing (or its first
 * set when everything is done). Reordering stays web-only — there is no
 * drag gesture to offer it — so the sheet says only "Tap to jump".
 *
 * A bottom sheet rather than a popover: the web's panel is anchored to a
 * desktop progress rail native never had.
 */
export function LiveExerciseSheet({
  visible,
  onClose,
  exercises,
  completed,
  currentExerciseIndex,
  onJump,
  testID,
}: LiveExerciseSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Exercises"
      testID={`${testID}-exercise-sheet`}
    >
      <Text
        testID={`${testID}-exercise-sheet-hint`}
        className="text-muted-foreground text-xs mb-3"
      >
        Tap to jump
      </Text>
      <View style={{ gap: 8 }}>
        {exercises.map((exercise, idx) => {
          const done = completed[idx] ?? false;
          const isCurrent = idx === currentExerciseIndex;
          return (
            <View key={exercise.slug}>
              <Button
                testID={`${testID}-exercise-sheet-row-${idx}`}
                variant="ghost"
                accessibilityLabel={
                  `${exercise.name}` +
                  (done ? ", completed" : "") +
                  (isCurrent ? ", current" : "")
                }
                onPress={() => onJump(idx)}
              >
                {`${idx + 1}. ${exercise.name} · ${exercise.sets} ${setUnitLabel(
                  exercise.trackingType,
                  exercise.sets || 0,
                ).toLowerCase()}${done ? " ✓" : ""}${isCurrent ? " · Now" : ""}`}
              </Button>
            </View>
          );
        })}
      </View>
    </BottomSheet>
  );
}
