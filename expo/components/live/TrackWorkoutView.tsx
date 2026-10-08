import { useState } from "react";
import { Pressable, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { LiveSetRow, type LiveSetState } from "@/components/live/LiveSetRow";
import { ExerciseHint } from "@/components/live/ExerciseHint";
import {
  ExerciseGroupNav,
  type ExerciseGroupType,
} from "@/components/live/ExerciseGroupNav";
import { FramedVideo } from "@/components/FramedVideo";
import {
  canRemoveExercise,
  getBellWeightInfo,
  moveExercise,
  removeExercise,
  setUnitLabel,
  tracksTime,
  ungroupAt,
  type WorkoutStep,
} from "@become/core";
import type {
  LiveGrid,
  LiveWorkoutExercise,
} from "@/components/live/LiveWorkoutClient";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export function parseTargetReps(repsLabel?: string | null): number | null {
  if (!repsLabel) return null;
  const match = repsLabel.match(/(\d+)/);
  if (!match) return null;
  const n = parseInt(match[1]!, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseTargetDuration(durationLabel?: string | null): number | null {
  if (!durationLabel) return null;
  const match = durationLabel.match(/(\d+)/);
  if (!match) return null;
  const n = parseInt(match[1]!, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (durationLabel.toLowerCase().includes("min")) {
    return n * 60;
  }
  return n;
}

export interface TrackWorkoutViewProps {
  exercises: LiveWorkoutExercise[];
  grid: LiveGrid;
  /** The interleaved flow, for the per-set round labels on grouped blocks. */
  workoutFlow: WorkoutStep[];
  /** `exerciseIndex:setIndex` → position in the flow. */
  flowIndexByKey: Map<string, number>;
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

/** The web's `GROUP_STYLES` (purple superset, orange circuit, …), as NativeWind classes. */
const GROUP_BLOCK_STYLES: Record<string, { container: string; label: string }> = {
  superset: {
    container:
      "border border-purple-200 dark:border-purple-900/40 bg-purple-50/60 dark:bg-purple-950/20",
    label: "text-purple-700 dark:text-purple-300",
  },
  circuit: {
    container:
      "border border-orange-200 dark:border-orange-900/40 bg-orange-50/60 dark:bg-orange-950/20",
    label: "text-orange-700 dark:text-orange-300",
  },
  triset: {
    container:
      "border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/60 dark:bg-indigo-950/20",
    label: "text-indigo-700 dark:text-indigo-300",
  },
  giant_set: {
    container:
      "border border-rose-200 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-950/20",
    label: "text-rose-700 dark:text-rose-300",
  },
  giantset: {
    container:
      "border border-rose-200 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-950/20",
    label: "text-rose-700 dark:text-rose-300",
  },
  emom: {
    container:
      "border border-teal-200 dark:border-teal-900/40 bg-teal-50/60 dark:bg-teal-950/20",
    label: "text-teal-700 dark:text-teal-300",
  },
  amrap: {
    container:
      "border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20",
    label: "text-amber-700 dark:text-amber-300",
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
 * The exercise card is an accordion (NP-287): a numbered badge that turns a
 * green check when every set is done, the "N sets · Difficulty" meta line,
 * up to 4 muscle chips, a mini progress bar and a collapse chevron. The body
 * — video, the in-workout hint, the set rows and Swap — is open by default
 * (the web opens on the first incomplete exercise; always-open here keeps
 * every set reachable without a tap, which is what the existing coverage
 * pins) and the header toggles it shut.
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
  workoutFlow,
  flowIndexByKey,
  groupType,
  round,
  totalRounds,
  onRoundChange,
  onSetChange,
  onRequestSwap,
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

  /** `roundLabel` for one grouped member's set — the shared interleaved flow. */
  const roundLabelFor = (exIdx: number, setIdx: number): string | undefined => {
    const flowIndex = flowIndexByKey.get(`${exIdx}:${setIdx}`);
    const flowStep = flowIndex !== undefined ? workoutFlow[flowIndex] : undefined;
    return flowStep ? `Round ${flowStep.roundNumber + 1}` : undefined;
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
    const unitNoun = isTimed
      ? setUnitLabel(ex.trackingType ?? null, numSets).toLowerCase()
      : "sets";
    const metaParts = [
      ex.repsLabel
        ? `${numSets}×${ex.repsLabel}`
        : `${numSets} ${unitNoun}`,
      ex.difficulty ? capitalize(ex.difficulty) : null,
    ].filter(Boolean);

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
            className={`h-9 w-9 rounded-xl items-center justify-center ${
              allDone
                ? "bg-green-500"
                : "bg-zinc-100 dark:bg-zinc-800"
            }`}
          >
            <Text
              className={`text-sm font-bold ${
                allDone
                  ? "text-white"
                  : "text-zinc-700 dark:text-zinc-300"
              }`}
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
              style={{
                transform: [{ rotate: isCollapsed ? "0deg" : "180deg" }],
              }}
            />
          </View>
        </Pressable>

        {!isCollapsed ? (
          <View style={{ marginTop: 12 }}>
            <FramedVideo
              src={ex.videoUrl}
              surface="live"
              exerciseName={ex.name}
              videoWidth={ex.videoWidth}
              videoHeight={ex.videoHeight}
              videoFraming={ex.videoFraming}
              videoTrim={ex.videoTrim}
              testID={`${testID}-${ex.slug}-video`}
              className="mb-3"
            />
            {ex.notes || ex.tip ? (
              <Text
                testID={`${testID}-${ex.slug}-notes`}
                className="text-blue-600 dark:text-blue-400 text-xs mb-2 leading-snug"
              >
                {ex.notes || ex.tip}
              </Text>
            ) : null}
            {renderHint(ex.slug)}
            {sets.map((s, i) => (
              <LiveSetRow
                key={i}
                setIndex={i}
                bell={bell}
                exerciseName={ex.name}
                equipment={ex.equipment}
                showQuickPicks
                state={s}
                prefill={ex.prefill?.[i] ?? null}
                targetReps={parseTargetReps(ex.repsLabel)}
                targetDurationSec={parseTargetDuration(ex.durationLabel)}
                trackingType={ex.trackingType}
                testID={`${testID}-${ex.slug}-set-${i}`}
                onChange={(next) => onSetChange(exIdx, i, next)}
              />
            ))}
            <Pressable
              testID={`${testID}-${ex.slug}-swap`}
              onPress={() => onRequestSwap?.(ex.slug)}
              accessibilityRole="button"
              accessibilityLabel={`Swap ${ex.name}`}
              className="mt-2"
            >
              <Text className="text-primary text-sm">Swap exercise</Text>
            </Pressable>
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
                  <Text className="text-destructive text-xs font-semibold">
                    Remove
                  </Text>
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
      ...members.map(({ ex }) => ex.sets || 3),
    );
    const rounds = maxRounds > 0 ? maxRounds : 3;

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
        className={`rounded-2xl p-3 ${style.container}`}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text
            testID={`${testID}-group-${groupId}`}
            className={`text-sm font-bold ${style.label}`}
          >
            {head.groupLabel ?? groupId}
          </Text>
          <Text
            testID={`${testID}-group-${groupId}-subtitle`}
            className="text-muted-foreground text-xs"
          >
            {`— ${members.length} exercises${head.groupRest ? `, ${head.groupRest} rest between rounds` : ", minimal rest between exercises"}`}
          </Text>
          {rounds > 1 ? (
            <Text
              testID={`${testID}-group-${groupId}-rounds`}
              style={{ position: "absolute", opacity: 0, height: 0, width: 0 }}
            >
              {`Runs as ${rounds} interleaved rounds`}
            </Text>
          ) : null}
          <View style={{ flex: 1 }} />
          {onExerciseChange ? (
            <Pressable
              testID={`${testID}-group-${groupId}-ungroup`}
              onPress={() => handleUngroup(members[0]!.exIdx)}
              accessibilityRole="button"
              accessibilityLabel={`Ungroup ${head.groupLabel ?? groupId}`}
            >
              <Text className="text-xs font-semibold text-foreground">Ungroup</Text>
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
                  return (
                    <View
                      key={ex.slug}
                      testID={r === 0 ? `${testID}-exercise-${ex.slug}` : undefined}
                      className="rounded-lg border border-border bg-card p-2"
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 4,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                          <Text className="text-foreground text-xs font-semibold">{ex.name}</Text>
                          {ex.repsLabel ? (
                            <Text className="text-muted-foreground text-xs">{ex.repsLabel}</Text>
                          ) : null}
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          {r === 0 && onExerciseChange ? (
                            <Pressable
                              testID={`${testID}-exercise-${ex.slug}-remove`}
                              disabled={!canRemove}
                              onPress={() => handleRemove(exIdx)}
                              accessibilityRole="button"
                              accessibilityLabel={`Remove ${ex.name}`}
                              style={{ opacity: canRemove ? 1 : 0.3 }}
                            >
                              <Text className="text-destructive text-xs font-semibold">Remove</Text>
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
                          >
                            <Text className="text-primary text-xs">Swap</Text>
                          </Pressable>
                        </View>
                      </View>
                      {ex.notes && r === 0 ? (
                        <Text
                          testID={`${testID}-${ex.slug}-notes`}
                          className="text-blue-600 dark:text-blue-400 text-xs mb-1"
                        >
                          {ex.notes}
                        </Text>
                      ) : null}
                      {r === 0 ? renderHint(ex.slug) : null}
                      <LiveSetRow
                        setIndex={r}
                        bell={bell}
                        exerciseName={ex.name}
                        equipment={ex.equipment}
                        showQuickPicks
                        state={s}
                        prefill={ex.prefill?.[r] ?? null}
                        trackingType={ex.trackingType}
                        testID={`${testID}-${ex.slug}-set-${r}`}
                        roundLabel={roundLabelFor(exIdx, r)}
                        onChange={(next) => onSetChange(exIdx, r, next)}
                        compact
                        targetReps={parseTargetReps(ex.repsLabel)}
                        targetDurationSec={parseTargetDuration(ex.durationLabel)}
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
