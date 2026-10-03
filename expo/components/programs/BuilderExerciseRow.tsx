import { useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import {
  BUILDER_EXERCISE_ROLES,
  BUILDER_PERCENT_1RM_MAX,
  BUILDER_PERCENT_1RM_MIN,
  BUILDER_RPE_MAX,
  BUILDER_RPE_MIN,
  builderExerciseName,
  parseBuilderPercentOf1RM,
  parseBuilderRpe,
  parseBuilderSets,
  validateBuilderExercise,
  type BuilderExercise,
  type BuilderExerciseRole,
} from "@/lib/programs/programBuilder";
import {
  ExercisePicker,
  type ExercisePickerSelection,
} from "@/components/programs/ExercisePicker";

export interface BuilderExerciseRowProps {
  exercise: BuilderExercise;
  exerciseIndex: number;
  /** Slugs already in this workout, so the picker hides them. */
  excludeSlugs: readonly string[];
  onChange: (patch: Partial<BuilderExercise>) => void;
  onRemove: () => void;
  testID: string;
}

const ROLE_LABELS: Record<BuilderExerciseRole, string> = {
  compound: "Compound",
  secondary: "Secondary",
  accessory: "Accessory",
};

/**
 * ONE EXERCISE ROW (NP-171).
 *
 * Native counterpart of `webapp/app/dashboard/admin/programs/_editors/
 * ExerciseEditor.tsx`: the picked exercise's name, the prescription the coach
 * writes (sets, reps, rest, tempo, RPE, percent of 1RM, duration), the role
 * and the coach notes — and removal. The picker hands back the catalogue
 * `exerciseSlug` (never a typed name), and RPE / percent of 1RM are refused
 * in the field, before saving, at the model's own bounds.
 */
export function BuilderExerciseRow({
  exercise,
  exerciseIndex,
  excludeSlugs,
  onChange,
  onRemove,
  testID,
}: BuilderExerciseRowProps) {
  const { colors } = useThemeTokens();
  const [expanded, setExpanded] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [rpeText, setRpeText] = useState(
    exercise.rpe === undefined ? "" : String(exercise.rpe),
  );
  const [rpeError, setRpeError] = useState<string | null>(null);
  const [percentText, setPercentText] = useState(
    exercise.percentOf1RM === undefined ? "" : String(exercise.percentOf1RM),
  );
  const [percentError, setPercentError] = useState<string | null>(null);
  const [setsText, setSetsText] = useState(
    exercise.sets === undefined ? "" : String(exercise.sets),
  );
  const [setsError, setSetsError] = useState<string | null>(null);

  const missingSlug = !exercise.exerciseSlug || !exercise.exerciseSlug.trim();
  const rowProblem = validateBuilderExercise(exercise);
  const title = builderExerciseName(exercise);

  const prescriptionSummary = [
    exercise.sets !== undefined ? `${exercise.sets} sets` : null,
    exercise.reps?.trim() ? `× ${exercise.reps.trim()}` : null,
    exercise.rest?.trim() ? `rest ${exercise.rest.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View
      testID={testID}
      className="border border-border rounded-xl p-3"
      style={{ gap: 8 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            testID={`${testID}-name`}
            className="text-foreground text-sm font-semibold"
          >
            {title}
          </Text>
          {prescriptionSummary ? (
            <Text
              testID={`${testID}-summary`}
              className="text-muted-foreground text-xs"
            >
              {prescriptionSummary}
            </Text>
          ) : null}
        </View>
        <Pressable
          testID={`${testID}-toggle`}
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${title}, exercise ${exerciseIndex + 1}`}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((prev) => !prev)}
          style={[
            minTouchTarget,
            {
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: colors.muted,
            },
          ]}
        >
          {expanded ? (
            <ChevronUp size={18} color={colors["muted-foreground"]} />
          ) : (
            <ChevronDown size={18} color={colors["muted-foreground"]} />
          )}
        </Pressable>
        <Pressable
          testID={`${testID}-remove`}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${title} from this workout`}
          onPress={() => setConfirmRemove(true)}
          style={[
            minTouchTarget,
            {
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
            },
          ]}
        >
          <Trash2 size={16} color={colors.destructive} />
        </Pressable>
      </View>

      {missingSlug ? (
        <Text
          testID={`${testID}-missing-slug`}
          accessibilityRole="alert"
          className="text-destructive text-xs"
        >
          Pick this exercise from the catalogue or your custom exercises so it
          saves with a link.
        </Text>
      ) : null}

      {expanded ? (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-sets`}
                label="Sets"
                placeholder="3"
                keyboardType="number-pad"
                value={setsText}
                error={setsError ?? undefined}
                onChangeText={(text) => {
                  setSetsText(text);
                  const parsed = parseBuilderSets(text);
                  setSetsError(parsed.error ?? null);
                  if (!parsed.error) {
                    onChange(
                      parsed.value === undefined
                        ? { sets: undefined }
                        : { sets: parsed.value },
                    );
                  }
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-reps`}
                label="Reps"
                placeholder="8-10"
                value={exercise.reps ?? ""}
                onChangeText={(text) => onChange({ reps: text })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-rest`}
                label="Rest"
                placeholder="60s"
                value={exercise.rest ?? ""}
                onChangeText={(text) => onChange({ rest: text })}
              />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-tempo`}
                label="Tempo"
                placeholder="3-1-1-0"
                value={exercise.tempo ?? ""}
                onChangeText={(text) => onChange({ tempo: text })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-duration`}
                label="Duration"
                placeholder="30 sec"
                value={exercise.duration ?? ""}
                onChangeText={(text) => onChange({ duration: text })}
              />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-rpe`}
                label={`RPE (${BUILDER_RPE_MIN}–${BUILDER_RPE_MAX})`}
                placeholder="8"
                keyboardType="decimal-pad"
                value={rpeText}
                error={rpeError ?? undefined}
                onChangeText={(text) => {
                  setRpeText(text);
                  const parsed = parseBuilderRpe(text);
                  setRpeError(parsed.error ?? null);
                  if (!parsed.error) {
                    onChange(
                      parsed.value === undefined
                        ? { rpe: undefined }
                        : { rpe: parsed.value },
                    );
                  }
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-percent`}
                label={`% of 1RM (${BUILDER_PERCENT_1RM_MIN}–${BUILDER_PERCENT_1RM_MAX})`}
                placeholder="75"
                keyboardType="decimal-pad"
                value={percentText}
                error={percentError ?? undefined}
                onChangeText={(text) => {
                  setPercentText(text);
                  const parsed = parseBuilderPercentOf1RM(text);
                  setPercentError(parsed.error ?? null);
                  if (!parsed.error) {
                    onChange(
                      parsed.value === undefined
                        ? { percentOf1RM: undefined }
                        : { percentOf1RM: parsed.value },
                    );
                  }
                }}
              />
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Text className="text-foreground text-sm font-medium">Role</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {BUILDER_EXERCISE_ROLES.map((role) => {
                const selected = exercise.role === role;
                return (
                  <Pressable
                    key={role}
                    testID={`${testID}-role-${role}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${ROLE_LABELS[role]} role`}
                    onPress={() =>
                      onChange(
                        selected ? { role: undefined } : { role },
                      )
                    }
                    style={[
                      minTouchTarget,
                      {
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 999,
                        backgroundColor: selected
                          ? colors.primary
                          : colors.muted,
                      },
                    ]}
                  >
                    <Text
                      className={
                        selected
                          ? "text-primary-foreground text-xs font-semibold"
                          : "text-muted-foreground text-xs font-semibold"
                      }
                    >
                      {ROLE_LABELS[role]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Input
            testID={`${testID}-details`}
            label="Coach notes"
            placeholder="e.g. Pause at the bottom"
            value={exercise.details ?? ""}
            onChangeText={(text) => onChange({ details: text })}
            multiline
            numberOfLines={2}
          />

          {rowProblem && !missingSlug ? (
            <Text
              testID={`${testID}-problem`}
              accessibilityRole="alert"
              className="text-destructive text-xs"
            >
              {rowProblem}
            </Text>
          ) : null}
        </View>
      ) : null}

      <Modal
        testID={`${testID}-remove-modal`}
        visible={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Remove this exercise?"
      >
        <Text className="text-muted-foreground text-sm mb-4">
          {`${title} will be removed from this workout. This cannot be undone.`}
        </Text>
        <View style={{ gap: 8 }}>
          <Button
            testID={`${testID}-remove-confirm`}
            variant="destructive"
            onPress={() => {
              setConfirmRemove(false);
              onRemove();
            }}
          >
            Yes, remove it
          </Button>
          <Button
            testID={`${testID}-remove-cancel`}
            variant="ghost"
            onPress={() => setConfirmRemove(false)}
          >
            Keep it
          </Button>
        </View>
      </Modal>
    </View>
  );
}

export interface BuilderWorkoutExercisesProps {
  exercises: BuilderExercise[];
  onAdd: (selection: ExercisePickerSelection) => void;
  onChange: (exerciseIndex: number, patch: Partial<BuilderExercise>) => void;
  onRemove: (exerciseIndex: number) => void;
  testID: string;
}

/**
 * The rows inside one session, with the picker that adds them (NP-171).
 * Reorder and grouping follow in NP-172 — rows render in saved order.
 */
export function BuilderWorkoutExercises({
  exercises,
  onAdd,
  onChange,
  onRemove,
  testID,
}: BuilderWorkoutExercisesProps) {
  const [picking, setPicking] = useState(false);
  const excludeSlugs = exercises
    .map((exercise) => exercise.exerciseSlug ?? "")
    .filter(Boolean);

  return (
    <View style={{ gap: 8 }}>
      <Text className="text-foreground text-sm font-medium">
        {exercises.length === 0
          ? "Exercises"
          : `Exercises (${exercises.length})`}
      </Text>
      {exercises.map((exercise, exerciseIndex) => (
        <BuilderExerciseRow
          key={`exercise-${exerciseIndex}`}
          exercise={exercise}
          exerciseIndex={exerciseIndex}
          excludeSlugs={excludeSlugs.filter(
            (_, index) => index !== exerciseIndex,
          )}
          onChange={(patch) => onChange(exerciseIndex, patch)}
          onRemove={() => onRemove(exerciseIndex)}
          testID={`${testID}-exercise-${exerciseIndex}`}
        />
      ))}
      {picking ? (
        <ExercisePicker
          testID={`${testID}-picker`}
          excludeSlugs={excludeSlugs}
          onSelect={(selection) => {
            setPicking(false);
            onAdd(selection);
          }}
          onClose={() => setPicking(false)}
        />
      ) : (
        <Button
          testID={`${testID}-add`}
          variant="secondary"
          size="sm"
          accessibilityLabel="Add an exercise to this workout"
          onPress={() => setPicking(true)}
        >
          Add exercise
        </Button>
      )}
    </View>
  );
}

export default BuilderExerciseRow;
