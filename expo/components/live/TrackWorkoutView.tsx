import { Pressable, View } from "react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { LiveSetRow, type LiveSetState } from "@/components/live/LiveSetRow";
import { ExerciseHint } from "@/components/live/ExerciseHint";
import {
  ExerciseGroupNav,
  type ExerciseGroupType,
} from "@/components/live/ExerciseGroupNav";
import { FramedVideo } from "@/components/FramedVideo";
import { getBellWeightInfo, type WorkoutStep } from "@become/core";
import type {
  LiveGrid,
  LiveWorkoutExercise,
} from "@/components/live/LiveWorkoutClient";

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
  testID: string;
}

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
  testID,
}: TrackWorkoutViewProps) {
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
        const bell = getBellWeightInfo(ex);
        const sets = grid[ex.slug] ?? [];
        // Render a group header the first time a new groupId appears, so
        // superset/circuit/triset members render contiguously under a label.
        const prevGroup = exercises[exIdx - 1]?.groupId;
        const showGroupHeader = !!ex.groupId && ex.groupId !== prevGroup;
        // The interleaved rounds for this block (NP-172): consecutive rows
        // sharing a groupId run A1 B1 A2 B2 …, so the header names each
        // round and each set row names its round. `flowIndexByKey` is the
        // same `buildWorkoutFlow` the web live view runs, keyed by
        // exercise + set.
        const groupRoundsForBlock = showGroupHeader
          ? (() => {
              const members = exercises.filter(
                (member) => member.groupId === ex.groupId,
              );
              const maxSets = Math.max(
                ex.groupRounds ?? 0,
                ...members.map((member) => member.sets || 0),
              );
              return maxSets > 0 ? maxSets : members.length > 0 ? 1 : 0;
            })()
          : 0;
        return (
          <View key={ex.slug}>
            {showGroupHeader ? (
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
            ) : null}
            <Card
              testID={`${testID}-exercise-${ex.slug}`}
              title={ex.name}
              subtitle={
                ex.repsLabel ? `${ex.sets}×${ex.repsLabel}` : `${ex.sets} sets`
              }
            >
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
              {ex.notes ? (
                <Text
                  testID={`${testID}-${ex.slug}-notes`}
                  className="text-muted-foreground text-xs mb-2"
                >
                  {ex.notes}
                </Text>
              ) : null}
              {/* The web's contextual nudge for THIS exercise
                  (progression / plateau), inside its own card. */}
              {(() => {
                const hint = exerciseHints?.[ex.slug.toLowerCase()];
                if (!hint) return null;
                return (
                  <ExerciseHint
                    hint={hint}
                    exerciseSlug={ex.slug}
                    onDismiss={() => onDismissHint?.(ex.slug.toLowerCase())}
                    testID={`${testID}-${ex.slug}-hint`}
                  />
                );
              })()}
              {sets.map((s, i) => {
                const flowIndex = ex.groupId
                  ? flowIndexByKey.get(`${exIdx}:${i}`)
                  : undefined;
                const flowStep =
                  flowIndex !== undefined ? workoutFlow[flowIndex] : undefined;
                return (
                  <LiveSetRow
                    key={i}
                    setIndex={i}
                    bell={bell}
                    exerciseName={ex.name}
                    equipment={ex.equipment}
                    showQuickPicks
                    state={s}
                    prefill={ex.prefill?.[i] ?? null}
                    trackingType={ex.trackingType}
                    testID={`${testID}-${ex.slug}-set-${i}`}
                    roundLabel={
                      ex.groupId && flowStep
                        ? `Round ${flowStep.roundNumber + 1}`
                        : undefined
                    }
                    onChange={(next) => onSetChange(exIdx, i, next)}
                  />
                );
              })}
              <Pressable
                testID={`${testID}-${ex.slug}-swap`}
                onPress={() => onRequestSwap?.(ex.slug)}
                accessibilityRole="button"
                accessibilityLabel={`Swap ${ex.name}`}
                className="mt-2"
              >
                <Text className="text-primary text-sm">Swap exercise</Text>
              </Pressable>
            </Card>
          </View>
        );
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
