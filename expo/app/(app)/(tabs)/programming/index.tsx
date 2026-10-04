import React, { useState } from "react";
import { useRouter } from "expo-router";
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
  Zap,
} from "lucide-react-native";
import { ResumeWorkoutPill } from "@/components/workout/ResumeWorkoutPill";
import { UpcomingWeekStrip } from "@/components/workout/UpcomingWeekStrip";
import { ContinueTrainingSection } from "@/components/workout/ContinueTrainingSection";
import { GenerateSheet } from "@/components/programs/GenerateSheet";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * Workout Tab Root Route (NP-071)
 *
 * Rebuilt around what the member is doing right now:
 * - Resume pill for in-progress workout or planned session
 * - Upcoming week strip with status icons and calendar link
 * - Continue Training cards showing active programs with progress % and paused state
 * - Quick links to History (NP-112), Browse (NP-072), Workout Now (NP-076), and Calendar
 * - Generate (NP-133): the standard-generator sheet (session or program, no AI switch)
 */
export default function ProgrammingIndexRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const [showGenerate, setShowGenerate] = useState(false);

  const handleOpenHistory = () => {
    router.push("/(tabs)/programming/history" as never);
  };

  const handleOpenBrowse = () => {
    router.push("/(tabs)/programming/browse");
  };

  const handleOpenMine = () => {
    router.push("/(tabs)/programming/mine");
  };

  const handleOpenExercises = () => {
    router.push("/(tabs)/programming/exercises");
  };

  const handleWorkoutNow = () => {
    router.push("/(tabs)/programming?quick=true" as never);
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="programming-index-route"
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
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

        {/* Quick Links Hub */}
        <View className="flex-row flex-wrap items-center gap-2 mb-5">
          <Pressable
            testID="workout-open-history"
            accessibilityRole="button"
            accessibilityLabel="Training History"
            onPress={handleOpenHistory}
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card"
          >
            <History size={14} color={colors.primary} />
            <Text className="text-foreground text-xs font-semibold">
              History
            </Text>
          </Pressable>

          <Pressable
            testID="workout-open-browse"
            accessibilityRole="button"
            accessibilityLabel="Browse Programs"
            onPress={handleOpenBrowse}
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card"
          >
            <Sparkles size={14} color={colors.accent} />
            <Text className="text-foreground text-xs font-semibold">
              Browse
            </Text>
          </Pressable>

          <Pressable
            testID="workout-open-mine"
            accessibilityRole="button"
            accessibilityLabel="My Programs"
            onPress={handleOpenMine}
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card"
          >
            <Dumbbell size={14} color={colors.primary} />
            <Text className="text-foreground text-xs font-semibold">
              My Programs
            </Text>
          </Pressable>

          <Pressable
            testID="workout-open-exercises"
            accessibilityRole="button"
            accessibilityLabel="My Exercises"
            onPress={handleOpenExercises}
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card"
          >
            <Dumbbell size={14} color={colors.primary} />
            <Text className="text-foreground text-xs font-semibold">
              My Exercises
            </Text>
          </Pressable>

          <Pressable
            testID="workout-open-workout-now"
            accessibilityRole="button"
            accessibilityLabel="Workout Now"
            onPress={handleWorkoutNow}
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600"
          >
            <Zap size={14} color={colors["primary-foreground"]} fill={colors["primary-foreground"]} />
            <Text className="text-white text-xs font-semibold">
              Workout Now
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
      </ScrollView>
      <GenerateSheet visible={showGenerate} onClose={() => setShowGenerate(false)} />
    </SafeAreaView>
  );
}
