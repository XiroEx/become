import React, { useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Flame,
  Dumbbell,
  UtensilsCrossed,
  Brain,
  ChevronRight,
} from "lucide-react-native";
import type { DashboardTile } from "@become/api-client";
import {
  streakPages,
  type StreakPageId,
  type StreaksLite,
} from "@become/core";
import { FireNumber } from "@/components/streaks/FireNumber";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { DashboardStatData } from "@/lib/dashboard/types";

export interface StreakTileProps {
  tile?: DashboardTile;
  streaks?: StreaksLite | null;
  statData?: DashboardStatData | null;
  size?: "1x1" | "2x1";
  loading?: boolean;
  onPress?: () => void;
  onOpenStreaks?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const ICON: Record<StreakPageId, typeof Flame> = {
  super: Flame,
  overall: Flame,
  workout: Dumbbell,
  nutrition: UtensilsCrossed,
  mindset: Brain,
};

const INK: Record<
  StreakPageId,
  { icon: string; badge: string; bar: string }
> = {
  super: {
    icon: "#ea580c",
    badge: "rgba(234, 88, 12, 0.15)",
    bar: "#ea580c",
  },
  overall: {
    icon: "#f59e0b",
    badge: "rgba(245, 158, 11, 0.15)",
    bar: "#f59e0b",
  },
  workout: {
    icon: "#16a34a",
    badge: "rgba(22, 163, 74, 0.15)",
    bar: "#16a34a",
  },
  nutrition: {
    icon: "#dc2626",
    badge: "rgba(220, 38, 38, 0.15)",
    bar: "#dc2626",
  },
  mindset: {
    icon: "#9333ea",
    badge: "rgba(147, 51, 234, 0.15)",
    bar: "#9333ea",
  },
};

export function StreakTile({
  tile,
  streaks,
  statData,
  size = "1x1",
  loading = false,
  onPress,
  onOpenStreaks,
  testID,
  style,
}: StreakTileProps) {
  const { colors } = useThemeTokens();
  const router = useRouter();

  // Every streak, one page at a time — super first when there is one. Falls
  // back to the day streak alone while /api/streaks is still in flight.
  const sourceStreaks: StreaksLite | null =
    (streaks && streaks.pillars ? streaks : null) ??
    (statData?.streaksLite && statData.streaksLite.pillars ? statData.streaksLite : null);

  const fallback: StreaksLite | null =
    sourceStreaks ??
    (statData
      ? {
          overall: {
            current: statData.streakDays ?? 0,
            best: statData.longestStreak ?? statData.streakDays ?? 0,
            nextMilestone: statData.nextMilestone ?? null,
            activeToday: statData.activityToday ?? false,
            freezes: 0,
          },
          pillars: {
            workout: {
              unit: "days",
              current: 0,
              best: 0,
              thisWeek: statData.thisWeekWorkouts ?? 0,
              target: statData.weeklyTarget ?? null,
              weekLost: false,
            },
            nutrition: { current: 0, best: 0, activeToday: false },
            mindset: { current: 0, best: 0, activeToday: false },
            super: {
              current: 0,
              best: 0,
              activeToday: false,
              today: {
                nutrition: false,
                mindset: false,
                trained: false,
                restDay: false,
                weekOnTrack: true,
              },
            },
          },
        }
      : null);

  const pages = streakPages(fallback);
  const leadId = pages[0]?.id;
  const [nav, setNav] = useState<{ lead: string | undefined; i: number }>({
    lead: leadId,
    i: 0,
  });
  const i =
    nav.lead === leadId
      ? Math.min(nav.i, Math.max(0, pages.length - 1))
      : 0;

  const goTo = (next: number) => {
    if (!pages.length) return;
    setNav({
      lead: leadId,
      i: ((next % pages.length) + pages.length) % pages.length,
    });
  };

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: GestureResponderEvent) => {
    touchStartRef.current = {
      x: e.nativeEvent.pageX,
      y: e.nativeEvent.pageY,
    };
  };

  const onTouchEnd = (e: GestureResponderEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.nativeEvent.pageX - touchStartRef.current.x;
    const dy = e.nativeEvent.pageY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
      goTo(i + (dx < 0 ? 1 : -1));
    }
  };

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (onOpenStreaks) {
      onOpenStreaks();
    } else {
      router.push("/(tabs)/dashboard/streaks" as never);
    }
  };

  const wide = size === "2x1" || tile?.size === "2x1";

  if (loading || !fallback || pages.length === 0) {
    return (
      <View
        testID={testID ? `${testID}-loading` : "streak-tile-loading"}
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
          style,
        ]}
      >
        <View style={styles.squareHeader}>
          <View
            style={[styles.badgeSmall, { backgroundColor: colors.muted, opacity: 0.6 }]}
          />
          <View
            style={{
              height: 12,
              width: "50%",
              backgroundColor: colors.muted,
              opacity: 0.6,
              borderRadius: 4,
              marginLeft: 8,
            }}
          />
        </View>
        <View
          style={{
            height: 24,
            width: "40%",
            backgroundColor: colors.muted,
            opacity: 0.6,
            borderRadius: 4,
            marginTop: 8,
          }}
        />
        <View
          style={[
            styles.barTrack,
            { backgroundColor: colors.muted, opacity: 0.6, marginTop: 8 },
          ]}
        />
      </View>
    );
  }

  const p = pages[i]!;
  const IconComponent = ICON[p.id] ?? Flame;
  const ink = INK[p.id] ?? INK.overall;
  const effectiveTestId = testID ?? (tile ? `tile-${tile.id}` : "streak-tile");

  const accessibilityLabel = `${p.fullLabel}: ${p.value} ${p.unit ?? ""}. ${p.footer}`;

  const renderValue = () => {
    if (p.emphasis) {
      return (
        <Text
          testID="streak-super-value"
          className="text-foreground text-2xl font-bold"
          numberOfLines={1}
        >
          <FireNumber>{p.value}</FireNumber>
          {p.unit ? (
            <Text className="text-xs font-semibold text-muted-foreground">
              {" "}{p.unit}
            </Text>
          ) : null}
        </Text>
      );
    }
    // Formatted value matching both full unit display and building label
    const formattedVal = p.unit ? `${p.value} ${p.unit}` : p.value;
    return (
      <Text
        testID="tile-streak-value"
        className="text-foreground text-2xl font-bold"
        numberOfLines={1}
      >
        {formattedVal}
      </Text>
    );
  };

  return (
    <Pressable
      testID={effectiveTestId}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={handlePress}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {wide ? (
        <View style={styles.wideRow}>
          <View style={styles.wideLeft}>
            <View style={[styles.badge, { backgroundColor: ink.badge }]}>
              <IconComponent size={20} color={ink.icon} />
            </View>
            <View style={styles.wideMeta}>
              <Text
                className="text-muted-foreground text-xs font-medium"
                numberOfLines={1}
              >
                {p.label}
              </Text>
              {renderValue()}
              {p.footer ? (
                <Text
                  testID="tile-streak-footer"
                  className="text-muted-foreground text-[11px] mt-0.5"
                  numberOfLines={1}
                >
                  {p.footer}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.wideRight}>
            <View
              style={[
                styles.barTrack,
                { backgroundColor: colors.muted, width: 80 },
              ]}
            >
              <View
                style={[
                  styles.barFill,
                  {
                    backgroundColor: ink.bar,
                    width: `${Math.max(0, Math.min(100, p.pct))}%`,
                  },
                ]}
              />
            </View>
            {pages.length > 1 ? (
              <View
                testID="streak-tile-dots"
                style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
              >
                {pages.map((pg, idx) => (
                  <Pressable
                    key={pg.id}
                    accessibilityRole="button"
                    accessibilityLabel={pg.fullLabel}
                    accessibilityState={{ selected: idx === i }}
                    onPress={(e) => {
                      e.stopPropagation();
                      goTo(idx);
                    }}
                    hitSlop={6}
                    style={{
                      height: 4,
                      width: idx === i ? 10 : 4,
                      borderRadius: 2,
                      backgroundColor:
                        idx === i
                          ? pg.id === "super"
                            ? "#ea580c"
                            : colors["muted-foreground"]
                          : colors.border,
                    }}
                  />
                ))}
              </View>
            ) : (
              <ChevronRight size={16} color={colors["muted-foreground"]} />
            )}
          </View>
        </View>
      ) : (
        <View style={styles.squareContent}>
          <View style={styles.squareHeader}>
            <View style={[styles.badgeSmall, { backgroundColor: ink.badge }]}>
              <IconComponent size={16} color={ink.icon} />
            </View>
            <Text
              className="text-muted-foreground text-xs font-medium flex-1 ml-2"
              numberOfLines={1}
            >
              {p.label}
            </Text>
          </View>
          <View style={{ marginTop: 8 }}>
            {renderValue()}
          </View>
          {/* Progress bar */}
          <View
            style={[
              styles.barTrack,
              { backgroundColor: colors.muted, marginTop: 6 },
            ]}
          >
            <View
              style={[
                styles.barFill,
                {
                  backgroundColor: ink.bar,
                  width: `${Math.max(0, Math.min(100, p.pct))}%`,
                },
              ]}
            />
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 4,
            }}
          >
            {p.footer ? (
              <Text
                testID="tile-streak-footer"
                className="text-muted-foreground text-[11px] flex-1 mr-2"
                numberOfLines={1}
              >
                {p.footer}
              </Text>
            ) : null}
            {pages.length > 1 ? (
              <View
                testID="streak-tile-dots"
                style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
              >
                {pages.map((pg, idx) => (
                  <Pressable
                    key={pg.id}
                    accessibilityRole="button"
                    accessibilityLabel={pg.fullLabel}
                    accessibilityState={{ selected: idx === i }}
                    onPress={(e) => {
                      e.stopPropagation();
                      goTo(idx);
                    }}
                    hitSlop={6}
                    style={{
                      height: 4,
                      width: idx === i ? 10 : 4,
                      borderRadius: 2,
                      backgroundColor:
                        idx === i
                          ? pg.id === "super"
                            ? "#ea580c"
                            : colors["muted-foreground"]
                          : colors.border,
                    }}
                  />
                ))}
              </View>
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
    padding: 12,
    borderWidth: 1,
    minHeight: 96,
    minWidth: 44,
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
    flexShrink: 1,
  },
  wideRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  barTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
});

export default StreakTile;
