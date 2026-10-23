import React, { useEffect, useMemo, useState } from "react";
import { View, Pressable, StyleSheet, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AnimatedRe, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "@/lib/motion/reanimated";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  becomingStageTokens,
  onDarkForeground,
  rgbOf,
} from "@/lib/theme/tokens";
import { MOTION_MS, motionMs } from "@/lib/motion/motion";
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
import { fmtUnit, readReached } from "@become/core";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { usePressed } from "@/lib/a11y/usePressed";
import {
  checkBecomingUnread,
  markBecomingSeen,
} from "@/lib/becoming/storage";
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
  const { colors, tint } = useThemeTokens();
  const router = useRouter();
  const reduced = useReducedMotion();
  const [isUnread, setIsUnread] = useState(false);
  const cardPress = usePressed();

  // The web's unread state is a violet gradient (`bg-gradient-to-br
  // from-violet-600 to-violet-500`, `doorClassName` in
  // `webapp/components/dashboard/BecomingDoor.tsx`) — white ink on violet in
  // BOTH modes, like the Becoming stage's night sky. The stops are the
  // mode-invariant violet tokens, so no colour literal is written here.
  // `mind-violet` is violet-500 in both modes; the `from` stop is violet-600,
  // which the web draws only here, so it lives beside the stage's own
  // always-dark triplets in `tokens.ts` rather than as a full theme token.
  const unreadGradient = [
    rgbOf(becomingStageTokens.doorVioletFrom),
    colors["mind-violet"],
  ] as const;
  // White ink at the web's own alphas (`text-white`, `text-white/60`,
  // `text-white/65`, `text-white/85`, `bg-white/10`, `bg-white/15`) — the
  // stage's ink (white in both modes) at an alpha, never a literal.
  const unreadInk = onDarkForeground;
  const unreadInk70 = rgbOf(becomingStageTokens.ink, 0.7);
  const unreadInk65 = rgbOf(becomingStageTokens.ink, 0.65);
  const unreadInk85 = rgbOf(becomingStageTokens.ink, 0.85);
  const unreadInk80 = rgbOf(becomingStageTokens.ink, 0.8);
  const unreadWash10 = rgbOf(becomingStageTokens.ink, 0.1);
  const unreadWash15 = rgbOf(becomingStageTokens.ink, 0.15);

  useEffect(() => {
    // Sync from storage (AsyncStorage), not from render — the unread flag
    // lands after mount, like the web's `useSyncExternalStore` read of
    // localStorage. (No set-state-in-effect suppression: this effect never
    // re-runs, so the state it sets cannot loop.)
    void checkBecomingUnread().then(setIsUnread);
  }, []);

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
  const reached = readReached(n?.status, n?.pace?.status);

  // THE BREATH — the web's `becoming-door-pulse` (2.4s loud) /
  // `becoming-door-nudge` (3.2s calm) halo, ported to Reanimated so it runs
  // on the UI thread. Loud = unread week (full halo swell); calm = a "what
  // to work on" line is showing (half amplitude, slower). Reduced motion
  // holds the card still at full opacity.
  const breath = useSharedValue(0);
  const hasWorkLine = top !== null;

  useEffect(() => {
    if (reduced) {
      breath.set(0);
      return;
    }
    if (isUnread) {
      breath.set(
        withRepeat(
          withSequence(
            withTiming(1, { duration: motionMs(MOTION_MS.becomingLoud / 2, false) }),
            withTiming(0, { duration: motionMs(MOTION_MS.becomingLoud / 2, false) }),
          ),
          -1,
          false,
        ),
      );
    } else if (hasWorkLine) {
      breath.set(
        withRepeat(
          withSequence(
            withTiming(1, { duration: motionMs(MOTION_MS.becomingCalm / 2, false) }),
            withTiming(0, { duration: motionMs(MOTION_MS.becomingCalm / 2, false) }),
          ),
          -1,
          false,
        ),
      );
    } else {
      breath.set(0);
    }
    // Re-run when the unread/work state flips, like the web's class swap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnread, hasWorkLine, reduced]);

  const breathStyle = useAnimatedStyle(() => ({
    // Loud swells the halo to full; calm breathes at half amplitude.
    opacity: isUnread ? 0.55 + 0.45 * breath.value : 0.96 + 0.04 * breath.value,
    transform: [{ scale: 1 + (isUnread ? 0.02 : 0.008) * breath.value }],
  }));

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
      : reached === "reached"
        ? { value: "Reached ✓", sub: undefined }
        : reached === "at-goal"
          ? { value: "At goal", sub: "hold a week" }
          : n.pace?.status === "behind"
            ? {
                value: `${fmtUnit(n.pace.behindByKg, n.unit)} behind`,
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
    <AnimatedRe.View testID={isUnread ? "becoming-door-breath" : undefined} style={reduced ? undefined : breathStyle}>
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
          // The unread card is the gradient itself: the Pressable is
          // transparent and the LinearGradient beneath paints edge to edge
          // (the web's `overflow-hidden` rounded card). The calm card keeps
          // its token surface and border.
          isUnread
            ? {
                backgroundColor: "transparent",
                borderColor: "transparent",
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
        {isUnread ? (
          <LinearGradient
            testID="becoming-door-gradient"
            colors={[...unreadGradient]}
            // `bg-gradient-to-br`: top-left → bottom-right.
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View
              style={[
                styles.iconBadge,
                {
                  backgroundColor: isUnread
                    ? unreadWash15
                    : tint("mind-violet", 0.15),
                },
              ]}
            >
              <Compass
                size={18}
                color={isUnread ? unreadInk : colors["mind-violet"]}
              />
            </View>
            <View style={styles.headerMeta}>
              <Text
                style={[
                  styles.kicker,
                  {
                    color: isUnread ? unreadInk70 : colors["mind-violet"],
                  },
                ]}
              >
                The Becoming{isUnread ? " · a new week is written" : ""}
              </Text>
              <Text
                style={[
                  styles.titleText,
                  { color: isUnread ? unreadInk : colors.foreground },
                ]}
              >
                Then → now → next, across all three
              </Text>
            </View>
          </View>
          <ArrowRight
            size={18}
            color={isUnread ? unreadInk80 : colors["muted-foreground"]}
          />
        </View>

        <View testID="becoming-door-chips" style={styles.chipRow}>
          {/* Mind chip — the web's `bg-white/10` on the gradient, `bg-zinc-50
              dark:bg-zinc-800/60` when calm. */}
          <View
            style={[
              styles.chip,
              {
                backgroundColor: isUnread
                  ? unreadWash10
                  : tint("muted", 0.3),
              },
            ]}
          >
            <Brain
              size={14}
              color={isUnread ? unreadInk : colors.accent}
            />
            <View style={styles.chipContent}>
              <Text
                style={[
                  styles.chipLabel,
                  {
                    color: isUnread
                      ? unreadInk65
                      : colors["muted-foreground"],
                  },
                ]}
              >
                Mind
              </Text>
              <Text
                style={[
                  styles.chipValue,
                  { color: isUnread ? unreadInk : colors.foreground },
                ]}
              >
                {mindChip.value}
              </Text>
              {mindChip.sub ? (
                <Text
                  style={[
                    styles.chipSub,
                    {
                      color: isUnread
                        ? unreadInk65
                        : colors["muted-foreground"],
                    },
                  ]}
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
                  ? unreadWash10
                  : tint("muted", 0.3),
              },
            ]}
          >
            <UtensilsCrossed
              size={14}
              color={isUnread ? unreadInk : colors.primary}
            />
            <View style={styles.chipContent}>
              <Text
                style={[
                  styles.chipLabel,
                  {
                    color: isUnread
                      ? unreadInk65
                      : colors["muted-foreground"],
                  },
                ]}
              >
                Nutrition
              </Text>
              <Text
                style={[
                  styles.chipValue,
                  {
                    color: isUnread
                      ? n?.pace?.status === "behind"
                        ? colors.amber
                        : unreadInk
                      : n?.pace?.status === "behind"
                        ? colors.accent
                        : colors.foreground,
                  },
                ]}
              >
                {nutritionChip.value}
              </Text>
              {nutritionChip.sub ? (
                <Text
                  style={[
                    styles.chipSub,
                    {
                      color: isUnread
                        ? unreadInk65
                        : colors["muted-foreground"],
                    },
                  ]}
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
                  ? unreadWash10
                  : tint("muted", 0.3),
              },
            ]}
          >
            <Dumbbell
              size={14}
              color={isUnread ? unreadInk : colors.success}
            />
            <View style={styles.chipContent}>
              <Text
                style={[
                  styles.chipLabel,
                  {
                    color: isUnread
                      ? unreadInk65
                      : colors["muted-foreground"],
                  },
                ]}
              >
                Training
              </Text>
              <Text
                style={[
                  styles.chipValue,
                  { color: isUnread ? unreadInk : colors.foreground },
                ]}
              >
                {trainingChip.value}
              </Text>
              {trainingChip.sub ? (
                <Text
                  style={[
                    styles.chipSub,
                    {
                      color: isUnread
                        ? unreadInk65
                        : colors["muted-foreground"],
                    },
                  ]}
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
              color={isUnread ? colors.amber : colors["mind-violet"]}
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
                style={[
                  styles.nextTitle,
                  { color: isUnread ? unreadInk85 : colors.foreground },
                ]}
              >
                {top.title}
              </Text>
              <Text
                style={[
                  styles.nextSub,
                  {
                    color: isUnread
                      ? unreadInk65
                      : colors["muted-foreground"],
                  },
                ]}
              >
                {" "}· {top.sub}
              </Text>
            </Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
    </AnimatedRe.View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 44,
    minWidth: 44,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    // No `gap`: the web stacks header / chips / next line with plain margins
    // (`p-3.5`, chips `mt-2.5`, next line `mt-2`), and a uniform gap fits
    // neither pair (10, then 8).
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
  titleText: {
    fontSize: 14,
    fontWeight: "700",
  },
  chipRow: {
    flexDirection: "row",
    gap: 6,
    // The web's `mt-2.5` (10) between the header and the chips.
    marginTop: 10,
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
    // The web's `mt-2` (8) between the chips and the "work on next" line.
    marginTop: 8,
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
