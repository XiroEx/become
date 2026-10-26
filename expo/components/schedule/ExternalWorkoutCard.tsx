import { View } from "react-native";
import { Activity } from "lucide-react-native";
import { Text } from "@/components/Text";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  EXTERNAL_WORKOUT_LABEL,
  externalWorkoutDetail,
  type ExternalCalItem,
} from "@/lib/schedule/slotStatus";

export interface ExternalWorkoutCardProps {
  workout: ExternalCalItem;
  /** The member's unit system — distance reads in km for kg, miles for lbs. */
  unit: "lbs" | "kg";
}

/**
 * One tracked workout done outside Become, on the calendar's day panel (card
 * 6adf69c7) — the web's teal day card in `CalendarClient.tsx`.
 *
 * Read-only on purpose: Health owns the session, so there is nothing here to
 * start, skip or reschedule, and the program session below it is untouched.
 * One accessible element, read as one fact ("Walking, extra activity, tracked
 * by Whoop · 45 min"), with the icon hidden as decoration (NP-124).
 */
export function ExternalWorkoutCard({ workout, unit }: ExternalWorkoutCardProps) {
  const { colors } = useThemeTokens();
  const detail = externalWorkoutDetail(workout, unit);
  return (
    <View
      testID={`day-detail-external-${workout.externalId}`}
      accessible
      accessibilityLabel={`${workout.activityName}, ${EXTERNAL_WORKOUT_LABEL.toLowerCase()}, ${detail}`}
      className="rounded-xl border border-teal-500/40 bg-teal-500/10 p-3"
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ paddingTop: 2 }}
      >
        <Activity size={16} color={colors.teal} />
      </View>
      <View style={{ flex: 1 }}>
        <Text className="text-foreground font-medium text-sm" style={WRAPPABLE_TEXT}>
          {workout.activityName}
        </Text>
        <Text className="text-muted-foreground text-xs mt-1" style={WRAPPABLE_TEXT}>
          {detail}
        </Text>
      </View>
      <View className="rounded-full bg-teal-500/20 px-2 py-0.5">
        <Text className="text-[10px] font-semibold text-teal-600 dark:text-teal-400">
          {EXTERNAL_WORKOUT_LABEL}
        </Text>
      </View>
    </View>
  );
}
