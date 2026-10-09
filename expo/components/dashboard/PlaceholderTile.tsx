import React from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { DashboardTile } from "@become/api-client";
import {
  Flame,
  TrendingUp,
  Target,
  Utensils,
  Droplets,
  Scale,
  Dumbbell,
  Sparkles,
  Activity,
} from "lucide-react-native";

export interface PlaceholderTileProps {
  tile: DashboardTile;
}

type TokenThemeType = ReturnType<typeof useThemeTokens>;

function getTileConfig(tile: DashboardTile, theme: TokenThemeType) {
  const { colors, tint } = theme;

  if (tile.kind === "smart-rotating") {
    return {
      label: tile.id === "smart" ? "Smart Tile" : tile.id,
      Icon: Sparkles,
      color: colors.accent,
      bg: tint("accent", 0.15),
    };
  }
  if (tile.kind === "metric") {
    const label = tile.id
      ? tile.id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "Metric";
    return {
      label,
      Icon: Activity,
      color: colors.primary,
      bg: tint("primary", 0.15),
    };
  }

  // Known stat cards
  if (tile.id === "streak") {
    return {
      label: "Day Streak",
      Icon: Flame,
      color: colors.accent,
      bg: tint("accent", 0.15),
    };
  }
  if (tile.id === "mood") {
    return {
      label: "Today's Mood",
      Icon: Flame,
      color: colors["muted-foreground"],
      bg: tint("muted", 0.3),
    };
  }
  if (tile.id === "weekly") {
    return {
      label: "This Week",
      Icon: TrendingUp,
      color: colors.success,
      bg: tint("success", 0.15),
    };
  }
  if (tile.id === "goal") {
    return {
      label: "Goal",
      Icon: Target,
      color: colors.accent,
      bg: tint("accent", 0.15),
    };
  }
  if (tile.id === "calories") {
    return {
      label: "Calories",
      Icon: Utensils,
      color: colors.primary,
      bg: tint("primary", 0.15),
    };
  }
  if (tile.id === "water") {
    return {
      label: "Water",
      Icon: Droplets,
      color: colors.primary,
      bg: tint("primary", 0.15),
    };
  }
  if (tile.id === "weight") {
    return {
      label: "Weight",
      Icon: Scale,
      color: colors["muted-foreground"],
      bg: tint("muted", 0.3),
    };
  }
  if (tile.id === "workouts") {
    return {
      label: "Total Workouts",
      Icon: Dumbbell,
      color: colors["muted-foreground"],
      bg: tint("muted", 0.3),
    };
  }

  const label = tile.id
    ? tile.id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Stat";
  return {
    label,
    Icon: Activity,
    color: colors["muted-foreground"],
    bg: tint("muted", 0.3),
  };
}

export function PlaceholderTile({ tile }: PlaceholderTileProps) {
  const theme = useThemeTokens();
  const { colors } = theme;
  const wide = tile.size === "2x1";
  const config = getTileConfig(tile, theme);
  const IconComponent = config.Icon;

  return (
    <View
      testID={`tile-${tile.id}`}
      accessibilityRole="summary"
      accessibilityLabel={`${config.label}: placeholder`}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      {wide ? (
        <View style={styles.wideRow}>
          <View style={styles.wideLeft}>
            <View style={[styles.badge, { backgroundColor: config.bg }]}>
              <IconComponent size={20} color={config.color} />
            </View>
            <View style={styles.wideMeta}>
              <Text className="text-muted-foreground text-xs font-medium" numberOfLines={1}>
                {config.label}
              </Text>
              <Text className="text-muted-foreground text-2xl font-bold">
                —
              </Text>
            </View>
          </View>
          <View style={styles.wideRight} />
        </View>
      ) : (
        <View style={styles.squareContent}>
          <View style={styles.squareHeader}>
            <View style={[styles.badgeSmall, { backgroundColor: config.bg }]}>
              <IconComponent size={16} color={config.color} />
            </View>
            <Text
              className="text-muted-foreground text-xs font-medium flex-1 ml-2"
              numberOfLines={1}
            >
              {config.label}
            </Text>
          </View>
          <Text className="text-muted-foreground text-2xl font-bold mt-2">
            —
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    // Fills the grid's fixed 96px cell (NP-352) instead of growing to
    // content — a `minHeight` here let this tile out-grow its row-mate.
    height: "100%",
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
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  squareContent: {
    flex: 1,
    justifyContent: "center",
  },
  squareHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
});

export default PlaceholderTile;
