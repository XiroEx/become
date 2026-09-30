/**
 * How fast? Three chips (0.5 / 1 / 1.5 lb a week; 0.25 / 0.5 / 0.75 kg) with
 * the ETA under them. A CHOSEN pace, not a computed one — a computed pace from
 * history reads as a verdict; this is a plan. Used by onboarding, Settings and
 * the nutrition goals page.
 */

import { View, Pressable } from "react-native";
import { Text } from "@/components/Text";
import {
  PACE_OPTIONS_LB,
  PACE_OPTIONS_KG,
  unitToKg,
  kgToUnit,
  etaWeeks,
  formatEta,
  etaDate,
} from "@become/core";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

export interface PacePickerProps {
  unit: "lbs" | "kg";
  direction: "lose" | "maintain" | "gain";
  /** Current pace in kg/week (null → nothing selected). */
  valueKgPerWeek: number | null;
  onChange: (kgPerWeek: number) => void;
  /** For the ETA line, both in `unit`. */
  latestWeight?: number | null;
  targetWeight?: number | null;
  compact?: boolean;
  disabled?: boolean;
  testID?: string;
}

export function PacePicker({
  unit,
  direction,
  valueKgPerWeek,
  onChange,
  latestWeight,
  targetWeight,
  compact,
  disabled,
  testID = "pace-picker",
}: PacePickerProps) {
  const { colors } = useThemeTokens();

  if (direction === "maintain") return null;

  const options = unit === "kg" ? PACE_OPTIONS_KG : PACE_OPTIONS_LB;
  const selected =
    valueKgPerWeek != null
      ? Math.round(kgToUnit(valueKgPerWeek, unit) * 100) / 100
      : null;
  const eta =
    latestWeight && targetWeight && valueKgPerWeek
      ? etaWeeks(
          unitToKg(latestWeight, unit),
          unitToKg(targetWeight, unit),
          valueKgPerWeek,
        )
      : null;
  const when =
    eta != null && eta > 0
      ? etaDate(new Date(), eta).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })
      : null;

  return (
    <View testID={testID} style={{ gap: 8 }}>
      {!compact && (
        <Text className="text-foreground text-xs font-medium">
          How fast? ({direction === "lose" ? "lose" : "gain"} per week)
        </Text>
      )}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {options.map((o) => {
          const on = selected != null && Math.abs(selected - o) < 0.01;
          return (
            <Pressable
              key={o}
              testID={`pace-${o}`}
              disabled={disabled}
              onPress={() => onChange(unitToKg(o, unit))}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[
                minTouchTarget,
                {
                  flex: 1,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  borderColor: on ? colors.foreground : colors.border,
                  backgroundColor: on ? colors.foreground : colors.card,
                  opacity: disabled ? 0.5 : 1,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: on ? colors.background : colors.foreground,
                }}
              >
                {o} {unit === "kg" ? "kg" : "lb"}
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  color: on ? colors.background : colors["muted-foreground"],
                  opacity: 0.7,
                }}
              >
                / week
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text
        testID="pace-eta"
        className="text-muted-foreground text-xs mt-0.5"
      >
        {eta == null
          ? "Pick a pace to see when you get there."
          : eta === 0
            ? "You are already inside your target band."
            : `At this pace: ${formatEta(eta)}${when ? ` → ${when}` : ""}. Slower is easier to keep; faster is fine short term.`}
      </Text>
    </View>
  );
}

export default PacePicker;
