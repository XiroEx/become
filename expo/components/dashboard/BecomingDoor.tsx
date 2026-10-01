import React from "react";
import { View, Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { Compass, Brain, UtensilsCrossed, Dumbbell, ChevronRight } from "lucide-react-native";
import { useRouter } from "expo-router";
import type { BecomingWidgetData } from "@/lib/dashboard/types";

// TODO: NP-192 owns full The Becoming screen navigation and journey view

export interface BecomingDoorProps {
  data?: BecomingWidgetData | null;
  onOpen?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function BecomingDoor({
  data,
  onOpen,
  testID,
  style,
}: BecomingDoorProps) {
  const { colors, tint } = useThemeTokens();
  const router = useRouter();

  const mindLevel = data?.mindLevel ?? 1;
  const mindChapter = data?.mindChapter ?? 1;
  const nutritionPace = data?.nutritionPace ?? "On pace";
  const nutritionSub = data?.nutritionTargetWeight
    ? `→ ${Math.round(data.nutritionTargetWeight)} ${data.nutritionUnit ?? "lbs"}`
    : undefined;
  const trainingDone = data?.trainingDone ?? 0;
  const trainingTarget = data?.trainingTarget ?? 3;
  const trainingSub = trainingDone >= trainingTarget ? "week done" : "this week";
  const averagePct =
    data?.averagePacePct != null
      ? Math.min(100, Math.max(0, data.averagePacePct))
      : trainingTarget > 0
        ? Math.min(100, Math.round((trainingDone / trainingTarget) * 100))
        : 67;

  const handlePress = () => {
    if (onOpen) {
      onOpen();
    } else {
      router.push("/(tabs)/mind" as never);
    }
  };

  return (
    <Pressable
      testID={testID ?? "dashboard-becoming"}
      accessibilityRole="button"
      accessibilityLabel={`The Becoming: Mind Level ${mindLevel}, Nutrition ${nutritionPace}, Training ${trainingDone} of ${trainingTarget}`}
      accessibilityHint="Opens The Becoming journey"
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        minTouchTarget,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.iconWrapper,
              { backgroundColor: tint("accent", 0.15) },
            ]}
          >
            <Compass size={18} color={colors.accent} />
          </View>
          <View style={styles.headerMeta}>
            <Text className="text-foreground text-sm font-bold">The Becoming</Text>
            <Text className="text-muted-foreground text-[11px]">
              Three pillars · one path
            </Text>
          </View>
        </View>

        <ChevronRight size={18} color={colors["muted-foreground"]} />
      </View>

      <View style={styles.chipsRow}>
        {/* Mind chip */}
        <View
          style={[
            styles.chip,
            { backgroundColor: tint("muted", 0.4) },
          ]}
        >
          <Brain size={13} color={colors.accent} />
          <View style={styles.chipMeta}>
            <Text className="text-muted-foreground text-[9px] font-bold uppercase tracking-wider">
              Mind
            </Text>
            <Text className="text-foreground text-xs font-bold leading-tight">
              Lv {mindLevel}
            </Text>
            <Text className="text-muted-foreground text-[10px] leading-tight">
              Ch {mindChapter}
            </Text>
          </View>
        </View>

        {/* Nutrition chip */}
        <View
          style={[
            styles.chip,
            { backgroundColor: tint("muted", 0.4) },
          ]}
        >
          <UtensilsCrossed size={13} color={colors.success} />
          <View style={styles.chipMeta}>
            <Text className="text-muted-foreground text-[9px] font-bold uppercase tracking-wider">
              Nutrition
            </Text>
            <Text className="text-foreground text-xs font-bold leading-tight">
              {nutritionPace}
            </Text>
            {nutritionSub ? (
              <Text className="text-muted-foreground text-[10px] leading-tight">
                {nutritionSub}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Training chip */}
        <View
          style={[
            styles.chip,
            { backgroundColor: tint("muted", 0.4) },
          ]}
        >
          <Dumbbell size={13} color={colors.primary} />
          <View style={styles.chipMeta}>
            <Text className="text-muted-foreground text-[9px] font-bold uppercase tracking-wider">
              Training
            </Text>
            <Text className="text-foreground text-xs font-bold leading-tight">
              {trainingDone}/{trainingTarget}
            </Text>
            <Text className="text-muted-foreground text-[10px] leading-tight">
              {trainingSub}
            </Text>
          </View>
        </View>
      </View>

      {/* Averaging line */}
      <View style={styles.averagingSection}>
        <View
          style={[
            styles.averagingTrack,
            { backgroundColor: tint("muted", 0.4) },
          ]}
        >
          <View
            style={[
              styles.averagingFill,
              { width: `${averagePct}%`, backgroundColor: colors.accent },
            ]}
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    minHeight: 44,
    minWidth: 44,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    flexShrink: 1,
  },
  headerMeta: {
    flex: 1,
    flexShrink: 1,
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  chip: {
    flex: 1,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  chipMeta: {
    flex: 1,
    flexShrink: 1,
  },
  averagingSection: {
    marginTop: 10,
  },
  averagingTrack: {
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
  },
  averagingFill: {
    height: "100%",
    borderRadius: 2,
  },
});
