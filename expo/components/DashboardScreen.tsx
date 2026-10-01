import { useState } from "react";
import { View, ScrollView, RefreshControl, Pressable } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Settings, Sliders } from "lucide-react-native";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { BottomSheet } from "@/components/BottomSheet";
import { TileGrid } from "@/components/dashboard/TileGrid";
import { BecomingDoor } from "@/components/dashboard/BecomingDoor";
import { UpNextCard } from "@/components/dashboard/UpNextCard";
import { ProgressChart } from "@/components/dashboard/ProgressChart";
import type {
  DashboardTile,
  DashboardTilesResponse,
  GoalProgressResponse,
  MindSummaryResponse,
  ProgressApiResponse,
} from "@become/api-client";
import type {
  DashboardStatData,
  UpcomingWorkoutSummary,
} from "@/lib/dashboard/types";
import {
  CheckInModal,
  type CheckInPayload,
  type MoodLevel,
} from "@/components/CheckInModal";
import { WeightLogSheet } from "@/components/dashboard/WeightLogSheet";
import { MoodLogSheet } from "@/components/dashboard/MoodLogSheet";
import type { WeightUnit } from "@become/core";
import { LegalLinks } from "@/components/legal/LegalLinks";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface TodayWorkoutSummary {
  programName: string;
  workoutTitle: string;
  phaseLabel: string;
  exerciseCount: number;
}

/**
 * Today's workout as one sentence, for the grouped summary below. Reads the way
 * the card reads, in the order it reads: what, which program and phase, how big.
 */
export function todayWorkoutSummaryLabel(w: TodayWorkoutSummary): string {
  const exercises = `${w.exerciseCount} exercise${w.exerciseCount === 1 ? "" : "s"}`;
  const where = [w.programName, w.phaseLabel].filter(Boolean).join(", ");
  return `${w.workoutTitle}. ${where}. ${exercises}.`;
}

export interface DashboardScreenProps {
  userName?: string | null;
  streakDays: number;
  freezeAvailable?: boolean;
  todayWorkout: TodayWorkoutSummary | null;
  /**
   * Opens today's workout. REQUIRED, and deliberately not defaulted: it shipped
   * as `onStartWorkout ?? (() => {})` and the dashboard route never passed one,
   * so the button rendered, pressed, and did nothing. A required prop is what
   * makes `tsc` fail the next time a route forgets it.
   */
  onStartWorkout: () => void;
  /**
   * Opens the calendar. Calendar is a hidden route in the (tabs) tree
   * (`href: null`), so — like the settings gear — a screen has to offer the way
   * in or the month view is unreachable from the UI.
   */
  onOpenCalendar: () => void;
  onSubmitCheckIn: (payload: CheckInPayload) => Promise<void> | void;
  onSkipCheckIn?: () => Promise<void> | void;
  submittingCheckIn?: boolean;
  /** Controls modal externally for testability. Defaults to internal state. */
  checkInOpen?: boolean;
  onCheckInOpenChange?: (open: boolean) => void;
  checkInInfo?: {
    daysSinceMood?: number;
    daysSinceWeight?: number;
    lastWeight?: number | null;
    targetWeight?: number | null;
  };
  weightUnit?: WeightUnit;
  /** Weight log sheet wiring (Weight tile parity) */
  onOpenWeight?: () => void;
  weightSheetOpen?: boolean;
  onWeightSheetOpenChange?: (open: boolean) => void;
  onSubmitWeight?: (weight: number) => Promise<void> | void;
  /** Mood log sheet wiring (Mood tile parity) */
  onOpenMood?: () => void;
  moodSheetOpen?: boolean;
  onMoodSheetOpenChange?: (open: boolean) => void;
  onSubmitMood?: (mood: MoodLevel) => Promise<void> | void;
  /** Initial-load skeleton (no data yet). Distinct from pull-to-refresh. */
  loading?: boolean;
  /** Inline error banner text; null/undefined hides it. */
  errorText?: string | null;
  /** Pull-to-refresh wiring. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /**
   * Opens the settings screen. THE ONLY ENTRY POINT TO IT in a store build:
   * settings is a hidden route in the (tabs) tree with no tab of its own, so
   * without this button the screen — and with it the account-deletion path
   * both app stores require — is unreachable by a member or a reviewer.
   */
  onOpenSettings?: () => void;
  /** Opens streaks detail screen (NP-108). */
  onOpenStreaks?: () => void;
  /** Saved dashboard layout from server or cache (controlled). */
  layout?: DashboardTile[] | null;
  /** Live stats data for stat tiles (streak, mood, weekly, goal, calories, etc.). */
  statData?: DashboardStatData | null;
  /** Server tiles response with suggestions, rotator picks, and metrics. */
  tilesData?: DashboardTilesResponse | null;
  /** Handler to dismiss a server suggestion. */
  onDismissSuggestion?: (id: string) => Promise<void> | void;
  /** The Becoming pillar goal views. */
  goals?: GoalProgressResponse | null;
  /** Mindset level and summary. */
  mind?: MindSummaryResponse | null;
  /** Upcoming scheduled workout for Up Next card. */
  upcomingWorkout?: UpcomingWorkoutSummary | null;
  /** Action tile callback: opens Mind tab / session. */
  onOpenMind?: () => void;
  /** Action tile callback: opens Nutrition tab. */
  onOpenNutrition?: () => void;
  /** Action tile callback: opens Workout Now sheet. */
  onOpenWorkoutNow?: () => void;
  /** Controls Workout Now sheet externally for testability. */
  workoutNowOpen?: boolean;
  onWorkoutNowOpenChange?: (open: boolean) => void;
  /** Progress data for ProgressChart (Weight | BMI | Mood) (NP-211). */
  progressData?: ProgressApiResponse | null;
  /** Fitness goal for ProgressChart trend sentiment (NP-211). */
  fitnessGoal?: string | null;
  /** Target weight for ProgressChart reference line (NP-211). */
  targetWeight?: number | null;
  /** Callback when Customize tiles link is pressed (NP-157). */
  onOpenCustomizeTiles?: () => void;
}

export function DashboardScreen({
  userName,
  streakDays,
  freezeAvailable = false,
  todayWorkout,
  onStartWorkout,
  onOpenCalendar,
  onSubmitCheckIn,
  onSkipCheckIn,
  submittingCheckIn = false,
  checkInOpen,
  onCheckInOpenChange,
  checkInInfo,
  weightUnit = "lbs",
  onOpenWeight,
  weightSheetOpen,
  onWeightSheetOpenChange,
  onSubmitWeight,
  onOpenMood,
  moodSheetOpen,
  onMoodSheetOpenChange,
  onSubmitMood,
  loading = false,
  errorText,
  refreshing = false,
  onRefresh,
  onOpenSettings,
  onOpenStreaks,
  layout,
  statData,
  tilesData,
  onDismissSuggestion,
  goals,
  mind,
  upcomingWorkout,
  onOpenMind,
  onOpenNutrition,
  onOpenWorkoutNow,
  workoutNowOpen,
  onWorkoutNowOpenChange,
  progressData,
  fitnessGoal,
  targetWeight,
  onOpenCustomizeTiles,
}: DashboardScreenProps) {
  const { colors, tint } = useThemeTokens();
  const [internalOpen, setInternalOpen] = useState<boolean>(false);
  const isControlled = checkInOpen !== undefined;
  const open = isControlled ? checkInOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (isControlled) onCheckInOpenChange?.(value);
    else setInternalOpen(value);
  };

  const [internalWeightSheetOpen, setInternalWeightSheetOpen] =
    useState<boolean>(false);
  const isWeightSheetControlled = weightSheetOpen !== undefined;
  const isWeightSheetOpen = isWeightSheetControlled
    ? weightSheetOpen
    : internalWeightSheetOpen;
  const setWeightSheetOpen = (value: boolean) => {
    if (isWeightSheetControlled) onWeightSheetOpenChange?.(value);
    else setInternalWeightSheetOpen(value);
  };

  const handleOpenWeight = () => {
    if (onOpenWeight) {
      onOpenWeight();
    } else {
      setWeightSheetOpen(true);
    }
  };

  const [internalMoodSheetOpen, setInternalMoodSheetOpen] =
    useState<boolean>(false);
  const isMoodSheetControlled = moodSheetOpen !== undefined;
  const isMoodSheetOpen = isMoodSheetControlled
    ? moodSheetOpen
    : internalMoodSheetOpen;
  const setMoodSheetOpen = (value: boolean) => {
    if (isMoodSheetControlled) onMoodSheetOpenChange?.(value);
    else setInternalMoodSheetOpen(value);
  };

  const handleOpenMood = () => {
    if (onOpenMood) {
      onOpenMood();
    } else {
      setMoodSheetOpen(true);
    }
  };

  const [internalWorkoutNowOpen, setInternalWorkoutNowOpen] =
    useState<boolean>(false);
  const isWorkoutNowControlled = workoutNowOpen !== undefined;
  const isWorkoutNowOpen = isWorkoutNowControlled
    ? workoutNowOpen
    : internalWorkoutNowOpen;
  const setWorkoutNowOpen = (value: boolean) => {
    if (isWorkoutNowControlled) onWorkoutNowOpenChange?.(value);
    else setInternalWorkoutNowOpen(value);
  };

  const handleWorkoutNow = () => {
    if (onOpenWorkoutNow) {
      onOpenWorkoutNow();
    } else {
      setWorkoutNowOpen(true);
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
        testID="dashboard-screen"
      >
        <View
          testID="dashboard-skeleton"
          style={{ padding: 16, gap: 16 }}
          // Three grey rectangles are nothing at all to a screen reader unless
          // they are one element that says what is happening.
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading your dashboard"
          accessibilityLiveRegion="polite"
        >
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                height: i === 0 ? 32 : 96,
                borderRadius: 12,
                backgroundColor: colors.muted,
              }}
            />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  // TODO: NP-157 owns native dashboard tile customizer
  const handleCustomizeTiles = () => {
    if (onOpenCustomizeTiles) {
      onOpenCustomizeTiles();
    }
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="dashboard-screen"
    >
      <ScrollView
        testID="dashboard-scroll"
        contentContainerStyle={{ padding: 16, gap: 16 }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              testID="dashboard-refresh"
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          ) : undefined
        }
      >
        {errorText ? (
          <View
            testID="dashboard-error"
            accessibilityLiveRegion="polite"
            style={{
              padding: 12,
              borderRadius: 12,
              backgroundColor: tint("destructive", 0.18),
              gap: 8,
            }}
          >
            <Text accessibilityRole="alert" className="text-destructive text-sm">
              {errorText}
            </Text>
            {onRefresh ? (
              <Button
                testID="dashboard-retry-button"
                variant="secondary"
                size="sm"
                onPress={onRefresh}
                accessibilityLabel="Retry"
              >
                Retry
              </Button>
            ) : null}
          </View>
        ) : null}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flexShrink: 1 }}>
            <Text
              testID="dashboard-greeting"
              accessibilityRole="header"
              className="text-foreground text-2xl font-bold"
            >
              {userName ? `Hey, ${userName}` : "Welcome"}
            </Text>
            <Text className="text-muted-foreground text-sm">
              Here&apos;s your day
            </Text>
          </View>
          {/* The way into Settings — and therefore the way to Delete account,
              which both stores check is reachable from inside the app. */}
          <Pressable
            testID="dashboard-open-settings"
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={onOpenSettings}
            disabled={!onOpenSettings}
            // A 20-point icon in 8 points of padding is a 36-point target. The
            // border grows to 44 x 44 and the icon stays centred in it.
            style={[minTouchTarget, { alignItems: "center", justifyContent: "center" }]}
            className="rounded-xl border border-border p-2"
          >
            <Settings color={colors["muted-foreground"]} size={20} strokeWidth={1.5} />
          </Pressable>
        </View>

        {/* The doorway to The Becoming (NP-192) */}
        <BecomingDoor
          goals={goals}
          mind={mind}
          onPress={onOpenMind}
        />

        {todayWorkout ? (
          <Card testID="dashboard-today" title="Today's workout">
            {/* ONE SWIPE, NOT THREE. Title, program · phase and the exercise
                count are one fact about today, so they are one accessibility
                element that reads as a sentence; the button after it is the
                thing to act on. */}
            <View
              testID="dashboard-today-summary"
              accessible
              accessibilityLabel={todayWorkoutSummaryLabel(todayWorkout)}
            >
              <Text
                testID="dashboard-today-workout"
                className="text-foreground text-lg font-semibold mb-1"
              >
                {todayWorkout.workoutTitle}
              </Text>
              <Text
                testID="dashboard-today-program"
                className="text-muted-foreground text-sm mb-1"
              >
                {todayWorkout.programName} · {todayWorkout.phaseLabel}
              </Text>
              <Text
                testID="dashboard-today-exercises"
                className="text-muted-foreground text-sm mb-3"
              >
                {todayWorkout.exerciseCount} exercise
                {todayWorkout.exerciseCount === 1 ? "" : "s"}
              </Text>
            </View>
            <Button
              testID="dashboard-start-workout"
              accessibilityLabel={`Start workout: ${todayWorkout.workoutTitle}`}
              onPress={onStartWorkout}
            >
              Start workout
            </Button>
          </Card>
        ) : (
          <Card testID="dashboard-rest" title="Today">
            <Text className="text-muted-foreground">
              Rest day. Take a walk, drink water, log your mood.
            </Text>
          </Card>
        )}

        {/* Unified Dashboard Tile Grid (NP-104) */}
        <TileGrid
          layout={layout}
          statData={statData ?? { streakDays, thisWeekWorkouts: 0 }}
          tilesData={tilesData}
          onDismissSuggestion={onDismissSuggestion}
          onOpenMind={onOpenMind}
          onOpenNutrition={onOpenNutrition}
          onOpenWorkoutNow={handleWorkoutNow}
          onOpenCalendar={onOpenCalendar}
          onOpenCheckIn={() => setOpen(true)}
          onOpenWeight={handleOpenWeight}
          onOpenMood={handleOpenMood}
          onMoodChange={onSubmitMood}
          onOpenSettings={onOpenSettings}
          onOpenStreaks={onOpenStreaks}
        />

        {/* Customize tiles link (NP-211 / NP-157) */}
        <View
          style={{
            alignItems: "flex-end",
            marginTop: -6,
            marginBottom: 4,
          }}
        >
          <Pressable
            testID="dashboard-customize-tiles"
            accessibilityRole="button"
            accessibilityLabel="Customize tiles"
            onPress={handleCustomizeTiles}
            style={[
              minTouchTarget,
              { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Sliders size={14} color={colors["muted-foreground"]} />
            <Text
              style={{ flexShrink: 1 }}
              className="text-muted-foreground text-xs font-medium"
            >
              Customize tiles
            </Text>
          </Pressable>
        </View>

        {/* Up Next training card (NP-106) */}
        <UpNextCard
          workout={upcomingWorkout}
          onOpenCalendar={onOpenCalendar}
          onPressWorkout={onStartWorkout}
        />

        {/* Progress Chart: Weight | BMI | Mood (NP-211) */}
        <ProgressChart
          weightData={progressData?.weightData}
          bmiData={progressData?.bmiData}
          bodyFatData={progressData?.bodyFatData}
          leanMassData={progressData?.leanMassData}
          moodData={progressData?.moodData}
          fitnessGoal={fitnessGoal ?? statData?.fitnessGoal}
          targetWeight={
            targetWeight ??
            (statData?.targetWeightKg
              ? Math.round(
                  statData.targetWeightKg *
                    (weightUnit === "kg" ? 1 : 2.20462) *
                    10,
                ) / 10
              : undefined)
          }
          weightUnit={weightUnit}
        />

        {/* The in-app footer. Apple wants the privacy policy reachable from
            inside the app, not only from a marketing page a member installing to
            the home screen never returns to. Mirrors web's DashboardClient.tsx:965. */}
        <View
          testID="dashboard-legal-footer"
          className="border-t border-border pt-4 mt-4"
        >
          <LegalLinks showCopyright />
        </View>
      </ScrollView>

      <CheckInModal
        testID="dashboard-checkin-modal"
        visible={open}
        onClose={() => setOpen(false)}
        onSubmit={async (payload) => {
          await onSubmitCheckIn(payload);
          setOpen(false);
        }}
        onSkip={async () => {
          await onSkipCheckIn?.();
          setOpen(false);
        }}
        submitting={submittingCheckIn}
        daysSinceMood={checkInInfo?.daysSinceMood}
        daysSinceWeight={checkInInfo?.daysSinceWeight}
        lastWeight={checkInInfo?.lastWeight}
        targetWeight={checkInInfo?.targetWeight}
        weightUnit={weightUnit}
      />

      <WeightLogSheet
        testID="dashboard-weight-sheet"
        visible={isWeightSheetOpen}
        onClose={() => setWeightSheetOpen(false)}
        onSubmit={onSubmitWeight}
        lastWeight={checkInInfo?.lastWeight}
        targetWeight={checkInInfo?.targetWeight}
        weightUnit={weightUnit}
      />

      <MoodLogSheet
        testID="dashboard-mood-sheet"
        visible={isMoodSheetOpen}
        onClose={() => setMoodSheetOpen(false)}
        onSubmit={onSubmitMood}
        currentMood={statData?.todaysMood}
      />

      <BottomSheet
        testID="dashboard-workout-now-sheet"
        visible={isWorkoutNowOpen}
        onClose={() => setWorkoutNowOpen(false)}
        title="Workout Now"
      >
        <View style={{ padding: 16, gap: 12 }}>
          <Text className="text-foreground text-base">
            Start a quick workout session.
          </Text>
          <Button
            testID="dashboard-workout-now-sheet-start"
            onPress={() => {
              setWorkoutNowOpen(false);
              onStartWorkout();
            }}
          >
            Start Session
          </Button>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}
