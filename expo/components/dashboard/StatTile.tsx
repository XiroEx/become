import React from "react";
import { View, Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { LucideIcon } from "lucide-react-native";

export type StatTileAccent =
  | "green"
  | "blue"
  | "amber"
  | "red"
  | "purple"
  | "zinc";

export interface StatTileProps {
  id: string;
  label: string;
  value: string;
  unit?: string;
  Icon: LucideIcon;
  accent?: StatTileAccent;
  size?: "1x1" | "2x1";
  progressPct?: number | null;
  progressColor?: string;
  subline?: string;
  onPress?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function StatTile({
  id,
  label,
  value,
  unit,
  Icon,
  accent = "zinc",
  size = "1x1",
  progressPct,
  progressColor,
  subline,
  onPress,
  testID,
  style,
}: StatTileProps) {
  const { colors, tint } = useThemeTokens();
  const wide = size === "2x1";

  const getAccentColors = (acc: StatTileAccent) => {
    switch (acc) {
      case "amber":
        return { icon: colors.accent, bg: tint("accent", 0.15), bar: colors.accent };
      case "green":
        return { icon: colors.success, bg: tint("success", 0.15), bar: colors.success };
      case "red":
        return { icon: colors.destructive, bg: tint("destructive", 0.15), bar: colors.destructive };
      case "blue":
        return { icon: colors.primary, bg: tint("primary", 0.15), bar: colors.primary };
      case "purple":
        return { icon: colors.accent, bg: tint("accent", 0.15), bar: colors.accent };
      default:
        return {
          icon: colors["muted-foreground"],
          bg: tint("muted", 0.3),
          bar: colors["muted-foreground"],
        };
    }
  };

  const accentScheme = getAccentColors(accent);
  const effectiveBarColor = progressColor ?? accentScheme.bar;
  const clampedPct = progressPct != null ? Math.min(100, Math.max(0, progressPct)) : null;

  return (
    <Pressable
      testID={testID ?? `tile-${id}`}
      accessibilityRole="summary"
      accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ""}${subline ? `. ${subline}` : ""}`}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed && onPress ? 0.8 : 1,
        },
        style,
      ]}
    >
      {wide ? (
        <View style={styles.wideRow}>
          <View style={styles.wideLeft}>
            <View style={[styles.badge, { backgroundColor: accentScheme.bg }]}>
              <Icon size={20} color={accentScheme.icon} />
            </View>
            <View style={styles.wideMeta}>
              <Text className="text-muted-foreground text-xs font-medium" numberOfLines={1}>
                {label}
              </Text>
              <View style={styles.valueRow}>
                <Text className="text-foreground text-2xl font-extrabold tracking-tight">
                  {value}
                </Text>
                {unit ? (
                  <Text className="text-muted-foreground text-xs font-semibold ml-1 self-end mb-0.5">
                    {unit}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.wideRight}>
            {clampedPct != null ? (
              <View
                style={[
                  styles.track,
                  { backgroundColor: tint("muted", 0.4) },
                ]}
              >
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${clampedPct}%`,
                      backgroundColor: effectiveBarColor,
                    },
                  ]}
                />
              </View>
            ) : null}
            {subline ? (
              <Text className="text-muted-foreground text-[11px] mt-1" numberOfLines={1}>
                {subline}
              </Text>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.squareContent}>
          <View style={styles.squareTop}>
            <View style={[styles.badgeSmall, { backgroundColor: accentScheme.bg }]}>
              <Icon size={16} color={accentScheme.icon} />
            </View>
            <Text
              className="text-muted-foreground text-xs font-medium flex-1 ml-2"
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>

          <View style={styles.squareMiddle}>
            <Text className="text-foreground text-2xl font-extrabold tracking-tight">
              {value}
            </Text>
            {unit ? (
              <Text className="text-muted-foreground text-xs font-semibold ml-1 self-end mb-0.5">
                {unit}
              </Text>
            ) : null}
          </View>

          <View style={styles.squareBottom}>
            {clampedPct != null ? (
              <View
                style={[
                  styles.track,
                  { backgroundColor: tint("muted", 0.4) },
                ]}
              >
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${clampedPct}%`,
                      backgroundColor: effectiveBarColor,
                    },
                  ]}
                />
              </View>
            ) : null}
            {subline ? (
              <Text className="text-muted-foreground text-[10px] mt-0.5" numberOfLines={1}>
                {subline}
              </Text>
            ) : null}
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    minHeight: 96,
    justifyContent: "center",
  },
  wideRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  wideLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
  },
  wideMeta: {
    justifyContent: "center",
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 2,
  },
  wideRight: {
    flex: 1,
    maxWidth: "50%",
    justifyContent: "center",
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeSmall: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  squareContent: {
    flex: 1,
    justifyContent: "space-between",
  },
  squareTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  squareMiddle: {
    flexDirection: "row",
    alignItems: "baseline",
    marginVertical: 2,
  },
  squareBottom: {
    width: "100%",
  },
  track: {
    height: 4,
    width: "100%",
    borderRadius: 2,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 2,
  },
});

export default StatTile;
