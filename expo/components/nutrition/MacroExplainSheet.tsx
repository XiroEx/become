import { View, ScrollView } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { BottomSheet } from "@/components/BottomSheet";
import type { CalcStep, MacroNote } from "@become/core";

export interface MacroExplainSheetProps {
  isOpen?: boolean;
  visible?: boolean;
  title: string;
  headline: string;
  steps: CalcStep[];
  note?: MacroNote;
  onClose: () => void;
  testID?: string;
}

/**
 * MacroExplainSheet (NP-056 / NP-148).
 *
 * Shows the calculated breakdown of calories or macros (steps and notes)
 * using the shared math in @become/core.
 */
export function MacroExplainSheet({
  isOpen,
  visible,
  title,
  headline,
  steps,
  note,
  onClose,
  testID = "macro-explain-sheet",
}: MacroExplainSheetProps) {
  const isVisible = Boolean(isOpen ?? visible);

  return (
    <BottomSheet
      visible={isVisible}
      onClose={onClose}
      title={title}
      testID={testID}
      accessibilityLabel={title}
    >
      <View testID={`${testID}-container`}>
        {/* Headline */}
        <Text
          testID="explain-headline"
          accessibilityRole="header"
          className="text-foreground text-2xl font-bold mb-4"
        >
          {headline}
        </Text>

        {/* Calculated steps */}
        <ScrollView className="max-h-80 mb-4" bounces={false}>
          {steps.map((s, i) => (
            <View
              key={`${s.label}-${i}`}
              className="p-3 rounded-xl border border-border bg-card mb-2"
            >
              <View className="flex-row items-baseline justify-between gap-3">
                <View className="flex-row items-baseline flex-1 gap-1">
                  <Text className="text-muted-foreground text-xs">{i + 1}.</Text>
                  <Text className="text-foreground text-xs font-semibold flex-1">
                    {s.label}
                  </Text>
                </View>
                <Text className="text-foreground text-xs font-bold font-mono">
                  {s.value}
                </Text>
              </View>
              <Text className="text-muted-foreground text-xs mt-1 leading-relaxed">
                {s.detail}
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* Caution or Info Note */}
        {note ? (
          <View
            testID={`explain-note-${note.tone}`}
            className={`p-3 rounded-xl border mb-4 flex-row gap-2 ${
              note.tone === "caution"
                ? "border-amber-400 bg-amber-500/10"
                : "border-emerald-400 bg-emerald-500/10"
            }`}
          >
            <Text
              className={`text-xs flex-1 ${
                note.tone === "caution"
                  ? "text-amber-500 font-medium"
                  : "text-emerald-500 font-medium"
              }`}
            >
              {note.text}
            </Text>
          </View>
        ) : null}

        {/* Dismiss Button */}
        <Button
          testID={`${testID}-close`}
          onPress={onClose}
        >
          Got it
        </Button>
      </View>
    </BottomSheet>
  );
}

export default MacroExplainSheet;
