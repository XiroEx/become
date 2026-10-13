/**
 * THE MID-SESSION EXERCISE LIST — add, remove, reorder and group (NP-138).
 *
 * Native port of the exercise-list half of the web live client's
 * `showExerciseList` panel
 * (`webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`,
 * ~l.2080-2199): every row jumps to its exercise, removes it (asking first
 * when sets are logged), and toggles a superset with the next exercise, and
 * the whole list reorders by long-press drag
 * (`react-native-draggable-flatlist`, the phone's `@hello-pangea/dnd`).
 *
 * Rules that travel from the web:
 *  - removing an exercise changes today's session only, never the program
 *    (the caller owns persistence; this only reports the intent);
 *  - the remove confirm only fires when there is logged work to lose — and
 *    only COMPLETED sets count (the inputs come pre-filled with last
 *    session's numbers, and those are a suggestion, not work done today);
 *  - the last exercise stays: a workout with nothing in it is not a workout
 *    (`canRemoveExercise` disables every remove button);
 *  - grouping moves exercises together at the first one's position, so the
 *    flow builder interleaves them (`groupIndexes` / `ungroupAt` from
 *    `@become/core` — the same copy the web runs).
 */

import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { GripVertical, Layers, Trash2, Unlink } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { BottomSheet } from "@/components/BottomSheet";
import { ConfirmModal } from "@/components/workout/ConfirmModal";
import {
  canRemoveExercise,
  groupIndexes,
  moveExercise,
  needsMoreExercises,
  removeExercise,
  ungroupAt,
  type GroupKind,
} from "@become/core";
import type { LiveGrid, LiveWorkoutExercise } from "@/components/live/LiveWorkoutClient";
import type { LiveSetState } from "@/components/live/LiveSetRow";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

export interface WorkoutExerciseChange {
  exercises: LiveWorkoutExercise[];
  /** `order[newIndex] = oldIndex`, or -1 for an exercise that did not exist before. */
  order: number[];
  /** Where the member should land after the change (web parity: stay put). */
  landOn?: number;
}

export interface WorkoutExerciseListProps {
  visible: boolean;
  onClose: () => void;
  exercises: LiveWorkoutExercise[];
  /** The live grid, read to decide whether a removal asks first. */
  grid: LiveGrid;
  /** Index of the exercise the member is standing in, for the "Now" chip. */
  currentExerciseIndex?: number;
  /** Jump to the exercise's first set that still needs doing. */
  onJump: (exerciseIndex: number) => void;
  /** Apply a structural change (the route permutes its grid + swaps + saves). */
  onChange: (change: WorkoutExerciseChange) => void;
  /** Open the add-exercise sheet. */
  onAddExercise: () => void;
  testID?: string;
}

/** Only COMPLETED sets count as logged work when asking before a removal. */
export function exerciseHasLoggedWork(
  grid: LiveGrid,
  slug: string,
): boolean {
  return (grid[slug] ?? []).some((s: LiveSetState) => s.completed);
}

export function WorkoutExerciseList({
  visible,
  onClose,
  exercises,
  grid,
  currentExerciseIndex,
  onJump,
  onChange,
  onAddExercise,
  testID = "workout-exercise-list",
}: WorkoutExerciseListProps) {
  const { colors } = useThemeTokens();
  const [confirmRemoveIdx, setConfirmRemoveIdx] = useState<number | null>(null);
  const canRemove = canRemoveExercise(exercises);
  const shouldNudgeAddExercise = needsMoreExercises(exercises.length);

  const closeConfirm = useCallback(() => setConfirmRemoveIdx(null), []);

  const dropAt = useCallback(
    (idx: number) => {
      if (!canRemoveExercise(exercises)) return;
      const res = removeExercise(exercises, idx);
      setConfirmRemoveIdx(null);
      onChange({ exercises: res.exercises, order: res.order });
    },
    [exercises, onChange],
  );

  const requestRemoveAt = useCallback(
    (idx: number) => {
      const ex = exercises[idx];
      if (!ex) return;
      if (exerciseHasLoggedWork(grid, ex.slug)) setConfirmRemoveIdx(idx);
      else dropAt(idx);
    },
    [exercises, grid, dropAt],
  );

  const toggleGroupAt = useCallback(
    (idx: number) => {
      const ex = exercises[idx];
      if (!ex) return;
      if (ex.groupId) {
        const res = ungroupAt(exercises, idx);
        onChange({ exercises: res.exercises, order: res.order });
        return;
      }
      if (idx + 1 >= exercises.length) return;
      const res = groupIndexes(exercises, [idx, idx + 1], "superset" as GroupKind);
      onChange({ exercises: res.exercises, order: res.order });
    },
    [exercises, onChange],
  );

  const commitDragEnd = useCallback(
    (data: LiveWorkoutExercise[]) => {
      if (data.length !== exercises.length) return;
      const fromSlugs = exercises.map((e) => e.slug);
      const toSlugs = data.map((e) => e.slug);
      if (fromSlugs.join("|") === toSlugs.join("|")) return;
      // The drag already shows the final arrangement; `moveExercise` rebuilds
      // the same permutation through the shared rule (including
      // `sanitizeGroups`, which settles a group the drag split apart) and
      // reports the `order` the grid and the swap trail have to follow.
      // Recompute through the pure move so a split group dissolves the same
      // way it does on the web: find the single exercise that changed place.
      let changedFrom = -1;
      let changedTo = -1;
      for (let i = 0; i < fromSlugs.length; i++) {
        if (fromSlugs[i] !== toSlugs[i]) {
          if (changedFrom === -1) changedFrom = fromSlugs.indexOf(toSlugs[i]!);
          changedTo = i;
        }
      }
      if (changedFrom === -1) return;
      const res = moveExercise(exercises, changedFrom, changedTo);
      onChange({ exercises: res.exercises, order: res.order });
    },
    [exercises, onChange],
  );

  const renderItem = useCallback(
    ({
      item: exercise,
      getIndex,
      drag,
      isActive,
    }: RenderItemParams<LiveWorkoutExercise>) => {
    const idx = getIndex() ?? exercises.findIndex((e) => e.slug === exercise.slug);
    const done = (grid[exercise.slug] ?? []).length > 0 &&
      (grid[exercise.slug] ?? []).every((s) => s.completed);
    const isCurrent = idx === currentExerciseIndex;
    return (
      <ScaleDecorator>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingVertical: 6,
            paddingHorizontal: 4,
            borderRadius: 12,
            backgroundColor: isActive ? colors.muted : "transparent",
            opacity: isActive ? 0.85 : 1,
          }}
        >
          <Pressable
            testID={`${testID}-drag-handle-${idx}`}
            onLongPress={drag}
            delayLongPress={120}
            accessibilityRole="button"
            accessibilityLabel={`Reorder ${exercise.name}`}
            accessibilityHint="Long press and drag to reorder"
            style={[minTouchTarget, { alignItems: "center", justifyContent: "center" }]}
          >
            <GripVertical size={18} color={colors["muted-foreground"]} />
          </Pressable>
          <Pressable
            testID={`${testID}-row-${idx}`}
            onPress={() => onJump(idx)}
            onLongPress={drag}
            delayLongPress={400}
            accessibilityRole="button"
            accessibilityLabel={`${idx + 1}. ${exercise.name}${done ? ", completed" : ""}${isCurrent ? ", current" : ""}`}
            style={{ flex: 1, paddingVertical: 6 }}
          >
            <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
              {`${idx + 1}. ${exercise.name}`}
            </Text>
            <Text className="text-muted-foreground text-xs" numberOfLines={1}>
              {`${exercise.sets} ${exercise.repsLabel ? `× ${exercise.repsLabel}` : "sets"}`}
              {exercise.groupId ? ` · ${exercise.groupLabel || "Superset"}` : ""}
              {done ? " ✓" : ""}
              {isCurrent ? " · Now" : ""}
            </Text>
          </Pressable>
          {isCurrent && !done ? (
            <Text className="text-primary text-[10px] font-semibold uppercase">
              Now
            </Text>
          ) : null}
          {exercise.groupId || idx + 1 < exercises.length ? (
            <Pressable
              testID={`${testID}-group-toggle-${idx}`}
              onPress={() => toggleGroupAt(idx)}
              accessibilityRole="button"
              accessibilityLabel={exercise.groupId ? `Ungroup ${exercise.name}` : `Superset ${exercise.name} with the next exercise`}
              style={[minTouchTarget, { alignItems: "center", justifyContent: "center" }]}
            >
              {exercise.groupId ? (
                <Unlink size={16} color={colors.primary} />
              ) : (
                <Layers size={16} color={colors["muted-foreground"]} />
              )}
            </Pressable>
          ) : null}
          <Pressable
            testID={`${testID}-remove-${idx}`}
            onPress={() => requestRemoveAt(idx)}
            disabled={!canRemove}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${exercise.name}`}
            style={[minTouchTarget, { alignItems: "center", justifyContent: "center", opacity: canRemove ? 1 : 0.25 }]}
          >
            <Trash2 size={16} color={colors["muted-foreground"]} />
          </Pressable>
        </View>
      </ScaleDecorator>
    );
  },
    [colors, currentExerciseIndex, exercises, grid, canRemove, requestRemoveAt, toggleGroupAt, onJump, testID],
  );

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={onClose}
        title="Exercises"
        testID={testID}
      >
        <Text
          testID={`${testID}-hint`}
          className="text-muted-foreground text-xs mb-2"
        >
          Tap to jump · hold to move
        </Text>
        <DraggableFlatList
          data={exercises}
          keyExtractor={(item: LiveWorkoutExercise) => item.slug}
          onDragEnd={({ data }: { data: LiveWorkoutExercise[] }) => commitDragEnd(data)}
          onPlaceholderIndexChange={() => {}}
          renderItem={renderItem}
          scrollEnabled={false}
        />
        <View style={{ marginTop: 8 }}>
          <Button
            testID={`${testID}-add`}
            variant={shouldNudgeAddExercise ? "primary" : "secondary"}
            onPress={onAddExercise}
            accessibilityLabel="Add exercise"
            accessibilityHint={
              shouldNudgeAddExercise
                ? `Only ${exercises.length} exercises — most sessions run 4 or more`
                : undefined
            }
          >
            {`＋ Add exercise${shouldNudgeAddExercise ? ` (${exercises.length}/4)` : ""}`}
          </Button>
        </View>
      </BottomSheet>
      <ConfirmModal
        open={confirmRemoveIdx !== null}
        destructive
        title={`Remove ${confirmRemoveIdx !== null ? (exercises[confirmRemoveIdx]?.name ?? "this exercise") : ""}?`}
        body="You have already logged sets against it. They go with it."
        confirmLabel="Remove it"
        cancelLabel="Keep it"
        onConfirm={() => {
          if (confirmRemoveIdx !== null) dropAt(confirmRemoveIdx);
        }}
        onCancel={closeConfirm}
        testID={`${testID}-remove-confirm`}
      />
    </>
  );
}
