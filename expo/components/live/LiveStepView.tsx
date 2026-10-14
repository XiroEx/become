import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Dumbbell,
  Plus,
  Repeat,
  X,
} from "lucide-react-native";
import { Text } from "@/components/Text";
import { type LiveSetState } from "@/components/live/LiveSetRow";
import { LiveStepInputs } from "@/components/live/LiveStepInputs";
import { LiveSetReference, isNewPR } from "@/components/live/LiveSetReference";
import { LiveExerciseDetails } from "@/components/live/LiveExerciseDetails";
import { ExerciseHint } from "@/components/live/ExerciseHint";
import { KeyboardDoneBar } from "@/components/live/KeyboardDoneBar";
import { FramedVideo } from "@/components/FramedVideo";
import {
  ExerciseGroupNav,
  type ExerciseGroupType,
} from "@/components/live/ExerciseGroupNav";
import {
  equipmentAssumption,
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
import {
  DEFAULT_LOAD_UNIT,
  loadRepsLabel,
  type WeightUnit,
} from "@/lib/live/bellStyle";
import {
  bellCountFor,
  bellMemoryKeyFor,
  type BellChoices,
  type BellCount,
} from "@/lib/live/bellCount";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { formatElapsed, overallProgressPercent } from "@/lib/live/liveProgress";
import { hitSlopToMinTarget, minTouchTarget } from "@/lib/a11y/touchTarget";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";

/**
 * THE PANEL'S SPACING, IN ONE PLACE (NP-381).
 *
 * Jon: "the native has a lot more spacing … just how the spacing is is
 * terrible." It was one uniform 8pt rhythm — every line of the exercise block
 * 8 apart, every block 8 apart — while the web's bottom overlay
 * (`LiveWorkoutClient.tsx` ~2341-2740) is `p-4` with `mb-4` under the
 * exercise block, `mb-4` under the progress bar, `mb-6` under the inputs and
 * `gap-3` between the actions, and 4-6px (`mt-1`, `mt-1.5`) between the lines
 * INSIDE the exercise block. Tight where the web is tight, generous where the
 * web is generous — and named here so the numbers cannot drift apart again.
 */
export const LIVE_PANEL_SPACING = {
  /** The web's `p-4` on the bottom overlay. */
  panelPaddingX: 16,
  /** A little less than `p-4` at the top: the scrim above already separates. */
  panelPaddingTop: 12,
  /** The SafeAreaView adds the home indicator; the web adds `2rem` to it. */
  panelPaddingBottom: 8,
  /** `mb-4` — exercise block → progress bar → inputs. */
  blockGap: 16,
  /** `mt-1.5` — the lines inside the exercise block. */
  infoGap: 6,
  /** `gap-3` — the action row, and `mt-3` over the previous-set line. */
  actionGap: 12,
  /**
   * How much of the screen the panel may take before its own content starts
   * scrolling. The clip is the background, so the panel can never be allowed
   * to swallow the whole of it — the tallest case (an interval exercise with a
   * hint, a Last/PR line and four cardio boxes) is about this much of a
   * 6.1-inch phone, and the web's panel lands in the same place.
   */
  panelMaxHeight: "72%",
} as const;

/** How tall the fade from the clip into the panel is (the web's gradient). */
const PANEL_SCRIM_HEIGHT = 64;
/** How tall the fade behind the floating top bar is (the web's `from-black/60`). */
const TOP_SCRIM_HEIGHT = 128;

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
   * The member's lifting-load unit (`profile.weightUnit ?? 'lbs'`, NP-209).
   * Names the weight box, the doubled-total hint and the `Last set:` line.
   * A PR keeps the unit it was SET in, so the `PR:` line does not read this.
   * Defaults to `'lbs'`.
   */
  weightUnit?: WeightUnit;
  /**
   * ONE DUMBBELL OR TWO, keyed by the exercise's memory key
   * (`bellMemoryKeyFor`): `bellChoices` is what the member picked in THIS
   * session, `rememberedBells` what their most recent logged set says. Neither
   * means the automatic per-exercise answer — see `lib/live/bellCount.ts`.
   * `onBellChoice` records a new answer; omitted, no one/two control renders.
   */
  bellChoices?: BellChoices;
  rememberedBells?: BellChoices;
  onBellChoice?: (memoryKey: string, count: BellCount) => void;
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
  weightUnit: WeightUnit = DEFAULT_LOAD_UNIT,
): string | null {
  if (setIndex <= 0 || !previous?.completed) return null;
  const t = normalizeTracking(trackingType ?? null);
  if (t === "intervals") {
    return previous.durationSec
      ? `Round ${setIndex}: ${previous.durationSec}s`
      : `Round ${setIndex}: done`;
  }
  if (t === "reps_weight") {
    return `Last set: ${loadRepsLabel(previous.weight ?? 0, previous.reps ?? 0, weightUnit)}`;
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
 * The SET INPUTS are the web's own input group (`LiveStepInputs`), not the
 * Track row: boxes side by side under fixed-height labels, the quick-pick
 * loads as one sideways strip, `🔥 NEW PR!` in the weight label row and the
 * equipment disclosure beside the exercise name. Rendering `LiveSetRow` here
 * is what left Live with a set-number column, a bordered card, a wrapping
 * pick grid and a second `Last:` line the web never shows.
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
  weightUnit = DEFAULT_LOAD_UNIT,
  bellChoices,
  rememberedBells,
  onBellChoice,
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
  const { colors, tint } = useThemeTokens();
  const total = workoutFlow.length;
  const safeIndex = Math.min(Math.max(stepIndex, 0), Math.max(total - 1, 0));
  const step = workoutFlow[safeIndex];
  const exercise = step ? exercises[step.exerciseIndex] : undefined;
  const [inputsOpen, setInputsOpen] = useState(true);

  // THE RED PULSING DOT (the web's `animate-pulse` on the elapsed timer).
  // Plain `Animated`, not moti/Reanimated, so `lib/a11y/reducedMotion`'s
  // import-sweep rule does not apply — Reduce Motion is still honoured by
  // holding the dot at full opacity instead of starting the loop.
  const reducedMotion = useReducedMotion();
  const timerDotOpacity = useMemo(() => new Animated.Value(1), []);
  useEffect(() => {
    if (reducedMotion) {
      timerDotOpacity.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(timerDotOpacity, {
          toValue: 0.4,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(timerDotOpacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [reducedMotion, timerDotOpacity]);

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
  // …and how many of them, which is the member's call on a dumbbell/kettlebell
  // exercise: their pick this session, else what they logged last time, else
  // the automatic answer (so ignoring the control changes nothing).
  const bellCount = bellCountFor(exercise, bellChoices, rememberedBells);
  const bellKey = bellMemoryKeyFor(exercise);
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
    weightUnit,
  );
  const overall = overallProgressPercent(grid);
  // The web's equipment disclosure, in the web's place (under the pills):
  // shown only when the app applies an implement the displayed name does not
  // state — "Dumbbell Bench Press" needs no chip, "Rear Delt Fly" does.
  const assumption = equipmentAssumption({
    name: exercise.name,
    equipment: exercise.equipment,
  });
  const assumptionLabel =
    assumption.assumed && assumption.label
      ? `Logging as ${assumption.label}`
      : null;
  // `🔥 NEW PR!` belongs in the weight LABEL ROW on the web, beside the label
  // — the reference block above keeps saying it too, as it already did.
  const beatingPR = isNewPR(
    exercise.trackingType,
    current.weight,
    exercisePRs?.[exercise.name] ?? null,
  );

  /** One of the web's small translucent pills under the exercise name. */
  const pill = (
    id: string,
    accessibilityLabel: string,
    icon: ReactNode,
    text: string,
    onPress: () => void,
  ) => (
    <Pressable
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={hitSlopToMinTarget(120, 30)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: colors.muted,
      }}
    >
      {icon}
      <Text
        style={WRAPPABLE_TEXT}
        className="text-foreground text-xs font-medium"
      >
        {text}
      </Text>
    </Pressable>
  );

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
      {/* THE CLIP, FULL-SCREEN (NP-381) — the web's `absolute inset-0`
          background, which is what the `live` video surface has always
          described itself as ("full-screen background, typically portrait on a
          phone", `lib/videoFraming.ts`). It used to be a 16:9 rounded card in
          the layout flow with everything else stacked under it, which is the
          "lot more spacing" Jon saw: the same screen, spread down the phone
          instead of layered on one clip. Nothing on it is tappable, so touches
          pass straight through to the chrome above. */}
      <View
        testID={`${testID}-live-media`}
        pointerEvents="none"
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      >
        <FramedVideo
          fill
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
      </View>

      {/* The web's `bg-linear-to-b from-black/60 to-transparent` behind the
          floating top bar — a wash of the PAGE colour rather than the web's
          literal black, so the exit button and the timer stay legible on a
          light phone too (NP-288's rule). */}
      <LinearGradient
        testID={`${testID}-live-top-scrim`}
        pointerEvents="none"
        colors={[tint("background", 0.8), tint("background", 0)]}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: TOP_SCRIM_HEIGHT,
        }}
      />

      {/* TOP BAR — the web's floating immersive chrome: exit / Track|Live /
          red-dot timer, `flex items-center justify-between px-4 py-3`. The
          exit button is the web's `h-9 w-9 rounded-full bg-white/10` —
          drawn with a theme tint rather than the literal white, so a light
          phone still reads this bar in light mode (NP-288). */}
      <View
        testID={`${testID}-live-topbar`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        {onExit ? (
          <Pressable
            testID={`${testID}-live-exit`}
            accessibilityRole="button"
            accessibilityLabel="Exit live workout"
            onPress={onExit}
            hitSlop={hitSlopToMinTarget(36, 36)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: tint("foreground", 0.1),
            }}
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
          {/* The web's resume indicator is a PILL with a clock face
              (`rounded-full bg-yellow-500/20 px-3 py-1.5 text-sm font-medium
              text-yellow-400`), the same chrome Track's one already has. */}
          {resumed ? (
            <View
              testID={`${testID}-live-resume-pill`}
              style={{
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 4,
                backgroundColor: tint("accent", 0.2),
              }}
            >
              <Text
                testID={`${testID}-resume-indicator`}
                className="text-accent text-xs font-medium"
              >
                Resuming
              </Text>
            </View>
          ) : null}
          {typeof activeSeconds === "number" ? (
            // The web's elapsed timer is a translucent PILL — `flex
            // items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5
            // backdrop-blur-sm` with a pulsing red dot and `font-mono text-sm
            // tabular-nums` — the same chrome as the ✕ beside it, drawn with a
            // theme tint rather than the web's literal black (NP-288's rule).
            <View
              testID={`${testID}-live-timer`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: tint("foreground", 0.1),
              }}
            >
              <Animated.View
                testID={`${testID}-live-timer-dot`}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: colors.brand,
                  opacity: timerDotOpacity,
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

      {/* THE EXERCISE RAIL, over the clip (the web's story dots). */}
      {onOpenExercises ? (
        // The web's exercise rail: `flex flex-col gap-1.5 absolute right-4
        // top-1/2 -translate-y-1/2` — bare dots pinned to the clip's
        // right edge, no icon and no pill chrome around them. The
        // Pressable spans the clip's full height (top:0, bottom:0,
        // justifyContent:"center") to land the dot column at the
        // vertical centre without measuring its own height, and widens
        // the tap target past the dots' narrow width. The top bar and the
        // panel are drawn after it, so each wins the touches where they
        // overlap it.
        <Pressable
          testID={`${testID}-live-exercises`}
          accessibilityRole="button"
          accessibilityLabel={exercisesLabel ?? "Open exercise list"}
          onPress={onOpenExercises}
          hitSlop={{ top: 0, bottom: 0, left: 16, right: 16 }}
          style={{
            position: "absolute",
            right: 12,
            top: 0,
            bottom: 0,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View testID={`${testID}-live-dots`} style={{ gap: 6 }}>
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

      {/* THE BOTTOM PANEL — everything the web stacks over the bottom of the
          clip (`absolute bottom-0 left-0 right-0 … p-4`). The space above it
          is the clip itself, so the screen is ONE layered view the way the
          web's is, and the panel scrolls on its own so a tall exercise
          (hint + Last + PR + cardio inputs) never pushes the actions off
          screen. It stays a flex child rather than an absolute overlay so
          the keyboard-avoiding behaviour below still lifts it — the number
          pad must never cover the CTA. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* The clip, uncovered: this is the web's video area between the top
            chrome and the panel. It gives up its height first (flexShrink)
            when the panel needs room. */}
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }} pointerEvents="none" />

        {/* The web fades its panel into the clip (`bg-linear-to-t
            from-black/80 via-black/40 to-transparent`). Native fades into the
            PAGE colour instead and then goes solid under the text, because
            this screen is light on a light phone (NP-288) and 4px type over a
            moving clip is not readable in either mode. */}
        <LinearGradient
          testID={`${testID}-live-panel-scrim`}
          pointerEvents="none"
          colors={[tint("background", 0), tint("background", 0.92)]}
          style={{ height: PANEL_SCRIM_HEIGHT, marginBottom: -1 }}
        />

        <View
          testID={`${testID}-live-panel`}
          style={{
            flexShrink: 1,
            maxHeight: LIVE_PANEL_SPACING.panelMaxHeight,
            backgroundColor: colors.background,
            paddingBottom: LIVE_PANEL_SPACING.panelPaddingBottom,
          }}
        >
          <ScrollView
            testID={`${testID}-live-panel-scroll`}
            style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={{
              paddingHorizontal: LIVE_PANEL_SPACING.panelPaddingX,
              paddingTop: LIVE_PANEL_SPACING.panelPaddingTop,
              paddingBottom: LIVE_PANEL_SPACING.panelPaddingTop,
              gap: LIVE_PANEL_SPACING.blockGap,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <View
              testID={`${testID}-live-exercise-${exercise.slug}`}
              style={{ gap: LIVE_PANEL_SPACING.infoGap }}
            >
              {/* `Exercise 1/12 • Set 1/3 • SUPERSET 1` */}
              <View
                style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}
              >
                {/* The web's line is `text-sm text-white/60` with the group
                    label in purple — one size, no bold (NP-365's device pass
                    left it a size small and semibold). */}
                <Text
                  testID={`${testID}-live-step`}
                  className="text-muted-foreground text-sm"
                >
                  {`Exercise ${step.exerciseIndex + 1}/${exercises.length}`}
                </Text>
                <Text className="text-muted-foreground text-sm">•</Text>
                <Text
                  testID={`${testID}-live-set-label`}
                  className="text-muted-foreground text-sm"
                >
                  {`${unit} ${step.setIndex + 1}/${totalSets}`}
                </Text>
                {groupLabel ? (
                  <>
                    <Text className="text-muted-foreground text-sm">•</Text>
                    <Text
                      testID={`${testID}-live-group-label`}
                      className="text-mindset text-sm"
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
                {/* The web's badge is a CHIP beside the name (`rounded
                    bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium
                    text-blue-400`), not a bare word. */}
                {exercise.swappedFromName ? (
                  <View
                    style={{
                      borderRadius: 4,
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      backgroundColor: tint("info", 0.2),
                    }}
                  >
                    <Text
                      testID={`${testID}-live-swapped-badge`}
                      className="text-info text-[10px] font-medium"
                    >
                      Swapped
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* The web's pills: change what you are doing, or add to it,
                  without leaving the set. They are PILLS — `rounded-full
                  bg-white/10 px-3 py-1.5 text-xs font-medium` — not the shared
                  `Button`'s `rounded-xl` block, for the same reason the CTA
                  below is drawn by hand (NP-365): this screen's chrome is the
                  web's floating pill chrome. The slop keeps the 44-point target
                  a pill that small would otherwise miss. */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {pill(
                  `${testID}-live-swap`,
                  `Swap ${exercise.name}`,
                  <Repeat size={14} color={colors.foreground} />,
                  "Swap Exercise",
                  () => onRequestSwap?.(exercise.slug),
                )}
                {onAddExercise
                  ? pill(
                      `${testID}-live-add`,
                      "Add Exercise",
                      <Plus size={14} color={colors.foreground} />,
                      "Add Exercise",
                      onAddExercise,
                    )
                  : null}
              </View>

              {/* "This is being logged as a Dumbbell." The web renders this
                  disclosure HERE — under the pills, above the inputs
                  (`EquipmentAssumptionRow dark`) — and only when the exercise's
                  own name does not already state the implement. It used to sit
                  under the weight box as part of the Track row. */}
              {assumptionLabel ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    alignSelf: "flex-start",
                    gap: 4,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    backgroundColor: colors.muted,
                  }}
                >
                  <Dumbbell size={12} color={colors["muted-foreground"]} />
                  <Text
                    testID={`${testID}-live-${exercise.slug}-assumption`}
                    style={WRAPPABLE_TEXT}
                    className="text-muted-foreground text-[11px] font-medium"
                  >
                    {assumptionLabel}
                  </Text>
                </View>
              ) : null}

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
                weightUnit={weightUnit}
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
              {/* The web's `text-sm font-medium text-white/70 tabular-nums`. */}
              <Text className="text-muted-foreground text-sm font-medium tabular-nums">
                {`${overall}%`}
              </Text>
            </View>

            {/* THE WEB'S OWN INPUT GROUP (not the Track row): boxes side by
                side under fixed-height labels, the quick picks as one scrolling
                strip beneath them. */}
            {inputsOpen ? (
              <LiveStepInputs
                setIndex={step.setIndex}
                bell={bell}
                bells={bellCount}
                {...(onBellChoice
                  ? {
                      onBellsChange: (count: BellCount) =>
                        onBellChoice(bellKey, count),
                    }
                  : {})}
                weightUnit={weightUnit}
                exerciseName={exercise.name}
                state={current}
                trackingType={exercise.trackingType}
                targetReps={exercise.repsLabel ?? null}
                targetDuration={exercise.durationLabel ?? null}
                newPR={beatingPR}
                testID={`${testID}-live-${exercise.slug}-set-${step.setIndex}`}
                onChange={(next) => onSetChange(step.exerciseIndex, step.setIndex, next)}
              />
            ) : null}
          </ScrollView>

          <View
            style={{
              paddingHorizontal: LIVE_PANEL_SPACING.panelPaddingX,
              gap: LIVE_PANEL_SPACING.actionGap,
            }}
          >
            {/* The Done key `number-pad` does not have, above the actions. */}
            <KeyboardDoneBar
              {...(keyboardDoneVisible !== undefined
                ? { visible: keyboardDoneVisible }
                : {})}
              testID={`${testID}-live-keyboard-done`}
            />
            {/* The web's action row: `flex gap-3`. */}
            <View
              testID={`${testID}-live-actions`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: LIVE_PANEL_SPACING.actionGap,
              }}
            >
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
                  skipping and green only for a real completion.
                  Styled as the web's own CTA — `w-full rounded-full
                  bg-emerald-500 py-4 font-bold text-base` (`success` is the
                  emerald token everywhere else in the app) — rather than
                  `Button`'s shared `rounded-xl`, which the web's pill shape
                  does not use here. */}
              <View style={{ flex: 1 }}>
                <Pressable
                  testID={`${testID}-live-complete`}
                  accessibilityRole="button"
                  accessibilityLabel={completeLabel}
                  accessibilityHint={
                    isInterval
                      ? undefined
                      : "Completes with exactly what was typed; blank stays blank"
                  }
                  onPress={() =>
                    isSkipping && !isLastStep && onRequestSkip
                      ? onRequestSkip()
                      : onCompleteStep?.()
                  }
                  style={{ minHeight: 44 }}
                  className={`items-center justify-center rounded-full py-4 ${
                    isSkipping && !isLastStep ? "bg-muted" : "bg-success"
                  }`}
                >
                  <Text
                    style={[WRAPPABLE_TEXT, { textAlign: "center" }]}
                    className={`text-base font-bold ${
                      isSkipping && !isLastStep
                        ? "text-foreground"
                        : "text-primary-foreground"
                    }`}
                  >
                    {completeLabel}
                  </Text>
                </Pressable>
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
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
