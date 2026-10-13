import { useState } from "react";
import { View, Pressable } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import {
  MIN_TOUCH_TARGET,
  hitSlopToMinTarget,
} from "@/lib/a11y/touchTarget";
import {
  DAY_LABELS,
  validateScheduleSettings,
  type ScheduleSettings,
} from "@/lib/schedule/scheduleSettings";

export interface ScheduleSettingsFormProps {
  initial: ScheduleSettings;
  onSubmit: (next: ScheduleSettings) => Promise<void> | void;
  /**
   * The web's card-header program name (`h3 font-semibold ...`). Rendered in
   * the left column of the 2-column card header alongside the `Edit Days`
   * pill (NP-368) — this component owns the whole card header because it
   * also owns the editing state that decides whether the pill shows.
   */
  programName?: string;
  /**
   * The web's card-header subtitle (`mt-0.5 text-xs ...`):
   * `{completed}/{total} workouts completed · Started {date}`.
   */
  subtitle?: string;
  saving?: boolean;
  testID?: string;
}

/**
 * Mirrors the web's Edit Days flow
 * (`webapp/app/dashboard/calendar/settings/page.tsx`): a 2-column card
 * header (program name + subtitle left, a bordered "Edit Days" pill
 * top-right, NP-368) above read-only day chips (selected = solid, mirroring
 * the black/white invert of `bg-zinc-900 text-white dark:bg-white
 * dark:text-black`). Pressing the pill swaps in the toggle-able chips, a
 * hint, and the "Save & Regenerate" / "Cancel" pair (the pill itself hides
 * while editing, same as web). Native used to render always-editable chips
 * with the brand-red outline and a red submit button (NP-293) — there is no
 * edit/view distinction and no hint on the web's "future workouts will be
 * regenerated" consequence.
 */
export function ScheduleSettingsForm({
  initial,
  onSubmit,
  programName,
  subtitle,
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

  // Edit-mode (toggle-able) chips: unchanged square boxes.
  const chipClass = (selected: boolean) =>
    `w-9 h-9 items-center justify-center rounded-lg ${
      selected ? "bg-foreground" : "bg-muted"
    }`;
  const chipTextClass = (selected: boolean) =>
    `text-xs font-medium ${
      selected ? "text-background" : "text-muted-foreground"
    }`;

  // NP-368: the web's READ-ONLY chips are a rectangular pill (`rounded-lg
  // px-3 py-1.5 text-xs font-semibold`), not the fixed `h-9 w-9` square the
  // edit-mode chips above still use.
  const readOnlyChipClass = (selected: boolean) =>
    `rounded-lg px-3 py-1.5 ${selected ? "bg-foreground" : "bg-muted"}`;
  const readOnlyChipTextClass = (selected: boolean) =>
    `text-xs font-semibold ${
      selected ? "text-background" : "text-muted-foreground"
    }`;

  // NP-368: the web card header is a 2-column `flex items-start
  // justify-between` row — program name + subtitle on the left, the `Edit
  // Days` pill top-right — not the button stacked below the chips.
  const header = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
      }}
    >
      <View style={{ flex: 1 }}>
        {programName ? (
          <Text
            testID={`${testID}-title`}
            className="text-foreground font-semibold"
          >
            {programName}
          </Text>
        ) : null}
        {subtitle ? (
          <Text
            testID={`${testID}-program-subtitle`}
            className="text-muted-foreground text-xs mt-0.5"
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {!editing ? (
        <Pressable
          testID={`${testID}-edit-days`}
          accessibilityRole="button"
          accessibilityLabel="Edit Days"
          onPress={startEditing}
          hitSlop={hitSlopToMinTarget(MIN_TOUCH_TARGET, MIN_TOUCH_TARGET)}
          className="rounded-lg border border-border px-2.5 py-1.5"
        >
          <Text className="text-muted-foreground text-xs font-medium">
            Edit Days
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  if (!editing) {
    return (
      <View testID={testID} style={{ gap: 12 }}>
        {header}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {[0, 1, 2, 3, 4, 5, 6].map((d) => {
            const selected = initial.trainingDays.includes(d);
            return (
              <View
                key={d}
                testID={`${testID}-day-${d}`}
                accessibilityLabel={`${DAY_LABELS[d]} ${selected ? "selected" : "not selected"}`}
                className={readOnlyChipClass(selected)}
              >
                <Text className={readOnlyChipTextClass(selected)}>{DAY_LABELS[d]}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View testID={testID} style={{ gap: 12 }}>
      {header}
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
