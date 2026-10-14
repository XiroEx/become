import { Pressable, View } from "react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { hitSlopToMinTarget } from "@/lib/a11y/touchTarget";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import type { BellWeightInfo } from "@become/core";
import { bellCountLabel, type BellCount } from "@/lib/live/bellCount";

/** The only two answers there are. */
const BELL_COUNTS: readonly BellCount[] = [1, 2];

export interface BellCountToggleProps {
  /** What this exercise is loaded with, from `getBellWeightInfo`. */
  info: BellWeightInfo;
  /** The count currently in effect (never null — see `bellCountFor`). */
  value: BellCount;
  onChange: (count: BellCount) => void;
  /**
   * Optional leading copy, e.g. "How many?" — the web shows it in Track,
   * where the control sits in the exercise card, and omits it in Live, where
   * it sits directly under the "Weight per DB" box.
   */
  label?: string;
  testID?: string;
}

/**
 * ONE DUMBBELL OR TWO — the native twin of
 * `webapp/components/workout/BellCountToggle.tsx`.
 *
 * Jon, 2026-09-18: *"there are some exercises that I can do single if I wanted
 * to and just keep it as one 1 dumbbell"*. `getBellWeightInfo` guesses per
 * exercise and is usually right; this is how the member says otherwise. Shown
 * ONLY on a dumbbell/kettlebell exercise with a weight box, defaulted to that
 * automatic answer (and to whatever they logged last time), and saved with the
 * set as `ISetLog.bells` — see `lib/live/bellCount.ts`.
 *
 * ONE component for both views, like the web's, so the control cannot drift
 * between them: the Live step renders it under the weight box, Track renders
 * it once per exercise card. The web's two `tone`s are not needed here — the
 * native Live screen is not a black page (NP-288), so both views read the same
 * theme tokens.
 */
export function BellCountToggle({
  info,
  value,
  onChange,
  label,
  testID = "bell-count",
}: BellCountToggleProps) {
  const { colors } = useThemeTokens();
  // Barbells, machines, cables and bodyweight have no such question to answer.
  if (!info.style) return null;
  const implement = info.style === "kettlebell" ? "kettlebells" : "dumbbells";

  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={`How many ${implement}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 6,
      }}
    >
      {label ? (
        <Text
          testID={`${testID}-label`}
          style={WRAPPABLE_TEXT}
          className="text-muted-foreground text-xs"
        >
          {label}
        </Text>
      ) : null}
      {BELL_COUNTS.map((count) => {
        const selected = value === count;
        return (
          <Pressable
            key={count}
            testID={`${testID}-${count}`}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={`${count} ${implement.slice(0, -1)}${count === 1 ? "" : "s"}`}
            onPress={() => onChange(count)}
            hitSlop={hitSlopToMinTarget(48, 26)}
            style={{
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 3,
              backgroundColor: selected ? colors.primary : colors.muted,
            }}
          >
            <Text
              testID={`${testID}-${count}-label`}
              style={WRAPPABLE_TEXT}
              className={`text-[11px] font-semibold ${
                selected ? "text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {bellCountLabel(info, count)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
