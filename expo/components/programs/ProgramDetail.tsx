import { useState, useMemo, useCallback, useRef } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Text } from "@/components/Text";
import {
  AlignLeft,
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
  Zap,
} from "lucide-react-native";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  coverImage?: string | null;
  coverParallax?: boolean;
  coverZoom?: number;
  coverPositionX?: number;
  coverPositionY?: number;
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
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
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
  onScroll: onScrollProp,
}: ProgramDetailProps) {
  const { colors, tint, isDark } = useThemeTokens();
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get("window").height;
  const heroMinHeight = Math.max(380, Math.round(windowHeight * 0.52));
  const [heroHeight, setHeroHeight] = useState(heroMinHeight);

  const scrollY = useRef(new Animated.Value(0)).current;

  // Parallax transforms for hero cover & sticky sliding sheet
  const heroTranslateY = scrollY.interpolate({
    inputRange: [0, heroHeight],
    outputRange: [0, heroHeight],
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const imageTranslateY = scrollY.interpolate({
    inputRange: [-heroHeight, 0, heroHeight],
    outputRange: [-heroHeight * 0.25, 0, heroHeight * 0.3],
    extrapolateLeft: "extend",
    extrapolateRight: "clamp",
  });

  const zoom = program.coverZoom ?? 1;
  const imageScale = scrollY.interpolate({
    inputRange: [-heroHeight, 0],
    outputRange: [zoom * 1.3, zoom],
    extrapolateRight: "clamp",
  });

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

  const onScrollCombined = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.setValue(event.nativeEvent?.contentOffset?.y ?? 0);
      handleScroll(event);
      onScrollProp?.(event);
    },
    [handleScroll, onScrollProp, scrollY],
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
    <Animated.ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 40 }}
      testID={testID}
      onScroll={onScrollCombined}
      scrollEventThrottle={16}
    >
      {/* Sticky full-bleed photo hero with parallax cover image and gradient overlay */}
      <Animated.View
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0) setHeroHeight(Math.max(heroMinHeight, h));
        }}
        style={{
          minHeight: heroMinHeight,
          backgroundColor: "#18181b",
          overflow: "hidden",
          transform: [{ translateY: heroTranslateY }],
          zIndex: 0,
        }}
      >
        {/* Cover image or dark fallback */}
        {program.coverImage ? (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                transform: [
                  { translateY: imageTranslateY },
                  { scale: imageScale },
                ],
              },
            ]}
          >
            <Image
              source={{ uri: program.coverImage }}
              resizeMode="cover"
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        ) : (
          <View style={StyleSheet.absoluteFill}>
            <LinearGradient
              colors={
                isDark
                  ? ["#000000", "#18181b", "#000000"]
                  : ["#18181b", "#27272a", "#18181b"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        )}

        {/* Gradient overlay: lighter at top so the image breathes,
            darker at the bottom so program text stays legible. */}
        <LinearGradient
          colors={["rgba(0, 0, 0, 0.3)", "rgba(0, 0, 0, 0.45)", "rgba(0, 0, 0, 0.8)"]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View
          style={{
            paddingTop: Math.max(insets.top, 16) + 4,
            paddingBottom: 24,
            paddingHorizontal: 16,
            flex: 1,
            justifyContent: "space-between",
          }}
        >
          {/* Top nav row */}
          {onBack || onOpenCalendar ? (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
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
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                  }}
                >
                  <ChevronLeft size={16} color="#ffffff" strokeWidth={2} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#ffffff" }}>
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
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                  }}
                >
                  <Calendar size={16} color="#ffffff" strokeWidth={2} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#ffffff" }}>
                    Calendar
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* Spacer pushes the program info down */}
          <View style={{ flex: 1, minHeight: 28 }} />

          {/* Program info */}
          <View>
            {/* Badges: Green duration pill & Blue frequency pill */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {program.durationWeeks ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                    borderRadius: 9999,
                    backgroundColor: "rgba(34, 197, 94, 0.2)",
                  }}
                >
                  <Clock size={14} color="#4ade80" strokeWidth={2} />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#4ade80" }}>
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
                    backgroundColor: "rgba(59, 130, 246, 0.2)",
                  }}
                >
                  <Calendar size={14} color="#60a5fa" strokeWidth={2} />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#60a5fa" }}>
                    {program.trainingDaysPerWeek}x/week
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Title & Heart save button */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text
                  testID={`${testID}-name`}
                  style={{ fontSize: 24, fontWeight: "800", color: "#ffffff" }}
                >
                  {program.name}
                </Text>
                {program.targetUser ? (
                  <Text style={{ fontSize: 15, color: "#d4d4d8", marginTop: 6 }}>
                    {program.targetUser}
                  </Text>
                ) : null}
                {program.goal ? (
                  <Text style={{ fontSize: 13, color: "#a1a1aa", marginTop: 4 }}>
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
                    borderColor: "rgba(255, 255, 255, 0.3)",
                    padding: 10,
                  }}
                >
                  <Heart
                    color={isSaved ? heroRgb("brand") : "#ffffff"}
                    fill={isSaved ? heroRgb("brand") : "transparent"}
                    size={22}
                    strokeWidth={1.5}
                  />
                </Pressable>
              ) : null}
            </View>

            {/* Action buttons (Pills) */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 16 }}>
              {activeProgramLoading ? (
                <View
                  testID={`${testID}-start-loading`}
                  accessibilityLabel="Loading program status"
                  style={{
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                    borderRadius: 9999,
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: "600", color: "rgba(255, 255, 255, 0.6)" }}>
                    Loading…
                  </Text>
                </View>
              ) : isEnrolled ? (
                <Pressable
                  testID={`${testID}-continue`}
                  accessibilityRole="button"
                  accessibilityLabel="Continue"
                  onPress={onContinue}
                  disabled={actionPending}
                  style={{
                    borderRadius: 9999,
                    overflow: "hidden",
                    opacity: actionPending ? 0.5 : 1,
                  }}
                >
                  <LinearGradient
                    colors={["#22c55e", "#059669"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{
                      paddingHorizontal: 20,
                      paddingVertical: 10,
                      borderRadius: 9999,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#ffffff" }}>
                      Continue
                    </Text>
                  </LinearGradient>
                </Pressable>
              ) : (
                <Pressable
                  testID={`${testID}-start`}
                  accessibilityRole="button"
                  accessibilityLabel={onEnroll ? "Enroll in program" : "Start program"}
                  onPress={onEnroll ?? onStart ?? (() => {})}
                  disabled={actionPending}
                  style={{
                    borderRadius: 9999,
                    overflow: "hidden",
                    opacity: actionPending ? 0.5 : 1,
                  }}
                >
                  <LinearGradient
                    colors={["#22c55e", "#059669"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{
                      paddingHorizontal: 20,
                      paddingVertical: 10,
                      borderRadius: 9999,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#ffffff" }}>
                      {onEnroll ? "Enroll in program" : "Start program"}
                    </Text>
                  </LinearGradient>
                </Pressable>
              )}

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
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 9999,
                  backgroundColor: hasInProgressWorkout
                    ? "rgba(234, 179, 8, 0.2)"
                    : "rgba(255, 255, 255, 0.1)",
                  borderWidth: hasInProgressWorkout ? 1 : 0,
                  borderColor: hasInProgressWorkout ? "rgba(234, 179, 8, 0.5)" : "transparent",
                  opacity: actionPending ? 0.5 : 1,
                }}
              >
                {hasInProgressWorkout ? (
                  <>
                    <Clock size={16} color="#facc15" strokeWidth={2} />
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#facc15" }}>Resume</Text>
                  </>
                ) : (
                  <>
                    <Play size={16} color="#ffffff" fill="#ffffff" />
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#ffffff" }}>
                      Workout
                    </Text>
                  </>
                )}
              </Pressable>

              {shareBody ? (
                <NativeShareButton
                  body={shareBody}
                  getToken={shareGetToken}
                  testID={`${testID}-share`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    borderRadius: 9999,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                    borderWidth: 0,
                  }}
                  textStyle={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: "#ffffff",
                  }}
                  tintColor="#ffffff"
                />
              ) : null}
            </View>

            {/* Enrolled block */}
            {activeProgram ? (
              <View
                style={{
                  marginTop: 16,
                  paddingTop: 16,
                  borderTopWidth: 1,
                  borderTopColor: "rgba(255, 255, 255, 0.15)",
                  gap: 12,
                }}
              >
                {onSetStartDate ? (
                  <Pressable
                    testID={`${testID}-start-date`}
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
        </View>
      </Animated.View>

      {/* Content panel — slides UP and OVER the sticky hero on scroll */}
      <View
        style={{
          position: "relative",
          zIndex: 10,
          elevation: 10,
          marginTop: -16,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          backgroundColor: colors.background,
          paddingHorizontal: 16,
          paddingTop: 16,
          gap: 16,
        }}
      >
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

        {/* Phase Selector Card */}
        {program.phases.length > 0 ? (
          <Card style={{ marginTop: -8, zIndex: 10 }}>
            <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-3">
              Select Phase
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
            >
              {program.phases.map((phase) => {
                const isSelected = activePhaseIndex === phase.phaseIndex;
                const phaseWeeks =
                  phase.weeks ||
                  (phase.weekStart
                    ? phase.weekStart === phase.weekEnd
                      ? `Week ${phase.weekStart}`
                      : `Weeks ${phase.weekStart}–${phase.weekEnd}`
                    : "");
                return (
                  <Pressable
                    key={phase.phaseIndex}
                    testID={`${testID}-phase-${phase.phaseIndex}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Phase ${phase.name}`}
                    onPress={() => handleSelectPhase(phase.phaseIndex)}
                    style={{
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      borderRadius: 8,
                      backgroundColor: isSelected
                        ? isDark
                          ? "#ffffff"
                          : "#18181b"
                        : isDark
                          ? "#27272a"
                          : "#f4f4f5",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: isSelected ? "700" : "600",
                        color: isSelected
                          ? isDark
                            ? "#000000"
                            : "#ffffff"
                          : isDark
                            ? "#a1a1aa"
                            : "#52525b",
                      }}
                    >
                      <Text>{phase.name}</Text>
                      {phaseWeeks ? <Text> ({phaseWeeks})</Text> : null}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {currentPhase?.focus ? (
              <View
                testID={`${testID}-phase-focus`}
                style={{
                  marginTop: 12,
                  borderRadius: 8,
                  backgroundColor: isDark ? "rgba(39, 39, 42, 0.5)" : "#f4f4f5",
                  padding: 12,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: isDark ? "#ffffff" : "#18181b",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Zap
                      size={16}
                      color={isDark ? "#000000" : "#ffffff"}
                      fill={isDark ? "#000000" : "#ffffff"}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                      Focus
                    </Text>
                    <Text className="text-foreground text-sm mt-1">
                      {currentPhase.focus}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Day Selector (4-column grid) */}
        {currentPhaseWorkouts.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: colors.foreground,
              }}
            >
              Training Days
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
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
                      width: "23.5%",
                      paddingHorizontal: 8,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: isSelected
                        ? isDark
                          ? "#ffffff"
                          : "#18181b"
                        : isDark
                          ? "#18181b"
                          : "#ffffff",
                      borderWidth: 1,
                      borderColor: isSelected
                        ? isDark
                          ? "#ffffff"
                          : "#18181b"
                        : isDark
                          ? "#27272a"
                          : "#e4e4e7",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: isSelected
                            ? isDark
                              ? "#000000"
                              : "#ffffff"
                            : isDark
                              ? "#a1a1aa"
                              : "#52525b",
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
                              isSelected
                                ? isDark
                                  ? "#000000"
                                  : "#ffffff"
                                : colors.success
                            }
                          />
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Selected Workout & Exercise List */}
        {currentWorkout ? (
          <View style={{ gap: 12, marginTop: 4 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                marginBottom: 4,
              }}
            >
              <LinearGradient
                colors={
                  isDark
                    ? ["#3f3f46", "#27272a"]
                    : ["#18181b", "#3f3f46"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.15,
                  shadowRadius: 4,
                  elevation: 3,
                }}
              >
                <AlignLeft size={20} color="#ffffff" strokeWidth={2} />
              </LinearGradient>
              <View style={{ flex: 1 }}>
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
                  {(currentWorkout.exercises?.length ?? currentWorkout.exerciseCount) === 1
                    ? ""
                    : "s"}
                </Text>
              </View>
            </View>

            {renderedExercises}
          </View>
        ) : null}
      </View>
    </Animated.ScrollView>
  );
}

export default ProgramDetail;
