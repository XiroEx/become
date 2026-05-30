import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

export type MoodLevel = 1 | 2 | 3 | 4 | 5;

export interface CheckInPayload {
  mood: MoodLevel;
  weightLbs: number | null;
}

export interface CheckInModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: CheckInPayload) => Promise<void> | void;
  submitting?: boolean;
  testID?: string;
}

const MOOD_LABELS: Record<MoodLevel, string> = {
  1: "Rough",
  2: "Low",
  3: "OK",
  4: "Good",
  5: "Great",
};

export function CheckInModal({
  visible,
  onClose,
  onSubmit,
  submitting = false,
  testID = "check-in-modal",
}: CheckInModalProps) {
  const [mood, setMood] = useState<MoodLevel | null>(null);
  const [weightText, setWeightText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!mood) {
      setError("Pick a mood");
      return;
    }
    let weightLbs: number | null = null;
    if (weightText.trim()) {
      const parsed = Number(weightText);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError("Enter a positive weight or leave blank");
        return;
      }
      weightLbs = parsed;
    }
    setError(null);
    // Surface a submit failure inline so the user knows the check-in didn't
    // save. On success the parent closes the modal; on rejection it stays open
    // with this message so they can retry.
    try {
      await onSubmit({ mood, weightLbs });
    } catch {
      setError("Couldn't save your check-in. Please try again.");
    }
  };

  return (
    <Modal
      testID={testID}
      visible={visible}
      onClose={onClose}
      title="Daily check-in"
    >
      <Text className="text-muted-foreground text-sm mb-3">
        How are you feeling today?
      </Text>
      <View
        testID={`${testID}-mood-row`}
        style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}
      >
        {([1, 2, 3, 4, 5] as MoodLevel[]).map((level) => (
          <Pressable
            key={level}
            testID={`${testID}-mood-${level}`}
            onPress={() => setMood(level)}
            accessibilityRole="button"
            accessibilityLabel={`Mood ${level}: ${MOOD_LABELS[level]}`}
            accessibilityState={{ selected: mood === level }}
            className={`px-2 py-2 rounded-xl items-center justify-center border ${
              mood === level
                ? "border-primary bg-primary/10"
                : "border-border bg-card"
            }`}
            style={{ flex: 1, marginHorizontal: 2 }}
          >
            <Text
              className={mood === level ? "text-primary font-semibold" : "text-foreground"}
            >
              {level}
            </Text>
            <Text className="text-muted-foreground text-[10px]">
              {MOOD_LABELS[level]}
            </Text>
          </Pressable>
        ))}
      </View>
      <Input
        testID={`${testID}-weight`}
        label="Weight (lbs) — optional"
        keyboardType="decimal-pad"
        value={weightText}
        onChangeText={setWeightText}
        placeholder="180"
      />
      {error ? (
        <Text
          testID={`${testID}-error`}
          className="text-destructive text-xs mt-2"
        >
          {error}
        </Text>
      ) : null}
      <View style={{ height: 12 }} />
      <Button
        testID={`${testID}-submit`}
        onPress={handleSubmit}
        loading={submitting}
        disabled={submitting}
      >
        Save check-in
      </Button>
    </Modal>
  );
}
