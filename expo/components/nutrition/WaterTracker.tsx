import { View, Pressable } from "react-native";
import { Droplets } from "lucide-react-native";
import { Card } from "@/components/Card";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface WaterTrackerProps {
  current: number;
  goal: number;
  onAddWater: (amount: number) => void;
  disabled?: boolean;
  testID?: string;
}

const QUICK_AMOUNTS = [
  { label: "+8 oz", sublabel: "Glass", amount: 8, testID: "nutrition-water-add-8" },
  { label: "+16 oz", sublabel: "Bottle", amount: 16, testID: "nutrition-water-add-16" },
  { label: "+32 oz", sublabel: "Large", amount: 32, testID: "nutrition-water-add-32" },
] as const;

export function WaterTracker({
  current,
  goal,
  onAddWater,
  disabled = false,
  testID = "nutrition-water-section",
}: WaterTrackerProps) {
  const { colors, tint } = useThemeTokens();
  const safeGoal = Math.max(goal, 1);
  const safeCurrent = Math.max(current, 0);
  const percentage = Math.min((safeCurrent / safeGoal) * 100, 100);
  const isComplete = safeCurrent >= safeGoal;

  return (
    <Card testID={testID}>
      {/* Header row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: isComplete ? tint("primary", 0.15) : colors.muted,
            }}
          >
            <Droplets
              size={18}
              color={isComplete ? colors.primary : colors["muted-foreground"]}
            />
          </View>
          <Text className="text-foreground text-sm font-semibold">Water</Text>
        </View>
        <Text
          testID="nutrition-water-label"
          className="text-muted-foreground text-xs font-medium tabular-nums"
        >
          <Text
            className={
              isComplete
                ? "text-primary font-semibold"
                : "text-foreground font-semibold"
            }
          >
            {safeCurrent}
          </Text>
          {" / "}
          {safeGoal} oz
        </Text>
      </View>

      {/* Progress bar */}
      <View
        testID="nutrition-water-progress-bar"
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`Water progress: ${safeCurrent} of ${safeGoal} ounces`}
        accessibilityValue={{ min: 0, max: safeGoal, now: safeCurrent }}
        style={{
          height: 10,
          width: "100%",
          borderRadius: 5,
          backgroundColor: colors.muted,
          overflow: "hidden",
          marginBottom: 12,
        }}
      >
        <View
          style={{
            height: "100%",
            width: `${percentage}%`,
            borderRadius: 5,
            backgroundColor: colors.primary,
          }}
        />
      </View>

      {/* Quick-add buttons */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {QUICK_AMOUNTS.map((item) => (
          <Pressable
            key={item.amount}
            testID={item.testID}
            accessibilityRole="button"
            accessibilityLabel={`Add ${item.label} (${item.sublabel}) of water`}
            disabled={disabled}
            onPress={() => onAddWater(item.amount)}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 8,
              paddingHorizontal: 4,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {item.amount === 8 && (
              <View
                testID="nutrition-add-water-button"
                style={{ position: "absolute", width: "100%", height: "100%" }}
                pointerEvents="none"
              />
            )}
            <Text className="text-xs font-semibold text-primary">
              {item.label}
            </Text>
            <Text className="text-[10px] text-muted-foreground mt-0.5">
              {item.sublabel}
            </Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}
