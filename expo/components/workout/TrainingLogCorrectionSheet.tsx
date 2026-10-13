/**
 * CORRECT A LOGGED WORKOUT — THE NATIVE SHEET (NP-166).
 *
 * Native port of `webapp/components/workout/TrainingLogCorrectionModal.tsx`
 * (opened from the progress page's workout rows): the member fixes a mistyped
 * set in a finished workout, reviews the change list, and saves through
 * `PATCH /api/workouts/logs` — after which PRs and history recompute from the
 * corrected log server-side.
 *
 * The flow is the web's flow on purpose: edit, then an explicit review step
 * ("Confirm these corrections" — saving rewrites the workout and recalculates
 * personal records), then the PATCH. The server owns validation (a negative
 * weight or fractional reps is refused with the server's own words, rendered
 * verbatim — never rewritten, never invented). The sheet is mounted with a
 * `key` per workout by its callers, so each opening starts from a fresh
 * draft; no prop-sync effects.
 */

import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Toggle } from "@/components/Toggle";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  correctionChanges,
  draftFromWorkout,
  parseDraftNumber,
  submitWorkoutCorrection,
  correctionErrorMessage,
  visibleCorrectionFields,
  type CorrectableWorkout,
  type CorrectionDraft,
  type CorrectionField,
} from "@/lib/workout/correction";

const FIELD_LABELS: Record<CorrectionField, string> = {
  reps: "reps",
  weight: "weight (lb)",
  duration: "duration (sec)",
  distance: "distance (m)",
  speed: "speed (mph)",
};

const REVIEW_PREVIEW = 6;

export interface TrainingLogCorrectionSheetProps {
  workout: CorrectableWorkout;
  onClose: () => void;
  /** Refetch the caller's payload (the caller also closes the sheet). */
  onSaved: () => void | Promise<void>;
  /** Session JWT for the PATCH. Absent → the sheet still opens. */
  authToken?: string | null;
  testID?: string;
}

export function TrainingLogCorrectionSheet({
  workout,
  onClose,
  onSaved,
  authToken = null,
  testID = "correction-sheet",
}: TrainingLogCorrectionSheetProps) {
  const { colors, tint } = useThemeTokens();
  const [draft, setDraft] = useState<CorrectionDraft>(() => draftFromWorkout(workout));
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changes = useMemo(() => correctionChanges(workout, draft), [workout, draft]);

  const close = () => {
    if (!saving) onClose();
  };

  const touch = (next: CorrectionDraft) => {
    setDraft(next);
    setReviewing(false);
    setError(null);
  };

  const updateSet = (
    exerciseIndex: number,
    setIndex: number,
    field: CorrectionField,
    raw: string,
  ) => {
    touch({
      ...draft,
      sets: draft.sets.map((sets, ei) =>
        ei !== exerciseIndex
          ? sets
          : sets.map((set, si) => (si !== setIndex ? set : { ...set, [field]: raw })),
      ),
    });
  };

  const updateSetCompleted = (exerciseIndex: number, setIndex: number, value: boolean) => {
    touch({
      ...draft,
      sets: draft.sets.map((sets, ei) =>
        ei !== exerciseIndex
          ? sets
          : sets.map((set, si) => (si !== setIndex ? set : { ...set, completed: value })),
      ),
    });
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await submitWorkoutCorrection(workout, draft, { authToken });
      await onSaved();
    } catch (e) {
      setError(correctionErrorMessage(e, "Could not save this correction"));
      setReviewing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      visible
      onClose={close}
      title="Correct workout log"
      testID={testID}
      accessibilityLabel={`Correct workout log, ${workout.title || workout.day}`}
      sheetStyle={{ maxHeight: "90%" }}
    >
      <ScrollView
        testID={`${testID}-scroll`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 8, gap: 16 }}
      >
        <Text testID={`${testID}-subtitle`} className="text-muted-foreground text-xs">
          {workout.title || workout.day} · {workout.date}
        </Text>

        {workout.kind === "quick" ? (
          <Input
            testID={`${testID}-title`}
            label="Session title"
            value={draft.title}
            onChangeText={(v) => touch({ ...draft, title: v })}
            accessibilityHint="Corrected session title"
          />
        ) : null}

        <Input
          testID={`${testID}-duration`}
          label="Duration (minutes)"
          keyboardType="decimal-pad"
          value={draft.duration}
          onChangeText={(v) => touch({ ...draft, duration: v })}
          accessibilityHint="Corrected workout duration in minutes"
        />

        {workout.notesKnown ? (
          <Input
            testID={`${testID}-notes`}
            label="Notes"
            multiline
            value={draft.notes}
            onChangeText={(v) => touch({ ...draft, notes: v })}
            accessibilityHint="Corrected workout notes"
          />
        ) : null}

        {workout.exercises.map((exercise, exerciseIndex) => {
          // The columns follow what is entered, the web's rule: a column
          // appears when any set holds it.
          const entered = exercise.sets.map((_, setIndex) => {
            const next = draft.sets[exerciseIndex]?.[setIndex];
            return {
              reps: next ? parseDraftNumber(next.reps) : null,
              weight: next ? parseDraftNumber(next.weight) : null,
              duration: next ? parseDraftNumber(next.duration) : null,
              distance: next ? parseDraftNumber(next.distance) : null,
              speed: next ? parseDraftNumber(next.speed) : null,
            };
          });
          const fields = visibleCorrectionFields(entered);
          const shown = fields.length > 0 ? fields : (["reps", "weight"] as CorrectionField[]);
          return (
            <View
              key={`${exercise.slug ?? exercise.name}-${exerciseIndex}`}
              testID={`${testID}-exercise-${exerciseIndex}`}
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 12,
                gap: 8,
              }}
            >
              <Text className="text-foreground text-sm font-semibold">{exercise.name}</Text>
              {exercise.sets.map((_, setIndex) => {
                const setDraft = draft.sets[exerciseIndex]?.[setIndex];
                if (!setDraft) return null;
                return (
                  <View
                    key={setIndex}
                    testID={`${testID}-exercise-${exerciseIndex}-set-${setIndex}`}
                    style={{
                      borderRadius: 12,
                      backgroundColor: colors.muted,
                      padding: 10,
                      gap: 8,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text className="text-muted-foreground text-xs font-semibold">
                        Set {setIndex + 1}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text className="text-muted-foreground text-xs">Count set</Text>
                        <Toggle
                          testID={`${testID}-exercise-${exerciseIndex}-set-${setIndex}-counted`}
                          value={setDraft.completed}
                          onValueChange={(v) => updateSetCompleted(exerciseIndex, setIndex, v)}
                          accessibilityLabel={`Count set ${setIndex + 1} of ${exercise.name}`}
                          accessibilityHint="Whether this set counts toward records and volume"
                        />
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {shown.map((field) => (
                        <View
                          key={field}
                          style={{ flexGrow: 1, flexBasis: shown.length > 2 ? "45%" : "30%" }}
                        >
                          <Input
                            testID={`${testID}-exercise-${exerciseIndex}-set-${setIndex}-${field}`}
                            label={FIELD_LABELS[field]}
                            keyboardType="decimal-pad"
                            value={setDraft[field]}
                            onChangeText={(v) => updateSet(exerciseIndex, setIndex, field, v)}
                            accessibilityHint={`Corrected ${FIELD_LABELS[field]} for set ${setIndex + 1}`}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}

        {reviewing && changes.length > 0 ? (
          <View
            testID={`${testID}-review-banner`}
            accessibilityRole="alert"
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.accent,
              backgroundColor: tint("accent", 0.14),
              padding: 12,
              gap: 4,
            }}
          >
            <Text className="text-foreground text-sm font-bold">Confirm these corrections</Text>
            <Text className="text-muted-foreground text-xs">
              Saving rewrites this workout and recalculates personal records from your completed
              history.
            </Text>
            <View style={{ gap: 2, marginTop: 4 }}>
              {changes.slice(0, REVIEW_PREVIEW).map((change) => (
                <Text
                  key={change}
                  testID={`${testID}-review-change`}
                  className="text-foreground text-xs"
                >
                  • {change}
                </Text>
              ))}
              {changes.length > REVIEW_PREVIEW ? (
                <Text className="text-foreground text-xs">
                  • Plus {changes.length - REVIEW_PREVIEW} more changes
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {error ? (
          <Text
            testID={`${testID}-error`}
            accessibilityRole="alert"
            className="text-destructive text-sm"
          >
            {error}
          </Text>
        ) : null}

        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Button
              testID={`${testID}-cancel`}
              variant="ghost"
              disabled={saving}
              onPress={() => {
                if (reviewing) {
                  setReviewing(false);
                } else {
                  close();
                }
              }}
            >
              {reviewing ? "Keep editing" : "Cancel"}
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button
              testID={`${testID}-confirm`}
              variant="primary"
              disabled={saving || changes.length === 0}
              loading={saving}
              onPress={() => {
                if (reviewing) void save();
                else {
                  setReviewing(true);
                  setError(null);
                }
              }}
            >
              {saving ? "Saving…" : reviewing ? "Confirm & save" : "Review correction"}
            </Button>
          </View>
        </View>
        {/* Keep the primary action reachable with one thumb: the row above is
            the whole footer, so this spacer only needs the home-indicator gap
            the sheet padding does not already give it. */}
        <View style={{ height: 8 }} />
      </ScrollView>
    </BottomSheet>
  );
}

export default TrainingLogCorrectionSheet;
