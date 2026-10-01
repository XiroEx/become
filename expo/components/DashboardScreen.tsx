import { useState, useMemo, useCallback } from "react";
import { View, ScrollView, RefreshControl, Pressable } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { Settings, CalendarDays } from "lucide-react-native";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StreakBanner } from "@/components/StreakBanner";
import { BottomSheet } from "@/components/BottomSheet";
import { TileGrid } from "@/components/dashboard/TileGrid";
import { BecomingDoor } from "@/components/dashboard/BecomingDoor";
import type { DashboardTile } from "@become/api-client";
import type {
  DashboardTileContext,
  BecomingWidgetData,
  SuggestionItem,
} from "@/lib/dashboard/types";
import {
  CheckInModal,
  type CheckInPayload,
} from "@/components/CheckInModal";
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
  submittingCheckIn?: boolean;
  /** Controls modal externally for testability. Defaults to internal state. */
  checkInOpen?: boolean;
  onCheckInOpenChange?: (open: boolean) => void;
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
  /** Saved dashboard layout from server or cache (controlled). */
  layout?: DashboardTile[] | null;
  /** Action tile callback: opens Mind tab / session. */
  onOpenMind?: () => void;
  /** Action tile callback: opens Nutrition tab. */
  onOpenNutrition?: () => void;
  /** Action tile callback: opens Workout Now sheet. */
  onOpenWorkoutNow?: () => void;
  /** Controls Workout Now sheet externally for testability. */
  workoutNowOpen?: boolean;
  onWorkoutNowOpenChange?: (open: boolean) => void;
  /** Live stat-tile context (weight/mood/streak/etc.) */
  statContext?: DashboardTileContext;
  /** Server suggestions (e.g. Nudge cards) */
  suggestions?: SuggestionItem[];
  /** The Becoming summary data */
  becoming?: BecomingWidgetData | null;
  /** Opens The Becoming / Mind */
  onOpenBecoming?: () => void;
  /** Callback when a suggestion is dismissed */
  onDismissSuggestion?: (id: string) => void;
}

export function DashboardScreen({
  userName,
  streakDays,
  freezeAvailable = false,
  todayWorkout,
  onStartWorkout,
  onOpenCalendar,
  onSubmitCheckIn,
  submittingCheckIn = false,
  checkInOpen,
  onCheckInOpenChange,
  loading = false,
  errorText,
  refreshing = false,
  onRefresh,
  onOpenSettings,
  layout,
  onOpenMind,
  onOpenNutrition,
  onOpenWorkoutNow,
  workoutNowOpen,
  onWorkoutNowOpenChange,
  statContext,
  suggestions,
  becoming,
  onOpenBecoming,
  onDismissSuggestion,
}: DashboardScreenProps) {
  const { colors, tint } = useThemeTokens();
  const [internalOpen, setInternalOpen] = useState<boolean>(false);
  const isControlled = checkInOpen !== undefined;
  const open = isControlled ? checkInOpen : internalOpen;
  const setOpen = useCallback(
    (value: boolean) => {
      if (isControlled) onCheckInOpenChange?.(value);
      else setInternalOpen(value);
    },
    [isControlled, onCheckInOpenChange],
  );

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

  const effectiveStatContext = useMemo<DashboardTileContext>(() => {
    if (statContext) return statContext;
    return {
      data: {
        weightData: [],
        bmiData: [],
        moodData: [],
        stats: {
          totalWorkouts: 0,
          thisWeekWorkouts: 0,
        },
      },
      streakData: {
        streakDays,
        longestStreak: streakDays,
        nextMilestone:
          streakDays > 0
            ? streakDays < 3
              ? 3
              : streakDays < 7
                ? 7
                : streakDays < 14
                  ? 14
                  : streakDays + 7
            : 3,
        activityToday: streakDays > 0,
        streakFreezes: freezeAvailable ? 1 : 0,
      },
      nutritionData: null,
      weeklyAvailability: 3,
      weightUnit: "lbs",
      todaysMood: null,
      onOpenCheckIn: () => setOpen(true),
    };
  }, [statContext, streakDays, freezeAvailable, setOpen]);

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

        <StreakBanner
          testID="dashboard-streak"
          streakDays={streakDays}
          freezeAvailable={freezeAvailable}
        />

        {/* The Becoming widget at the top (NP-210) */}
        <BecomingDoor
          data={becoming}
          onOpen={onOpenBecoming ?? onOpenMind}
          testID="dashboard-becoming"
        />

        {/* Unified Dashboard Tile Grid (NP-104 / NP-210) */}
        <TileGrid
          layout={layout}
          statContext={effectiveStatContext}
          suggestions={suggestions}
          onOpenMind={onOpenMind}
          onOpenNutrition={onOpenNutrition}
          onOpenWorkoutNow={handleWorkoutNow}
          onOpenStreak={onOpenCalendar}
          onOpenMood={() => setOpen(true)}
          onOpenGoal={onOpenNutrition}
          onOpenCalories={onOpenNutrition}
          onOpenCalendar={onOpenCalendar}
          onDismissSuggestion={onDismissSuggestion}
        />

        {/* Up Next with Calendar link below the tiles (NP-210; TODO: NP-106 owns full Next Workout Card) */}
        <View testID="dashboard-up-next" style={{ gap: 8 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
              <CalendarDays size={18} color={colors.primary} />
              <Text className="text-foreground text-base font-semibold" style={{ flexShrink: 1 }}>
                Up Next
              </Text>
            </View>
          </View>

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

          {/* The way into the calendar — a hidden route in the (tabs) tree, so
              the month view has no entry point of its own. */}
          <Button
            testID="dashboard-open-calendar"
            variant="secondary"
            accessibilityLabel="Calendar"
            onPress={onOpenCalendar}
          >
            Calendar
          </Button>
        </View>

        <Button
          testID="dashboard-open-checkin"
          variant="secondary"
          onPress={() => setOpen(true)}
        >
          Check in
        </Button>

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
        submitting={submittingCheckIn}
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
