import { View, ScrollView, Pressable } from "react-native";
import { Calculator, X, Info, AlertTriangle } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { BottomSheet } from "@/components/BottomSheet";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
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
 * MacroExplainSheet (NP-056 / NP-148 / NP-247).
 *
 * Shows the calculated breakdown of calories or macros (steps and notes)
 * using the shared math in @become/core.
 *
 * Web parity (NP-247): the title row carries a calculator icon and its own
 * close "X" (`webapp/components/nutrition/MacroExplainSheet.tsx`), and the
 * note callout carries a tone icon — a caution triangle or an info circle,
 * matching the web's AlertTriangle / Info. The step values are a bold plain
 * number, not `font-mono`: the web never sets a monospace face here, so a
 * figure like "1,750 cal" read in a different typeface than everything
 * around it on native for no reason.
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
  const { colors } = useThemeTokens();
  const isVisible = Boolean(isOpen ?? visible);

  return (
    <BottomSheet
      visible={isVisible}
      onClose={onClose}
      testID={testID}
      accessibilityLabel={title}
    >
      <View testID={`${testID}-container`}>
        {/* Title row: calculator icon, title, close X (web parity, NP-247) */}
        <View className="flex-row items-center justify-between gap-3 mb-4">
          <View className="flex-row items-center gap-2 flex-1">
            <Calculator size={16} color={colors["muted-foreground"]} />
            <Text
              testID={`${testID}-title`}
              accessibilityRole="header"
              className="text-foreground text-sm font-semibold flex-1"
              numberOfLines={1}
            >
              {title}
            </Text>
          </View>
          <Pressable
            testID={`${testID}-close-icon`}
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={minTouchTarget}
            className="items-center justify-center"
          >
            <X size={16} color={colors["muted-foreground"]} />
          </Pressable>
        </View>

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
                <Text className="text-foreground text-xs font-bold tabular-nums">
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
            <View className="mt-0.5">
              {note.tone === "caution" ? (
                <AlertTriangle size={14} color={colors.accent} />
              ) : (
                <Info size={14} color={colors.success} />
              )}
            </View>
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
