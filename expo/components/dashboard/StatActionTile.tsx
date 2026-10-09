import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { DashboardTile } from "@become/api-client";
import { Brain, UtensilsCrossed, Zap, ChevronRight, Scale } from "lucide-react-native";
import { useRouter } from "expo-router";
import { usePressed } from "@/lib/a11y/usePressed";

export interface StatActionTileProps {
  tile: DashboardTile;
  onOpenMind?: () => void;
  onOpenNutrition?: () => void;
  onOpenWorkoutNow?: () => void;
  onOpenWeight?: () => void;
  /**
   * Fired on press BEFORE the tile's own action, never instead of it — the
   * smart tile's engagement signal (NP-156).
   */
  onTap?: () => void;
  /** Defaults to `tile-<id>`; the smart tile renames its rotated card. */
  testID?: string;
}

export function StatActionTile({
  tile,
  onOpenMind,
  onOpenNutrition,
  onOpenWorkoutNow,
  onOpenWeight,
  onTap,
  testID,
}: StatActionTileProps) {
  const { colors, tint } = useThemeTokens();
  const router = useRouter();
  const tilePress = usePressed();
  const wide = tile.size === "2x1";

  let label = "";
  let actionValue = "";
  let subtitle = "";
  let IconComponent = Zap;
  let color = colors.success;
  let bg = tint("success", 0.15);
  let handlePress = () => {};

  if (tile.id === "mindset") {
    label = "Mindset";
    actionValue = "Begin";
    subtitle = "Jump into today's session";
    IconComponent = Brain;
    color = colors.accent;
    bg = tint("accent", 0.15);
    handlePress = () => {
      if (onOpenMind) {
        onOpenMind();
      } else {
        router.push("/(tabs)/mind?start=1" as never);
      }
    };
  } else if (tile.id === "nutrition") {
    label = "Nutrition";
    actionValue = "Log";
    subtitle = "Add today's meals";
    IconComponent = UtensilsCrossed;
    color = colors.primary;
    bg = tint("primary", 0.15);
    handlePress = () => {
      if (onOpenNutrition) {
        onOpenNutrition();
      } else {
        router.push("/(tabs)/nutrition" as never);
      }
    };
  } else if (tile.id === "workoutNow") {
    label = "Workout Now";
    actionValue = "Start";
    subtitle = "Jump into a session now";
    IconComponent = Zap;
    color = colors.success;
    bg = tint("success", 0.15);
    handlePress = () => {
      if (onOpenWorkoutNow) {
        onOpenWorkoutNow();
      } else {
        router.push("/(tabs)/programming?quick=true" as never);
      }
    };
  } else if (tile.id === "weight") {
    label = "Weight";
    actionValue = "Log";
    subtitle = "Track today's weight";
    IconComponent = Scale;
    color = colors.primary;
    bg = tint("primary", 0.15);
    handlePress = () => {
      if (onOpenWeight) {
        onOpenWeight();
      }
    };
  }

  return (
    <Pressable
      testID={testID ?? `tile-${tile.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${actionValue}`}
      accessibilityHint={subtitle}
      onPress={() => {
        onTap?.();
        handlePress();
      }}
      onPressIn={tilePress.onPressIn}
      onPressOut={tilePress.onPressOut}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: tilePress.pressed ? 0.8 : 1,
        },
      ]}
    >
      {wide ? (
        <View style={styles.wideRow}>
          <View style={styles.wideLeft}>
            <View style={[styles.badge, { backgroundColor: bg }]}>
              <IconComponent size={22} color={color} />
            </View>
            <View style={styles.wideMeta}>
              <Text className="text-muted-foreground text-xs font-medium" numberOfLines={1}>
                {label}
              </Text>
              <Text className="text-foreground text-2xl font-bold">
                {actionValue}
              </Text>
            </View>
          </View>
          <View style={styles.wideRight}>
            <Text className="text-muted-foreground text-[11px] mr-1">
              {subtitle}
            </Text>
            <ChevronRight size={16} color={colors["muted-foreground"]} />
          </View>
        </View>
      ) : (
        <View style={styles.squareContent}>
          <View style={styles.squareTopRow}>
            <View style={[styles.badgeSmall, { backgroundColor: bg }]}>
              <IconComponent size={18} color={color} />
            </View>
            <View style={styles.squareMeta}>
              <Text
                className="text-muted-foreground text-xs font-medium"
                numberOfLines={1}
              >
                {label}
              </Text>
              <Text className="text-foreground text-2xl font-extrabold tracking-tight">
                {actionValue}
              </Text>
            </View>
          </View>
          <View style={styles.squareBottom}>
            <Text className="text-muted-foreground text-[10px]" numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    height: "100%",
    minHeight: 96,
    justifyContent: "center",
  },
  wideRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wideLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexShrink: 1,
  },
  wideMeta: {
    justifyContent: "center",
  },
  wideRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  squareContent: {
    flex: 1,
    justifyContent: "center",
    gap: 6,
  },
  squareTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  squareMeta: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  squareBottom: {
    width: "100%",
  },
});

export default StatActionTile;
