import React, { useCallback, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Dumbbell,
  History,
  Sparkles,
  Wand2,
} from "lucide-react-native";
import { ResumeWorkoutPill } from "@/components/workout/ResumeWorkoutPill";
import { UpcomingWeekStrip } from "@/components/workout/UpcomingWeekStrip";
import { ContinueTrainingSection } from "@/components/workout/ContinueTrainingSection";
import { WorkoutNowSheet } from "@/components/workout/WorkoutNowSheet";
import { GenerateSheet } from "@/components/programs/GenerateSheet";
import { ProgramsCatalog } from "@/components/programs/ProgramsCatalog";
import { PageHeader } from "@/components/navigation/PageHeader";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useTabBarCondenseOnScroll } from "@/lib/navigation/tabBarCondense";
import { TAB_BAR_CONTENT_INSET } from "@/lib/navigation/tabBarInset";
import { QUICK_SESSION_DATE_RE } from "@/lib/quickSession/logPlan";

/**
 * Workout Tab Root Route (NP-071)
 *
 * Rebuilt around what the member is doing right now:
 * - Resume pill for in-progress workout or planned session
 * - Upcoming week strip with status icons and calendar link
 * - Continue Training cards showing active programs with progress % and paused state
 * - History pill on the right of the Workout title row, matching the web's header (NP-355)
 * - Quick links to Workouts (hub Exercises), Programs (hub Programs) and Generate (NP-133),
 *   fitting 3 chips on a single horizontal row, matching web (NP-277, NP-355)
 * - Saved for Later, Recommended for You and Browse Programs below Continue Training —
 *   the same sections/components the Browse screen uses, so the web's single
 *   Workout page and the native Workout tab show the same content (NP-277)
 */
export default function ProgrammingIndexRoute() {
  const { colors } = useThemeTokens();
  const tabBarScroll = useTabBarCondenseOnScroll();
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
        {...tabBarScroll}
        contentContainerStyle={{
          padding: 16,
          // Clear the floating glass tab bar (NP-351).
          paddingBottom: TAB_BAR_CONTENT_INSET,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header: title + avatar menu (help lives in the menu;
            history moved to the quick-links pills below; the calendar is
            reached from the week strip below, like the web's next-workout
            card links to /dashboard/calendar). The web keeps `mb-4` under
            its header on phone widths; this wrapper is that margin (the
            container carries no gap). */}
        <View testID="workout-header-wrap" className="mb-4">
          <PageHeader
            title="Workout"
            subtitle="Choose your training path and start building."
            helpKey="programming"
          />
        </View>

        {/* Quick Links Hub — Workouts (hub Exercises), Programs
            (hub Programs), History and Generate chips, matching the web's
            icons/colours exactly
            (Workouts green dumbbell, Programs amber sparkles, History info,
            Generate purple Wand2) on a single horizontal row (NP-355).
            `mb-4` matches the web's links wrapper on phone widths. */}
        <View className="flex-row flex-wrap items-center gap-2 mb-4">
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

        {/* 1. Resume Workout Pill (if active or planned). The `mb-6` lives on
            the pill itself — the way the web's `ResumeWorkoutButton` carries
            its own `mb-6` — so an absent pill (it returns null with no
            workout) leaves zero space instead of an empty margined wrapper. */}
        <ResumeWorkoutPill className="mb-6" />

        {/* 2. Upcoming Week Strip (`mb-6`, the web's upcoming `mb-6`). */}
        <View testID="workout-upcoming-wrap" className="mb-6">
          <UpcomingWeekStrip />
        </View>

        {/* 3. Continue Training Cards (`mb-6`, the web's continue `mb-6`). */}
        <View testID="workout-continue-wrap" className="mb-6">
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
