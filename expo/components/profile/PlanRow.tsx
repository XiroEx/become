/**
 * "Plan — Free / Plus" in the profile screen.
 * Ported 1:1 from `webapp/components/profile/PlanRow.tsx`.
 *
 * The always-visible entry point to the plan screen (`/plan`), for someone who
 * never hit a gate.
 *
 * Like every other tier surface it renders NOTHING while ENTITLEMENTS_ENFORCED
 * is off (`data.enforced === false` or `!data`).
 */

import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, Sparkles } from "lucide-react-native";
import { tierLabel, useEntitlements } from "@/lib/entitlements";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

export interface PlanRowProps {
  onPress?: () => void;
  testID?: string;
}

export function PlanRow({
  onPress,
  testID = "profile-plan-row",
}: PlanRowProps) {
  const router = useRouter();
  const { colors } = useThemeTokens();
  const { data } = useEntitlements();

  if (!data || data.enforced === false) return null;

  const isPlus = data.tier !== "free";
  const label = tierLabel(data.tier);

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push("/plan" as never);
    }
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Plan, ${label}`}
      accessibilityHint="Opens the plan details and upgrade screen"
      onPress={handlePress}
      style={[
        minTouchTarget,
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        },
      ]}
      className="w-full rounded-2xl border border-border bg-card px-5 py-4"
    >
      <View className="flex-row items-center gap-3">
        <Sparkles size={20} color={colors["muted-foreground"]} />
        <Text className="text-foreground text-sm font-medium">Plan</Text>
      </View>
      <View className="flex-row items-center gap-2">
        <View
          testID={`${testID}-tier-badge`}
          className={`rounded-full px-2.5 py-0.5 ${
            isPlus
              ? "bg-purple-100 dark:bg-purple-950/40"
              : "bg-muted"
          }`}
        >
          <Text
            className={`text-xs font-semibold ${
              isPlus
                ? "text-purple-700 dark:text-purple-300"
                : "text-muted-foreground"
            }`}
          >
            {label}
          </Text>
        </View>
        <ChevronRight size={16} color={colors["muted-foreground"]} />
      </View>
    </Pressable>
  );
}

export default PlanRow;
