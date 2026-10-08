import React from "react";
import {
  View,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ChevronLeft,
  Flame,
  Dumbbell,
  UtensilsCrossed,
  Brain,
  Snowflake,
  Check,
  Circle,
} from "lucide-react-native";
import { Card } from "@/components/Card";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { FireNumber } from "@/components/streaks/FireNumber";
import { StreakMilestoneModal } from "@/components/StreakMilestoneModal";
import { streakDisplay, STREAK_VISIBLE_MIN } from "@become/core";
import type { StreaksPayload } from "@become/api-client";

export interface StreaksScreenProps {
  data: StreaksPayload | null;
  loading?: boolean;
  error?: string | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  onBack?: () => void;
  onOpenSettings?: () => void;
  onUseFreeze?: () => Promise<void> | void;
  freezing?: boolean;
  freezeError?: string | null;
  milestoneCelebration?: number | null;
  onCloseMilestoneCelebration?: () => void;
}

function unitWord(n: number, unit: "days" | "weeks"): string {
  const one = unit === "days" ? "day" : "week";
  return `${n} ${n === 1 ? one : unit}`;
}

/**
 * A day key as a short date — the keys are plain YYYY-MM-DD, read in UTC so
 * the label cannot slide a day west of Greenwich.
 */
export function fmtDay(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function StreakValue({
  current,
  unit,
  tone,
  fire = false,
}: {
  current: number;
  unit: "days" | "weeks";
  tone?: string;
  fire?: boolean;
}) {
  const d = streakDisplay(current);
  if (!d.visible) {
    return (
      <View>
        <Text className="text-2xl font-extrabold tracking-tight text-muted-foreground">
          Building
        </Text>
        <Text className="text-xs text-muted-foreground mt-0.5">
          {current}/{STREAK_VISIBLE_MIN} {unit} · {d.remaining} more to start
        </Text>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline" }}>
      {fire ? (
        <FireNumber className="text-3xl font-extrabold tracking-tight">
          {current}
        </FireNumber>
      ) : (
        <Text
          className={`text-3xl font-extrabold tracking-tight ${tone ?? "text-foreground"}`}
        >
          {current}
        </Text>
      )}
      <Text className="ml-1 text-base font-semibold text-muted-foreground">
        {" "}{unit}
      </Text>
    </View>
  );
}

function BuildBar({
  current,
  barColor,
}: {
  current: number;
  barColor?: string;
}) {
  const { colors } = useThemeTokens();
  const d = streakDisplay(current);
  if (d.visible) return null;
  const pct = Math.round(
    (Math.min(current, STREAK_VISIBLE_MIN) / STREAK_VISIBLE_MIN) * 100,
  );
  return (
    <View className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <View
        className="h-full rounded-full"
        style={{ width: `${pct}%`, backgroundColor: barColor ?? colors.accent }}
      />
    </View>
  );
}

function TodayDot({ done, label }: { done: boolean; label: string }) {
  const { colors } = useThemeTokens();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
      {done ? (
        <Check size={13} color={colors.success} />
      ) : (
        <Circle size={11} color={colors["muted-foreground"]} />
      )}
      <Text
        style={{
          fontSize: 11.5,
          letterSpacing: -0.25,
          color: done ? colors.success : colors["muted-foreground"],
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function StreaksScreen({
  data,
  loading = false,
  error,
  refreshing = false,
  onRefresh,
  onBack,
  onOpenSettings,
  onUseFreeze,
  freezing = false,
  freezeError,
  milestoneCelebration,
  onCloseMilestoneCelebration,
}: StreaksScreenProps) {
  const { colors, tint } = useThemeTokens();
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/dashboard");
    }
  };

  const handleOpenSettings = () => {
    if (onOpenSettings) {
      onOpenSettings();
    } else {
      router.push("/settings");
    }
  };

  const overall = data?.overall;
  const p = data?.pillars;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="streaks-screen"
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.foreground}
            />
          ) : undefined
        }
      >
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to dashboard"
            testID="streaks-back-button"
            onPress={handleBack}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <ChevronLeft size={20} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text className="text-foreground text-2xl font-bold">Streaks</Text>
            <Text className="text-muted-foreground text-sm">
              Three in a row makes a streak
            </Text>
          </View>
        </View>

        {error && !data ? (
          <Card testID="streaks-error-card">
            <Text className="text-sm text-red-500">
              Couldn&apos;t load your streaks. Pull to refresh.
            </Text>
          </Card>
        ) : null}

        {/* ── Overall Day Streak ────────────────────────────────────────── */}
        <Card testID="streak-overall">
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: tint("accent", 0.15),
                alignItems: "center",
                justifyContent: "center",
                opacity: overall?.activeToday ? 1 : 0.6,
              }}
            >
              <Flame size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <Text className="text-foreground text-sm font-semibold">
                  Day streak
                </Text>
                {overall && overall.freezes > 0 ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    {/* Blue on the web (`text-blue-500`); `info` is the app's one
                        blue token and already covers this exact shade (NP-258). */}
                    <Snowflake size={14} color={colors.info} />
                    <Text className="text-xs text-blue-500 font-medium">
                      {overall.freezes} freeze{overall.freezes === 1 ? "" : "s"}
                    </Text>
                  </View>
                ) : null}
              </View>

              {overall ? (
                <>
                  <View className="mt-1">
                    <StreakValue current={overall.current} unit="days" />
                    <BuildBar current={overall.current} barColor={colors.accent} />
                  </View>
                  <Text className="text-muted-foreground text-xs mt-2 leading-relaxed">
                    Any activity keeps it alive: a workout, a meal, a weigh-in or a mood check-in.
                    {overall.best > 0 ? (
                      <Text>
                        {" "}Best:{" "}
                        <Text className="font-semibold text-foreground">
                          {unitWord(overall.best, "days")}
                        </Text>
                        .
                      </Text>
                    ) : null}
                    {overall.nextMilestone &&
                    streakDisplay(overall.current).visible ? (
                      <Text> Next milestone at {overall.nextMilestone}.</Text>
                    ) : null}
                  </Text>
                  <View className="mt-2">
                    <TodayDot
                      done={overall.activeToday}
                      label={
                        overall.activeToday
                          ? "Done today"
                          : "Nothing logged yet today"
                      }
                    />
                  </View>
                </>
              ) : (
                <View className="mt-2 h-8 w-32 rounded bg-muted opacity-60" />
              )}
            </View>
          </View>
        </Card>

        {/* ── Workout Pillar ───────────────────────────────────────────── */}
        <Card testID="streak-workout">
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: tint("success", 0.15),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Dumbbell size={22} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text className="text-foreground text-sm font-semibold">
                Workout streak
              </Text>
              {p ? (
                p.workout.target ? (
                  <>
                    <View className="mt-1">
                      <StreakValue current={p.workout.current} unit="days" />
                      <BuildBar current={p.workout.current} barColor={colors.success} />
                    </View>
                    <Text className="text-muted-foreground text-xs mt-2 leading-relaxed">
                      Days in a row your training week stayed on track. You train {p.workout.target}× a week —{" "}
                      <Text className="font-medium text-foreground">rest days count</Text>
                      , and falling short of that weekly target is what breaks it.
                      {p.workout.best > 0 ? (
                        <Text>
                          {" "}Best:{" "}
                          <Text className="font-semibold text-foreground">
                            {unitWord(p.workout.best, "days")}
                          </Text>
                          .
                        </Text>
                      ) : null}
                      {p.workout.weeksOnTarget > 0 ? (
                        <Text>
                          {" "}{unitWord(p.workout.weeksOnTarget, "weeks")} in a row on target.
                        </Text>
                      ) : null}
                    </Text>
                    <View testID="workout-target-info" className="mt-2">
                      <TodayDot
                        done={p.workout.metThisWeek}
                        label={
                          p.workout.metThisWeek
                            ? `This week ${p.workout.thisWeek}/${p.workout.target} · target hit`
                            : p.workout.weekLost
                              ? `This week ${p.workout.thisWeek}/${p.workout.target} · can't reach ${p.workout.target} this week`
                              : `This week ${p.workout.thisWeek}/${p.workout.target} · ${p.workout.remainingThisWeek} to go`
                        }
                      />
                    </View>
                  </>
                ) : (
                  <Text className="text-muted-foreground text-sm mt-1 leading-relaxed">
                    Set how many days a week you train in{" "}
                    <Text
                      testID="workout-settings-link"
                      accessibilityRole="link"
                      onPress={handleOpenSettings}
                      className="font-medium text-blue-500"
                    >
                      Settings
                    </Text>{" "}
                    and this counts the days your training week stays on track.
                  </Text>
                )
              ) : (
                <View className="mt-2 h-8 w-32 rounded bg-muted opacity-60" />
              )}
            </View>
          </View>
        </Card>

        {/* ── Nutrition Pillar ─────────────────────────────────────────── */}
        <Card testID="streak-nutrition">
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <View
              className="bg-red-100 dark:bg-red-900/30"
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                // Red/coral tint on the web (`bg-red-100 text-red-600` /
                // `dark:bg-red-900/30 dark:text-red-400`) — neutral dark grey
                // (`primary`) on native was the bug (NP-354).
                backgroundColor: tint("brand", 0.15),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <UtensilsCrossed size={22} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text className="text-foreground text-sm font-semibold">
                Nutrition streak
              </Text>
              {p ? (
                <>
                  <View className="mt-1">
                    <StreakValue current={p.nutrition.current} unit="days" />
                    <BuildBar current={p.nutrition.current} barColor={colors.brand} />
                  </View>
                  <Text className="text-muted-foreground text-xs mt-2 leading-relaxed">
                    Days in a row you logged food.
                    {p.nutrition.best > 0 ? (
                      <Text>
                        {" "}Best:{" "}
                        <Text className="font-semibold text-foreground">
                          {unitWord(p.nutrition.best, "days")}
                        </Text>
                        .
                      </Text>
                    ) : null}
                  </Text>
                  <View className="mt-2">
                    <TodayDot
                      done={p.nutrition.activeToday}
                      label={
                        p.nutrition.activeToday
                          ? "Logged today"
                          : "Log a meal to keep it"
                      }
                    />
                  </View>
                </>
              ) : (
                <View className="mt-2 h-8 w-32 rounded bg-muted opacity-60" />
              )}
            </View>
          </View>
        </Card>

        {/* ── Mindset Pillar ──────────────────────────────────────────── */}
        <Card testID="streak-mindset">
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                // Purple on the web (`bg-purple-100 text-purple-600` /
                // `dark:bg-purple-900/30 dark:text-purple-400`) — orange
                // (`accent`) on native was the bug (NP-258).
                backgroundColor: tint("mindset", 0.15),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Brain size={22} color={colors.mindset} />
            </View>
            <View style={{ flex: 1 }}>
              <Text className="text-foreground text-sm font-semibold">
                Mindset streak
              </Text>
              {p ? (
                <>
                  <View className="mt-1">
                    <StreakValue current={p.mindset.current} unit="days" />
                    <BuildBar current={p.mindset.current} barColor={colors.mindset} />
                  </View>
                  <Text className="text-muted-foreground text-xs mt-2 leading-relaxed">
                    Days in a row with a mood check-in, a Mind check-in, a session or a journal entry.
                    {p.mindset.best > 0 ? (
                      <Text>
                        {" "}Best:{" "}
                        <Text className="font-semibold text-foreground">
                          {unitWord(p.mindset.best, "days")}
                        </Text>
                        .
                      </Text>
                    ) : null}
                  </Text>
                  <View className="mt-2">
                    <TodayDot
                      done={p.mindset.activeToday}
                      label={
                        p.mindset.activeToday
                          ? "Checked in today"
                          : "Check in to keep it"
                      }
                    />
                  </View>
                </>
              ) : (
                <View className="mt-2 h-8 w-32 rounded bg-muted opacity-60" />
              )}
            </View>
          </View>
        </Card>

        {/* ── Super Streak ─────────────────────────────────────────────── */}
        <Card testID="streak-super" style={{ paddingHorizontal: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: tint("accent", 0.15),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Flame size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="text-foreground text-sm font-semibold">
                Super streak
              </Text>
              {p ? (
                <>
                  <View className="mt-1">
                    <StreakValue
                      current={p.super.current}
                      unit="days"
                      tone="text-orange-500 dark:text-orange-400"
                      fire
                    />
                    <BuildBar current={p.super.current} barColor={colors.accent} />
                  </View>
                  <Text className="text-muted-foreground text-xs mt-2 leading-relaxed">
                    All three pillars, every day: food logged, mindset checked in, and trained (a scheduled rest day counts) — with the training week on track.
                    {p.super.best > 0 ? (
                      <Text>
                        {" "}Best:{" "}
                        <Text className="font-semibold text-foreground">
                          {unitWord(p.super.best, "days")}
                        </Text>
                        .
                      </Text>
                    ) : null}
                  </Text>
                  <View
                    testID="super-streak-indicators"
                    style={{
                      marginTop: 8,
                      flexDirection: "row",
                      flexWrap: "nowrap",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <TodayDot done={p.super.today.nutrition} label="Food" />
                    <TodayDot done={p.super.today.mindset} label="Mindset" />
                    <TodayDot
                      done={p.super.today.trained}
                      label={p.super.today.restDay ? "Rest day" : "Trained"}
                    />
                    <TodayDot
                      done={p.super.today.weekOnTrack}
                      label="Week on track"
                    />
                  </View>

                  {/* The one freeze */}
                  {p.super.freeze ? (
                    <View
                      testID="super-freeze"
                      className="mt-3 p-3 rounded-xl border border-sky-200 bg-sky-50/70 dark:border-sky-900/50 dark:bg-sky-950/30"
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "flex-start",
                          gap: 8,
                        }}
                      >
                        {/* Sky/blue on the web (`text-sky-500`); `info` is the
                            app's one blue token (NP-258). */}
                        <Snowflake
                          size={16}
                          color={p.super.freeze.available ? colors.info : colors["muted-foreground"]}
                          style={{ marginTop: 2 }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text className="text-xs font-semibold text-foreground">
                            {p.super.freeze.frozenToday
                              ? "Today is frozen — the streak holds"
                              : p.super.freeze.available
                                ? "One freeze, in hand"
                                : "Freeze spent"}
                          </Text>
                          <Text className="text-muted-foreground text-[11px] mt-0.5 leading-snug">
                            {p.super.freeze.frozenToday
                              ? "It comes back in a month."
                              : p.super.freeze.available
                                ? "Covers one day the super streak would otherwise break. You get it back a month after you use it."
                                : p.super.freeze.returnsOn
                                  ? `Back on ${fmtDay(p.super.freeze.returnsOn)}.`
                                  : "Recharging."}
                          </Text>
                          {freezeError ? (
                            <Text
                              testID="freeze-error"
                              className="text-[11px] text-red-500 mt-1 font-medium"
                            >
                              {freezeError}
                            </Text>
                          ) : null}
                        </View>
                        {p.super.freeze.available &&
                        !p.super.freeze.frozenToday &&
                        !p.super.activeToday &&
                        p.super.current >= (data?.minVisible ?? 3) ? (
                          <Pressable
                            testID="use-freeze"
                            accessibilityRole="button"
                            accessibilityLabel="Use super streak freeze"
                            disabled={freezing}
                            onPress={onUseFreeze}
                            className="flex-row items-center justify-center gap-1.5 bg-sky-500 px-3 py-1.5 rounded-lg min-h-[44px] min-w-[44px]"
                            style={{
                              opacity: freezing ? 0.6 : 1,
                            }}
                          >
                            {freezing ? (
                              <ActivityIndicator size="small" color={colors["primary-foreground"]} />
                            ) : (
                              <Snowflake size={14} color={colors["primary-foreground"]} />
                            )}
                            <Text className="text-xs font-bold text-white">
                              Use it
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  ) : null}
                </>
              ) : (
                <View className="mt-2 h-8 w-32 rounded bg-muted opacity-60" />
              )}
            </View>
          </View>
        </Card>
      </ScrollView>
      <StreakMilestoneModal
        testID="streaks-screen-milestone-modal"
        visible={milestoneCelebration !== null && milestoneCelebration !== undefined}
        milestone={milestoneCelebration ?? null}
        streakDays={overall?.current ?? 0}
        onClose={() => onCloseMilestoneCelebration?.()}
      />
    </SafeAreaView>
  );
}

export default StreaksScreen;
