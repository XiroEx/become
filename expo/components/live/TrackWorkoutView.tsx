import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { ArrowUpDown, ChevronDown, Layers, Trash2, Unlink } from "lucide-react-native";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { hitSlopToMinTarget } from "@/lib/a11y/touchTarget";
import {
  LiveSetRow,
  setInputsFor,
  type LiveSetState,
} from "@/components/live/LiveSetRow";
import {
  bellCountFor,
  bellMemoryKeyFor,
  showsBellTotal,
  type BellChoices,
  type BellCount,
} from "@/lib/live/bellCount";
import { ExerciseHint } from "@/components/live/ExerciseHint";
import {
  ExerciseGroupNav,
  type ExerciseGroupType,
} from "@/components/live/ExerciseGroupNav";
import { FramedVideo } from "@/components/FramedVideo";
import {
  canRemoveExercise,
  defaultDurationUnit,
  getBellWeightInfo,
  groupIndexes,
  isFloorsExercise,
  moveExercise,
  removeExercise,
  tracksTime,
  ungroupAt,
  type DurationUnit,
} from "@become/core";
import type {
  LiveGrid,
  LiveWorkoutExercise,
} from "@/components/live/LiveWorkoutClient";
import { DEFAULT_LOAD_UNIT, type WeightUnit } from "@/lib/live/bellStyle";

export interface TrackWorkoutViewProps {
  exercises: LiveWorkoutExercise[];
  grid: LiveGrid;
  groupType?: ExerciseGroupType | null;
  round: number;
  totalRounds: number;
  onRoundChange: (round: number) => void;
  onSetChange: (
    exerciseIndex: number,
    setIndex: number,
    next: LiveSetState,
  ) => void;
  onRequestSwap?: (slug: string) => void;
  /**
   * The member's lifting-load unit (`profile.weightUnit ?? 'lbs'`, NP-209) —
   * handed to every `LiveSetRow` so the Track grid's weight boxes read in the
   * member's unit. Defaults to `'lbs'`.
   */
  weightUnit?: WeightUnit;
  /**
   * ONE DUMBBELL OR TWO, keyed by the exercise's memory key
   * (`bellMemoryKeyFor`): `bellChoices` is the member's pick in THIS session,
   * `rememberedBells` what their most recent logged set says. Neither means
   * the automatic per-exercise answer — see `lib/live/bellCount.ts`. The
   * control is asked ONCE PER EXERCISE (the web asks it on the exercise, not
   * on each set) and every set of that exercise saves the same answer.
   * `onBellChoice` records a new one; omitted, no control renders.
   */
  bellChoices?: BellChoices;
  rememberedBells?: BellChoices;
  onBellChoice?: (memoryKey: string, count: BellCount) => void;
  /** Session notes — the web's `notes` field on the save (Track only). */
  notes: string;
  onNotesChange: (notes: string) => void;
  /** The web shows the notes box once any set is done. */
  showNotes: boolean;
  /**
   * In-workout hints keyed by lowercase exercise slug (the web's
   * `exerciseNudges`). Rendered inside the exercise's own card, in
   * context — each hint only on its own exercise.
   */
  exerciseHints?: Record<string, { id: string; title: string; body: string }>;
  /** Dismiss an exercise's hint on the account. */
  onDismissHint?: (slug: string) => void;
  /**
   * Apply a structural change made from inside the card — Move up / Move
   * down / Remove on a single exercise, Ungroup on a superset/circuit block
   * (NP-287: the web offers all four from the accordion itself, not only
   * from the Exercises sheet). Omitted, the card renders without these
   * controls and behaves exactly as it did before NP-287.
   */
  onExerciseChange?: (change: {
    exercises: LiveWorkoutExercise[];
    order: number[];
  }) => void;
  testID: string;
}

/** Title-case a single word — "beginner" → "Beginner" (the web's `capitalize` class). */
function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Round-rounded completion percent for a set of (completed, total) pairs. */
function completionPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
}

/**
 * The web's `GROUP_STYLES` (purple superset, orange circuit, …), as
 * NativeWind classes. `badge` is the web's pill badge fill
 * (`rounded-full px-2.5 py-0.5 text-xs font-semibold text-white bg-*-500`,
 * NP-364) — one solid colour per group type, matching `container`.
 */
const GROUP_BLOCK_STYLES: Record<
  string,
  { container: string; label: string; badge: string }
> = {
  superset: {
    container:
      "border border-purple-200 dark:border-purple-900/40 bg-purple-50/60 dark:bg-purple-950/20",
    label: "text-purple-700 dark:text-purple-300",
    badge: "bg-purple-500",
  },
  circuit: {
    container:
      "border border-orange-200 dark:border-orange-900/40 bg-orange-50/60 dark:bg-orange-950/20",
    label: "text-orange-700 dark:text-orange-300",
    badge: "bg-orange-500",
  },
  triset: {
    container:
      "border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/60 dark:bg-indigo-950/20",
    label: "text-indigo-700 dark:text-indigo-300",
    badge: "bg-indigo-500",
  },
  giant_set: {
    container:
      "border border-rose-200 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-950/20",
    label: "text-rose-700 dark:text-rose-300",
    badge: "bg-rose-500",
  },
  giantset: {
    container:
      "border border-rose-200 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-950/20",
    label: "text-rose-700 dark:text-rose-300",
    badge: "bg-rose-500",
  },
  emom: {
    container:
      "border border-teal-200 dark:border-teal-900/40 bg-teal-50/60 dark:bg-teal-950/20",
    label: "text-teal-700 dark:text-teal-300",
    badge: "bg-teal-500",
  },
  amrap: {
    container:
      "border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20",
    label: "text-amber-700 dark:text-amber-300",
    badge: "bg-amber-500",
  },
};

/**
 * THE TRACK VIEW — every exercise and every set of the workout on one screen.
 *
 * Web equivalent:
 * `webapp/app/dashboard/workout/[programId]/workout/WorkoutFormClient.tsx`.
 *
 * This is the grid native has always had, now reachable (it is what opening a
 * workout lands on) and now sharing one grid, one save and one position with
 * the Live view beside it — the web's arrangement, where the two views are one
 * workout seen two ways.
 *
 * The exercise card is an accordion (NP-287): a round number badge that
 * turns a green check when every set is done, the "N sets × reps · Difficulty"
 * meta line, up to 4 muscle chips, a Layers group-toggle icon button, a swap
 * icon button, a mini progress bar and a collapse chevron. The body — video,
 * the in-workout hint, the table header, the set rows and the Move up / Move
 * down / Remove footer — is open by default (the web opens on the first
 * incomplete exercise; always-open here keeps every set reachable without a
 * tap, which is what the existing coverage pins) and the header toggles it
 * shut.
 *
 * A superset/circuit/etc. block (members sharing a `groupId`, 2 or more of
 * them) draws as ONE coloured card — purple for a superset, orange for a
 * circuit, and so on — with its label, an Ungroup action and the block's own
 * % done, laid out ROUND BY ROUND: each round names itself and lists every
 * member's set for that round, side by side, the way the web does. A
 * `groupId` with only one member (nothing to pair it with) renders as a plain
 * exercise with a small label above it, exactly as before.
 *
 * The set rows, their inputs and their test ids are unchanged: a cardio
 * exercise asks for duration and distance here exactly as it does in Live,
 * because both render `LiveSetRow` and `LiveSetRow` reads one shared
 * `normalizeTracking`.
 */
export function TrackWorkoutView({
  exercises,
  grid,
  groupType,
  round,
  totalRounds,
  onRoundChange,
  onSetChange,
  onRequestSwap,
  weightUnit = DEFAULT_LOAD_UNIT,
  bellChoices,
  rememberedBells,
  onBellChoice,
  notes,
  onNotesChange,
  showNotes,
  exerciseHints,
  onDismissHint,
  onExerciseChange,
  testID,
}: TrackWorkoutViewProps) {
  const { colors } = useThemeTokens();
  // Collapsed state is opt-IN per slug: absent (the common case) means open,
  // so every existing caller that never taps a header still sees every set —
  // only NP-287's new chevron can close one.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleCollapsed = (slug: string) =>
    setCollapsed((prev) => ({ ...prev, [slug]: !prev[slug] }));
  // The sec/min unit per exercise — the web's `durationUnits[exerciseIndex]`,
  // owned here so the header toggle and every row of the exercise agree.
  const [durationUnits, setDurationUnits] = useState<Record<string, DurationUnit>>({});
  const durationUnitFor = (ex: LiveWorkoutExercise): DurationUnit =>
    durationUnits[ex.slug] ?? defaultDurationUnit(ex.trackingType);

  const canRemove = canRemoveExercise(exercises);

  const emitChange = (res: { exercises: LiveWorkoutExercise[]; order: number[] }) => {
    onExerciseChange?.({ exercises: res.exercises, order: res.order });
  };

  const handleMove = (idx: number, direction: -1 | 1) => {
    emitChange(moveExercise(exercises, idx, idx + direction));
  };
  const handleRemove = (idx: number) => {
    if (!canRemoveExercise(exercises)) return;
    emitChange(removeExercise(exercises, idx));
  };
  const handleUngroup = (idx: number) => {
    emitChange(ungroupAt(exercises, idx));
  };
  /**
   * Superset it with the next exercise, or break the group — the web's
   * header `toggleGroupAt` (NP-287 parity): ungroup when the exercise is
   * already grouped, otherwise group it with the one right after it. Same
   * rule `WorkoutExerciseList`'s manage sheet uses, now reachable from the
   * Track card itself so a member never has to leave it to build a superset.
   */
  const handleToggleGroup = (idx: number) => {
    const ex = exercises[idx];
    if (!ex) return;
    if (ex.groupId) {
      emitChange(ungroupAt(exercises, idx));
      return;
    }
    if (idx + 1 >= exercises.length) return;
    emitChange(groupIndexes(exercises, [idx, idx + 1], "superset"));
  };

  const renderHint = (slug: string) => {
    const hint = exerciseHints?.[slug.toLowerCase()];
    if (!hint) return null;
    return (
      <ExerciseHint
        hint={hint}
        exerciseSlug={slug}
        onDismiss={() => onDismissHint?.(slug.toLowerCase())}
        testID={`${testID}-${slug}-hint`}
      />
    );
  };

  /**
   * ONE DUMBBELL OR TWO for this exercise — the web's Track control, asked
   * once per exercise (never per set: the choice belongs to the exercise, and
   * every set of it saves the same answer) and defaulted to the automatic
   * answer, so leaving it alone changes nothing. The copy under it is the
   * web's, and its tail follows the choice: a pair has a combined total worth
   * disowning, one implement does not.
   *
   * Renders nothing without `onBellChoice`, and nothing on an exercise with no
   * weight box or no implement to count.
   */
  const renderBellChoice = (ex: LiveWorkoutExercise, withHint = true) => {
    if (!setInputsFor(ex.trackingType).weight) return null;
    const info = getBellWeightInfo(ex);
    if (!info.style) return null;
    const bells = bellCountFor(ex, bellChoices, rememberedBells);
    const implement = info.style === "dumbbell" ? "dumbbell" : "kettlebell";
    if (!withHint) return null;
    return (
      <View style={{ gap: 6, marginBottom: 8 }}>
        <Text
          testID={`${testID}-${ex.slug}-bell-hint`}
          className="text-muted-foreground text-xs"
        >
          {`Enter the weight of one ${implement}${
            showsBellTotal(info, bells) ? " — not the combined total." : "."
          }`}
        </Text>
      </View>
    );
  };

  /** The accordion card for one ungrouped exercise (or a lone `groupId` with no partner). */
  const renderExerciseCard = (ex: LiveWorkoutExercise, exIdx: number) => {
    const sets = grid[ex.slug] ?? [];
    const bell = getBellWeightInfo(ex);
    const totalCount = sets.length;
    const doneCount = sets.filter((s) => s.completed).length;
    const allDone = totalCount > 0 && doneCount === totalCount;
    const pct = completionPercent(doneCount, totalCount);
    const isCollapsed = !!collapsed[ex.slug];
    const numSets = ex.sets || 3;
    const isTimed = tracksTime(ex.trackingType);
    const unit = isTimed
      ? (numSets === 1 ? "round" : "rounds")
      : (numSets === 1 && ex.sets === 1 ? "sets" : numSets === 1 ? "set" : "sets");
    // The web's header meta: "3 sets × 8-12" — the count, the unit, and the
    // prescription when the exercise names one.
    const metaParts = [
      ex.repsLabel ? `${numSets} ${unit} × ${ex.repsLabel}` : `${numSets} ${unit}`,
      ex.difficulty ? capitalize(ex.difficulty) : null,
    ].filter(Boolean);
    // The web-Track table columns for this exercise, from its own tracking
    // type — the header row and every set row are built from the same list
    // so the labels sit exactly over the boxes they name.
    const tableInputs = setInputsFor(ex.trackingType);
    const durationUnit = durationUnitFor(ex);

    return (
      <View
        key={ex.slug}
        testID={`${testID}-exercise-${ex.slug}`}
        className={`bg-card rounded-2xl border p-4 ${
          allDone ? "border-green-400 dark:border-green-700" : "border-border"
        }`}
      >
        <Pressable
          testID={`${testID}-exercise-${ex.slug}-header`}
          onPress={() => toggleCollapsed(ex.slug)}
          accessibilityRole="button"
          accessibilityLabel={`${isCollapsed ? "Expand" : "Collapse"} ${ex.name}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
        >
          <View
            testID={`${testID}-exercise-${ex.slug}-badge`}
            className={`h-9 w-9 rounded-full items-center justify-center ${
              allDone ? "bg-green-500" : "bg-zinc-100 dark:bg-zinc-800"
            }`}
          >
            <Text
              className={`${
                allDone ? "text-white" : "text-zinc-700 dark:text-zinc-300"
              } text-sm font-bold`}
            >
              {allDone ? "✓" : exIdx + 1}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text className="text-foreground text-base font-semibold">{ex.name}</Text>
            <Text
              testID={`${testID}-exercise-${ex.slug}-meta`}
              className="text-muted-foreground text-xs"
            >
              {metaParts.join(" · ")}
            </Text>
            {ex.primaryMuscles && ex.primaryMuscles.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                {ex.primaryMuscles.slice(0, 4).map((m) => (
                  <View
                    key={m}
                    testID={`${testID}-exercise-${ex.slug}-muscle-${m}`}
                    className="rounded-full bg-muted px-2 py-0.5"
                  >
                    <Text className="text-muted-foreground text-[10px] font-medium">
                      {m.replace(/_/g, " ")}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {onExerciseChange && (ex.groupId || exIdx + 1 < exercises.length) ? (
              <Pressable
                testID={`${testID}-exercise-${ex.slug}-group-toggle`}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  handleToggleGroup(exIdx);
                }}
                accessibilityRole="button"
                accessibilityLabel={
                  ex.groupId
                    ? `Ungroup ${ex.name}`
                    : `Superset ${ex.name} with the next exercise`
                }
                hitSlop={hitSlopToMinTarget(28, 28)}
                className={`h-7 w-7 rounded-full items-center justify-center ${
                  ex.groupId
                    ? "bg-purple-100 dark:bg-purple-900/30"
                    : "bg-zinc-100 dark:bg-zinc-800"
                }`}
              >
                {ex.groupId ? (
                  <Unlink size={14} color={colors.primary} />
                ) : (
                  <Layers size={14} color={colors["muted-foreground"]} />
                )}
              </Pressable>
            ) : null}
            <Pressable
              testID={`${testID}-exercise-${ex.slug}-swap`}
              onPress={() => onRequestSwap?.(ex.slug)}
              accessibilityRole="button"
              accessibilityLabel={`Swap ${ex.name}`}
              hitSlop={hitSlopToMinTarget(28, 28)}
              className="h-7 w-7 rounded-full bg-zinc-100 dark:bg-zinc-800 items-center justify-center"
            >
              <ArrowUpDown size={14} color={colors["muted-foreground"]} />
            </Pressable>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <View
                testID={`${testID}-exercise-${ex.slug}-progress`}
                className="h-1.5 w-14 overflow-hidden rounded-full bg-muted"
              >
                <View
                  style={{ width: `${pct}%` }}
                  className="h-full rounded-full bg-green-500"
                />
              </View>
              <ChevronDown
                size={18}
                color={colors["muted-foreground"]}
                style={{ transform: [{ rotate: isCollapsed ? "-90deg" : "0deg" }] }}
              />
            </View>
          </View>
        </Pressable>

        {!isCollapsed ? (
          <View style={{ marginTop: 12 }}>
            <FramedVideo
              src={ex.videoUrl}
              surface="form"
              exerciseName={ex.name}
              videoWidth={ex.videoWidth}
              videoHeight={ex.videoHeight}
              videoFraming={ex.videoFraming}
              videoTrim={ex.videoTrim}
              testID={`${testID}-${ex.slug}-video`}
              className="mb-3"
            />
            {ex.notes ? (
              <Text
                testID={`${testID}-${ex.slug}-notes`}
                className="text-blue-600 dark:text-blue-400 text-xs mb-2"
              >
                {ex.notes}
              </Text>
            ) : null}
            {renderHint(ex.slug)}
            {renderBellChoice(ex)}
            {/* The web's table header row above the set grid — one muted
                uppercase cell per column the exercise asks for, over the
                boxes they name, so SET never sits over a Time box. */}
            <View
              testID={`${testID}-${ex.slug}-set-table-header`}
              style={{ flexDirection: "row", alignItems: "center" }}
              className="gap-2 mb-1"
            >
              <Text className="w-8 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {isTimed ? "Round" : "Set"}
              </Text>
              {tableInputs.weight ? (
                <Text className="flex-1 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {bell.style === "dumbbell"
                    ? "Wt/DB"
                    : bell.style === "kettlebell"
                      ? "Wt/KB"
                      : "Weight"}
                </Text>
              ) : null}
              {tableInputs.reps && !isTimed ? (
                <Text className="flex-1 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Reps
                </Text>
              ) : null}
              {tableInputs.duration ? (
                <View className="flex-1 flex-row items-center justify-center">
                  <Text className="text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    {durationUnit === "sec" ? "Sec" : "Min"}
                  </Text>
                  <Pressable
                    testID={`${testID}-${ex.slug}-duration-toggle`}
                    onPress={() =>
                      setDurationUnits((prev) => ({
                        ...prev,
                        [ex.slug]: durationUnit === "sec" ? "min" : "sec",
                      }))
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Show duration in ${durationUnit === "sec" ? "minutes" : "seconds"}`}
                    hitSlop={hitSlopToMinTarget(40, 20)}
                    className="rounded-full bg-muted px-2 py-0.5 ml-1"
                  >
                    <Text className="text-muted-foreground text-[10px] font-semibold">
                      {durationUnit === "sec" ? "min" : "sec"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              {tableInputs.distance ? (
                <Text className="flex-1 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {isFloorsExercise(ex.name) ? "Floors" : "Dist (m)"}
                </Text>
              ) : null}
              {tableInputs.speed ? (
                <Text className="flex-1 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  mph
                </Text>
              ) : null}
              <Text className="w-12 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Done
              </Text>
            </View>
            {sets.map((s, i) => (
              <LiveSetRow
                key={i}
                setIndex={i}
                bell={bell}
                bells={bellCountFor(ex, bellChoices, rememberedBells)}
                weightUnit={weightUnit}
                exerciseName={ex.name}
                equipment={ex.equipment}
                track
                targetReps={ex.repsLabel}
                targetDuration={ex.durationLabel}
                state={s}
                prefill={ex.prefill?.[i] ?? null}
                trackingType={ex.trackingType}
                durationUnit={durationUnit}
                onDurationUnitChange={(next) =>
                  setDurationUnits((prev) => ({ ...prev, [ex.slug]: next }))
                }
                testID={`${testID}-${ex.slug}-set-${i}`}
                onChange={(next) => onSetChange(exIdx, i, next)}
              />
            ))}
            {onExerciseChange ? (
              <View
                style={{ flexDirection: "row", gap: 8, marginTop: 10 }}
                className="border-t border-border pt-3"
              >
                <Pressable
                  testID={`${testID}-exercise-${ex.slug}-move-up`}
                  disabled={exIdx === 0}
                  onPress={() => handleMove(exIdx, -1)}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${ex.name} up`}
                  style={{ opacity: exIdx === 0 ? 0.3 : 1 }}
                >
                  <Text className="text-muted-foreground text-xs font-semibold">
                    ↑ Move up
                  </Text>
                </Pressable>
                <Pressable
                  testID={`${testID}-exercise-${ex.slug}-move-down`}
                  disabled={exIdx === exercises.length - 1}
                  onPress={() => handleMove(exIdx, 1)}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${ex.name} down`}
                  style={{ opacity: exIdx === exercises.length - 1 ? 0.3 : 1 }}
                >
                  <Text className="text-muted-foreground text-xs font-semibold">
                    ↓ Move down
                  </Text>
                </Pressable>
                <View style={{ flex: 1 }} />
                <Pressable
                  testID={`${testID}-exercise-${ex.slug}-remove`}
                  disabled={!canRemove}
                  onPress={() => handleRemove(exIdx)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${ex.name}`}
                  style={{ opacity: canRemove ? 1 : 0.3 }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Trash2 size={14} color={colors.destructive} />
                    <Text className="text-destructive text-xs font-semibold">
                      Remove
                    </Text>
                  </View>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  /** The round-by-round block for a real group (2+ members sharing a groupId). */
  const renderGroupBlock = (
    groupId: string,
    members: { ex: LiveWorkoutExercise; exIdx: number }[],
  ) => {
    const head = members[0]!.ex;
    const style = GROUP_BLOCK_STYLES[head.groupType ?? "superset"] ?? GROUP_BLOCK_STYLES.superset!;
    const maxRounds = Math.max(
      head.groupRounds ?? 0,
      ...members.map(({ ex }) => ex.sets || 0),
    );
    const rounds = maxRounds > 0 ? maxRounds : 1;

    let completed = 0;
    let total = 0;
    for (const { ex } of members) {
      const sets = grid[ex.slug] ?? [];
      total += sets.length;
      completed += sets.filter((s) => s.completed).length;
    }
    const groupPct = completionPercent(completed, total);

    return (
      <View
        key={groupId}
        testID={`${testID}-group-${groupId}-block`}
        className={`rounded-2xl p-4 ${style.container}`}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* The web's header: a purple icon pill, the bold group name, the
              muted member/rest description, an Ungroup pill, the block's own
              progress bar and %. */}
          <View
            testID={`${testID}-group-${groupId}-badge`}
            className={`h-7 w-7 rounded-lg items-center justify-center ${style.badge}`}
          >
            <Layers size={14} color={colors["primary-foreground"]} />
          </View>
          <Text
            testID={`${testID}-group-${groupId}`}
            className="text-foreground text-sm font-bold"
          >
            {head.groupLabel ?? groupId}
          </Text>
          <Text
            testID={`${testID}-group-${groupId}-subtitle`}
            className="text-muted-foreground text-xs"
          >
            {`— ${members.length} exercises${head.groupRest ? `, ${head.groupRest} rest between rounds` : ", minimal rest between exercises"}`}
          </Text>
          <View style={{ flex: 1 }} />
          {onExerciseChange ? (
            <Pressable
              testID={`${testID}-group-${groupId}-ungroup`}
              onPress={() => handleUngroup(members[0]!.exIdx)}
              accessibilityRole="button"
              accessibilityLabel={`Ungroup ${head.groupLabel ?? groupId}`}
              hitSlop={hitSlopToMinTarget(28, 20)}
              className="flex-row items-center rounded-full bg-card border border-border px-2.5 py-1"
            >
              <Unlink size={11} color={colors["muted-foreground"]} />
              <Text className="text-xs font-semibold text-foreground"> Ungroup</Text>
            </Pressable>
          ) : null}
          <View className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
            <View
              style={{ width: `${groupPct}%` }}
              className="h-full rounded-full bg-green-500"
            />
          </View>
          <Text
            testID={`${testID}-group-${groupId}-percent`}
            className="text-muted-foreground text-xs font-medium"
          >
            {`${groupPct}%`}
          </Text>
        </View>

        {/* ROUND 1, ROUND 2, … — every member's set for that round, together. */}
        <View style={{ marginTop: 10, gap: 8 }}>
          {Array.from({ length: rounds }, (_, r) => (
            <View
              key={r}
              testID={`${testID}-group-${groupId}-round-${r + 1}`}
              className="rounded-xl border border-border bg-background/60 p-3"
            >
              <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-2">
                {`Round ${r + 1}`}
              </Text>
              <View style={{ gap: 8 }}>
                {members.map(({ ex, exIdx }) => {
                  const sets = grid[ex.slug] ?? [];
                  const s = sets[r];
                  if (!s) return null;
                  const bell = getBellWeightInfo(ex);
                  // The web's round row: the bold name on top with a trash
                  // icon, a swap icon and the muted prescription target on
                  // the right, then the weight/reps inputs side by side.
                  const roundTarget = ex.repsLabel ?? ex.durationLabel ?? "";
                  return (
                    <View
                      key={ex.slug}
                      // Each member is named by its slug once: on its round-1 card
                      // (the web's grouped Track has no separate per-member block).
                      testID={r === 0 ? `${testID}-exercise-${ex.slug}` : undefined}
                      className="rounded-lg border border-border bg-card p-2"
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 4,
                        }}
                      >
                        <Text
                          style={{ flex: 1 }}
                          numberOfLines={1}
                          className="text-foreground text-sm font-semibold"
                        >
                          {ex.name}
                        </Text>
                        {r === 0 && onExerciseChange ? (
                          <Pressable
                            testID={`${testID}-exercise-${ex.slug}-remove`}
                            disabled={!canRemove}
                            onPress={() => handleRemove(exIdx)}
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${ex.name}`}
                            hitSlop={hitSlopToMinTarget(28, 28)}
                            style={{ opacity: canRemove ? 1 : 0.3 }}
                            className="h-7 w-7 rounded-full items-center justify-center"
                          >
                            <Trash2 size={14} color={colors.destructive} />
                          </Pressable>
                        ) : null}
                        <Pressable
                          testID={
                            r === 0
                              ? `${testID}-${ex.slug}-swap`
                              : `${testID}-${ex.slug}-set-${r}-swap`
                          }
                          onPress={() => onRequestSwap?.(ex.slug)}
                          accessibilityRole="button"
                          accessibilityLabel={`Swap ${ex.name}`}
                          hitSlop={hitSlopToMinTarget(28, 28)}
                          className="h-7 w-7 rounded-full bg-zinc-100 dark:bg-zinc-800 items-center justify-center"
                        >
                          <ArrowUpDown size={14} color={colors["muted-foreground"]} />
                        </Pressable>
                        {roundTarget ? (
                          <Text className="text-muted-foreground text-xs">
                            {roundTarget}
                          </Text>
                        ) : null}
                      </View>
                      {/* Asked once per exercise (round 1) rather than per
                          round — the choice is the exercise's, and every round
                          of it saves the same answer. */}
                      {r === 0 ? renderBellChoice(ex, false) : null}
                      <LiveSetRow
                        compact
                        track
                        setIndex={r}
                        bell={bell}
                        bells={bellCountFor(ex, bellChoices, rememberedBells)}
                        weightUnit={weightUnit}
                        exerciseName={ex.name}
                        equipment={ex.equipment}
                        targetReps={ex.repsLabel}
                        targetDuration={ex.durationLabel}
                        state={s}
                        prefill={ex.prefill?.[r] ?? null}
                        trackingType={ex.trackingType}
                        durationUnit={durationUnitFor(ex)}
                        onDurationUnitChange={(next) =>
                          setDurationUnits((prev) => ({ ...prev, [ex.slug]: next }))
                        }
                        testID={`${testID}-${ex.slug}-set-${r}`}
                        onChange={(next) => onSetChange(exIdx, r, next)}
                      />
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View testID={`${testID}-track`} style={{ gap: 12 }}>
      {groupType ? (
        <ExerciseGroupNav
          testID={`${testID}-group-nav`}
          groupType={groupType}
          currentRound={round}
          totalRounds={totalRounds}
          onPrev={() => onRoundChange(Math.max(1, round - 1))}
          onNext={() => onRoundChange(Math.min(totalRounds, round + 1))}
        />
      ) : null}

      {exercises.map((ex, exIdx) => {
        const prevGroup = exercises[exIdx - 1]?.groupId;
        const isGroupStart = !!ex.groupId && ex.groupId !== prevGroup;
        const isGroupContinuation = !!ex.groupId && ex.groupId === prevGroup;

        // A later member of a block already rendered — skip it here.
        if (isGroupContinuation) return null;

        if (isGroupStart) {
          const members = exercises
            .map((member, i) => ({ ex: member, exIdx: i }))
            .filter(({ ex: member }) => member.groupId === ex.groupId);

          // A `groupId` with nobody to pair it with (NP-172 can leave one
          // behind) is not a group the web would draw specially — render the
          // small label it always has, then the exercise as a normal card.
          if (members.length <= 1) {
            const groupRoundsForBlock = (() => {
              const maxSets = Math.max(
                ex.groupRounds ?? 0,
                ...members.map((m) => m.ex.sets || 0),
              );
              return maxSets > 0 ? maxSets : members.length > 0 ? 1 : 0;
            })();
            return (
              <View key={ex.slug}>
                <View
                  testID={`${testID}-group-${ex.groupId}-header`}
                  style={{ gap: 4, marginTop: 8 }}
                >
                  <Text
                    testID={`${testID}-group-${ex.groupId}`}
                    className="text-primary text-sm font-semibold"
                  >
                    {ex.groupLabel ?? ex.groupId}
                  </Text>
                  {groupRoundsForBlock > 1 ? (
                    <Text
                      testID={`${testID}-group-${ex.groupId}-rounds`}
                      className="text-muted-foreground text-xs"
                    >
                      {`Runs as ${groupRoundsForBlock} interleaved rounds`}
                    </Text>
                  ) : null}
                </View>
                {renderExerciseCard(ex, exIdx)}
              </View>
            );
          }

          return renderGroupBlock(ex.groupId!, members);
        }

        return renderExerciseCard(ex, exIdx);
      })}

      {/* Session notes — the web's textarea, which appears once any set is
          done and is saved as `notes` on the workout log. */}
      {showNotes ? (
        <View style={{ marginTop: 8 }}>
          <Input
            testID={`${testID}-notes`}
            label="Session Notes (optional)"
            multiline
            value={notes}
            onChangeText={onNotesChange}
            placeholder="How did it feel? Any PRs, adjustments, or reminders…"
          />
        </View>
      ) : null}
    </View>
  );
}
