import React, { useState } from "react";
import { View, Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { X, Sparkles, ArrowRight } from "lucide-react-native";
import { useRouter } from "expo-router";
import type { DashboardTile } from "@become/api-client";
import type { SuggestionItem } from "@/lib/dashboard/types";

export interface SuggestionCardProps {
  tile?: DashboardTile;
  suggestion?: SuggestionItem | null;
  onDismiss?: (id: string) => void;
  onAction?: (href: string) => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function SuggestionCard({
  tile,
  suggestion,
  onDismiss,
  onAction,
  testID,
  style,
}: SuggestionCardProps) {
  const { colors, tint, isDark } = useThemeTokens();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return null;
  }

  const effectiveTestId = testID ?? (tile ? `tile-${tile.id}` : "suggestion-card");

  if (!suggestion) {
    // Rotator fallback when no server suggestions are active — NEVER "Coming soon"
    return (
      <View
        testID={effectiveTestId}
        accessibilityRole="summary"
        accessibilityLabel="Smart Tile: Active highlights"
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
          style,
        ]}
      >
        <View style={styles.rotatorRow}>
          <View style={[styles.badgeSmall, { backgroundColor: tint("accent", 0.15) }]}>
            <Sparkles size={16} color={colors.accent} />
          </View>
          <View style={styles.rotatorMeta}>
            <View style={styles.rotatorHeader}>
              <Text className="text-muted-foreground text-xs font-medium">Smart Tile</Text>
              <View style={[styles.liveDot, { backgroundColor: colors.accent }]} />
            </View>
            <Text className="text-foreground text-sm font-semibold mt-0.5">
              Focus: Consistency
            </Text>
            <Text className="text-muted-foreground text-[11px] mt-0.5">
              Keep your streak alive today
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const nudgeStyle = {
    bg: tint("accent", 0.2),
    text: colors.accent,
    label: "NUDGE",
  };
  const severityBadgeStyles: Record<string, { bg: string; text: string; label: string }> = {
    info: {
      bg: tint("muted", 0.6),
      text: colors.foreground,
      label: "INFO",
    },
    nudge: nudgeStyle,
    warning: {
      bg: tint("destructive", 0.2),
      text: colors.destructive,
      label: "WARNING",
    },
    celebration: {
      bg: tint("success", 0.2),
      text: colors.success,
      label: "CELEBRATION",
    },
  };

  const badgeStyle = (suggestion.severity && severityBadgeStyles[suggestion.severity]) ? severityBadgeStyles[suggestion.severity]! : nudgeStyle;

  const handleAction = () => {
    if (suggestion.primaryAction?.href) {
      if (onAction) {
        onAction(suggestion.primaryAction.href);
      } else {
        router.push(suggestion.primaryAction.href as never);
      }
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    if (onDismiss) {
      onDismiss(suggestion.id);
    }
  };

  return (
    <View
      testID={effectiveTestId}
      accessibilityRole="summary"
      accessibilityLabel={`${badgeStyle.label} suggestion: ${suggestion.title}`}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.badgeWrapper}>
          <View style={[styles.badge, { backgroundColor: badgeStyle.bg }]}>
            <Text style={[styles.badgeText, { color: badgeStyle.text }]}>
              {badgeStyle.label}
            </Text>
          </View>
        </View>

        {suggestion.dismissible !== false ? (
          <Pressable
            testID="suggestion-dismiss"
            accessibilityRole="button"
            accessibilityLabel={`Dismiss ${suggestion.title}`}
            onPress={handleDismiss}
            hitSlop={8}
            style={({ pressed }) => [
              styles.dismissButton,
              {
                backgroundColor: tint("muted", 0.4),
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <X size={14} color={colors["muted-foreground"]} />
          </Pressable>
        ) : null}
      </View>

      <Text className="text-foreground text-sm font-bold mt-1" numberOfLines={1}>
        {suggestion.title}
      </Text>

      {suggestion.body ? (
        <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={2}>
          {suggestion.body}
        </Text>
      ) : null}

      {suggestion.primaryAction ? (
        <Pressable
          testID="suggestion-action"
          accessibilityRole="button"
          accessibilityLabel={suggestion.primaryAction.label}
          onPress={handleAction}
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: isDark ? tint("foreground", 0.15) : colors.foreground,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Text
            style={[
              styles.actionButtonText,
              { color: isDark ? colors.foreground : colors.card },
            ]}
          >
            {suggestion.primaryAction.label}
          </Text>
          <ArrowRight size={12} color={isDark ? colors.foreground : colors.card} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    minHeight: 96,
    justifyContent: "space-between",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badgeWrapper: {
    flexDirection: "row",
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  dismissButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
  },
  actionButtonText: {
    fontSize: 11,
    fontWeight: "600",
  },
  rotatorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  rotatorMeta: {
    flex: 1,
  },
  rotatorHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeSmall: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default SuggestionCard;
