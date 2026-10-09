import React, { useEffect, useMemo, useState } from "react";
import { View, Pressable, StyleSheet, Animated } from "react-native";
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
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { usePressed } from "@/lib/a11y/usePressed";
import { checkBecomingUnread, markBecomingSeen } from "@/lib/becoming/storage";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";

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
  const { colors, tint, isDark } = useThemeTokens();
  const router = useRouter();
  const reduced = useReducedMotion();
  const [isUnread, setIsUnread] = useState(false);
  const cardPress = usePressed();

  const pulseAnim = useMemo(() => new Animated.Value(1), []);

  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (isUnread && !reduced) {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.88,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      );
      anim.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => {
      anim?.stop();
    };
  }, [isUnread, reduced, pulseAnim]);

  const handlePress = () => {
    markBecomingSeen();
    setIsUnread(false);
    if (onPress) {
      onPress();
    } else {
      router.push("/becoming" as never);
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
    <Animated.View
      style={{
        opacity: isUnread && !reduced ? pulseAnim : 1,
      }}
    >
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={
          isUnread
            ? "The Becoming · a new week is written. Then → now → next, across all three."
            : "The Becoming. Then → now → next, across all three."
        }
        onPress={handlePress}
        onPressIn={cardPress.onPressIn}
        onPressOut={cardPress.onPressOut}
        style={[
          minTouchTarget,
          styles.card,
          isUnread
            ? {
                backgroundColor: isDark
                  ? "hsl(258, 45%, 15%)"
                  : "hsl(258, 90%, 96%)",
                borderColor: isDark
                  ? "hsl(258, 80%, 65%)"
                  : "hsl(258, 80%, 55%)",
              }
            : {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
          {
            opacity: cardPress.pressed ? 0.85 : 1,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View
              style={[
                styles.iconBadge,
                {
                  backgroundColor: isUnread
                    ? isDark
                      ? "hsla(258, 80%, 70%, 0.25)"
                      : "hsla(258, 80%, 50%, 0.15)"
                    : tint("mind-violet", 0.15),
                },
              ]}
            >
              <Compass
                size={18}
                color={
                  isUnread
                    ? isDark
                      ? "hsl(258, 90%, 80%)"
                      : "hsl(258, 90%, 45%)"
                    : colors["mind-violet"]
                }
              />
            </View>
            <View style={styles.headerMeta}>
              <Text
                style={[
                  styles.kicker,
                  {
                    color: isUnread
                      ? isDark
                        ? "hsl(258, 90%, 80%)"
                        : "hsl(258, 90%, 45%)"
                      : colors["mind-violet"],
                  },
                ]}
              >
                The Becoming{isUnread ? " · a new week is written" : ""}
              </Text>
              <Text
                style={[
                  styles.titleText,
                  { color: colors.foreground },
                ]}
              >
                Then → now → next, across all three
              </Text>
            </View>
          </View>
          <ArrowRight
            size={18}
            color={
              isUnread
                ? isDark
                  ? "hsl(258, 90%, 80%)"
                  : "hsl(258, 90%, 45%)"
                : colors["muted-foreground"]
            }
          />
        </View>

        <View style={styles.chipRow}>
          {/* Mind chip */}
          <View
            style={[
              styles.chip,
              {
                backgroundColor: isUnread
                  ? isDark
                    ? "hsla(258, 60%, 70%, 0.15)"
                    : "hsla(258, 60%, 50%, 0.08)"
                  : tint("muted", 0.3),
              },
            ]}
          >
            <Brain
              size={14}
              color={
                isUnread
                  ? isDark
                    ? "hsl(258, 80%, 75%)"
                    : "hsl(258, 70%, 45%)"
                  : colors["mind-violet"]
              }
            />
            <View style={styles.chipContent}>
              <Text
                style={[
                  styles.chipLabel,
                  { color: colors["muted-foreground"] },
                ]}
              >
                Mind
              </Text>
              <Text
                style={[
                  styles.chipValue,
                  { color: colors.foreground },
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {mindChip.value}
              </Text>
              {mindChip.sub ? (
                <Text
                  style={[
                    styles.chipSub,
                    { color: colors["muted-foreground"] },
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
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
              {
                backgroundColor: isUnread
                  ? isDark
                    ? "hsla(258, 60%, 70%, 0.15)"
                    : "hsla(258, 60%, 50%, 0.08)"
                  : tint("muted", 0.3),
              },
            ]}
          >
            <UtensilsCrossed
              size={14}
              color={
                isUnread
                  ? isDark
                    ? "hsl(38, 90%, 65%)"
                    : "hsl(38, 90%, 45%)"
                  : colors.brand
              }
            />
            <View style={styles.chipContent}>
              <Text
                style={[
                  styles.chipLabel,
                  { color: colors["muted-foreground"] },
                ]}
              >
                Nutrition
              </Text>
              <Text
                style={[
                  styles.chipValue,
                  { color: colors.foreground },
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {nutritionChip.value}
              </Text>
              {nutritionChip.sub ? (
                <Text
                  style={[
                    styles.chipSub,
                    { color: colors["muted-foreground"] },
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
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
              {
                backgroundColor: isUnread
                  ? isDark
                    ? "hsla(258, 60%, 70%, 0.15)"
                    : "hsla(258, 60%, 50%, 0.08)"
                  : tint("muted", 0.3),
              },
            ]}
          >
            <Dumbbell
              size={14}
              color={
                isUnread
                  ? isDark
                    ? "hsl(142, 70%, 65%)"
                    : "hsl(142, 70%, 40%)"
                  : colors.success
              }
            />
            <View style={styles.chipContent}>
              <Text
                style={[
                  styles.chipLabel,
                  { color: colors["muted-foreground"] },
                ]}
              >
                Training
              </Text>
              <Text
                style={[
                  styles.chipValue,
                  { color: colors.foreground },
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {trainingChip.value}
              </Text>
              {trainingChip.sub ? (
                <Text
                  style={[
                    styles.chipSub,
                    { color: colors["muted-foreground"] },
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {trainingChip.sub}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {top ? (
          <View testID="becoming-door-next" style={styles.nextRow}>
            <Sparkles
              size={14}
              color={
                isUnread
                  ? isDark
                    ? "hsl(38, 90%, 65%)"
                    : "hsl(38, 90%, 45%)"
                  : colors["mind-violet"]
              }
            />
            {/* One truncated line, like the web's `truncate` paragraph — two
                SEPARATELY-styled Text nodes nested inside one outer Text so
                `numberOfLines` governs the pair together instead of each
                wrapping into its own second line (NP-316). */}
            <Text
              style={styles.nextTextWrap}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              <Text
                style={[styles.nextTitle, { color: colors.foreground }]}
              >
                {top.title}
              </Text>
              <Text
                style={[styles.nextSub, { color: colors["muted-foreground"] }]}
              >
                {" "}· {top.sub}
              </Text>
            </Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 44,
    minWidth: 44,
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
    borderRadius: 12,
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
  titleText: {
    fontSize: 14,
    fontWeight: "700",
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
    borderRadius: 8,
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
  chipValue: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
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
  nextTextWrap: {
    flex: 1,
  },
  nextTitle: {
    fontSize: 12,
    fontWeight: "600",
  },
  nextSub: {
    fontSize: 11,
  },
});

export default BecomingDoor;
