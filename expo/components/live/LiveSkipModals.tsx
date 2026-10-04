import { View } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { setUnitLabel } from "@become/core";
import type { LiveWorkoutExercise } from "@/components/live/LiveWorkoutClient";

export interface LiveSkipModalProps {
  visible: boolean;
  onClose: () => void;
  /** Skip just the current step's set (reps 0, weight 0, completed). */
  onSkipSet: () => void;
  /** Skip every remaining set of the current exercise. */
  onSkipExercise: () => void;
  exercise?: LiveWorkoutExercise;
  /** Which set of the exercise the member is standing on (0-based). */
  setIndex: number;
  testID: string;
}

/**
 * THE SKIP SHEET — the web live client's skip confirmation modal.
 *
 * Web equivalent: the `showSkipModal` dialog in
 * `webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`
 * (`Skip {setUnit}?` → `Skip This {setUnit} Only` /
 * `Skip All {setUnitPlural} (… total)` / Cancel). The web's fourth action —
 * "Swap for Alternative" — is already one tap away on the Live step itself
 * (`Swap exercise`), so the sheet carries the three skip actions only.
 */
export function LiveSkipModal({
  visible,
  onClose,
  onSkipSet,
  onSkipExercise,
  exercise,
  setIndex,
  testID,
}: LiveSkipModalProps) {
  const unit = setUnitLabel(exercise?.trackingType ?? null, 1);
  const unitPlural = setUnitLabel(exercise?.trackingType ?? null, exercise?.sets ?? 0);
  const total = exercise?.sets ?? 0;
  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={`Skip ${unit}?`}
      testID={`${testID}-skip-modal`}
    >
      <Text
        testID={`${testID}-skip-modal-message`}
        className="text-muted-foreground text-sm mb-1 text-center"
      >
        {`Are you sure you want to skip this ${unit.toLowerCase()} of ${exercise?.name ?? "this exercise"}?`}
      </Text>
      <Text
        testID={`${testID}-skip-modal-position`}
        className="text-muted-foreground text-xs mb-4 text-center"
      >
        {`${unit} ${setIndex + 1} of ${total}`}
      </Text>
      <View style={{ gap: 12 }}>
        <Button
          testID={`${testID}-skip-set`}
          variant="secondary"
          onPress={onSkipSet}
        >
          {`Skip This ${unit} Only`}
        </Button>
        <Button
          testID={`${testID}-skip-exercise`}
          variant="secondary"
          onPress={onSkipExercise}
        >
          {`Skip All ${unitPlural} (${total} ${unitPlural.toLowerCase()} total)`}
        </Button>
        <Button testID={`${testID}-skip-cancel`} variant="ghost" onPress={onClose}>
          Cancel
        </Button>
      </View>
    </Modal>
  );
}

export interface LiveEditConfirmModalProps {
  visible: boolean;
  onClose: () => void;
  /** Save the new values over the already-completed set. */
  onConfirm: () => void;
  exerciseName?: string;
  /** What the set holds now, in words (the web's Before box). */
  beforeLabel?: string;
  /** What it will hold, in words (the web's After box). */
  afterLabel?: string;
  testID: string;
}

/**
 * THE EDIT-CONFIRM MODAL — the web live client's `showEditConfirmModal`.
 *
 * The web asks before overwriting a set already marked done (`Update Set?` →
 * `Save Changes` / Cancel, with the Before → After values). Native edits land
 * through the same gate: re-completing a finished step from the Live view
 * opens this instead of writing silently.
 */
export function LiveEditConfirmModal({
  visible,
  onClose,
  onConfirm,
  exerciseName,
  beforeLabel,
  afterLabel,
  testID,
}: LiveEditConfirmModalProps) {
  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Update Set?"
      testID={`${testID}-edit-modal`}
    >
      <Text
        testID={`${testID}-edit-modal-message`}
        className="text-muted-foreground text-sm mb-4 text-center"
      >
        {`This set of ${exerciseName ?? "this exercise"} was already logged. Save new values?`}
      </Text>
      <View
        testID={`${testID}-edit-modal-values`}
        style={{ flexDirection: "row", gap: 8, marginBottom: 16, alignItems: "center", justifyContent: "center" }}
      >
        <Text className="text-muted-foreground text-sm">
          {`Before: ${beforeLabel ?? "—"}`}
        </Text>
        <Text className="text-muted-foreground text-sm">→</Text>
        <Text className="text-foreground text-sm font-semibold">
          {`After: ${afterLabel ?? "—"}`}
        </Text>
      </View>
      <View style={{ gap: 12 }}>
        <Button testID={`${testID}-edit-confirm`} variant="primary" onPress={onConfirm}>
          Save Changes
        </Button>
        <Button testID={`${testID}-edit-cancel`} variant="ghost" onPress={onClose}>
          Cancel
        </Button>
      </View>
    </Modal>
  );
}
