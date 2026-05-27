import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { Toggle } from "@/components/Toggle";
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

export function ScheduleSettingsForm({
  initial,
  onSubmit,
  saving = false,
  testID = "schedule-settings",
}: ScheduleSettingsFormProps) {
  const [trainingDays, setTrainingDays] = useState<number[]>(initial.trainingDays);
  const [startDate, setStartDate] = useState<string>(initial.startDate);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(initial.autoAdvance);
  const [error, setError] = useState<string | null>(null);

  const toggleDay = (day: number) => {
    setTrainingDays((cur) =>
      cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].sort(),
    );
  };

  const handleSubmit = async () => {
    const next: ScheduleSettings = { trainingDays, startDate, autoAdvance };
    const v = validateScheduleSettings(next);
    if (!v.ok) {
      setError(`Fix: ${v.errors.join(", ")}`);
      return;
    }
    setError(null);
    await onSubmit(next);
  };

  return (
    <View testID={testID} style={{ gap: 16 }}>
      <View>
        <Text className="text-foreground font-semibold mb-2">Training days</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <Pressable
              key={d}
              testID={`${testID}-day-${d}`}
              onPress={() => toggleDay(d)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: trainingDays.includes(d) }}
              accessibilityLabel={`${DAY_LABELS[d]} ${trainingDays.includes(d) ? "selected" : "not selected"}`}
              className={`px-3 py-2 rounded-xl border ${
                trainingDays.includes(d)
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card"
              }`}
            >
              <Text className="text-foreground">{DAY_LABELS[d]}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Input
        testID={`${testID}-start-date`}
        label="Start date (YYYY-MM-DD)"
        value={startDate}
        onChangeText={setStartDate}
        autoCapitalize="none"
      />
      <View
        testID={`${testID}-auto-advance-row`}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <Text className="text-foreground">Auto-advance to next phase</Text>
        <Toggle
          testID={`${testID}-auto-advance`}
          value={autoAdvance}
          onValueChange={setAutoAdvance}
          accessibilityLabel="Auto-advance to next phase"
        />
      </View>
      {error ? (
        <Text testID={`${testID}-error`} className="text-destructive text-sm">
          {error}
        </Text>
      ) : null}
      <Button
        testID={`${testID}-submit`}
        onPress={handleSubmit}
        loading={saving}
        disabled={saving}
      >
        Save settings
      </Button>
    </View>
  );
}
