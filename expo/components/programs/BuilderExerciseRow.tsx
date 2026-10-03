import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Link2,
  Trash2,
  Unlink,
} from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import {
  BUILDER_EXERCISE_ROLES,
  BUILDER_GROUP_LABELS,
  BUILDER_GROUP_TYPES,
  BUILDER_PERCENT_1RM_MAX,
  BUILDER_PERCENT_1RM_MIN,
  BUILDER_RPE_MAX,
  BUILDER_RPE_MIN,
  builderExerciseName,
  builderGroupAt,
  parseBuilderGroupRounds,
  parseBuilderPercentOf1RM,
  parseBuilderRpe,
  parseBuilderSets,
  validateBuilderExercise,
  type BuilderExercise,
  type BuilderExerciseRole,
  type BuilderGroupType,
} from "@/lib/programs/programBuilder";
import {
  ExercisePicker,
  type ExercisePickerSelection,
} from "@/components/programs/ExercisePicker";

export interface BuilderExerciseRowProps {
  exercise: BuilderExercise;
  exerciseIndex: number;
  /** Slugs already in this workout, so the picker hides them. */
  excludeSlugs: readonly string[];
  /** True while this row is picked for Combine (the group checkbox). */
  selectedForGroup?: boolean;
  /** Total rows in this workout — move up/down hide at the ends. */
  exerciseCount?: number;
  onChange: (patch: Partial<BuilderExercise>) => void;
  onRemove: () => void;
  /** Toggle this row's Combine checkbox. Absent when grouping is unavailable. */
  onToggleSelect?: () => void;
  /** Move this row one slot. Absent when drag reorder owns the gesture. */
  onMove?: (direction: -1 | 1) => void;
  /** Long-press starts the drag (react-native-draggable-flatlist). */
  onDragStart?: () => void;
  /** True while this row is the one being dragged. */
  dragging?: boolean;
  testID: string;
}

const ROLE_LABELS: Record<BuilderExerciseRole, string> = {
  compound: "Compound",
  secondary: "Secondary",
  accessory: "Accessory",
};

/**
 * ONE EXERCISE ROW (NP-171) with drag reorder and grouping (NP-172).
 *
 * Native counterpart of `webapp/app/dashboard/admin/programs/_editors/
 * ExerciseEditor.tsx`: the picked exercise's name, the prescription the coach
 * writes (sets, reps, rest, tempo, RPE, percent of 1RM, duration), the role
 * and the coach notes — and removal. The picker hands back the catalogue
 * `exerciseSlug` (never a typed name), and RPE / percent of 1RM are refused
 * in the field, before saving, at the model's own bounds.
 *
 * Reorder arrives two ways: the long-press drag handle (which the parent wires
 * to `react-native-draggable-flatlist`) and the up/down buttons (which call
 * `onMove`). Grouping arrives as the Combine checkbox (`onToggleSelect`):
 * the parent collects the picks and stamps the web's own group fields.
 */
export function BuilderExerciseRow({
  exercise,
  exerciseIndex,
  excludeSlugs,
  selectedForGroup = false,
  exerciseCount,
  onChange,
  onRemove,
  onToggleSelect,
  onMove,
  onDragStart,
  dragging = false,
  testID,
}: BuilderExerciseRowProps) {
  const { colors } = useThemeTokens();
  const [expanded, setExpanded] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [rpeText, setRpeText] = useState(
    exercise.rpe === undefined ? "" : String(exercise.rpe),
  );
  const [rpeError, setRpeError] = useState<string | null>(null);
  const [percentText, setPercentText] = useState(
    exercise.percentOf1RM === undefined ? "" : String(exercise.percentOf1RM),
  );
  const [percentError, setPercentError] = useState<string | null>(null);
  const [setsText, setSetsText] = useState(
    exercise.sets === undefined ? "" : String(exercise.sets),
  );
  const [setsError, setSetsError] = useState<string | null>(null);

  const missingSlug = !exercise.exerciseSlug || !exercise.exerciseSlug.trim();
  const rowProblem = validateBuilderExercise(exercise);
  const title = builderExerciseName(exercise);
  const groupBadge = exercise.groupId
    ? (exercise.groupLabel?.trim() ||
        (exercise.groupType
          ? (BUILDER_GROUP_LABELS[exercise.groupType as BuilderGroupType] ??
            exercise.groupType)
          : "Group"))
    : null;
  const canMoveUp = onMove && exerciseIndex > 0;
  const canMoveDown =
    onMove &&
    exerciseCount !== undefined &&
    exerciseIndex < exerciseCount - 1;

  const prescriptionSummary = [
    exercise.sets !== undefined ? `${exercise.sets} sets` : null,
    exercise.reps?.trim() ? `× ${exercise.reps.trim()}` : null,
    exercise.rest?.trim() ? `rest ${exercise.rest.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View
      testID={testID}
      className="border border-border rounded-xl p-3"
      style={{ gap: 8, opacity: dragging ? 0.7 : 1 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        {onDragStart ? (
          <Pressable
            testID={`${testID}-drag-handle`}
            accessibilityRole="button"
            accessibilityLabel={`Reorder ${title}, exercise ${exerciseIndex + 1}. Long press to drag.`}
            onLongPress={onDragStart}
            delayLongPress={100}
            style={[
              minTouchTarget,
              {
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
              },
            ]}
          >
            <GripVertical size={18} color={colors["muted-foreground"]} />
          </Pressable>
        ) : null}
        {onToggleSelect ? (
          <Pressable
            testID={`${testID}-group-select`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selectedForGroup }}
            accessibilityLabel={
              selectedForGroup
                ? `Deselect ${title} from the group selection`
                : `Select ${title} to combine into a superset, circuit, or other group`
            }
            onPress={onToggleSelect}
            style={[
              minTouchTarget,
              {
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                borderWidth: 2,
                borderColor: selectedForGroup
                  ? colors.primary
                  : colors.border,
                backgroundColor: selectedForGroup
                  ? colors.primary
                  : "transparent",
                width: 28,
                height: 28,
              },
            ]}
          >
            {selectedForGroup ? (
              <Text className="text-primary-foreground text-xs font-bold">
                ✓
              </Text>
            ) : null}
          </Pressable>
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            testID={`${testID}-name`}
            className="text-foreground text-sm font-semibold"
          >
            {title}
          </Text>
          {groupBadge ? (
            <Text
              testID={`${testID}-group-badge`}
              className="text-primary text-xs font-semibold"
            >
              {groupBadge}
            </Text>
          ) : null}
          {prescriptionSummary ? (
            <Text
              testID={`${testID}-summary`}
              className="text-muted-foreground text-xs"
            >
              {prescriptionSummary}
            </Text>
          ) : null}
        </View>
        {onMove ? (
          <View style={{ flexDirection: "row", gap: 2 }}>
            <Pressable
              testID={`${testID}-move-up`}
              accessibilityRole="button"
              accessibilityLabel={`Move ${title} up`}
              accessibilityState={{ disabled: !canMoveUp }}
              disabled={!canMoveUp}
              onPress={() => onMove(-1)}
              style={[
                minTouchTarget,
                {
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  backgroundColor: colors.muted,
                  opacity: canMoveUp ? 1 : 0.4,
                },
              ]}
            >
              <ArrowUp size={16} color={colors["muted-foreground"]} />
            </Pressable>
            <Pressable
              testID={`${testID}-move-down`}
              accessibilityRole="button"
              accessibilityLabel={`Move ${title} down`}
              accessibilityState={{ disabled: !canMoveDown }}
              disabled={!canMoveDown}
              onPress={() => onMove(1)}
              style={[
                minTouchTarget,
                {
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  backgroundColor: colors.muted,
                  opacity: canMoveDown ? 1 : 0.4,
                },
              ]}
            >
              <ArrowDown size={16} color={colors["muted-foreground"]} />
            </Pressable>
          </View>
        ) : null}
        <Pressable
          testID={`${testID}-toggle`}
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${title}, exercise ${exerciseIndex + 1}`}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((prev) => !prev)}
          style={[
            minTouchTarget,
            {
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: colors.muted,
            },
          ]}
        >
          {expanded ? (
            <ChevronUp size={18} color={colors["muted-foreground"]} />
          ) : (
            <ChevronDown size={18} color={colors["muted-foreground"]} />
          )}
        </Pressable>
        <Pressable
          testID={`${testID}-remove`}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${title} from this workout`}
          onPress={() => setConfirmRemove(true)}
          style={[
            minTouchTarget,
            {
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
            },
          ]}
        >
          <Trash2 size={16} color={colors.destructive} />
        </Pressable>
      </View>

      {missingSlug ? (
        <Text
          testID={`${testID}-missing-slug`}
          accessibilityRole="alert"
          className="text-destructive text-xs"
        >
          Pick this exercise from the catalogue or your custom exercises so it
          saves with a link.
        </Text>
      ) : null}

      {expanded ? (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-sets`}
                label="Sets"
                placeholder="3"
                keyboardType="number-pad"
                value={setsText}
                error={setsError ?? undefined}
                onChangeText={(text) => {
                  setSetsText(text);
                  const parsed = parseBuilderSets(text);
                  setSetsError(parsed.error ?? null);
                  if (!parsed.error) {
                    onChange(
                      parsed.value === undefined
                        ? { sets: undefined }
                        : { sets: parsed.value },
                    );
                  }
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-reps`}
                label="Reps"
                placeholder="8-10"
                value={exercise.reps ?? ""}
                onChangeText={(text) => onChange({ reps: text })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-rest`}
                label="Rest"
                placeholder="60s"
                value={exercise.rest ?? ""}
                onChangeText={(text) => onChange({ rest: text })}
              />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-tempo`}
                label="Tempo"
                placeholder="3-1-1-0"
                value={exercise.tempo ?? ""}
                onChangeText={(text) => onChange({ tempo: text })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-duration`}
                label="Duration"
                placeholder="30 sec"
                value={exercise.duration ?? ""}
                onChangeText={(text) => onChange({ duration: text })}
              />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-rpe`}
                label={`RPE (${BUILDER_RPE_MIN}–${BUILDER_RPE_MAX})`}
                placeholder="8"
                keyboardType="decimal-pad"
                value={rpeText}
                error={rpeError ?? undefined}
                onChangeText={(text) => {
                  setRpeText(text);
                  const parsed = parseBuilderRpe(text);
                  setRpeError(parsed.error ?? null);
                  if (!parsed.error) {
                    onChange(
                      parsed.value === undefined
                        ? { rpe: undefined }
                        : { rpe: parsed.value },
                    );
                  }
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                testID={`${testID}-percent`}
                label={`% of 1RM (${BUILDER_PERCENT_1RM_MIN}–${BUILDER_PERCENT_1RM_MAX})`}
                placeholder="75"
                keyboardType="decimal-pad"
                value={percentText}
                error={percentError ?? undefined}
                onChangeText={(text) => {
                  setPercentText(text);
                  const parsed = parseBuilderPercentOf1RM(text);
                  setPercentError(parsed.error ?? null);
                  if (!parsed.error) {
                    onChange(
                      parsed.value === undefined
                        ? { percentOf1RM: undefined }
                        : { percentOf1RM: parsed.value },
                    );
                  }
                }}
              />
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Text className="text-foreground text-sm font-medium">Role</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {BUILDER_EXERCISE_ROLES.map((role) => {
                const selected = exercise.role === role;
                return (
                  <Pressable
                    key={role}
                    testID={`${testID}-role-${role}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${ROLE_LABELS[role]} role`}
                    onPress={() =>
                      onChange(
                        selected ? { role: undefined } : { role },
                      )
                    }
                    style={[
                      minTouchTarget,
                      {
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 999,
                        backgroundColor: selected
                          ? colors.primary
                          : colors.muted,
                      },
                    ]}
                  >
                    <Text
                      className={
                        selected
                          ? "text-primary-foreground text-xs font-semibold"
                          : "text-muted-foreground text-xs font-semibold"
                      }
                    >
                      {ROLE_LABELS[role]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Input
            testID={`${testID}-details`}
            label="Coach notes"
            placeholder="e.g. Pause at the bottom"
            value={exercise.details ?? ""}
            onChangeText={(text) => onChange({ details: text })}
            multiline
            numberOfLines={2}
          />

          {rowProblem && !missingSlug ? (
            <Text
              testID={`${testID}-problem`}
              accessibilityRole="alert"
              className="text-destructive text-xs"
            >
              {rowProblem}
            </Text>
          ) : null}
        </View>
      ) : null}

      <Modal
        testID={`${testID}-remove-modal`}
        visible={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Remove this exercise?"
      >
        <Text className="text-muted-foreground text-sm mb-4">
          {`${title} will be removed from this workout. This cannot be undone.`}
        </Text>
        <View style={{ gap: 8 }}>
          <Button
            testID={`${testID}-remove-confirm`}
            variant="destructive"
            onPress={() => {
              setConfirmRemove(false);
              onRemove();
            }}
          >
            Yes, remove it
          </Button>
          <Button
            testID={`${testID}-remove-cancel`}
            variant="ghost"
            onPress={() => setConfirmRemove(false)}
          >
            Keep it
          </Button>
        </View>
      </Modal>
    </View>
  );
}

export interface BuilderWorkoutExercisesProps {
  exercises: BuilderExercise[];
  onAdd: (selection: ExercisePickerSelection) => void;
  onChange: (exerciseIndex: number, patch: Partial<BuilderExercise>) => void;
  onRemove: (exerciseIndex: number) => void;
  /** Reorder rows (drag end or move buttons). Absent while reorder is off. */
  onReorder?: (fromIndex: number, toIndex: number) => void;
  /** Combine the picked rows into a block of this kind. */
  onGroup?: (indexes: number[], groupType: BuilderGroupType) => void;
  /** Break up the block the row belongs to. */
  onUngroup?: (exerciseIndex: number) => void;
  /** Remove one row from its block but keep the block. */
  onRemoveFromGroup?: (exerciseIndex: number) => void;
  /** Patch a block's label, rest and rounds. */
  onUpdateGroup?: (
    exerciseIndex: number,
    patch: Partial<Pick<BuilderExercise, "groupLabel" | "groupRest" | "groupRounds">>,
  ) => void;
  testID: string;
}

/**
 * The rows inside one session, with the picker that adds them (NP-171) plus
 * drag reorder and the group editor (NP-172).
 *
 * Native counterpart of the exercise list in
 * `webapp/app/dashboard/admin/programs/_editors/WorkoutEditor.tsx`: rows drag
 * to reorder (`react-native-draggable-flatlist`, the phone's `@hello-pangea/
 * dnd`), consecutive rows sharing a `groupId` render as one block with its
 * label, rest and rounds, and the Combine flow stamps the web's own group
 * fields so the saved order and the saved block are what the web editor shows
 * and what Live interleaves.
 */
export function BuilderWorkoutExercises({
  exercises,
  onAdd,
  onChange,
  onRemove,
  onReorder,
  onGroup,
  onUngroup,
  onRemoveFromGroup,
  onUpdateGroup,
  testID,
}: BuilderWorkoutExercisesProps) {
  const { colors } = useThemeTokens();
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const excludeSlugs = exercises
    .map((exercise) => exercise.exerciseSlug ?? "")
    .filter(Boolean);

  const toggleSelect = (index: number) => {
    setSelected((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );
  };

  const validSelection = selected.filter(
    (i) => i >= 0 && i < exercises.length,
  );
  const canCombine = validSelection.length >= 2;

  const combine = (groupType: BuilderGroupType) => {
    if (!canCombine) return;
    onGroup?.(validSelection, groupType);
    setSelected([]);
    setShowGroupMenu(false);
  };

  const moveRow = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= exercises.length) return;
    onReorder?.(fromIndex, toIndex);
    // A reorder moves rows under the selection: keep the selection pointing
    // at the same ROWS, not the same slots.
    setSelected((prev) =>
      prev.map((i) => {
        if (i === fromIndex) return toIndex;
        if (direction === 1 && i === toIndex) return fromIndex;
        if (direction === -1 && i === toIndex) return fromIndex;
        return i;
      }),
    );
  };

  const renderRow = (exerciseIndex: number, drag?: () => void, dragging = false) => {
    const exercise = exercises[exerciseIndex];
    if (!exercise) return null;
    return (
      <BuilderExerciseRow
        key={`exercise-${exercise.groupId ?? "solo"}-${exercise.exerciseSlug ?? exercise.name ?? exerciseIndex}-${exerciseIndex}`}
        exercise={exercise}
        exerciseIndex={exerciseIndex}
        excludeSlugs={excludeSlugs.filter((_, index) => index !== exerciseIndex)}
        selectedForGroup={selected.includes(exerciseIndex)}
        exerciseCount={exercises.length}
        onChange={(patch) => onChange(exerciseIndex, patch)}
        onRemove={() => onRemove(exerciseIndex)}
        onToggleSelect={onGroup ? () => toggleSelect(exerciseIndex) : undefined}
        onMove={onReorder ? (direction) => moveRow(exerciseIndex, direction) : undefined}
        onDragStart={drag}
        dragging={dragging}
        testID={`${testID}-exercise-${exerciseIndex}`}
      />
    );
  };

  const groupMenu = useMemo(() => {
    if (!showGroupMenu || !canCombine) return null;
    return (
      <View
        testID={`${testID}-group-menu`}
        className="border border-border rounded-xl p-2"
        style={{ gap: 4, backgroundColor: colors.card }}
      >
        {BUILDER_GROUP_TYPES.map((groupType) => (
          <Pressable
            key={groupType}
            testID={`${testID}-group-menu-${groupType}`}
            accessibilityRole="button"
            accessibilityLabel={`Combine ${validSelection.length} exercises into a ${BUILDER_GROUP_LABELS[groupType]}`}
            onPress={() => combine(groupType)}
            style={[
              minTouchTarget,
              {
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 12,
              },
            ]}
          >
            <Link2 size={16} color={colors.primary} />
            <Text className="text-foreground text-sm font-semibold">
              {BUILDER_GROUP_LABELS[groupType]}
            </Text>
          </Pressable>
        ))}
      </View>
    );
    // `combine` reads the current selection; the menu only exists while the
    // selection backing it is on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGroupMenu, canCombine, colors.card, testID]);

  // Consecutive rows sharing a groupId render as one block (the web renders
  // the same runs). Ungrouped rows render alone.
  const blocks: { key: string; indexes: number[]; groupId: string | null }[] = [];
  {
    let i = 0;
    while (i < exercises.length) {
      const groupId = exercises[i]?.groupId ?? null;
      if (groupId) {
        const indexes: number[] = [];
        while (i < exercises.length && exercises[i]?.groupId === groupId) {
          indexes.push(i);
          i += 1;
        }
        blocks.push({ key: `group-${groupId}`, indexes, groupId });
      } else {
        blocks.push({ key: `solo-${i}`, indexes: [i], groupId: null });
        i += 1;
      }
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <Text className="text-foreground text-sm font-medium">
        {exercises.length === 0
          ? "Exercises"
          : `Exercises (${exercises.length})`}
      </Text>
      {onGroup ? (
        <View style={{ gap: 8 }}>
          {exercises.length >= 2 ? (
            <Text className="text-muted-foreground text-xs">
              Select exercises to combine them into a superset, circuit, or
              other group.
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              testID={`${testID}-combine`}
              variant="secondary"
              size="sm"
              disabled={!canCombine}
              accessibilityLabel={
                canCombine
                  ? `Combine ${validSelection.length} selected exercises into a group`
                  : "Select 2 or more exercises to combine them into a group"
              }
              onPress={() => canCombine && setShowGroupMenu((prev) => !prev)}
            >
              {canCombine
                ? `Combine (${validSelection.length})`
                : "Combine"}
            </Button>
            {validSelection.length > 0 ? (
              <Button
                testID={`${testID}-combine-cancel`}
                variant="ghost"
                size="sm"
                onPress={() => {
                  setSelected([]);
                  setShowGroupMenu(false);
                }}
              >
                Cancel
              </Button>
            ) : null}
          </View>
          {validSelection.length > 0 && !canCombine ? (
            <Text className="text-muted-foreground text-xs">
              Select at least one more exercise to create a group.
            </Text>
          ) : null}
          {groupMenu}
        </View>
      ) : null}
      {blocks.map((block) => {
        if (!block.groupId) {
          const index = block.indexes[0] as number;
          return (
            <View key={block.key}>{renderRow(index)}</View>
          );
        }
        const first = exercises[block.indexes[0] as number];
        const group = builderGroupAt(exercises, block.indexes[0] as number);
        const groupLabel =
          first?.groupLabel?.trim() ||
          (first?.groupType
            ? (BUILDER_GROUP_LABELS[first.groupType as BuilderGroupType] ??
              first.groupType)
            : "Group");
        const isEditing = editingGroupId === block.groupId;
        return (
          <View
            key={block.key}
            testID={`${testID}-group-${block.groupId}`}
            className="border border-border rounded-xl p-2"
            style={{ gap: 8, backgroundColor: colors.card }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  testID={`${testID}-group-${block.groupId}-label`}
                  className="text-foreground text-sm font-bold"
                >
                  {groupLabel}
                </Text>
                <Text className="text-muted-foreground text-xs">
                  {block.indexes.length} exercises
                  {first?.groupRest ? ` · ${first.groupRest} rest` : ""}
                  {first?.groupRounds ? ` · ${first.groupRounds} rounds` : ""}
                </Text>
              </View>
              <Pressable
                testID={`${testID}-group-${block.groupId}-edit`}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${groupLabel} settings`}
                onPress={() =>
                  setEditingGroupId((prev) =>
                    prev === block.groupId ? null : block.groupId,
                  )
                }
                style={[
                  minTouchTarget,
                  {
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 12,
                    backgroundColor: colors.muted,
                    paddingHorizontal: 10,
                  },
                ]}
              >
                <Text className="text-muted-foreground text-xs font-semibold">
                  {isEditing ? "Done" : "Edit"}
                </Text>
              </Pressable>
              {onUngroup ? (
                <Pressable
                  testID={`${testID}-group-${block.groupId}-ungroup`}
                  accessibilityRole="button"
                  accessibilityLabel={`Break up ${groupLabel}`}
                  onPress={() => {
                    setEditingGroupId(null);
                    onUngroup(block.indexes[0] as number);
                  }}
                  style={[
                    minTouchTarget,
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      paddingHorizontal: 8,
                    },
                  ]}
                >
                  <Unlink size={14} color={colors["muted-foreground"]} />
                  <Text className="text-muted-foreground text-xs font-semibold">
                    Ungroup
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {isEditing && group ? (
              <BuilderGroupEditor
                group={group}
                onUpdateGroup={(patch) =>
                  onUpdateGroup?.(block.indexes[0] as number, patch)
                }
                onRemoveFromGroup={
                  onRemoveFromGroup
                    ? (index) => onRemoveFromGroup(index)
                    : undefined
                }
                testID={`${testID}-group-${block.groupId}`}
              />
            ) : null}
            <View style={{ gap: 8 }}>
              {block.indexes.map((index) => (
                <View key={`group-row-${index}`}>{renderRow(index)}</View>
              ))}
            </View>
          </View>
        );
      })}
      {picking ? (
        <ExercisePicker
          testID={`${testID}-picker`}
          excludeSlugs={excludeSlugs}
          onSelect={(selection) => {
            setPicking(false);
            onAdd(selection);
          }}
          onClose={() => setPicking(false)}
        />
      ) : (
        <Button
          testID={`${testID}-add`}
          variant="secondary"
          size="sm"
          accessibilityLabel="Add an exercise to this workout"
          onPress={() => setPicking(true)}
        >
          Add exercise
        </Button>
      )}
    </View>
  );
}

interface BuilderGroupEditorProps {
  group: NonNullable<ReturnType<typeof builderGroupAt>>;
  onUpdateGroup: (
    patch: Partial<Pick<BuilderExercise, "groupLabel" | "groupRest" | "groupRounds">>,
  ) => void;
  onRemoveFromGroup?: (exerciseIndex: number) => void;
  testID: string;
}

/**
 * THE GROUP EDITOR (NP-172): a block's label, rest between rounds and rounds,
 * plus removing one row from the block without breaking it up.
 */
export function BuilderGroupEditor({
  group,
  onUpdateGroup,
  onRemoveFromGroup,
  testID,
}: BuilderGroupEditorProps) {
  const { colors } = useThemeTokens();
  const [roundsText, setRoundsText] = useState(
    group.groupRounds === undefined ? "" : String(group.groupRounds),
  );
  const [roundsError, setRoundsError] = useState<string | null>(null);

  return (
    <View
      testID={`${testID}-editor`}
      className="border border-border rounded-xl p-3"
      style={{ gap: 12 }}
    >
      <Input
        testID={`${testID}-editor-label`}
        label="Label"
        placeholder="e.g. Superset"
        value={group.groupLabel ?? ""}
        onChangeText={(text) => onUpdateGroup({ groupLabel: text })}
      />
      <Input
        testID={`${testID}-editor-rest`}
        label="Rest between rounds"
        placeholder="e.g. 90s"
        value={group.groupRest ?? ""}
        onChangeText={(text) => onUpdateGroup({ groupRest: text })}
      />
      <Input
        testID={`${testID}-editor-rounds`}
        label="Rounds"
        placeholder="e.g. 3"
        keyboardType="number-pad"
        value={roundsText}
        error={roundsError ?? undefined}
        onChangeText={(text) => {
          setRoundsText(text);
          const parsed = parseBuilderGroupRounds(text);
          setRoundsError(parsed.error ?? null);
          if (!parsed.error) {
            if (parsed.value === undefined) {
              onUpdateGroup({ groupRounds: undefined as unknown as number });
              // Clearing rounds deletes the field on every member; the editor
              // keeps the blank text rather than re-seeding from the group.
            } else {
              onUpdateGroup({ groupRounds: parsed.value });
            }
          }
        }}
      />
      {onRemoveFromGroup ? (
        <View style={{ gap: 4 }}>
          <Text className="text-foreground text-sm font-medium">
            Exercises in this block
          </Text>
          {group.indexes.map((index) => (
            <View
              key={`ungroup-${index}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text className="text-muted-foreground text-xs" style={{ flex: 1 }}>
                {`Exercise ${index + 1}`}
              </Text>
              <Pressable
                testID={`${testID}-editor-remove-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`Remove exercise ${index + 1} from this block`}
                onPress={() => onRemoveFromGroup(index)}
                style={[
                  minTouchTarget,
                  {
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 12,
                  },
                ]}
              >
                <Unlink size={14} color={colors.destructive} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default BuilderExerciseRow;
