import React, { useCallback, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CalendarDays,
  Dumbbell,
  Heart,
  History,
  Search,
  Sparkles,
  Wand2,
} from "lucide-react-native";
import { ResumeWorkoutPill } from "@/components/workout/ResumeWorkoutPill";
import { UpcomingWeekStrip } from "@/components/workout/UpcomingWeekStrip";
import { ContinueTrainingSection } from "@/components/workout/ContinueTrainingSection";
import { WorkoutNowSheet } from "@/components/workout/WorkoutNowSheet";
import { GenerateSheet } from "@/components/programs/GenerateSheet";
import { ProgramsCatalog } from "@/components/programs/ProgramsCatalog";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { TAB_BAR_CONTENT_INSET } from "@/lib/navigation/tabBarInset";
import { QUICK_SESSION_DATE_RE } from "@/lib/quickSession/logPlan";

/**
 * Workout Tab Root Route (NP-071)
 *
 * Rebuilt around what the member is doing right now:
 * - Resume pill for in-progress workout or planned session
 * - Upcoming week strip with status icons and calendar link
 * - Continue Training cards showing active programs with progress % and paused state
 * - Quick links to History, Workouts (hub Exercises), Programs (hub Programs) and Generate (NP-133),
 *   matching the web's Workout page header chips (NP-277)
 * - Saved for Later, Recommended for You and Browse Programs below Continue Training —
 *   the same sections/components the Browse screen uses, so the web's single
 *   Workout page and the native Workout tab show the same content (NP-277)
 */
export default function ProgrammingIndexRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  // `?quick=1` opens the Workout Now sheet in place (dashboard tile, Workout
  // tab button); `?quickDate=YYYY-MM-DD` pre-fills the overview's Log/Plan
  // date when opened from a calendar day. Both arrive as route params — an
  // external navigation — so the sheet syncs from them via effect.
  const params = useLocalSearchParams<{ quick?: string; quickDate?: string }>();
  const quickParam = Array.isArray(params.quick) ? params.quick[0] : params.quick;
  const quickDateParam = Array.isArray(params.quickDate)
    ? params.quickDate[0]
    : params.quickDate;
  const [workoutNowOpen, setWorkoutNowOpen] = useState(false);

  React.useEffect(() => {
    if (quickParam === "true" || quickParam === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWorkoutNowOpen(true);
    }
  }, [quickParam]);

  const quickDate =
    quickDateParam && QUICK_SESSION_DATE_RE.test(quickDateParam)
      ? quickDateParam
      : undefined;
  const [showGenerate, setShowGenerate] = useState(false);

  const handleOpenHistory = () => {
    router.push("/(tabs)/programming/history" as never);
  };

  const handleOpenMine = () => {
    router.push("/(tabs)/programming/mine");
  };

  const handleOpenExercises = () => {
    router.push("/(tabs)/programming/exercises");
  };

  const handleWorkoutNow = useCallback(() => {
    setWorkoutNowOpen(true);
  }, []);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="programming-index-route"
    >
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          // Clear the floating glass tab bar (NP-351).
          paddingBottom: TAB_BAR_CONTENT_INSET,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header */}
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-foreground text-2xl font-bold">Workout</Text>
          <View className="flex-row gap-2">
            <Pressable
              testID="programming-open-search"
              accessibilityRole="button"
              accessibilityLabel="Search programs"
              onPress={() => router.push("/(tabs)/programming/search")}
              className="rounded-xl border border-border p-2"
            >
              <Search
                color={colors["muted-foreground"]}
                size={20}
                strokeWidth={1.5}
              />
            </Pressable>
            <Pressable
              testID="programming-open-saved"
              accessibilityRole="button"
              accessibilityLabel="Saved programs"
              onPress={() => router.push("/(tabs)/programming/saved")}
              className="rounded-xl border border-border p-2"
            >
              <Heart
                color={colors["muted-foreground"]}
                size={20}
                strokeWidth={1.5}
              />
            </Pressable>
            <Pressable
              testID="programming-open-calendar"
              accessibilityRole="button"
              accessibilityLabel="Calendar"
              onPress={() => router.push("/(tabs)/calendar")}
              className="rounded-xl border border-border p-2"
            >
              <CalendarDays
                color={colors["muted-foreground"]}
                size={20}
                strokeWidth={1.5}
              />
            </Pressable>
          </View>
        </View>

        <Text className="text-muted-foreground text-sm mb-3">
          Choose your training path and start building.
        </Text>

        {/* Quick Links Hub — History, Workouts (hub Exercises) and Programs
            (hub Programs) chips, matching the web's icons/colours exactly
            (History blue, Workouts green dumbbell, Programs amber sparkles);
            Browse and Workout Now dropped from this row — Browse's content
            now lives inline below Continue Training, and Workout Now already
            has its own button on the Continue Training header (NP-277). */}
        <View className="flex-row flex-wrap items-center gap-2 mb-5">
          <Pressable
            testID="workout-open-history"
            accessibilityRole="button"
            accessibilityLabel="Training History"
            onPress={handleOpenHistory}
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card"
          >
            <History size={14} color={colors.info} />
            <Text className="text-foreground text-xs font-semibold">
              History
            </Text>
          </Pressable>

          <Pressable
            testID="workout-open-exercises"
            accessibilityRole="button"
            accessibilityLabel="Workouts"
            onPress={handleOpenExercises}
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card"
          >
            <Dumbbell size={14} color={colors.success} />
            <Text className="text-foreground text-xs font-semibold">
              Workouts
            </Text>
          </Pressable>

          <Pressable
            testID="workout-open-mine"
            accessibilityRole="button"
            accessibilityLabel="Programs"
            onPress={handleOpenMine}
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card"
          >
            <Sparkles size={14} color={colors.accent} />
            <Text className="text-foreground text-xs font-semibold">
              Programs
            </Text>
          </Pressable>

          <Pressable
            testID="workout-open-generate"
            accessibilityRole="button"
            accessibilityLabel="Generate a workout"
            onPress={() => setShowGenerate(true)}
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-600"
          >
            <Wand2 size={14} color={colors["primary-foreground"]} />
            <Text className="text-white text-xs font-semibold">
              Generate
            </Text>
          </Pressable>
        </View>

        {/* 1. Resume Workout Pill (if active or planned) */}
        <View className="mb-5">
          <ResumeWorkoutPill />
        </View>

        {/* 2. Upcoming Week Strip */}
        <View className="mb-5">
          <UpcomingWeekStrip />
        </View>

        {/* 3. Continue Training Cards */}
        <View className="mb-5">
          <ContinueTrainingSection onWorkoutNow={handleWorkoutNow} />
        </View>

        {/* 4. Saved for Later, Recommended for You and Browse Programs —
            the web's Workout page continues below Continue Training with
            these sections; native used to stop after Continue Training.
            `ProgramsCatalog` is the exact component the dedicated Browse
            screen renders (NP-072), so both show identical content (NP-277). */}
        <ProgramsCatalog catalogTitle="Browse Programs" />
      </ScrollView>

      {/* Workout Now sheet (NP-076): focus → deterministic preview → NP-227 overview */}
      <WorkoutNowSheet
        visible={workoutNowOpen}
        onClose={() => setWorkoutNowOpen(false)}
        date={quickDate}
      />
      <GenerateSheet visible={showGenerate} onClose={() => setShowGenerate(false)} />
    </SafeAreaView>
  );
}
