import { useState, useMemo, useCallback } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { Text } from "@/components/Text";
import { Check, Clock, Heart, Play } from "lucide-react-native";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { ExerciseAccordion } from "@/components/ExerciseAccordion";
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
  /** Adjust the enrolled start date. Button renders only when provided. */
  onSetStartDate?: () => void;
  /** Abandon the program. Button renders only when provided. */
  onAbandon?: () => void;
  /** Pause or resume the program. Button renders only when provided. */
  onPauseResume?: () => void;
  /** Shift the schedule. Button renders only when provided. */
  onShift?: (days?: number) => void;
  /** Open web editor for this custom program. Button renders only when provided. */
  onEdit?: () => void;
  /** Disables the action buttons while a mutation is in flight. */
  actionPending?: boolean;
  /** Whether this program is saved by the user. */
  isSaved?: boolean;
  /** Save or unsave this program. */
  onToggleSave?: () => void | Promise<void>;
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
  completedDays,
  hasInProgressWorkout = false,
  onContinue,
  onStartLive,
  onResumeLive,
  onSetStartDate,
  onAbandon,
  onPauseResume,
  onShift,
  onEdit,
  actionPending = false,
  isSaved = false,
  onToggleSave,
  testID = "program-detail",
}: ProgramDetailProps) {
  const { colors, tint } = useThemeTokens();

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
        elements.push(
          <View
            key={`group-${groupId}`}
            testID={`${testID}-exercise-group-${groupId}`}
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              padding: 12,
              gap: 8,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <View
                style={{
                  backgroundColor: colors.primary,
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
                {groupExercises.length} exercises{ex.groupRest ? ` · ${ex.groupRest} rest` : " · minimal rest"}
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
      {/* Program Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            testID={`${testID}-name`}
            className="text-foreground text-2xl font-bold mb-1"
          >
            {program.name}
          </Text>
          <Text
            testID={`${testID}-description`}
            className="text-muted-foreground text-sm"
          >
            {program.description}
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 8,
            }}
          >
            {program.targetUser ? (
              <Text className="text-muted-foreground text-xs">
                {program.targetUser}
              </Text>
            ) : null}
            {program.durationWeeks ? (
              <Text className="text-muted-foreground text-xs">
                {program.durationWeeks} weeks
              </Text>
            ) : null}
            {program.trainingDaysPerWeek ? (
              <Text className="text-muted-foreground text-xs">
                {program.trainingDaysPerWeek}d / week
              </Text>
            ) : null}
            {program.goal ? (
              <Text className="text-muted-foreground text-xs">
                {program.goal}
              </Text>
            ) : null}
          </View>
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
            className="rounded-xl border border-border p-3"
          >
            <Heart
              color={isSaved ? colors.primary : colors["muted-foreground"]}
              fill={isSaved ? colors.primary : "transparent"}
              size={22}
              strokeWidth={1.5}
            />
          </Pressable>
        ) : null}
      </View>

      {/* Action Buttons: Continue / Start Program + Workout / Resume */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 130 }}>
          {isEnrolled ? (
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
            borderRadius: 12,
            backgroundColor: hasInProgressWorkout
              ? tint("accent", 0.2)
              : colors.card,
            borderWidth: 1,
            borderColor: hasInProgressWorkout ? colors.accent : colors.border,
          }}
        >
          {hasInProgressWorkout ? (
            <>
              <Clock size={16} color={colors.accent} strokeWidth={2} />
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.accent }}>Resume</Text>
            </>
          ) : (
            <>
              <Play size={16} color={colors.foreground} fill={colors.foreground} />
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>Workout</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Enrolled Progress & Controls */}
      {isEnrolled && activeProgram ? (
        <View style={{ gap: 6, marginVertical: 2 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text className="text-muted-foreground text-xs">
              Progress: {activeProgram.completedWorkouts ?? 0}/{activeProgram.totalWorkouts ?? 0} sessions
            </Text>
            {activeProgram.totalWorkouts ? (
              <Text className="text-muted-foreground text-xs font-semibold">
                {Math.round(((activeProgram.completedWorkouts ?? 0) / activeProgram.totalWorkouts) * 100)}%
              </Text>
            ) : null}
          </View>
          {activeProgram.totalWorkouts ? (
            <View style={{ height: 6, width: "100%", backgroundColor: colors.muted, borderRadius: 3, overflow: "hidden" }}>
              <View
                style={{
                  height: "100%",
                  width: `${Math.min(100, Math.round(((activeProgram.completedWorkouts ?? 0) / activeProgram.totalWorkouts) * 100))}%`,
                  backgroundColor: colors.success,
                  borderRadius: 3,
                }}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Paused indicator matching web */}
      {activeProgram?.status === "paused" ? (
        <View
          testID={`${testID}-paused-banner`}
          className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mt-1"
        >
          <Text className="text-amber-600 dark:text-amber-400 text-xs font-semibold">
            Program is paused. Workouts are frozen until you resume.
          </Text>
        </View>
      ) : null}

      {/* Program Management Actions */}
      {onEdit ? (
        <Button
          testID={`${testID}-edit`}
          variant="secondary"
          onPress={onEdit}
          disabled={actionPending}
        >
          Edit on web
        </Button>
      ) : null}

      {onPauseResume ? (
        <Button
          testID={`${testID}-pause-resume`}
          variant="secondary"
          onPress={onPauseResume}
          disabled={actionPending}
        >
          {activeProgram?.status === "paused" ? "Resume Program" : "Pause Program"}
        </Button>
      ) : null}

      {onShift ? (
        <Button
          testID={`${testID}-shift`}
          variant="secondary"
          onPress={() => onShift(3)}
          disabled={actionPending}
        >
          Delay Schedule
        </Button>
      ) : null}

      {onSetStartDate ? (
        <Button
          testID={`${testID}-set-start-date`}
          variant="secondary"
          onPress={onSetStartDate}
          disabled={actionPending}
        >
          Change start date
        </Button>
      ) : null}

      {onAbandon ? (
        <Button
          testID={`${testID}-abandon`}
          variant="secondary"
          onPress={onAbandon}
          disabled={actionPending}
        >
          Abandon program
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

