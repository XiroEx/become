import React from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import {
  BookOpen,
  ChevronRight,
  Dumbbell,
  Eye,
  Lock,
  Shield,
  Sparkles,
  Sword,
  Users,
  Wind,
} from "lucide-react-native";
import { SYSTEM_INFO, syntheticGate } from "@become/core";
import { Text } from "@/components/Text";
import { useEntitlements } from "@/lib/entitlements";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { mindAccentColor } from "@/lib/mind/accents";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { TokenName } from "@/lib/theme/tokens";

export interface TrainingGroundsProps {
  unlocked: string[];
  nextInLabel?: string | null;
  mainSessionCount?: number;
  testID?: string;
}

const ICONS: Record<
  string,
  React.ComponentType<{ size?: number; color?: string }>
> = {
  Wind,
  Sparkles,
  Eye,
  BookOpen,
  Sword,
  Shield,
  Users,
};

const TILE_STYLES: Record<string, { bg: string; ring: string }> = {
  "state-shift": {
    bg: "bg-cyan-500/10",
    ring: "border-cyan-500/30",
  },
  "self-image": {
    bg: "bg-violet-500/10",
    ring: "border-violet-500/30",
  },
  mission: {
    bg: "bg-blue-500/10",
    ring: "border-blue-500/30",
  },
  vision: {
    bg: "bg-emerald-500/10",
    ring: "border-emerald-500/30",
  },
  social: {
    bg: "bg-pink-500/10",
    ring: "border-pink-500/30",
  },
  discipline: {
    bg: "bg-red-500/10",
    ring: "border-red-500/30",
  },
  "anti-sabotage": {
    bg: "bg-orange-500/10",
    ring: "border-orange-500/30",
  },
};

const FALLBACK_TILE = {
  bg: "bg-zinc-500/10",
  ring: "border-zinc-500/30",
};

export function getSystemIconColor(
  system: string,
  colors: Record<TokenName, string>,
): string {
  switch (system) {
    case "discipline":
      return colors.primary;
    case "anti-sabotage":
      return colors.destructive;
    case "vision":
      return colors.success;
    default:
      // NP-299: the web's tile icon is MATCHED to each segment dashboard's own
      // signature color (`webapp/components/mind/TrainingGrounds.tsx`'s `TILE`
      // map — state-shift=cyan, self-image=violet, mission=blue, social=pink).
      // The generic `colors.accent` (amber) painted all four of these tiles
      // the same orange-ish hue instead.
      return mindAccentColor(system);
  }
}

export default function TrainingGrounds({
  unlocked,
  nextInLabel,
  mainSessionCount = 0,
  testID = "mind-training-grounds",
}: TrainingGroundsProps) {
  const router = useRouter();
  const { colors } = useThemeTokens();
  const { data: entitlements, feature } = useEntitlements();

  const visionPlusLocked =
    entitlements?.enforced === true && feature("vision")?.allowed === false;

  const allIds = Object.keys(SYSTEM_INFO);
  const unlockedList = unlocked ?? [];
  const unlockedIds = allIds.filter((id) => unlockedList.includes(id));
  const lockedIds = allIds.filter((id) => !unlockedList.includes(id));

  return (
    <View testID={testID} className="mb-2">
      {/* Header */}
      <View className="mb-4 flex-row items-end justify-between gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Dumbbell size={24} color={colors.accent} />
            <Text className="text-2xl font-extrabold text-foreground">
              Training Grounds
            </Text>
          </View>
          <Text className="mt-1 text-sm text-muted-foreground">
            Daily session done. Keep sharpening — every rep levels you up.
          </Text>
        </View>
        {nextInLabel ? (
          <View
            testID="mind-cooldown-label"
            className="shrink-0 rounded-full bg-muted px-3 py-1.5"
          >
            <Text className="text-xs font-semibold text-muted-foreground">
              Next {nextInLabel}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Unlocked Tiles */}
      <View className="flex-row flex-wrap justify-between">
        {unlockedIds.map((id) => {
          const info = SYSTEM_INFO[id];
          if (!info) return null;
          const Icon = ICONS[info.iconName] ?? Sparkles;
          const t = TILE_STYLES[id] ?? FALLBACK_TILE;
          const iconColor = getSystemIconColor(id, colors);
          return (
            <Pressable
              key={id}
              testID={`mind-system-tile-${id}`}
              accessibilityRole="button"
              accessibilityLabel={info.label}
              onPress={() => router.push(`/(tabs)/mind/${id}` as any)}
              className={`relative overflow-hidden rounded-2xl border ${t.bg} ${t.ring} p-4 active:scale-95`}
              style={{ width: "48%", marginBottom: 12, minHeight: 120 }}
            >
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-white/70 dark:bg-black/30">
                <Icon size={20} color={iconColor} />
              </View>
              <Text className="mt-3 text-sm font-bold text-foreground">
                {info.label}
              </Text>
              <Text
                className="mt-0.5 text-xs text-muted-foreground"
                numberOfLines={2}
              >
                {info.hook}
              </Text>
              <View style={{ position: "absolute", top: 16, right: 12 }}>
                <ChevronRight size={16} color={colors["muted-foreground"]} />
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Locked Tiles */}
      {lockedIds.length > 0 ? (
        <View className="flex-row flex-wrap justify-between mt-1">
          {lockedIds.map((id) => {
            const info = SYSTEM_INFO[id];
            if (!info) return null;
            const needed = Math.max(
              0,
              (info.chapter - 1) * 10 - mainSessionCount,
            );
            const planLocked = id === "vision" && visionPlusLocked;
            const distanceText = planLocked
              ? "Plus"
              : `Unlocks in Ch.${info.chapter}${needed > 0 ? ` — ${needed} main session${needed === 1 ? "" : "s"} away` : ""}`;

            if (planLocked) {
              return (
                <Pressable
                  key={id}
                  testID={`mind-system-tile-${id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${info.label} locked. See Plus`}
                  onPress={() => showUpgradeSheet(syntheticGate("vision"))}
                  className="rounded-2xl border border-dashed border-border bg-card/60 p-4 opacity-75 active:opacity-100"
                  style={{ width: "48%", marginBottom: 12, minHeight: 120 }}
                >
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-muted">
                    <Lock size={16} color={colors["muted-foreground"]} />
                  </View>
                  <Text className="mt-3 text-sm font-bold text-muted-foreground">
                    {info.label}
                  </Text>
                  <Text
                    testID={`mind-system-lock-reason-${id}`}
                    className="mt-0.5 text-xs text-muted-foreground/80"
                    numberOfLines={2}
                  >
                    {distanceText}
                  </Text>
                </Pressable>
              );
            }

            return (
              <View
                key={id}
                testID={`mind-system-tile-${id}`}
                className="rounded-2xl border border-dashed border-border bg-card/60 p-4 opacity-75"
                style={{ width: "48%", marginBottom: 12, minHeight: 120 }}
              >
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <Lock size={16} color={colors["muted-foreground"]} />
                </View>
                <Text className="mt-3 text-sm font-bold text-muted-foreground">
                  {info.label}
                </Text>
                <Text
                  testID={`mind-system-lock-reason-${id}`}
                  className="mt-0.5 text-xs text-muted-foreground/80"
                  numberOfLines={2}
                >
                  {distanceText}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
