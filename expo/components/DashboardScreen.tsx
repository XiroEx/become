import { useState } from "react";
import { View, ScrollView, RefreshControl, Pressable } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Sliders } from "lucide-react-native";
import { Button } from "@/components/Button";
import { BottomSheet } from "@/components/BottomSheet";
import { TileGrid } from "@/components/dashboard/TileGrid";
import { BecomingDoor } from "@/components/dashboard/BecomingDoor";
import { MindsetCard } from "@/components/dashboard/MindsetCard";
import { UpNextCard } from "@/components/dashboard/UpNextCard";
import { ResumeWorkoutPill } from "@/components/workout/ResumeWorkoutPill";
import { WorkoutNowSheet } from "@/components/workout/WorkoutNowSheet";
import { MissedWorkoutsCard } from "@/components/dashboard/MissedWorkoutsCard";
import { DashboardQuickLinks } from "@/components/dashboard/DashboardQuickLinks";
import type { MissedWorkoutSummary } from "@/lib/dashboard/trainingCards";
import { useTabBarCondenseOnScroll } from "@/lib/navigation/tabBarCondense";
import { TAB_BAR_CONTENT_INSET } from "@/lib/navigation/tabBarInset";
import { ProgressChart } from "@/components/dashboard/ProgressChart";
import { NutritionCard } from "@/components/dashboard/NutritionCard";
import { PlanCard } from "@/components/dashboard/PlanCard";
import { MoodGatewayBanner } from "@/components/dashboard/MoodGatewayBanner";
import { PushOptInCard } from "@/components/push/PushOptInCard";
import { CustomizeDashboardModal } from "@/components/dashboard/CustomizeDashboardModal";
import {
  CurrentProgramCard,
  type CurrentProgramData,
} from "@/components/dashboard/CurrentProgramCard";
import type { NutritionTrend } from "@/lib/dashboard/nutritionTrend";
import type {
  DashboardTile,
  DashboardTilesResponse,
  GoalProgressResponse,
  GoalReached,
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
import { ProgramNudgeModal } from "@/components/ProgramNudgeModal";
import { StreakMilestoneModal } from "@/components/StreakMilestoneModal";
import { GoalAchievedModal } from "@/components/GoalAchievedModal";
import { WeightLogSheet } from "@/components/dashboard/WeightLogSheet";
import { MoodLogSheet } from "@/components/dashboard/MoodLogSheet";
import { kgToUnit, type WeightUnit } from "@become/core";
import { LegalLinks } from "@/components/legal/LegalLinks";
import { PageHeader } from "@/components/navigation/PageHeader";
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
   * (Kept for the dashboard tile grid; the header gear moved into PageHeader.)
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
  /** Today's mood if logged (1–5) (NP-150 / NP-211). */
  todaysMood?: MoodLevel | null;
  /** Upcoming scheduled workout for Up Next card. */
  upcomingWorkout?: UpcomingWorkoutSummary | null;
  /**
   * Resume pill override (NP-071, shared with the web's ResumeWorkoutButton).
   * The pill fetches its own in-progress workout and needs a session, so it
   * renders only when the route opts in by passing `resumeEnabled`. Unit
   * tests render DashboardScreen without an AuthProvider, where the pill
   * would throw — hence opt-in rather than always-on.
   */
  resumeEnabled?: boolean;
  /** Missed sessions with Skip (NP-106, web NextWorkoutCard parity). */
  missedWorkouts?: MissedWorkoutSummary[] | null;
  /** The day marker currently being skipped; disables its Skip button. */
  skippingDate?: string | null;
  /** Opens a missed session's exact slot (Track with day + sd). */
  onDoMissedWorkout?: (workout: MissedWorkoutSummary) => void;
  /** Skips a missed session (PATCH /api/schedule { action: 'skip' }). */
  onSkipMissedWorkout?: (workout: MissedWorkoutSummary) => void;
  /** Opens the next workout's exact slot; falls back to onStartWorkout. */
  onStartNextWorkout?: () => void;
  /** First-time empty state: no program and no logged workouts. */
  showEmptyState?: boolean;
  /** Opens the Workout tab (empty-state Browse + All Programs link). */
  onBrowsePrograms?: () => void;
  /** Opens the Workout tab (All Programs quick link). */
  onOpenPrograms?: () => void;
  /** Opens the training history (NP-112). */
  onOpenHistory?: () => void;
  /**
   * Opens the Training Log (NP-130) — the Progress quick link and the
   * Current Program card's `Progress` label (NP-256).
   */
  onOpenProgress?: () => void;
  /** Nutrition quick-link description (calories today when known). */
  quickLinksNutritionDescription?: string | null;
  /** Action tile callback: opens Mind tab / session. */
  onOpenMind?: () => void;
  /** Doorway to The Becoming (NP-192). */
  onOpenBecoming?: () => void;
  /** Action tile callback: opens Nutrition tab. */
  onOpenNutrition?: () => void;
  /** The Goal tile's own destination: Nutrition Goals, not the day screen (NP-256). */
  onOpenNutritionGoals?: () => void;
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
  /** Controls customize tiles modal externally for testability (NP-157). */
  customizeTilesOpen?: boolean;
  onCustomizeTilesOpenChange?: (open: boolean) => void;
  /** Callback when layout is saved from customizer (NP-157). */
  onSaveLayout?: (
    layout: DashboardTile[],
  ) => Promise<DashboardTile[] | void> | void;
  /** Program nudge modal visibility */
  nudgeOpen?: boolean;
  onNudgeOpenChange?: (open: boolean) => void;
  priorShowings?: number;
  onExploreNudge?: () => void;
  onFindProgram?: () => void;
  onDismissNudgeForever?: () => void;
  /** Nutrition summary data (NP-212) */
  nutritionData?: {
    calories: { consumed: number; goal: number };
    protein: { current: number; goal: number };
    carbs: { current: number; goal: number };
    fats: { current: number; goal: number };
    water: { current: number; goal: number };
  } | null;
  /** Nutrition trend from last 7 days (NP-212) */
  nutritionTrend?: NutritionTrend | null;
  /** Quick Add callback from nutrition card */
  onQuickAdd?: () => void;
  /** Current program info from progressData (NP-212) */
  currentProgram?: CurrentProgramData | null;
  /** View current program details callback */
  onViewProgram?: (programId: string) => void;
  /** Active mood for the mood-to-mind gateway banner (NP-158) */
  gatewayMood?: MoodLevel | null;
  onDismissGatewayMood?: () => void;
  /** Opens the native plan page (NP-158) */
  onOpenPlan?: () => void;
  /** Streak milestone celebration (NP-159) */
  milestoneCelebration?: number | null;
  onCloseMilestoneCelebration?: () => void;
  /** Goal reached celebration (NP-159) */
  goalCelebration?: GoalReached | null;
  onCloseGoalCelebration?: () => void;
  onSetNextGoal?: () => void;
  /**
   * Push opt-in card wiring (NP-065). The route passes the signed-in token's
   * explicit "Turn on" registration; the card itself decides whether it shows
   * (undecided + 30-day dismissal expired) and owns the denied reprompt.
   */
  pushCardDeps?: React.ComponentProps<typeof PushOptInCard>["deps"];
  /** Test seam: force the push card visible regardless of stored dismissal. */
  showPushCard?: boolean;
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
  todaysMood,
  upcomingWorkout,
  resumeEnabled = false,
  missedWorkouts,
  skippingDate,
  onDoMissedWorkout,
  onSkipMissedWorkout,
  onStartNextWorkout,
  showEmptyState = false,
  onBrowsePrograms,
  onOpenPrograms,
  onOpenHistory,
  onOpenProgress,
  quickLinksNutritionDescription,
  onOpenMind,
  onOpenBecoming,
  onOpenNutrition,
  onOpenNutritionGoals,
  onOpenWorkoutNow,
  workoutNowOpen,
  onWorkoutNowOpenChange,
  progressData,
  fitnessGoal,
  targetWeight,
  onOpenCustomizeTiles,
  customizeTilesOpen,
  onCustomizeTilesOpenChange,
  onSaveLayout,
  nudgeOpen,
  onNudgeOpenChange,
  priorShowings,
  onExploreNudge,
  onFindProgram,
  onDismissNudgeForever,
  nutritionData,
  nutritionTrend,
  onQuickAdd,
  currentProgram,
  onViewProgram,
  gatewayMood,
  onDismissGatewayMood,
  onOpenPlan,
  milestoneCelebration,
  onCloseMilestoneCelebration,
  goalCelebration,
  onCloseGoalCelebration,
  onSetNextGoal,
  pushCardDeps,
  showPushCard = false,
}: DashboardScreenProps) {
  const { colors, tint } = useThemeTokens();
  const tabBarScroll = useTabBarCondenseOnScroll();
  const [internalGatewayMood, setInternalGatewayMood] =
    useState<MoodLevel | null>(null);
  const isGatewayMoodControlled = gatewayMood !== undefined;
  const activeGatewayMood = isGatewayMoodControlled
    ? gatewayMood
    : internalGatewayMood;
  const handleDismissGatewayMood = () => {
    if (isGatewayMoodControlled) {
      onDismissGatewayMood?.();
    }
    setInternalGatewayMood(null);
  };
  const [internalNudgeOpen, setInternalNudgeOpen] = useState<boolean>(false);
  const isNudgeControlled = nudgeOpen !== undefined;
  const isNudgeModalOpen = isNudgeControlled ? nudgeOpen : internalNudgeOpen;
  const setNudgeModalOpen = (value: boolean) => {
    if (isNudgeControlled) onNudgeOpenChange?.(value);
    else setInternalNudgeOpen(value);
  };

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

  const [internalCustomizeOpen, setInternalCustomizeOpen] =
    useState<boolean>(false);
  const isCustomizeOpen = customizeTilesOpen ?? internalCustomizeOpen;
  const setCustomizeOpen = (value: boolean) => {
    if (customizeTilesOpen !== undefined) onCustomizeTilesOpenChange?.(value);
    else setInternalCustomizeOpen(value);
  };

  const [internalLayout, setInternalLayout] =
    useState<DashboardTile[] | null>(null);
  const currentLayout = layout ?? internalLayout;

  if (loading) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
        testID="dashboard-screen"
      >
        <View
          testID="dashboard-skeleton"
          // Web phone padding: `px-3 py-4` (12 sides, 16 top) — the skeleton
          // paints the same box the loaded page scrolls in.
          style={{ paddingHorizontal: 12, paddingTop: 16, gap: 16 }}
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

  // NP-157 owns native dashboard tile customizer
  const handleCustomizeTiles = () => {
    setCustomizeOpen(true);
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
        {...tabBarScroll}
        testID="dashboard-scroll"
        contentContainerStyle={{
          // Web phone padding: `px-3 py-4` in app/dashboard/layout.tsx (12
          // sides, 16 top) with `space-y-4` (16) between sections. The bottom
          // stays TAB_BAR_CONTENT_INSET — that clears the floating glass bar,
          // not the page rhythm.
          paddingHorizontal: 12,
          paddingTop: 16,
          gap: 16,
          // Clear the floating glass tab bar (NP-351): it is absolutely
          // positioned, so content scrolls UNDER it and nothing reserves the
          // space but this.
          paddingBottom: TAB_BAR_CONTENT_INSET,
        }}
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
        {/* The page title and the avatar menu (help, profile and
            settings all live in the menu now). Only the container's 16pt gap
            sits under it: the owner cut the web's extra `mb-2` on device
            (2026-10-23), the subtitle read as floating above the cards. */}
        <View testID="dashboard-header-wrap">
          <PageHeader
            title="Become"
            subtitle="Track your fitness journey"
            helpKey="dashboard"
          />
        </View>

        {/* The doorway to The Becoming (NP-192) — first thing under the
            header, matching the web order (NP-255). */}
        <BecomingDoor
          goals={goals}
          mind={mind}
          onPress={onOpenBecoming}
        />

        {/* Unified Dashboard Tile Grid (NP-104). The grid and the
            Customize link share one wrapper, the way the web keeps them in
            a single `data-tour="dashboard-tiles"` div: the link sits `mt-2`
            (8) under the grid and the container gap (`space-y-4`) separates
            the group from what follows — no negative margins. */}
        <View testID="dashboard-tiles-wrap">
          <TileGrid
            layout={currentLayout}
            statData={statData ?? { streakDays, thisWeekWorkouts: 0 }}
            tilesData={tilesData}
            onDismissSuggestion={onDismissSuggestion}
            onOpenMind={onOpenMind}
            onOpenNutrition={onOpenNutrition}
            onOpenNutritionGoals={onOpenNutritionGoals}
            onOpenWorkoutNow={handleWorkoutNow}
            onOpenCalendar={onOpenCalendar}
            onOpenCheckIn={() => setOpen(true)}
            onOpenWeight={handleOpenWeight}
            onOpenMood={handleOpenMood}
            onMoodChange={onSubmitMood}
            onOpenSettings={onOpenSettings}
            onOpenStreaks={onOpenStreaks}
            onOpenHistory={onOpenHistory}
          />

          {/* Customize tiles link (NP-211 / NP-157). Web parity is `mt-2`
              above (8) and nothing below but the page `space-y-4` — the old
              `marginTop: -6 / marginBottom: 4` overlapped the grid gap and
              left a second gap below. The row is only as tall as its
              content (~20): the 44-point touch target comes from `hitSlop`,
              which the a11y helper counts, instead of `minTouchTarget`,
              which forced the VIEW to 44 tall and left the empty bands
              above and below the text (and pushed the resume banner down). */}
          <View
            testID="dashboard-customize-wrap"
            style={{
              alignItems: "flex-end",
              marginTop: 8,
            }}
          >
            <Pressable
              testID="dashboard-customize-tiles"
              accessibilityRole="button"
              accessibilityLabel="Customize tiles"
              onPress={handleCustomizeTiles}
              style={[
                { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1, minHeight: 20 },
              ]}
              hitSlop={{ top: 12, bottom: 12, left: 24, right: 24 }}
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
        </View>

        {/* Mood → Mindset gateway, once, right after the daily check-in (NP-158) */}
        {activeGatewayMood && !mind?.sessionDoneToday ? (
          <MoodGatewayBanner
            mood={activeGatewayMood}
            onDismiss={handleDismissGatewayMood}
            onOpenMind={onOpenMind}
          />
        ) : null}

        {/* Resume an in-progress workout (NP-071, shared with the web's
            ResumeWorkoutButton): sits between the tiles and Up Next, exactly
            where the web renders it. Opt-in via `resumeEnabled` because the
            pill needs a session (AuthProvider). */}
        {resumeEnabled ? <ResumeWorkoutPill /> : null}

        {/* Missed sessions with Skip (NP-106, web NextWorkoutCard parity) */}
        {missedWorkouts && missedWorkouts.length > 0 ? (
          <MissedWorkoutsCard
            missed={missedWorkouts}
            skippingDate={skippingDate}
            onDoIt={onDoMissedWorkout}
            onSkip={onSkipMissedWorkout}
            onViewAll={onOpenCalendar}
          />
        ) : null}

        {/* Up Next training card (NP-106). Web shows exactly one
            next-workout card here (NextWorkoutCard) — native used to ALSO
            show a separate "Today's workout" card above the tile grid,
            computed from a different endpoint, which could contradict this
            one (e.g. a day already completed, or the wrong day entirely).
            Up Next is now the single source of truth for "what's next",
            and its Start action already falls back to onStartWorkout
            (NP-255). */}
        <UpNextCard
          workout={upcomingWorkout}
          onOpenCalendar={onOpenCalendar}
          onPressWorkout={onStartNextWorkout ?? onStartWorkout}
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
            targetWeight != null
              ? Math.round(targetWeight * 10) / 10
              : statData?.targetWeightKg != null
                ? Math.round(
                    kgToUnit(statData.targetWeightKg, weightUnit) * 10,
                  ) / 10
                : undefined
          }
          weightUnit={weightUnit}
        />

        {/* Nutrition Summary Card (NP-212) */}
        {nutritionData ? (
          <NutritionCard
            calories={nutritionData.calories}
            protein={nutritionData.protein}
            carbs={nutritionData.carbs}
            fats={nutritionData.fats}
            water={nutritionData.water}
            trend={nutritionTrend}
            onOpenNutrition={onOpenNutrition}
            onQuickAdd={onQuickAdd}
          />
        ) : null}

        {/* Current Program Card (NP-212) */}
        {currentProgram ? (
          <CurrentProgramCard
            program={currentProgram}
            onView={() => onViewProgram?.(currentProgram.programId)}
            onContinue={onStartNextWorkout ?? onStartWorkout}
            onPressProgress={onOpenProgress}
          />
        ) : null}

        {/* Mindset Card (NP-150) — after Current Program, matching the
            web's order (NP-255; web renders them side by side on wider
            widths). */}
        <MindsetCard
          summary={mind ?? null}
          todaysMood={
            todaysMood !== undefined
              ? todaysMood
              : ((statData?.todaysMood as MoodLevel | null | undefined) ?? null)
          }
          onOpenMind={onOpenMind}
        />

        {/* Member plan & allowance meters (NP-158) */}
        <PlanCard onOpenPlan={onOpenPlan} />

        {/* Push opt-in card (NP-065): undecided members only, 30-day
            dismissal, never at first launch. The card reads its own state;
            the route only wires the explicit "Turn on" registration. Web
            renders this as a fixed-position overlay toast, so it never sits
            inside the page order; placed here, right after the Plan card,
            it does not split any adjacent pair of the web order (NP-255). */}
        {pushCardDeps || showPushCard ? (
          <PushOptInCard deps={pushCardDeps} />
        ) : null}

        {/* First-time empty state + quick links (NP-106, web
            DashboardClient parity): All Programs, Nutrition, Progress
            (→ the Training Log, NP-130/NP-256). No Connect link — chat is
            on hold for the store release. */}
        <DashboardQuickLinks
          showEmptyState={showEmptyState}
          onBrowsePrograms={onBrowsePrograms}
          onOpenPrograms={onOpenPrograms ?? onBrowsePrograms}
          onOpenNutrition={onOpenNutrition}
          onOpenProgress={onOpenProgress ?? onOpenHistory}
          nutritionDescription={quickLinksNutritionDescription}
        />

        {/* The in-app footer. Apple wants the privacy policy reachable from
            inside the app, not only from a marketing page a member installing to
            the home screen never returns to. Mirrors web's DashboardClient.tsx:965.
            Web rhythm is the page `space-y-4` plus `pt-2` on the links — the
            container gap supplies the 16, so this wrapper carries only the 8. */}
        <View
          testID="dashboard-legal-footer"
          className="border-t border-border pt-2"
        >
          <LegalLinks showCopyright />
        </View>
      </ScrollView>

      <ProgramNudgeModal
        testID="dashboard-program-nudge-modal"
        visible={isNudgeModalOpen}
        fitnessGoal={fitnessGoal}
        priorShowings={priorShowings}
        onExplore={() => {
          setNudgeModalOpen(false);
          onExploreNudge?.();
        }}
        onFindProgram={() => {
          setNudgeModalOpen(false);
          onFindProgram?.();
        }}
        onDismissForever={() => {
          setNudgeModalOpen(false);
          onDismissNudgeForever?.();
        }}
      />

      <CheckInModal
        testID="dashboard-checkin-modal"
        visible={open && !isNudgeModalOpen}
        onClose={() => setOpen(false)}
        onSubmit={async (payload) => {
          await onSubmitCheckIn(payload);
          if (payload.mood) {
            setInternalGatewayMood(payload.mood);
          }
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
        <WorkoutNowSheet
          visible={isWorkoutNowOpen}
          onClose={() => setWorkoutNowOpen(false)}
          testID="dashboard-workout-now-sheet-body"
        />
      </BottomSheet>

      <CustomizeDashboardModal
        testID="dashboard-customize-modal"
        visible={isCustomizeOpen}
        layout={currentLayout ?? []}
        onClose={() => setCustomizeOpen(false)}
        onSave={onSaveLayout ? (next) => onSaveLayout(next) : undefined}
        onSaved={async (savedLayout) => {
          setInternalLayout(savedLayout);
          setCustomizeOpen(false);
        }}
      />

      <StreakMilestoneModal
        testID="dashboard-streak-milestone-modal"
        visible={milestoneCelebration !== null && milestoneCelebration !== undefined}
        milestone={milestoneCelebration ?? null}
        streakDays={streakDays}
        onClose={() => onCloseMilestoneCelebration?.()}
      />

      <GoalAchievedModal
        testID="dashboard-goal-achieved-modal"
        visible={goalCelebration !== null && goalCelebration !== undefined}
        reached={goalCelebration ?? null}
        onClose={() => onCloseGoalCelebration?.()}
        onSetNextGoal={onSetNextGoal}
      />
    </SafeAreaView>
  );
}
