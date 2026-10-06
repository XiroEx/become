import { useState } from "react";
import { View, Pressable } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import {
  DAY_LABELS,
  validateScheduleSettings,
  type ScheduleSettings,
} from "@/lib/schedule/scheduleSettings";

export interface ScheduleSettingsFormProps {
  initial: ScheduleSettings;
  onSubmit: (next: ScheduleSettings) => Promise<void> | void;
  saving?: boolean;
  testID?: string;
}

/**
 * Mirrors the web's Edit Days flow
 * (`webapp/app/dashboard/calendar/settings/page.tsx`): read-only day chips
 * (selected = solid, mirroring the black/white invert of
 * `bg-zinc-900 text-white dark:bg-white dark:text-black`) with an "Edit Days"
 * button, which swaps in the toggle-able chips, a hint, and the
 * "Save & Regenerate" / "Cancel" pair. Native used to render always-editable
 * chips with the brand-red outline and a red submit button (NP-293) — there
 * is no edit/view distinction and no hint on the web's "future workouts will
 * be regenerated" consequence.
 */
export function ScheduleSettingsForm({
  initial,
  onSubmit,
  saving = false,
  testID = "schedule-settings",
}: ScheduleSettingsFormProps) {
  const [editing, setEditing] = useState(false);
  const [trainingDays, setTrainingDays] = useState<number[]>(initial.trainingDays);
  const [error, setError] = useState<string | null>(null);

  const startEditing = () => {
    setTrainingDays(initial.trainingDays);
    setError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setTrainingDays(initial.trainingDays);
    setError(null);
    setEditing(false);
  };

  const toggleDay = (day: number) => {
    setTrainingDays((cur) =>
      cur.includes(day)
        ? cur.filter((d) => d !== day)
        : [...cur, day].sort((a, b) => a - b),
    );
  };

  const handleSubmit = async () => {
    const next: ScheduleSettings = { trainingDays };
    const v = validateScheduleSettings(next);
    if (!v.ok) {
      setError(`Fix: ${v.errors.join(", ")}`);
      return;
    }
    setError(null);
    await onSubmit(next);
    setEditing(false);
  };

  const chipClass = (selected: boolean) =>
    `w-9 h-9 items-center justify-center rounded-lg ${
      selected ? "bg-foreground" : "bg-muted"
    }`;
  const chipTextClass = (selected: boolean) =>
    `text-xs font-medium ${
      selected ? "text-background" : "text-muted-foreground"
    }`;

  if (!editing) {
    return (
      <View testID={testID} style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {[0, 1, 2, 3, 4, 5, 6].map((d) => {
            const selected = initial.trainingDays.includes(d);
            return (
              <View
                key={d}
                testID={`${testID}-day-${d}`}
                accessibilityLabel={`${DAY_LABELS[d]} ${selected ? "selected" : "not selected"}`}
                className={chipClass(selected)}
              >
                <Text className={chipTextClass(selected)}>{DAY_LABELS[d]}</Text>
              </View>
            );
          })}
        </View>
        <Button
          testID={`${testID}-edit-days`}
          variant="ghost"
          size="sm"
          onPress={startEditing}
        >
          Edit Days
        </Button>
      </View>
    );
  }

  return (
    <View testID={testID} style={{ gap: 12 }}>
      <Text
        testID={`${testID}-hint`}
        className="text-muted-foreground text-xs"
      >
        Tap days to toggle. Future workouts will be regenerated.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {[0, 1, 2, 3, 4, 5, 6].map((d) => {
          const selected = trainingDays.includes(d);
          return (
            <Pressable
              key={d}
              testID={`${testID}-day-${d}`}
              onPress={() => toggleDay(d)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${DAY_LABELS[d]} ${selected ? "selected" : "not selected"}`}
              className={chipClass(selected)}
            >
              <Text className={chipTextClass(selected)}>{DAY_LABELS[d]}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text testID={`${testID}-error`} className="text-destructive text-sm">
          {error}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          testID={`${testID}-submit`}
          variant="inverted"
          onPress={handleSubmit}
          loading={saving}
          disabled={saving}
        >
          Save & Regenerate
        </Button>
        <Button
          testID={`${testID}-cancel`}
          variant="ghost"
          onPress={cancelEditing}
          disabled={saving}
        >
          Cancel
        </Button>
      </View>
    </View>
  );
}
