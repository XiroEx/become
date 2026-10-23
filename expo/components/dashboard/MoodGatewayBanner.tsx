/**
 * One line under the tile grid, shown once right after a mood is logged from
 * the daily check-in: the mood → Mindset gateway (NP-158).
 * Dismissible, never persisted, gone on the next load.
 * Ported 1:1 from `webapp/components/dashboard/MoodGatewayBanner.tsx`.
 */

import React, { useEffect } from "react";
import { View, Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "@/lib/motion/reanimated";
import { useRouter } from "expo-router";
import { ArrowRight, Brain, X } from "lucide-react-native";
import { Text } from "@/components/Text";
import { moodGateway, type MoodLevel } from "@become/core";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import {
  BANNER_ENTER_TRAVEL,
  MOTION_MS,
  motionMs,
} from "@/lib/motion/motion";

export interface MoodGatewayBannerProps {
  mood: MoodLevel;
  onDismiss: () => void;
  onOpenMind?: () => void;
  testID?: string;
}

export function MoodGatewayBanner({
  mood,
  onDismiss,
  onOpenMind,
  testID = "mood-gateway-banner",
}: MoodGatewayBannerProps) {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const g = moodGateway(mood);
  // THE DROP — the web's `initial={{ opacity: 0, y: -6 }}` settle.
  const reduced = useReducedMotion();
  const opacity = useSharedValue(reduced ? 1 : 0);
  const travel = useSharedValue(reduced ? 0 : BANNER_ENTER_TRAVEL);

  useEffect(() => {
    if (reduced) {
      opacity.set(1);
      travel.set(0);
      return;
    }
    const duration = motionMs(MOTION_MS.banner, false);
    opacity.set(withTiming(1, { duration }));
    travel.set(withTiming(0, { duration }));
    // Mount-only enter, like the web's banner mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: travel.value }],
  }));

  const handleOpenMind = () => {
    if (onOpenMind) {
      onOpenMind();
    } else {
      router.push("/(tabs)/mind" as never);
    }
  };

  return (
    <Animated.View
      testID={testID}
      accessibilityRole="summary"
      className="w-full flex-row items-center gap-3 rounded-2xl border border-purple-200 bg-purple-50 p-3 dark:border-purple-900/50 dark:bg-purple-950/30"
      style={reduced ? undefined : animatedStyle}
    >
      <View className="h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card border border-border">
        <Brain size={16} color={colors.accent} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-foreground text-sm">
          <Text className="font-semibold text-foreground">{g.headline} </Text>
          <Text className="text-muted-foreground">{g.body}</Text>
        </Text>
      </View>
      <Pressable
        testID={`${testID}-cta`}
        accessibilityRole="button"
        accessibilityLabel="Mindset"
        accessibilityHint="Opens the Mindset tab"
        onPress={handleOpenMind}
        style={[minTouchTarget, { flexDirection: "row", alignItems: "center", gap: 4 }]}
        className="shrink-0 rounded-lg bg-foreground px-3 py-1.5"
      >
        <Text className="text-background text-xs font-semibold">Mindset</Text>
        <ArrowRight size={14} color={colors.background} />
      </Pressable>
      <Pressable
        testID={`${testID}-dismiss`}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        accessibilityHint="Dismisses the Mindset recommendation"
        onPress={onDismiss}
        style={[minTouchTarget, { alignItems: "center", justifyContent: "center" }]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        className="h-7 w-7 shrink-0 items-center justify-center rounded-full"
      >
        <X size={16} color={colors["muted-foreground"]} />
      </Pressable>
    </Animated.View>
  );
}

export default MoodGatewayBanner;
