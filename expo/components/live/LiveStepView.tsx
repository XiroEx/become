import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, List, Plus, Repeat, X } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { LiveSetRow, type LiveSetState } from "@/components/live/LiveSetRow";
import { LiveSetReference } from "@/components/live/LiveSetReference";
import { LiveExerciseDetails } from "@/components/live/LiveExerciseDetails";
import { ExerciseHint } from "@/components/live/ExerciseHint";
import { KeyboardDoneBar } from "@/components/live/KeyboardDoneBar";
import { FramedVideo } from "@/components/FramedVideo";
import {
  ExerciseGroupNav,
  type ExerciseGroupType,
} from "@/components/live/ExerciseGroupNav";
import {
  getBellWeightInfo,
  normalizeTracking,
  setUnitLabel,
  tracksTime,
  type WorkoutStep,
} from "@become/core";
import type {
  LiveGrid,
  LiveWorkoutExercise,
} from "@/components/live/LiveWorkoutClient";
import type {
  ExerciseHistoryEntry,
  ExercisePRSummary,
} from "@become/api-client";
import {
  groupLabelForStep,
  liveCompleteLabel,
  totalRoundsForStep,
} from "@/components/live/LiveWorkoutClient";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { formatElapsed, overallProgressPercent } from "@/lib/live/liveProgress";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

export interface LiveStepViewProps {
  exercises: LiveWorkoutExercise[];
  grid: LiveGrid;
  /** The interleaved order the member walks (`buildWorkoutFlow`). */
  workoutFlow: WorkoutStep[];
  /** Which step of that flow is on screen. */
  stepIndex: number;
  onStepChange: (stepIndex: number) => void;
  onSetChange: (
    exerciseIndex: number,
    setIndex: number,
    next: LiveSetState,
  ) => void;
  /**
   * The web's primary action (`completeSet` / `advanceStep`): mark the
   * current set done with exactly what was typed and move to the next
   * step of `workoutFlow`. Wired by `LiveWorkoutClient`; on the last step
   * it enters the existing finish flow (`onFinish`).
   */
  onCompleteStep?: () => void;
  onRequestSkip?: () => void;
  isSkipping?: boolean;
  onRequestSwap?: (slug: string) => void;
  /**
   * Best completed set per exercise NAME (`useLiveWorkout`'s
   * `exerciseHistory`). Shown as the `Last:` reference under the set —
   * a reference only, never prefill.
   */
  exerciseHistory?: Record<string, ExerciseHistoryEntry>;
  /**
   * Persisted max-weight record per exercise NAME (`useLiveWorkout`'s
   * `exercisePRs`). Drives the `PR:` line and the NEW PR flag.
   */
  exercisePRs?: Record<string, ExercisePRSummary>;
  /**
   * In-workout hints keyed by lowercase exercise slug (the web's
   * `exerciseNudges`). Rendered under the exercise header, beside the
   * Last/PR lines — a reference, never prefill. Only the CURRENT
   * exercise's hint shows (the web shows each hint only while its exercise
   * is current).
   */
  exerciseHints?: Record<string, { id: string; title: string; body: string }>;
  /** Dismiss the current exercise's hint on the account. */
  onDismissHint?: (slug: string) => void;
  /**
   * The web's top-left `✕`: leave the live screen. Omitted, no exit button
   * renders (a test mounting the component alone has nowhere to go).
   */
  onExit?: () => void;
  /**
   * The Track|Live toggle, handed in by `LiveWorkoutClient` so the live top
   * bar carries the same control the web's does (and the same testIDs).
   */
  viewToggle?: ReactNode;
  /** Elapsed workout seconds — the web's red-dot timer in the top bar. */
  activeSeconds?: number;
  /** The web's `Resuming` pill, shown while the resume is fresh. */
  resumed?: boolean;
  /**
   * THE ONE exercises entry (the web's dots rail / `EXERCISES` popover):
   * the route's manage panel when it has one, else the built-in sheet.
   * `LiveWorkoutClient` decides which; this view only offers the door.
   */
  onOpenExercises?: () => void;
  /** Its accessible name — e.g. `Exercises (12)`. */
  exercisesLabel?: string;
  /** `done[i]` is true when every set of exercise i is complete (dot colour). */
  exerciseDone?: boolean[];
  /** The web's `Add Exercise` pill. Omitted, no pill renders. */
  onAddExercise?: () => void;
  /** Force the keyboard Done accessory on (tests have no soft keyboard). */
  keyboardDoneVisible?: boolean;
  testID: string;
}

/**
 * The web's previous-set line under the action row ("Previous set
 * reference", `LiveWorkoutClient.tsx` ~2683-2695): what the set before this
 * one actually held. Null on the first set of an exercise, and null while
 * the previous set is not done — it is a record, not a prescription.
 */
export function lastSetLine(
  previous: LiveSetState | undefined | null,
  trackingType: string | null | undefined,
  setIndex: number,
): string | null {
  if (setIndex <= 0 || !previous?.completed) return null;
  const t = normalizeTracking(trackingType ?? null);
  if (t === "intervals") {
    return previous.durationSec
      ? `Round ${setIndex}: ${previous.durationSec}s`
      : `Round ${setIndex}: done`;
  }
  if (t === "reps_weight") {
    return `Last set: ${previous.weight ?? 0} lbs × ${previous.reps ?? 0} reps`;
  }
  if (tracksTime(t)) {
    const unit = setUnitLabel(trackingType ?? null, 1).toLowerCase();
    return `Last ${unit}: ${previous.durationSec ?? 0}s`;
  }
  return `Last set: ${previous.reps ?? 0} reps`;
}

/**
 * THE LIVE VIEW — the web's full-screen step, one set at a time.
 *
 * Web equivalent:
 * `webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`.
 * NP-288 rebuilt this view to that shape: a top bar (`✕`, Track|Live, the
 * red-dot timer), the story progress bars for this exercise's sets, the
 * media with the exercise rail beside it, and a bottom bar carrying
 * `Exercise 1/12` · `Set 1/3`, the name, the `Swap Exercise` / `Add
 * Exercise` pills, the inputs and the actions. It used to be a card
 * scrolling under the Track header, with `Step 1 of 24`, `Set 1 of 1`
 * twice, Previous / Next and two different `Exercises` buttons.
 *
 * It is the SAME grid Track edits — this view only chooses which row of it to
 * put in front of you — so flipping between the two never loses a number and
 * never re-logs finished work. Which set it opens on is `resolveStartStep`
 * from `@become/core`, the rule both apps share: the remembered position
 * first, then the first set that still needs doing.
 *
 * A grouped block is walked round by round rather than exercise by exercise,
 * because the flow it steps through is `buildWorkoutFlow` — the same one the
 * Track view labels its rows with.
 *
 * Colours are theme tokens, never the web's white-on-black literals: the web
 * live page is a dark page in both modes, native is not, so a light phone
 * reads this screen in light mode (NP-288 checked both).
 */
export function LiveStepView({
  exercises,
  grid,
  workoutFlow,
  stepIndex,
  onStepChange,
  onSetChange,
  onCompleteStep,
  onRequestSkip,
  isSkipping = false,
  onRequestSwap,
  exerciseHistory,
  exercisePRs,
  exerciseHints,
  onDismissHint,
  onExit,
  viewToggle,
  activeSeconds,
  resumed = false,
  onOpenExercises,
  exercisesLabel,
  exerciseDone,
  onAddExercise,
  keyboardDoneVisible,
  testID,
}: LiveStepViewProps) {
  const { colors } = useThemeTokens();
  const total = workoutFlow.length;
  const safeIndex = Math.min(Math.max(stepIndex, 0), Math.max(total - 1, 0));
  const step = workoutFlow[safeIndex];
  const exercise = step ? exercises[step.exerciseIndex] : undefined;
  const [inputsOpen, setInputsOpen] = useState(true);

  if (!step || !exercise) {
    return (
      <View testID={`${testID}-live`} style={{ gap: 12 }}>
        <Text
          testID={`${testID}-live-empty`}
          className="text-muted-foreground text-sm"
        >
          Nothing to log yet.
        </Text>
      </View>
    );
  }

  const sets = grid[exercise.slug] ?? [];
  const current: LiveSetState = sets[step.setIndex] ?? {
    reps: null,
    weight: null,
    durationSec: null,
    distance: null,
    speed: null,
    completed: false,
  };
  const totalSets = sets.length || exercise.sets || 1;
  const unit = setUnitLabel(exercise.trackingType, 1);
  const bell = getBellWeightInfo(exercise);
  const isLastStep = safeIndex >= total - 1;
  // The group label comes from the CURRENT exercise — `workout.groupType`
  // is never set by the route, so `ExerciseGroupNav` would otherwise never
  // render. R = max(groupRounds, sets), the same max the flow walks.
  const groupLabel = groupLabelForStep(step, exercise);
  const groupType = ((): ExerciseGroupType | null => {
    const t = (exercise.groupType ?? "").toLowerCase();
    return t === "superset" ||
      t === "circuit" ||
      t === "triset" ||
      t === "giantset" ||
      t === "giant_set" ||
      t === "emom" ||
      t === "amrap"
      ? (t === "giant_set" ? "giantset" : (t as ExerciseGroupType))
      : groupLabel
        ? "superset"
        : null;
  })();
  const totalRounds = totalRoundsForStep(step, exercise, exercises);
  const currentRound = step.roundNumber + 1;
  const completeLabelBase = liveCompleteLabel(isLastStep, exercise.trackingType);
  const completeLabel = isLastStep
    ? completeLabelBase
    : isSkipping
      ? `Skip ${unit} →`
      : completeLabelBase;
  const isInterval = normalizeTracking(exercise.trackingType ?? null) === "intervals";
  const hint = exerciseHints?.[exercise.slug.toLowerCase()];
  const previousLine = lastSetLine(
    sets[step.setIndex - 1],
    exercise.trackingType,
    step.setIndex,
  );
  const overall = overallProgressPercent(grid);

  /** One circular icon control of the bottom bar (the web's 14x14 pills). */
  const iconButton = (
    id: string,
    label: string,
    icon: ReactNode,
    onPress: (() => void) | undefined,
    disabled = false,
  ) => (
    <Pressable
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={[
        minTouchTarget,
        {
          width: 44,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.muted,
          opacity: disabled ? 0.3 : 1,
        },
      ]}
    >
      {icon}
    </Pressable>
  );

  return (
    <View testID={`${testID}-live`} style={{ flex: 1 }}>
      {/* TOP BAR — the web's exit / Track|Live / red-dot timer row. */}
      <View
        testID={`${testID}-live-topbar`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        {onExit ? (
          <Pressable
            testID={`${testID}-live-exit`}
            accessibilityRole="button"
            accessibilityLabel="Exit live workout"
            onPress={onExit}
            style={[
              minTouchTarget,
              {
                width: 40,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.muted,
              },
            ]}
          >
            <X size={18} color={colors.foreground} />
          </Pressable>
        ) : null}
        {viewToggle ? (
          <View style={{ flex: 1, maxWidth: 180 }}>{viewToggle}</View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {resumed ? (
            <Text
              testID={`${testID}-resume-indicator`}
              className="text-accent text-xs font-semibold"
            >
              Resuming
            </Text>
          ) : null}
          {typeof activeSeconds === "number" ? (
            <View
              testID={`${testID}-live-timer`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: colors.muted,
              }}
            >
              <View
                testID={`${testID}-live-timer-dot`}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: colors.brand,
                }}
              />
              <Text
                testID={`${testID}-elapsed`}
                className="text-foreground font-mono text-sm tabular-nums"
              >
                {formatElapsed(activeSeconds)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* STORY PROGRESS BARS — one per set of this exercise (the web's
          Snapchat-style set indicators). */}
      <View
        testID={`${testID}-live-set-bars`}
        accessibilityLabel={`${unit} ${step.setIndex + 1} of ${totalSets}`}
        style={{ flexDirection: "row", gap: 4, paddingHorizontal: 16 }}
      >
        {Array.from({ length: totalSets }).map((_, i) => (
          <View
            key={i}
            testID={`${testID}-live-set-bar-${i}`}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 999,
              overflow: "hidden",
              backgroundColor: colors.muted,
            }}
          >
            <View
              style={{
                height: "100%",
                borderRadius: 999,
                width: i < step.setIndex ? "100%" : i === step.setIndex ? "50%" : "0%",
                backgroundColor:
                  i < step.setIndex ? colors.success : colors.foreground,
              }}
            />
          </View>
        ))}
      </View>

      {/* THE MEDIA, full width, with the exercise rail beside it — the web's
          full-bleed clip and its dots. */}
      <View style={{ marginTop: 8 }}>
        <FramedVideo
          src={exercise.videoUrl}
          surface="live"
          exerciseName={exercise.name}
          thumbnailUrl={exercise.thumbnailUrl}
          videoWidth={exercise.videoWidth}
          videoHeight={exercise.videoHeight}
          videoFraming={exercise.videoFraming}
          videoTrim={exercise.videoTrim}
          testID={`${testID}-live-${exercise.slug}-video`}
        />
        {onOpenExercises ? (
          <Pressable
            testID={`${testID}-live-exercises`}
            accessibilityRole="button"
            accessibilityLabel={exercisesLabel ?? "Open exercise list"}
            onPress={onOpenExercises}
            style={{
              position: "absolute",
              right: 8,
              top: 8,
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 8,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: colors.muted,
            }}
          >
            <List size={16} color={colors.foreground} />
            <View testID={`${testID}-live-dots`} style={{ gap: 4 }}>
              {exercises.map((ex, idx) => {
                const done = exerciseDone?.[idx] ?? false;
                const isCurrent = idx === step.exerciseIndex;
                return (
                  <View
                    key={ex.slug}
                    testID={`${testID}-live-dot-${idx}`}
                    style={{
                      width: 6,
                      height: isCurrent ? 12 : 6,
                      borderRadius: 999,
                      backgroundColor: done
                        ? colors.success
                        : isCurrent
                          ? colors.foreground
                          : colors.border,
                    }}
                  />
                );
              })}
            </View>
          </Pressable>
        ) : null}
      </View>

      {/* THE BOTTOM BAR — everything the web stacks over the bottom of the
          clip. Scrolls on its own so a tall exercise (hint + Last + PR +
          cardio inputs) never pushes the actions off screen, and lifts with
          the keyboard so the number pad cannot cover them. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          keyboardShouldPersistTaps="handled"
        >
          <View testID={`${testID}-live-exercise-${exercise.slug}`} style={{ gap: 8 }}>
            {/* `Exercise 1/12 • Set 1/3 • SUPERSET 1` */}
            <View
              style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}
            >
              <Text
                testID={`${testID}-live-step`}
                className="text-muted-foreground text-xs font-semibold"
              >
                {`Exercise ${step.exerciseIndex + 1}/${exercises.length}`}
              </Text>
              <Text className="text-muted-foreground text-xs">•</Text>
              <Text
                testID={`${testID}-live-set-label`}
                className="text-muted-foreground text-xs font-semibold"
              >
                {`${unit} ${step.setIndex + 1}/${totalSets}`}
              </Text>
              {groupLabel ? (
                <>
                  <Text className="text-muted-foreground text-xs">•</Text>
                  <Text
                    testID={`${testID}-live-group-label`}
                    className="text-mindset text-xs font-semibold"
                  >
                    {groupLabel}
                  </Text>
                </>
              ) : null}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text
                testID={`${testID}-live-exercise-name`}
                className="text-foreground text-2xl font-bold"
              >
                {exercise.name}
              </Text>
              {exercise.swappedFromName ? (
                <Text
                  testID={`${testID}-live-swapped-badge`}
                  className="text-info text-[10px] font-medium"
                >
                  Swapped
                </Text>
              ) : null}
            </View>

            {/* The web's pills: change what you are doing, or add to it,
                without leaving the set. */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Button
                testID={`${testID}-live-swap`}
                variant="secondary"
                size="sm"
                icon={<Repeat size={14} color={colors.foreground} />}
                onPress={() => onRequestSwap?.(exercise.slug)}
                accessibilityLabel={`Swap ${exercise.name}`}
              >
                Swap Exercise
              </Button>
              {onAddExercise ? (
                <Button
                  testID={`${testID}-live-add`}
                  variant="secondary"
                  size="sm"
                  icon={<Plus size={14} color={colors.foreground} />}
                  onPress={onAddExercise}
                >
                  Add Exercise
                </Button>
              ) : null}
            </View>

            {exercise.notes ? (
              <Text
                testID={`${testID}-live-${exercise.slug}-notes`}
                className="text-muted-foreground text-xs"
              >
                {exercise.notes}
              </Text>
            ) : null}
            <LiveExerciseDetails
              tip={exercise.tip}
              tempo={exercise.tempo}
              rpe={exercise.rpe}
              durationLabel={exercise.durationLabel}
              primaryMuscles={exercise.primaryMuscles}
              testID={`${testID}-live-${exercise.slug}-details`}
            />
            {/* The web's history + PR row (Live only; Track is unchanged). */}
            <LiveSetReference
              exerciseName={exercise.name}
              trackingType={exercise.trackingType}
              history={exerciseHistory?.[exercise.name] ?? null}
              pr={exercisePRs?.[exercise.name] ?? null}
              typedWeight={current.weight}
              testID={`${testID}-live-${exercise.slug}-reference`}
            />
            {/* The web's contextual nudge for THIS exercise only
                (progression / plateau) — beside the Last/PR lines. */}
            {hint ? (
              <ExerciseHint
                hint={hint}
                exerciseSlug={exercise.slug}
                onDismiss={() => onDismissHint?.(exercise.slug.toLowerCase())}
                testID={`${testID}-live-${exercise.slug}-hint`}
              />
            ) : null}
          </View>

          {groupType ? (
            <ExerciseGroupNav
              testID={`${testID}-live-group-nav`}
              groupType={groupType}
              currentRound={currentRound}
              totalRounds={totalRounds}
              onPrev={() => onStepChange(Math.max(0, safeIndex - 1))}
              onNext={() => onStepChange(Math.min(total - 1, safeIndex + 1))}
            />
          ) : null}

          {/* Overall progress — the web's bar + N% above the inputs. */}
          <View
            testID={`${testID}-live-overall-progress`}
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <View
              style={{
                flex: 1,
                height: 6,
                overflow: "hidden",
                borderRadius: 999,
                backgroundColor: colors.muted,
              }}
            >
              <View
                style={{
                  height: "100%",
                  borderRadius: 999,
                  width: `${overall}%`,
                  backgroundColor: colors.success,
                }}
              />
            </View>
            <Text className="text-muted-foreground text-xs font-medium tabular-nums">
              {`${overall}%`}
            </Text>
          </View>

          {inputsOpen ? (
            <LiveSetRow
              setIndex={step.setIndex}
              bell={bell}
              exerciseName={exercise.name}
              equipment={exercise.equipment}
              showQuickPicks
              hideComplete
              state={current}
              prefill={exercise.prefill?.[step.setIndex] ?? null}
              trackingType={exercise.trackingType}
              testID={`${testID}-live-${exercise.slug}-set-${step.setIndex}`}
              onChange={(next) => onSetChange(step.exerciseIndex, step.setIndex, next)}
            />
          ) : null}
        </ScrollView>

        <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}>
          {/* The Done key `number-pad` does not have, above the actions. */}
          <KeyboardDoneBar
            {...(keyboardDoneVisible !== undefined
              ? { visible: keyboardDoneVisible }
              : {})}
            testID={`${testID}-live-keyboard-done`}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {iconButton(
              `${testID}-live-prev`,
              "Previous set",
              <ChevronLeft size={22} color={colors.foreground} />,
              () => onStepChange(Math.max(0, safeIndex - 1)),
              safeIndex === 0,
            )}
            {iconButton(
              `${testID}-live-next`,
              "Next set",
              <ChevronRight size={22} color={colors.foreground} />,
              () => onStepChange(Math.min(total - 1, safeIndex + 1)),
              safeIndex >= total - 1,
            )}
            {iconButton(
              `${testID}-live-inputs-toggle`,
              inputsOpen ? "Hide inputs" : "Show inputs",
              inputsOpen ? (
                <ChevronDown size={22} color={colors.foreground} />
              ) : (
                <ChevronUp size={22} color={colors.foreground} />
              ),
              () => setInputsOpen((open) => !open),
            )}
            {/* The web's primary action: Complete <unit> → / Skip <unit> → /
                Done → / Finish Workout. Blank inputs open the skip modal
                (`onRequestSkip`); otherwise the button always completes. It
                is NEVER destructive-red — the web draws it neutral while
                skipping and green only for a real completion. */}
            <View style={{ flex: 1 }}>
              <Button
                testID={`${testID}-live-complete`}
                variant={isSkipping && !isLastStep ? "secondary" : "success"}
                size="lg"
                onPress={() =>
                  isSkipping && !isLastStep && onRequestSkip
                    ? onRequestSkip()
                    : onCompleteStep?.()
                }
                accessibilityHint={
                  isInterval
                    ? undefined
                    : "Completes with exactly what was typed; blank stays blank"
                }
              >
                {completeLabel}
              </Button>
            </View>
          </View>
          {/* The web's previous-set reference, under the buttons. */}
          {previousLine ? (
            <Text
              testID={`${testID}-live-last-set`}
              className="text-muted-foreground text-sm text-center"
            >
              {previousLine}
            </Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
