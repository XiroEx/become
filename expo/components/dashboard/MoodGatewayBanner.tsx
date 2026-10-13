/**
 * One line under the tile grid, shown once right after a mood is logged from
 * the daily check-in: the mood → Mindset gateway (NP-158).
 * Dismissible, never persisted, gone on the next load.
 * Ported 1:1 from `webapp/components/dashboard/MoodGatewayBanner.tsx`.
 */

import React from "react";
import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { ArrowRight, Brain, X } from "lucide-react-native";
import { Text } from "@/components/Text";
import { moodGateway, type MoodLevel } from "@become/core";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

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

  const handleOpenMind = () => {
    if (onOpenMind) {
      onOpenMind();
    } else {
      router.push("/(tabs)/mind" as never);
    }
  };

  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      className="w-full flex-row items-center gap-3 rounded-2xl border border-purple-200 bg-purple-50 p-3 dark:border-purple-900/50 dark:bg-purple-950/30"
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
    </View>
  );
}

export default MoodGatewayBanner;
