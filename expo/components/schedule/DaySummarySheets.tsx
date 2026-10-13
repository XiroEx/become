import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import {
  WorkoutSummary,
  computeSummaryPRs,
  summaryTotals,
  type WorkoutSummaryExercise,
  type WorkoutSummaryHistoryEntry,
  type WorkoutSummarySet,
} from "@/components/live/WorkoutSummary";
import { inferTracking } from "@become/core";
import type { ScheduledSlot, QuickCalItem } from "@/lib/schedule/slotStatus";
import type {
  ExerciseHistoryEntry,
  QuickSession,
  QuickSessionSet,
  StoredWorkoutExercise,
  StoredWorkoutLog,
  StoredWorkoutSet,
} from "@become/api-client";
import { fetchPastProgramLog, fetchQuickSession } from "@/lib/schedule/quickSessionDay";

export interface DaySummarySheetsProps {
  programSlot: ScheduledSlot | null;
  quickSession: QuickCalItem | null;
  getToken: () => string | undefined;
  onCloseProgram: () => void;
  onCloseQuick: () => void;
  onViewLog: () => void;
  onViewJourney: (programId: string) => void;
  testID?: string;
}

function setLabel(s: {
  reps?: number | null;
  weight?: number | null;
  duration?: number | null;
  completed?: boolean;
}): string {
  const parts: string[] = [];
  if (s.reps != null) parts.push(`${s.reps} reps`);
  if (s.weight != null && s.weight > 0) parts.push(`${s.weight} lb`);
  if (s.duration != null && s.duration > 0) parts.push(`${s.duration}s`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/**
 * One stored log → what the summary reads.
 *
 * The tracking type and the grouping come with it, and they have to: without
 * them the summary judges a treadmill on reps it was never asked for (so a
 * 12-minute, 2000 m walk rendered as `Done`) and draws a circuit as a flat
 * list of unrelated exercises. A log written before the type was stored gets
 * the same best guess every other read path uses (`inferTracking`), which is
 * exactly what the web's calendar does for the same screen.
 *
 * Exported for the tests: this mapping IS the bug surface, and it is cheaper
 * to drive it directly than through two fetches and a bottom sheet.
 */
export function storedLogToSummary(log: StoredWorkoutLog): {
  exercises: WorkoutSummaryExercise[];
  setsByExercise: WorkoutSummarySet[][];
  elapsedSeconds: number;
} {
  const exercises: WorkoutSummaryExercise[] = (log.exercises ?? []).map(
    (ex: StoredWorkoutExercise) => ({
      name: ex.name,
      trackingType: ex.prescription?.trackingType ?? inferTracking(ex.sets ?? []),
      groupId: ex.groupId ?? null,
      groupType: ex.groupType ?? null,
      groupLabel: ex.groupLabel ?? null,
      groupRounds: ex.groupRounds ?? null,
    }),
  );
  const setsByExercise: WorkoutSummarySet[][] = (log.exercises ?? []).map(
    (ex: StoredWorkoutExercise) =>
      (ex.sets ?? []).map((s: StoredWorkoutSet) => ({
        reps: s.reps ?? null,
        weight: s.weight ?? null,
        completed: !!s.completed,
        durationSec: s.duration ?? null,
        distance: s.distance ?? null,
        speed: s.speed ?? null,
      })),
  );
  return {
    exercises,
    setsByExercise,
    elapsedSeconds: log.duration ? log.duration * 60 : 0,
  };
}

/**
 * Past-day summaries for the calendar day sheet (NP-115).
 *
 * A past COMPLETED program workout opens the NP-086 `WorkoutSummary` fed by
 * `GET /api/workouts/log?programId&date` looked up on the COMPLETION date (a
 * made-up workout's log lives on the day it was actually done). A completed
 * quick session opens the web's `QuickSessionSummary` numbers — title, date,
 * completed-sets count, duration, and every exercise's logged sets — fed by
 * `GET /api/workouts/session?id=`.
 *
 * Both summaries use the web's math verbatim (`summaryTotals`): sets counts
 * every completed set, volume is weight × reps over LOADED work only — a
 * past cardio day is not worth thousands of pounds of volume.
 */
export function DaySummarySheets({
  programSlot,
  quickSession,
  getToken,
  onCloseProgram,
  onCloseQuick,
  onViewLog,
  onViewJourney,
  testID = "day-summary",
}: DaySummarySheetsProps) {
  const [log, setLog] = useState<StoredWorkoutLog | null | undefined>(
    undefined,
  );
  const [history, setHistory] = useState<
    Record<string, WorkoutSummaryHistoryEntry>
  >({});
  const [quick, setQuick] = useState<QuickSession | null | undefined>(
    undefined,
  );

  // The program log for the slot's completion date — a network sync from
  // outside React (slot + token), never derived during render. The loading
  // reset is part of that sync: a new slot must not flash the old log.
  useEffect(() => {
    let alive = true;
    if (!programSlot) return;
    // Syncs from the selected slot (an external navigation), not a render cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLog(undefined);
    setHistory({});
    void (async () => {
      try {
        const res = await fetchPastProgramLog(
          programSlot.programId,
          programSlot.date,
          programSlot.completedAt,
          { getToken },
        );
        if (!alive) return;
        if (!res) {
          setLog(null);
          return;
        }
        setLog(res.log);
        const mapped: Record<string, WorkoutSummaryHistoryEntry> = {};
        const entries = res.exerciseHistory as Record<string, ExerciseHistoryEntry>;
        for (const [name, h] of Object.entries(entries ?? {})) {
          mapped[name] = {
            weight: h.weight,
            reps: h.reps,
            ...(h.duration != null ? { duration: h.duration } : {}),
            date: h.date,
          };
        }
        setHistory(mapped);
      } catch {
        if (alive) setLog(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [programSlot, getToken]);

  // The quick session read — same external-sync shape as the program log.
  useEffect(() => {
    let alive = true;
    if (!quickSession?.sessionId) return;
    // Syncs from the selected session (an external navigation), not a render cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuick(undefined);
    void (async () => {
      try {
        const res = await fetchQuickSession(quickSession.sessionId ?? "", {
          getToken,
        });
        if (alive) setQuick(res);
      } catch {
        if (alive) setQuick(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [quickSession, getToken]);

  const programSummary = log ? storedLogToSummary(log) : null;
  const programTotals = programSummary
    ? summaryTotals(programSummary.exercises, programSummary.setsByExercise)
    : null;
  // Touch the PR helper so the sheet shares the summary's record rule (best
  // set vs the previous session, keyed by exercise name).
  const programPRs =
    log && programSummary
      ? computeSummaryPRs(programSummary.exercises, programSummary.setsByExercise, history)
      : [];

  const quickTotalSets =
    quick?.exercises.reduce(
      (n: number, e: QuickSession["exercises"][number]) =>
        n + e.sets.filter((s: QuickSessionSet) => s.completed).length,
      0,
    ) ?? 0;

  return (
    <>
      <BottomSheet
        visible={programSlot !== null}
        onClose={onCloseProgram}
        title={programSlot ? (programSlot.workoutTitle ?? "Workout") : undefined}
        testID={`${testID}-program`}
      >
        {log === undefined ? (
          <ActivityIndicator testID={`${testID}-program-loading`} />
        ) : log === null || !programSummary || !programTotals ? (
          <Text testID={`${testID}-program-missing`}>
            This workout isn&apos;t available.
          </Text>
        ) : (
          <View>
            <Text testID={`${testID}-program-sets`}>{programTotals.totalSets} sets logged</Text>
            <Text testID={`${testID}-program-volume`}>
              {programTotals.totalVolume.toLocaleString()} lb volume
            </Text>
            {programPRs.length > 0 ? (
              <Text testID={`${testID}-program-prs`}>
                {programPRs.length} new personal record{programPRs.length > 1 ? "s" : ""}
              </Text>
            ) : null}
            <View style={{ height: 8 }} />
            <WorkoutSummary
              programCompleted={false}
              completedProgramName=""
              programId={programSlot?.programId ?? ""}
              workoutDay={programSlot?.dayLabel ?? ""}
              workoutTitle={programSlot?.workoutTitle ?? "Workout"}
              elapsedSeconds={programSummary.elapsedSeconds}
              exercises={programSummary.exercises}
              setsByExercise={programSummary.setsByExercise}
              exerciseHistory={history}
              streak={null}
              goal={null}
              onDone={onCloseProgram}
              onViewJourney={() => {
                if (programSlot) onViewJourney(programSlot.programId);
              }}
              onViewLog={onViewLog}
              testID={`${testID}-program-summary`}
            />
          </View>
        )}
      </BottomSheet>

      <BottomSheet
        visible={quickSession !== null}
        onClose={onCloseQuick}
        title={quick?.title ?? quickSession?.title ?? "Session"}
        testID={`${testID}-quick`}
      >
        {quick === undefined ? (
          <ActivityIndicator testID={`${testID}-quick-loading`} />
        ) : quick === null ? (
          <Text testID={`${testID}-quick-missing`}>
            This session isn&apos;t available.
          </Text>
        ) : (
          <ScrollView>
            <Text testID={`${testID}-quick-meta`}>
              {quickTotalSets} sets logged
              {quick.duration ? ` · ${quick.duration} min` : ""}
            </Text>
            {quick.exercises.map((ex: QuickSession["exercises"][number], i: number) => (
              <View key={i} style={{ marginTop: 8 }}>
                <Text testID={`${testID}-quick-exercise-${i}`}>{ex.name}</Text>
                {ex.sets.map((s: QuickSessionSet, j: number) => (
                  <View
                    key={j}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text>Set {s.setNumber ?? j + 1}</Text>
                    <Text
                      testID={`${testID}-quick-exercise-${i}-set-${j}`}
                    >
                      {setLabel(s)}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
            <View style={{ height: 8 }} />
            <Button
              testID={`${testID}-quick-close`}
              variant="secondary"
              onPress={onCloseQuick}
            >
              Close
            </Button>
          </ScrollView>
        )}
      </BottomSheet>
    </>
  );
}
