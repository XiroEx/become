import { useState, useMemo, useCallback } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { Text } from "@/components/Text";
import {
  Calendar,
  Check,
  ChevronLeft,
  Clock,
  Heart,
  History,
  Pause as PauseIcon,
  Play,
  TimerReset,
  X,
} from "lucide-react-native";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { getTokens, tintToken, type TokenName } from "@/lib/theme/tokens";
import { ExerciseAccordion } from "@/components/ExerciseAccordion";
import { NativeShareButton } from "@/components/share/NativeShareButton";
import { useSingleVideoPlayer } from "@/lib/video/useSingleVideoPlayer";
import type { ActiveProgramSummary } from "@become/api-client";

export interface ProgramExerciseDetail {
  slug: string;
  name: string;
  type?: string;
  sets?: number;
  reps?: string;
  repsUnit?: string;
  rest?: string;
  details?: string;
  tip?: string;
  groupId?: string;
  groupType?: string;
  groupLabel?: string;
  groupRest?: string;
  groupRounds?: number;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
}

export interface ProgramWorkoutOutline {
  workoutIndex: number;
  day?: string;
  title: string;
  exerciseCount: number;
  exercises?: ProgramExerciseDetail[];
}

export interface ProgramPhaseOutline {
  phaseIndex: number;
  name: string;
  weeks?: string;
  weekStart: number;
  weekEnd: number;
  focus?: string;
  workouts: ProgramWorkoutOutline[];
}

export interface ProgramDetailViewModel {
  id: string;
  name: string;
  description: string;
  durationWeeks?: number;
  trainingDaysPerWeek?: number;
  goal?: string;
  targetUser?: "Beginner" | "Intermediate" | "Advanced";
  phases: ProgramPhaseOutline[];
}

export interface ProgramDetailProps {
  program: ProgramDetailViewModel;
  /** Phase tab press callback. */
  onPhasePress?: (phaseIndex: number) => void;
  onPhaseSelect?: (phaseIndex: number) => void;
  selectedPhaseIndex?: number;
  /** Day tab selection. */
  selectedDayKey?: string;
  onDaySelect?: (dayKey: string) => void;
  /** Start program / initial enroll callback when not enrolled. */
  onStart?: () => void;
  onEnroll?: () => void;
  /** Enrolled state: true if member is actively enrolled in this program. */
  isEnrolled?: boolean;
  activeProgram?: ActiveProgramSummary | null;
  /**
   * True while `GET /api/programs/active` is still in flight. Holds the
   * primary CTA in a neutral loading state instead of flashing "Enroll in
   * program" (and zero progress) at an already-enrolled member.
   */
  activeProgramLoading?: boolean;
  /** Completed days set (built from GET /api/workouts/logs with completed: true). */
  completedDays?: Set<string>;
  /** In-progress state: true if a workout is in-progress (isResume: true). */
  hasInProgressWorkout?: boolean;
  /** Continue training on the scheduled next day. */
  onContinue?: () => void;
  /** Start live workout directly. */
  onStartLive?: (phaseIndex?: number, workoutIndex?: number, day?: string) => void;
  /** Resume live workout directly. */
  onResumeLive?: () => void;
  /** Adjust the enrolled start date. Renders the start-date link only when provided. */
  onSetStartDate?: () => void;
  /** Abandon the program. Button renders only when provided. */
  onAbandon?: () => void;
  /** Pause or resume the program. Button renders only when provided. */
  onPauseResume?: () => void;
  /** Shift the schedule. Button renders only when provided. */
  onShift?: (days?: number) => void;
  /** Open this program's Schedule screen. Link renders only when provided. */
  onOpenSchedule?: () => void;
  /** Open the Training Log (progress/workouts). Link renders only when provided. */
  onOpenTrainingLog?: () => void;
  /** Back to the programs list. Renders the "All Programs" pill only when provided. */
  onBack?: () => void;
  /** Open the calendar. Renders the "Calendar" pill only when provided. */
  onOpenCalendar?: () => void;
  /** Open the editor for this custom program (native builder, NP-171). */
  onEdit?: () => void;
  /** Disables the action buttons while a mutation is in flight. */
  actionPending?: boolean;
  /** Whether this program is saved by the user. */
  isSaved?: boolean;
  /** Save or unsave this program. */
  onToggleSave?: () => void | Promise<void>;
  /**
   * Share affordance (NP-165): the exact `POST /api/share` body for this
   * program (`{ kind: 'program', programId }`), or omitted to hide the
   * button. The caller gates it with `canShareProgram` — catalogue, own
   * custom, or shared-with-me — the server re-checks and 404s otherwise.
   */
  shareBody?: { kind: "program"; programId: string };
  /** Bearer token getter for the share create. */
  shareGetToken?: () => string | undefined | Promise<string | undefined>;
  testID?: string;
}

const GROUP_LABELS: Record<string, string> = {
  superset: "Superset",
  circuit: "Circuit",
  triset: "Triset",
  giant_set: "Giant Set",
  emom: "EMOM",
  amrap: "AMRAP",
};

// Mirrors the web's GROUP_COLORS (ProgramDetailClient.tsx) — a distinct hue
// per group type instead of one red badge for everything. Every value is a
// theme token name, never a literal, per NP-123.
const GROUP_COLOR_TOKENS: Record<string, TokenName> = {
  superset: "mindset", // purple-600/400 — web's `bg-purple-500`
  circuit: "orange",
  triset: "indigo",
  giant_set: "rose",
  emom: "teal",
  amrap: "accent", // amber — web's `bg-amber-500`
};

/**
 * `Started Sep 15, 2026` / `Starts Thu, Oct 9, 2026` / `Set start date` — the
 * web's three labels for the enrolled start-date link (ProgramDetailClient.tsx).
 */
function formatStartDateLabel(startDate: string | null | undefined): string {
  if (!startDate) return "Set start date";
  const sd = startDate.split("T")[0]!;
  const d = new Date(`${sd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "Set start date";
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (sd > todayStr) {
    return `Starts ${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}`;
  }
  return `Started ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export function ProgramDetail({
  program,
  onPhasePress,
  onPhaseSelect,
  selectedPhaseIndex: selectedPhaseIndexProp,
  selectedDayKey: selectedDayKeyProp,
  onDaySelect,
  onStart,
  onEnroll,
  isEnrolled = false,
  activeProgram = null,
  activeProgramLoading = false,
  completedDays,
  hasInProgressWorkout = false,
  onContinue,
  onStartLive,
  onResumeLive,
  onSetStartDate,
  onAbandon,
  onPauseResume,
  onShift,
  onOpenSchedule,
  onOpenTrainingLog,
  onBack,
  onOpenCalendar,
  onEdit,
  actionPending = false,
  isSaved = false,
  onToggleSave,
  shareBody,
  shareGetToken,
  testID = "program-detail",
}: ProgramDetailProps) {
  const { colors, tint } = useThemeTokens();

  // The hero is ALWAYS dark (a dark-gradient-over-photo card on the web, same
  // in light and dark app mode) — so its own text/icon/badge colours are
  // pinned to the dark token set rather than following `colors`, which tracks
  // the system scheme. `heroRgb`/`heroTint` are the dark-pinned equivalents of
  // `colors`/`tint`.
  const heroTokens = useMemo(() => getTokens("dark"), []);
  const heroRgb = useCallback(
    (name: TokenName) => `rgb(${heroTokens[name]})`,
    [heroTokens],
  );
  const heroTint = useCallback(
    (name: TokenName, alpha: number) => tintToken(name, "dark", alpha),
    [],
  );

  // Determine smart defaults matching web parity
  const defaultPhaseIndex = useMemo(() => {
    if (isEnrolled && activeProgram?.currentPhase) {
      return Math.max(0, activeProgram.currentPhase - 1);
    }
    return 0;
  }, [isEnrolled, activeProgram]);

  const defaultDayKey = useMemo(() => {
    const targetPhase = program.phases[defaultPhaseIndex] || program.phases[0];
    const workouts = targetPhase?.workouts || [];
    if (isEnrolled) {
      // First incomplete day in active phase
      const firstIncomplete = workouts.find((w) => {
        const d = w.day ?? `Day ${w.workoutIndex + 1}`;
        return !completedDays?.has(d);
      });
      if (firstIncomplete) {
        return firstIncomplete.day ?? `Day ${firstIncomplete.workoutIndex + 1}`;
      }
      if (activeProgram?.currentDay) {
        return activeProgram.currentDay;
      }
    }
    return workouts[0]?.day ?? (workouts[0] ? `Day ${workouts[0].workoutIndex + 1}` : "Day 1");
  }, [isEnrolled, defaultPhaseIndex, program.phases, completedDays, activeProgram]);

  const [internalPhaseIndex, setInternalPhaseIndex] = useState(defaultPhaseIndex);
  const [internalDayKey, setInternalDayKey] = useState(defaultDayKey);

  const activePhaseIndex = selectedPhaseIndexProp ?? internalPhaseIndex;
  const currentPhase = program.phases[activePhaseIndex] || program.phases[0];

  const currentPhaseWorkouts = useMemo(() => {
    return currentPhase?.workouts || [];
  }, [currentPhase]);

  const activeDayKey = selectedDayKeyProp ?? internalDayKey;

  // Find workout for active day
  const currentWorkout = useMemo(() => {
    if (currentPhaseWorkouts.length === 0) return null;
    const match = currentPhaseWorkouts.find(
      (w) => (w.day ?? `Day ${w.workoutIndex + 1}`) === activeDayKey,
    );
    return match || currentPhaseWorkouts[0] || null;
  }, [currentPhaseWorkouts, activeDayKey]);

  const handleSelectPhase = (phaseIndex: number) => {
    onPhasePress?.(phaseIndex);
    onPhaseSelect?.(phaseIndex);
    if (selectedPhaseIndexProp === undefined) {
      setInternalPhaseIndex(phaseIndex);
      const newPhaseWorkouts = program.phases[phaseIndex]?.workouts || [];
      const hasCurrentDay = newPhaseWorkouts.some(
        (w) => (w.day ?? `Day ${w.workoutIndex + 1}`) === activeDayKey,
      );
      if (!hasCurrentDay && newPhaseWorkouts.length > 0) {
        const nextDay =
          newPhaseWorkouts[0]!.day ?? `Day ${newPhaseWorkouts[0]!.workoutIndex + 1}`;
        if (selectedDayKeyProp === undefined) {
          setInternalDayKey(nextDay);
        }
        onDaySelect?.(nextDay);
      }
    }
  };

  const handleSelectDay = (dayKey: string) => {
    onDaySelect?.(dayKey);
    if (selectedDayKeyProp === undefined) {
      setInternalDayKey(dayKey);
    }
  };

  const handleLivePress = () => {
    if (hasInProgressWorkout) {
      if (onResumeLive) {
        onResumeLive();
        return;
      }
    }
    if (onStartLive && currentWorkout) {
      onStartLive(activePhaseIndex, currentWorkout.workoutIndex, activeDayKey);
    }
  };

  const {
    activeSlug: activePlayingSlug,
    play: playVideo,
    release: releaseVideo,
    registerLayout,
    onScroll: handleScroll,
  } = useSingleVideoPlayer();
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  const handleToggleExpand = useCallback(
    (slug: string) => {
      setExpandedSlug((prev) => {
        if (prev === slug) {
          releaseVideo();
          return null;
        }
        playVideo(slug);
        return slug;
      });
    },
    [playVideo, releaseVideo],
  );

  const handlePlayPress = useCallback(
    (slug: string) => {
      setExpandedSlug((prev) => {
        if (prev !== slug) {
          playVideo(slug);
          return slug;
        }
        if (activePlayingSlug === slug) {
          releaseVideo();
        } else {
          playVideo(slug);
        }
        return slug;
      });
    },
    [activePlayingSlug, playVideo, releaseVideo],
  );

  // Render grouped or flat exercise rows
  const renderedExercises = useMemo(() => {
    const exercises = currentWorkout?.exercises;
    if (!exercises || exercises.length === 0) return null;

    const elements: React.ReactNode[] = [];
    let i = 0;
    while (i < exercises.length) {
      const ex = exercises[i]!;
      if (ex.groupId) {
        const groupId = ex.groupId;
        const groupExercises: { exercise: ProgramExerciseDetail; index: number }[] = [];
        while (i < exercises.length && exercises[i]?.groupId === groupId) {
          groupExercises.push({ exercise: exercises[i]!, index: i });
          i++;
        }
        const groupType = ex.groupType ?? "superset";
        const groupLabel = ex.groupLabel || GROUP_LABELS[groupType] || "Group";
        const groupToken = GROUP_COLOR_TOKENS[groupType] ?? GROUP_COLOR_TOKENS.superset!;
        elements.push(
          <View
            key={`group-${groupId}`}
            testID={`${testID}-exercise-group-${groupId}`}
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: tint(groupToken, 0.4),
              backgroundColor: tint(groupToken, 0.1),
              padding: 12,
              gap: 8,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <View
                style={{
                  backgroundColor: colors[groupToken],
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 9999,
                }}
              >
                <Text style={{ color: colors["primary-foreground"], fontSize: 11, fontWeight: "700" }}>
                  {groupLabel}
                </Text>
              </View>
              <Text className="text-muted-foreground text-xs">
                {groupExercises.length} exercises
                {ex.groupRest
                  ? ` · ${ex.groupRest} rest between rounds`
                  : " · minimal rest between exercises"}
              </Text>
            </View>
            {groupExercises.map(({ exercise: gEx, index: gIdx }) => (
              <View
                key={gEx.slug || gIdx}
                onLayout={(e) => {
                  registerLayout(gEx.slug, {
                    y: e.nativeEvent.layout.y,
                    height: e.nativeEvent.layout.height,
                  });
                }}
              >
                <ExerciseAccordion
                  exercise={gEx}
                  index={gIdx}
                  isInGroup
                  isExpanded={expandedSlug === gEx.slug}
                  isPlaying={activePlayingSlug === gEx.slug}
                  onToggleExpand={() => handleToggleExpand(gEx.slug)}
                  onPlayPress={() => handlePlayPress(gEx.slug)}
                  testID={testID}
                />
              </View>
            ))}
          </View>,
        );
      } else {
        const currentEx = ex;
        const currentIndex = i;
        elements.push(
          <View
            key={currentEx.slug || currentIndex}
            onLayout={(e) => {
              registerLayout(currentEx.slug, {
                y: e.nativeEvent.layout.y,
                height: e.nativeEvent.layout.height,
              });
            }}
          >
            <ExerciseAccordion
              exercise={currentEx}
              index={currentIndex}
              isExpanded={expandedSlug === currentEx.slug}
              isPlaying={activePlayingSlug === currentEx.slug}
              onToggleExpand={() => handleToggleExpand(currentEx.slug)}
              onPlayPress={() => handlePlayPress(currentEx.slug)}
              testID={testID}
            />
          </View>,
        );
        i++;
      }
    }
    return elements;
  }, [
    currentWorkout?.exercises,
    colors,
    tint,
    testID,
    expandedSlug,
    activePlayingSlug,
    handleToggleExpand,
    handlePlayPress,
    registerLayout,
  ]);

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16 }}
      testID={testID}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      {/* Hero — a dark card matching the web's dark hero-over-photo (NP-284):
          nav pills, duration/frequency badges, title, target user and goal.
          Always dark (heroRgb/heroTint), independent of app light/dark mode,
          same as the web's hero is always dark regardless of page theme. */}
      <View
        style={{
          borderRadius: 20,
          backgroundColor: heroRgb("card"),
          padding: 16,
          gap: 14,
        }}
      >
        {onBack || onOpenCalendar ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            {onBack ? (
              <Pressable
                testID={`${testID}-back`}
                accessibilityRole="button"
                accessibilityLabel="All Programs"
                onPress={onBack}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 9999,
                  backgroundColor: heroTint("foreground", 0.1),
                }}
              >
                <ChevronLeft size={16} color={heroRgb("foreground")} strokeWidth={2} />
                <Text style={{ fontSize: 13, fontWeight: "600", color: heroRgb("foreground") }}>
                  All Programs
                </Text>
              </Pressable>
            ) : (
              <View />
            )}
            {onOpenCalendar ? (
              <Pressable
                testID={`${testID}-open-calendar`}
                accessibilityRole="button"
                accessibilityLabel="Calendar"
                onPress={onOpenCalendar}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 9999,
                  backgroundColor: heroTint("foreground", 0.1),
                }}
              >
                <Calendar size={16} color={heroRgb("foreground")} strokeWidth={2} />
                <Text style={{ fontSize: 13, fontWeight: "600", color: heroRgb("foreground") }}>
                  Calendar
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {program.durationWeeks ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 9999,
                backgroundColor: heroTint("success", 0.2),
              }}
            >
              <Clock size={13} color={heroRgb("success")} strokeWidth={2} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: heroRgb("success") }}>
                {program.durationWeeks} Weeks
              </Text>
            </View>
          ) : null}
          {program.trainingDaysPerWeek ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 9999,
                backgroundColor: heroTint("info", 0.2),
              }}
            >
              <Calendar size={13} color={heroRgb("info")} strokeWidth={2} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: heroRgb("info") }}>
                {program.trainingDaysPerWeek}x/week
              </Text>
            </View>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text
              testID={`${testID}-name`}
              style={{ fontSize: 24, fontWeight: "800", color: heroRgb("foreground") }}
            >
              {program.name}
            </Text>
            {program.targetUser ? (
              <Text style={{ fontSize: 15, color: heroRgb("foreground"), opacity: 0.85, marginTop: 6 }}>
                {program.targetUser}
              </Text>
            ) : null}
            {program.goal ? (
              <Text style={{ fontSize: 13, color: heroRgb("foreground"), opacity: 0.6, marginTop: 4 }}>
                {program.goal}
              </Text>
            ) : null}
          </View>

          {onToggleSave ? (
            <Pressable
              testID={`${testID}-toggle-save`}
              accessibilityRole="button"
              accessibilityLabel={
                isSaved
                  ? `Unsave program ${program.name}`
                  : `Save program ${program.name}`
              }
              onPress={onToggleSave}
              disabled={actionPending}
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: heroTint("foreground", 0.3),
                padding: 10,
              }}
            >
              <Heart
                // Saved reads as a filled RED heart, which is the one thing on
                // this hero that is a brand accent rather than chrome — and the
                // hero is dark-pinned, so it takes the dark palette's `brand`
                // (red-500, the colour this heart has always been). `primary`
                // is zinc-900 in light mode now (NP-313) and would vanish here.
                color={isSaved ? heroRgb("brand") : heroRgb("foreground")}
                fill={isSaved ? heroRgb("brand") : "transparent"}
                size={22}
                strokeWidth={1.5}
              />
            </Pressable>
          ) : null}
          {shareBody ? (
            <NativeShareButton
              body={shareBody}
              getToken={shareGetToken}
              testID={`${testID}-share`}
            />
          ) : null}
        </View>

        {/* Action Buttons: Continue / Start Program + Workout / Resume */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1, minWidth: 130 }}>
            {activeProgramLoading ? (
              <Button
                testID={`${testID}-start-loading`}
                variant="secondary"
                disabled
                loading
                accessibilityLabel="Loading program status"
              >
                Loading…
              </Button>
            ) : isEnrolled ? (
              <Button
                testID={`${testID}-continue`}
                onPress={onContinue}
                disabled={actionPending}
              >
                Continue
              </Button>
            ) : (
              <Button
                testID={`${testID}-start`}
                onPress={onEnroll ?? onStart ?? (() => {})}
                disabled={actionPending}
              >
                {onEnroll ? "Enroll in program" : "Start program"}
              </Button>
            )}
          </View>

          <Pressable
            testID={hasInProgressWorkout ? `${testID}-resume` : `${testID}-workout-live`}
            accessibilityRole="button"
            accessibilityLabel={hasInProgressWorkout ? "Resume in-progress workout" : "Workout live"}
            onPress={handleLivePress}
            disabled={actionPending}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingHorizontal: 18,
              paddingVertical: 12,
              borderRadius: 9999,
              backgroundColor: hasInProgressWorkout
                ? heroTint("accent", 0.2)
                : heroTint("foreground", 0.1),
            }}
          >
            {hasInProgressWorkout ? (
              <>
                <Clock size={16} color={heroRgb("accent")} strokeWidth={2} />
                <Text style={{ fontSize: 15, fontWeight: "600", color: heroRgb("accent") }}>Resume</Text>
              </>
            ) : (
              <>
                <Play size={16} color={heroRgb("foreground")} fill={heroRgb("foreground")} />
                <Text style={{ fontSize: 15, fontWeight: "600", color: heroRgb("foreground") }}>
                  Workout
                </Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Enrolled block — start date link, progress, Schedule + Training
            Log links, inline Pause/Delay, red-outline Abandon. Gated on
            `activeProgram` the same way the web's whole block is, and held
            back entirely while the active-program read is in flight so an
            enrolled member is never shown "Enroll in program" / 0 progress
            while /api/programs/active is still loading (point 3). */}
        {!activeProgramLoading && isEnrolled && activeProgram ? (
          <View style={{ gap: 10 }}>
            {onSetStartDate ? (
              <Pressable
                testID={`${testID}-set-start-date`}
                accessibilityRole="button"
                accessibilityLabel="Change program start date"
                onPress={onSetStartDate}
                disabled={actionPending}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}
              >
                <Calendar size={14} color={heroRgb("info")} strokeWidth={2} />
                <Text style={{ fontSize: 13, fontWeight: "600", color: heroRgb("info") }}>
                  {formatStartDateLabel(activeProgram.startDate)}
                </Text>
              </Pressable>
            ) : null}

            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 13, color: heroRgb("muted-foreground") }}>
                  Progress: {activeProgram.completedWorkouts ?? 0}/{activeProgram.totalWorkouts ?? 0} sessions
                </Text>
                {activeProgram.totalWorkouts ? (
                  <Text style={{ fontSize: 13, fontWeight: "700", color: heroRgb("success") }}>
                    {Math.round(((activeProgram.completedWorkouts ?? 0) / activeProgram.totalWorkouts) * 100)}%
                  </Text>
                ) : null}
              </View>
              {activeProgram.totalWorkouts ? (
                <View
                  style={{
                    height: 6,
                    width: "100%",
                    backgroundColor: heroTint("foreground", 0.2),
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      height: "100%",
                      width: `${Math.min(100, Math.round(((activeProgram.completedWorkouts ?? 0) / activeProgram.totalWorkouts) * 100))}%`,
                      backgroundColor: heroRgb("success"),
                      borderRadius: 3,
                    }}
                  />
                </View>
              ) : null}
            </View>

            {onOpenSchedule || onOpenTrainingLog ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                {onOpenSchedule ? (
                  <Pressable
                    testID={`${testID}-schedule-link`}
                    accessibilityRole="button"
                    accessibilityLabel="View schedule"
                    onPress={onOpenSchedule}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                  >
                    <Calendar size={14} color={heroRgb("info")} strokeWidth={2} />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: heroRgb("info") }}>Schedule</Text>
                  </Pressable>
                ) : null}
                {onOpenTrainingLog ? (
                  <Pressable
                    testID={`${testID}-training-log-link`}
                    accessibilityRole="button"
                    accessibilityLabel="View training log"
                    onPress={onOpenTrainingLog}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                  >
                    <History size={14} color={heroRgb("success")} strokeWidth={2} />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: heroRgb("success") }}>
                      Training Log
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {onPauseResume || onShift ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                {onPauseResume ? (
                  <Pressable
                    testID={`${testID}-pause-resume`}
                    accessibilityRole="button"
                    onPress={onPauseResume}
                    disabled={actionPending}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                  >
                    <PauseIcon
                      size={14}
                      color={activeProgram.status === "paused" ? heroRgb("success") : heroRgb("accent")}
                      strokeWidth={2}
                    />
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: activeProgram.status === "paused" ? heroRgb("success") : heroRgb("accent"),
                      }}
                    >
                      {activeProgram.status === "paused" ? "Resume Program" : "Pause Program"}
                    </Text>
                  </Pressable>
                ) : null}

                {onPauseResume && onShift ? (
                  <Text style={{ fontSize: 13, color: heroRgb("muted-foreground") }}>|</Text>
                ) : null}

                {onShift ? (
                  <Pressable
                    testID={`${testID}-shift`}
                    accessibilityRole="button"
                    onPress={() => onShift(3)}
                    disabled={actionPending}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                  >
                    <TimerReset size={14} color={heroRgb("info")} strokeWidth={2} />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: heroRgb("info") }}>Delay Schedule</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {activeProgram.status === "paused" ? (
              <View
                testID={`${testID}-paused-banner`}
                style={{
                  backgroundColor: heroTint("accent", 0.15),
                  borderWidth: 1,
                  borderColor: heroTint("accent", 0.4),
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: heroRgb("accent") }}>
                  Program is paused. Workouts are frozen until you resume.
                </Text>
              </View>
            ) : null}

            {onAbandon ? (
              <Pressable
                testID={`${testID}-abandon`}
                accessibilityRole="button"
                accessibilityLabel="Abandon program"
                onPress={onAbandon}
                disabled={actionPending}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  alignSelf: "flex-start",
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 9999,
                  borderWidth: 1,
                  borderColor: heroTint("destructive", 0.4),
                }}
              >
                <X size={14} color={heroRgb("destructive")} strokeWidth={2} />
                <Text style={{ fontSize: 13, fontWeight: "600", color: heroRgb("destructive") }}>
                  Abandon program
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Program editor entry point (native builder, NP-171) — not part of
          the web hero, stays its own secondary action. */}
      {onEdit ? (
        <Button
          testID={`${testID}-edit`}
          variant="secondary"
          accessibilityLabel="Edit program"
          onPress={onEdit}
          disabled={actionPending}
        >
          Edit
        </Button>
      ) : null}

      {/* Phase Selector Tabs */}
      {program.phases.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Select Phase
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
          >
            {program.phases.map((phase) => {
              const isSelected = activePhaseIndex === phase.phaseIndex;
              return (
                <Pressable
                  key={phase.phaseIndex}
                  testID={`${testID}-phase-${phase.phaseIndex}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Phase ${phase.name}`}
                  onPress={() => handleSelectPhase(phase.phaseIndex)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: isSelected ? colors.primary : colors.card,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.primary : colors.border,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: isSelected ? "700" : "600",
                      color: isSelected
                        ? colors["primary-foreground"]
                        : colors.foreground,
                    }}
                  >
                    {phase.name}
                  </Text>
                  {phase.weeks || phase.weekStart ? (
                    <Text
                      style={{
                        fontSize: 11,
                        color: isSelected
                          ? colors["primary-foreground"]
                          : colors["muted-foreground"],
                        marginTop: 2,
                      }}
                    >
                      {phase.weeks || `Weeks ${phase.weekStart}–${phase.weekEnd}`}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          {currentPhase?.focus ? (
            <Card testID={`${testID}-phase-focus`}>
              <Text className="text-muted-foreground text-xs uppercase font-semibold">
                Focus
              </Text>
              <Text className="text-foreground text-sm mt-1">
                {currentPhase.focus}
              </Text>
            </Card>
          ) : null}
        </View>
      ) : null}

      {/* Day Selector Tabs */}
      {currentPhaseWorkouts.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Training Days
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
          >
            {currentPhaseWorkouts.map((w) => {
              const dayKey = w.day ?? `Day ${w.workoutIndex + 1}`;
              const isSelected = activeDayKey === dayKey;
              const isCompleted = Boolean(completedDays?.has(dayKey));
              return (
                <Pressable
                  key={dayKey}
                  testID={`${testID}-day-${dayKey}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${dayKey}${isCompleted ? " (Completed)" : ""}`}
                  onPress={() => handleSelectDay(dayKey)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: isSelected ? colors.primary : colors.card,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.primary : colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: isSelected ? "700" : "600",
                      color: isSelected
                        ? colors["primary-foreground"]
                        : colors.foreground,
                    }}
                  >
                    {dayKey}
                  </Text>
                  {isCompleted ? (
                    <View testID={`${testID}-day-check-${dayKey}`}>
                      <Check
                        size={14}
                        strokeWidth={2.5}
                        color={
                          isSelected ? colors["primary-foreground"] : colors.success
                        }
                      />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* Selected Workout & Exercise List */}
      {currentWorkout ? (
        <View style={{ gap: 12, marginTop: 4 }}>
          <View>
            <Text
              testID={`${testID}-workout-title`}
              className="text-foreground text-xl font-bold"
            >
              {currentWorkout.title}
            </Text>
            <Text
              testID={`${testID}-workout-exercise-count`}
              className="text-muted-foreground text-sm"
            >
              {currentWorkout.exercises?.length ?? currentWorkout.exerciseCount} exercise
              {(currentWorkout.exercises?.length ?? currentWorkout.exerciseCount) === 1 ? "" : "s"}
            </Text>
          </View>

          {renderedExercises}
        </View>
      ) : null}
    </ScrollView>
  );
}

