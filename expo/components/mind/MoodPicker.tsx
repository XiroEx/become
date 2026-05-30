import { View, Text, Pressable } from "react-native";

export type MoodValue = 1 | 2 | 3 | 4 | 5;

const MOODS: { value: MoodValue; emoji: string; label: string }[] = [
  { value: 1, emoji: "😞", label: "Rough" },
  { value: 2, emoji: "😕", label: "Low" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
];

export interface MoodPickerProps {
  selected?: MoodValue | null;
  onSelect: (mood: MoodValue) => void;
  disabled?: boolean;
  testID?: string;
}

/** Emoji-row mood picker (1–5). */
export function MoodPicker({
  selected,
  onSelect,
  disabled = false,
  testID = "mood-picker",
}: MoodPickerProps) {
  return (
    <View
      testID={testID}
      style={{ flexDirection: "row", justifyContent: "space-between" }}
    >
      {MOODS.map((m) => {
        const isSelected = selected === m.value;
        return (
          <Pressable
            key={m.value}
            testID={`${testID}-${m.value}`}
            onPress={() => !disabled && onSelect(m.value)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled }}
            accessibilityLabel={`Mood ${m.label}`}
            className={`items-center px-2 py-2 rounded-2xl ${
              isSelected ? "bg-primary/20 border border-primary" : ""
            }`}
          >
            <Text style={{ fontSize: 28 }}>{m.emoji}</Text>
            <Text
              className={`text-xs mt-1 ${
                isSelected ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {m.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
