import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useRouter } from "expo-router";
import {
  Compass,
  ArrowRight,
  Brain,
  UtensilsCrossed,
  Dumbbell,
  Sparkles,
} from "lucide-react-native";
import type {
  GoalProgressResponse,
  MindSummaryResponse,
} from "@become/api-client";

// TODO: NP-192 owns full native Becoming screen and journey stage

export interface BecomingDoorProps {
  goals?: GoalProgressResponse | null;
  mind?: MindSummaryResponse | null;
  onPress?: () => void;
  testID?: string;
}

const RANK: Record<string, number> = { warn: 0, nudge: 1, info: 2, good: 3 };

export function topSuggestion(goals?: GoalProgressResponse | null) {
  if (!goals) return null;
  const list = [goals.nutrition?.suggestion, goals.training?.suggestion].filter(
    (s): s is NonNullable<typeof s> => Boolean(s),
  );
  if (list.length === 0) return null;
  list.sort((a, b) => (RANK[a.severity] ?? 9) - (RANK[b.severity] ?? 9));
  return list[0] ?? null;
}

export function BecomingDoor({
  goals,
  mind,
  onPress,
  testID = "becoming-door",
}: BecomingDoorProps) {
  const { colors, tint } = useThemeTokens();
  const router = useRouter();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push("/(tabs)/mind?start=1" as never);
    }
  };

  const n = goals?.nutrition;
  const t = goals?.training;
  const top = topSuggestion(goals);

  const mindChip = mind
    ? {
        value: `Lv ${mind.level}`,
        sub: `Ch ${mind.chapter}${mind.chapterName ? ` · ${mind.chapterName}` : ""}`,
      }
    : { value: "—", sub: undefined };

  const nutritionChip = !n
    ? { value: "—", sub: undefined }
    : !n.target?.weight
      ? { value: "Set a target", sub: undefined }
      : n.pace?.status === "behind"
        ? {
            value: `${Math.round(n.pace.behindByKg)} ${n.unit} behind`,
            sub: `→ ${Math.round(n.target.weight)} ${n.unit}`,
          }
        : n.pace?.status === "ahead"
          ? {
              value: "Ahead",
              sub: n.pace.eta
                ? `${n.pace.eta} to ${Math.round(n.target.weight)}`
                : undefined,
            }
          : n.pace?.status === "on"
            ? {
                value: "On pace",
                sub: n.pace.eta
                  ? `${n.pace.eta} to ${Math.round(n.target.weight)}`
                  : undefined,
              }
            : n.direction === "maintain"
              ? { value: "Holding", sub: `${Math.round(n.target.weight)} ${n.unit}` }
              : { value: `→ ${Math.round(n.target.weight)}`, sub: n.unit };

  const trainingChip = !t
    ? { value: "—", sub: undefined }
    : !t.target?.daysPerWeek
      ? { value: "Set days", sub: undefined }
      : {
          value: `${t.thisWeek?.done ?? 0}/${t.target.daysPerWeek}`,
          sub: t.thisWeek?.weekLost
            ? "week off track"
            : t.thisWeek?.remaining === 0
              ? "week done"
              : "this week",
        };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="The Becoming. Then → now → next, across all three."
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.iconBadge,
              { backgroundColor: tint("accent", 0.15) },
            ]}
          >
            <Compass size={18} color={colors.accent} />
          </View>
          <View style={styles.headerMeta}>
            <Text
              style={[
                styles.kicker,
                { color: colors.accent },
              ]}
            >
              The Becoming
            </Text>
            <Text className="text-foreground text-sm font-bold">
              Then → now → next, across all three
            </Text>
          </View>
        </View>
        <ArrowRight size={18} color={colors["muted-foreground"]} />
      </View>

      <View style={styles.chipRow}>
        {/* Mind chip */}
        <View
          style={[
            styles.chip,
            { backgroundColor: tint("muted", 0.3) },
          ]}
        >
          <Brain size={14} color={colors.accent} />
          <View style={styles.chipContent}>
            <Text style={[styles.chipLabel, { color: colors["muted-foreground"] }]}>
              Mind
            </Text>
            <Text
              className="text-foreground text-xs font-bold leading-tight"
              numberOfLines={1}
            >
              {mindChip.value}
            </Text>
            {mindChip.sub ? (
              <Text
                style={[styles.chipSub, { color: colors["muted-foreground"] }]}
                numberOfLines={1}
              >
                {mindChip.sub}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Nutrition chip */}
        <View
          style={[
            styles.chip,
            { backgroundColor: tint("muted", 0.3) },
          ]}
        >
          <UtensilsCrossed size={14} color={colors.primary} />
          <View style={styles.chipContent}>
            <Text style={[styles.chipLabel, { color: colors["muted-foreground"] }]}>
              Nutrition
            </Text>
            <Text
              className="text-foreground text-xs font-bold leading-tight"
              numberOfLines={1}
            >
              {nutritionChip.value}
            </Text>
            {nutritionChip.sub ? (
              <Text
                style={[styles.chipSub, { color: colors["muted-foreground"] }]}
                numberOfLines={1}
              >
                {nutritionChip.sub}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Training chip */}
        <View
          style={[
            styles.chip,
            { backgroundColor: tint("muted", 0.3) },
          ]}
        >
          <Dumbbell size={14} color={colors.success} />
          <View style={styles.chipContent}>
            <Text style={[styles.chipLabel, { color: colors["muted-foreground"] }]}>
              Training
            </Text>
            <Text
              className="text-foreground text-xs font-bold leading-tight"
              numberOfLines={1}
            >
              {trainingChip.value}
            </Text>
            {trainingChip.sub ? (
              <Text
                style={[styles.chipSub, { color: colors["muted-foreground"] }]}
                numberOfLines={1}
              >
                {trainingChip.sub}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {top ? (
        <View testID="becoming-door-next" style={styles.nextRow}>
          <Sparkles size={14} color={colors.accent} />
          <Text
            className="text-foreground text-xs font-semibold"
            numberOfLines={1}
          >
            {top.title}
          </Text>
          <Text
            style={[styles.nextSub, { color: colors["muted-foreground"] }]}
            numberOfLines={1}
          >
            · {top.sub}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    gap: 12,
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
    flexShrink: 1,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerMeta: {
    justifyContent: "center",
    flexShrink: 1,
  },
  kicker: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: "row",
    gap: 6,
  },
  chip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
  },
  chipContent: {
    flex: 1,
    minWidth: 0,
  },
  chipLabel: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipSub: {
    fontSize: 10,
    lineHeight: 12,
  },
  nextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  nextSub: {
    fontSize: 11,
    flexShrink: 1,
  },
});

export default BecomingDoor;
