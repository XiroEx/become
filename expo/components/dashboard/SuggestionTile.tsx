import React, { useState, useCallback, useEffect } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { resolveWebPath } from "@/lib/navigation/webPathToRoute";
import { openWebSignedIn } from "@/lib/web/openWebSignedIn";
import type {
  DashboardTile,
  DashboardTilesResponse,
  DashboardSuggestion,
} from "@become/api-client";
import type { DashboardStatData } from "@/lib/dashboard/types";
import { StatTile } from "./StatTile";

export interface SuggestionTileProps {
  tile: DashboardTile;
  suggestion?: DashboardSuggestion | null;
  tilesData?: DashboardTilesResponse | null;
  statData?: DashboardStatData | null;
  onDismissSuggestion?: (id: string) => Promise<void> | void;
  onOpenCalendar?: () => void;
  onOpenNutrition?: () => void;
  onOpenCheckIn?: () => void;
  testID?: string;
}

const SEVERITY_CONFIG = {
  info: { label: "Info", token: "muted" as const },
  nudge: { label: "Nudge", token: "accent" as const },
  warning: { label: "Warning", token: "destructive" as const },
  celebration: { label: "Celebration", token: "success" as const },
};

export function SuggestionTile({
  tile,
  suggestion: propSuggestion,
  tilesData,
  statData,
  onDismissSuggestion,
  onOpenCalendar,
  onOpenNutrition,
  onOpenCheckIn,
  testID,
}: SuggestionTileProps) {
  const { colors, tint, isDark } = useThemeTokens();
  const router = useRouter();
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  // Filter server suggestions scoped for dashboard and not yet dismissed
  const availableSuggestions = (tilesData?.suggestions ?? []).filter((s) => {
    if (s.placement === "exercise") return false;
    const surface = (s as any).context?.surface;
    if (surface && surface !== "dashboard") return false;
    return !dismissedIds.includes(s.id);
  });

  const propIsValid =
    propSuggestion &&
    propSuggestion.placement !== "exercise" &&
    (!((propSuggestion as any).context?.surface) ||
      (propSuggestion as any).context?.surface === "dashboard") &&
    !dismissedIds.includes(propSuggestion.id);

  const activeSuggestion = propIsValid
    ? propSuggestion
    : availableSuggestions[0] ?? null;

  const handleDismiss = useCallback(async () => {
    if (!activeSuggestion) return;
    const id = activeSuggestion.id;
    setDismissedIds((prev) => [...prev, id]);
    try {
      await onDismissSuggestion?.(id);
    } catch {
      // Keep optimistic dismissal
    }
  }, [activeSuggestion, onDismissSuggestion]);

  const handleAction = useCallback(() => {
    if (!activeSuggestion?.primaryAction?.href) return;
    const href = activeSuggestion.primaryAction.href;
    const target = resolveWebPath(href);
    if (target.kind === "web") {
      void openWebSignedIn(target.path).catch(() => {});
    } else {
      if (target.href.startsWith("/(tabs)/nutrition") && onOpenNutrition) {
        onOpenNutrition();
      } else if (target.href.startsWith("/(tabs)/calendar") && onOpenCalendar) {
        onOpenCalendar();
      } else {
        router.push(target.href as never);
      }
    }
  }, [activeSuggestion, onOpenCalendar, onOpenNutrition, router]);

  // Rotator pool index state when no suggestion is active
  const [rotationIndex, setRotationIndex] = useState(0);
  const rotationPool: ("calories" | "water" | "weight" | "workouts")[] = [
    "calories",
    "water",
    "weight",
    "workouts",
  ];

  useEffect(() => {
    if (activeSuggestion) return;
    const interval = tile.settings?.intervalMs ?? 6000;
    const timer = setInterval(() => {
      setRotationIndex((prev) => (prev + 1) % rotationPool.length);
    }, interval);
    return () => clearInterval(timer);
  }, [activeSuggestion, rotationPool.length, tile.settings?.intervalMs]);

  const currentTileId = testID ?? `tile-${tile.id}`;

  // If there's an active suggestion, render the suggestion card
  if (activeSuggestion) {
    const sev = activeSuggestion.severity ?? "info";
    const sevConfig = SEVERITY_CONFIG[sev] ?? SEVERITY_CONFIG.info;
    const isNudge = sev === "nudge";
    const isWarn = sev === "warning";
    const isSuccess = sev === "celebration";

    const badgeBg = isNudge
      ? colors.accent
      : isWarn
        ? colors.destructive
        : isSuccess
          ? colors.success
          : colors.muted;

    const badgeText = isNudge
      ? colors["accent-foreground"]
      : isWarn
        ? colors["destructive-foreground"]
        : colors.card;

    const cardBg = isNudge
      ? tint("accent", 0.08)
      : isWarn
        ? tint("destructive", 0.08)
        : isSuccess
          ? tint("success", 0.08)
          : colors.card;

    const cardBorder = isNudge
      ? tint("accent", 0.35)
      : isWarn
        ? tint("destructive", 0.35)
        : isSuccess
          ? tint("success", 0.35)
          : colors.border;

    return (
      <View
        testID={currentTileId}
        accessibilityRole="summary"
        accessibilityLabel={`${sevConfig.label} suggestion: ${activeSuggestion.title}. ${activeSuggestion.body}`}
        style={[
          styles.container,
          {
            backgroundColor: cardBg,
            borderColor: cardBorder,
          },
        ]}
      >
        <View style={styles.topRow}>
          <View
            testID="suggestion-badge"
            style={[styles.badge, { backgroundColor: badgeBg }]}
          >
            <Text
              style={[
                styles.badgeLabel,
                { color: badgeText },
              ]}
            >
              {sevConfig.label}
            </Text>
          </View>
          {activeSuggestion.dismissible ? (
            <Pressable
              testID="suggestion-dismiss"
              accessibilityRole="button"
              accessibilityLabel={`Dismiss ${activeSuggestion.title}`}
              onPress={handleDismiss}
              style={[
                styles.dismissBtn,
                {
                  backgroundColor: isDark
                    ? tint("card", 0.1)
                    : tint("foreground", 0.05),
                  borderColor: isDark
                    ? tint("card", 0.2)
                    : tint("foreground", 0.1),
                },
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors["muted-foreground"]} />
            </Pressable>
          ) : null}
        </View>

        <Text
          className="text-foreground text-sm font-semibold mt-1"
          numberOfLines={1}
        >
          {activeSuggestion.title}
        </Text>
        <Text
          className="text-muted-foreground text-xs mt-0.5"
          numberOfLines={2}
        >
          {activeSuggestion.body}
        </Text>

        {activeSuggestion.primaryAction ? (
          <View style={styles.actionRow}>
            <Pressable
              testID="suggestion-primary-action"
              accessibilityRole="button"
              accessibilityLabel={activeSuggestion.primaryAction.label}
              onPress={handleAction}
              style={[
                styles.actionBtn,
                { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.actionText,
                  { color: colors["primary-foreground"] },
                ]}
              >
                {activeSuggestion.primaryAction.label}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  // Fallback / Live rotator when no server suggestion is active:
  // Rotate through unpinned stat cards (like calories, water, weight, workouts)
  const currentRotatedStatId = rotationPool[rotationIndex] ?? "calories";
  const rotatedTile: DashboardTile = {
    id: currentRotatedStatId,
    kind: "stat",
    size: tile.size,
  };

  // We wrap StatTile with an outer container that carries testID={currentTileId}
  // so tests expecting getByTestId("tile-smart") will find this element.
  return (
    <View style={{ flex: 1 }}>
      <StatTile
        tile={rotatedTile}
        statData={statData}
        onOpenCalendar={onOpenCalendar}
        onOpenNutrition={onOpenNutrition}
        onOpenCheckIn={onOpenCheckIn}
        testID={currentTileId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    minHeight: 96,
    justifyContent: "space-between",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  dismissBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actionRow: {
    flexDirection: "row",
    marginTop: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "500",
  },
});

export default SuggestionTile;
