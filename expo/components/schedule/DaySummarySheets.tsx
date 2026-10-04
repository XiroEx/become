import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import {
  apiFetch,
  PastWorkoutLogResponseSchema,
  QuickSessionResponseSchema,
  type PastWorkoutLogResponse,
  type QuickSessionResponse,
  type StoredWorkoutLog,
} from "@become/api-client";
import { Text } from "@/components/Text";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { localDateKey } from "@/lib/time/localDay";
import {
  summaryTotals,
  type WorkoutSummaryExercise,
  type WorkoutSummarySet,
} from "@/components/live/WorkoutSummary";
import type { ScheduledSlot } from "@/lib/schedule/slotStatus";
import type { QuickCalItem } from "@/lib/schedule/slotStatus";

/**
 * CALENDAR DAY SHEETS (NP-115).
 *
 * Native port of the two summary overlays the web calendar opens from a past
 * day (`webapp/app/dashboard/calendar/CalendarClient.tsx`):
 *  - a past COMPLETED program workout opens the log fetched from
 *    `GET /api/workouts/log?programId=&date=` (looked up on its COMPLETION
 *    date for a made-up workout, exactly like the web's `fetchWorkoutLog`),
 *    rendered through NP-086's `WorkoutSummary` math (`summaryTotals`) so the
 *    numbers match the web's `WorkoutSummary` verbatim;
 *  - a COMPLETED quick session opens the log fetched from
 *    `GET /api/workouts/session?id=` (NP-086's summary is program-shaped, so
 *    the quick read renders the web `QuickSessionSummary`'s own numbers:
 *    completed sets, per-exercise set rows, duration).
 *
 * Rules that travel from the web:
 *  - log dates are instants shown on the local day (`localDateKey`).
 *  - a made-up workout's log lives on its completion date, not its marker.
 */

export interface DayProgramSummary {
  slot: ScheduledSlot;
  log: StoredWorkoutLog;
  exerciseHistory: PastWorkoutLogResponse["exerciseHistory"];
}

export interface DayQuickSummary {
  item: QuickCalItem;
  session: NonNullable<QuickSessionResponse["session"]>;
}

/** Lookup date for a slot's log: completion instant for a made-up workout. */
export function programLogLookupDate(slot: ScheduledSlot): string {
  const lookup = slot.completedAt ?? slot.date;
  return typeof lookup === "string" ? lookup.slice(0, 10) : lookup;
}

function formatLogDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSummaryTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * Map a stored program log onto NP-086's summary inputs — the same projection
 * the web hands its `WorkoutSummary` (`exerciseData` as completed flags with
 * weight/reps strings, `exercises` as names). Timed sets carry no weight/reps
 * on the wire, so they count sets but add no volume — `summaryTotals` handles
 * that, exactly like the web's `totalSets` / `totalVolume`.
 */
export function programLogSummaryInputs(log: StoredWorkoutLog): {
  exercises: WorkoutSummaryExercise[];
  setsByExercise: WorkoutSummarySet[][];
  elapsedSeconds: number;
} {
  const exercises: WorkoutSummaryExercise[] = (log.exercises ?? []).map(
    (ex) => ({ name: ex.name }),
  );
  const setsByExercise: WorkoutSummarySet[][] = (log.exercises ?? []).map(
    (ex) =>
      (ex.sets ?? []).map((s) => ({
        reps: s.reps ?? null,
        weight: s.weight ?? null,
        completed: s.completed ?? false,
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

/** Completed sets across a quick session read (web `QuickSessionSummary`). */
export function quickSessionCompletedSets(
  session: NonNullable<QuickSessionResponse["session"]>,
): number {
  return (session.exercises ?? []).reduce(
    (n, ex) => n + (ex.sets ?? []).filter((s) => s.completed).length,
    0,
  );
}

export function quickSetLabel(s: {
  reps?: number | null;
  weight?: number | null;
  duration?: number | null;
}): string {
  const parts: string[] = [];
  if (s.reps != null) parts.push(`${s.reps} reps`);
  if (s.weight != null && s.weight > 0) parts.push(`${s.weight} lb`);
  if (s.duration != null && s.duration > 0) parts.push(`${s.duration}s`);
  return parts.length ? parts.join(" · ") : "—";
}

export interface DaySummarySheetsProps {
  programSummary: DayProgramSummary | null;
  quickSummary: DayQuickSummary | null;
  loadingKind: "program" | "quick" | null;
  onCloseProgram: () => void;
  onCloseQuick: () => void;
  testID?: string;
}

export function DaySummarySheets({
  programSummary,
  quickSummary,
  loadingKind,
  onCloseProgram,
  onCloseQuick,
  testID = "day-summary",
}: DaySummarySheetsProps) {
  const { colors } = useThemeTokens();
  const programTotals = programSummary
    ? summaryTotals(
        programLogSummaryInputs(programSummary.log).setsByExercise,
      )
    : null;
  const quickTotalSets = quickSummary
    ? quickSessionCompletedSets(quickSummary.session)
    : 0;

  return (
    <>
      <BottomSheet
        visible={loadingKind === "program" || programSummary !== null}
        onClose={onCloseProgram}
        title={
          programSummary
            ? `${programSummary.slot.dayLabel || "Workout"} — ${programSummary.slot.workoutTitle || "Workout"}`
            : "Workout summary"
        }
        testID={`${testID}-program`}
      >
        {programSummary && programTotals ? (
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
            <Text
              testID={`${testID}-program-date`}
              className="text-muted-foreground text-xs"
            >
              {formatLogDate(programSummary.log.date)} ·{" "}
              {programSummary.slot.programName || "Program"}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View
                testID={`${testID}-program-stat-time`}
                style={{
                  flex: 1,
                  alignItems: "center",
                  backgroundColor: colors.muted,
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <Text
                  testID={`${testID}-program-time`}
                  className="text-foreground text-2xl font-bold"
                >
                  {formatSummaryTime(
                    programLogSummaryInputs(programSummary.log)
                      .elapsedSeconds,
                  )}
                </Text>
                <Text className="text-muted-foreground text-xs uppercase mt-1">
                  Duration
                </Text>
              </View>
              <View
                testID={`${testID}-program-stat-sets`}
                style={{
                  flex: 1,
                  alignItems: "center",
                  backgroundColor: colors.muted,
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <Text
                  testID={`${testID}-program-sets`}
                  className="text-foreground text-2xl font-bold"
                >
                  {programTotals.totalSets}
                </Text>
                <Text className="text-muted-foreground text-xs uppercase mt-1">
                  Sets
                </Text>
              </View>
              <View
                testID={`${testID}-program-stat-volume`}
                style={{
                  flex: 1,
                  alignItems: "center",
                  backgroundColor: colors.muted,
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <Text
                  testID={`${testID}-program-volume`}
                  className="text-foreground text-2xl font-bold"
                >
                  {programTotals.totalVolume.toLocaleString()}
                </Text>
                <Text className="text-muted-foreground text-xs uppercase mt-1">
                  Volume lbs
                </Text>
              </View>
            </View>
            {(programSummary.log.exercises ?? []).map((ex, exIdx) => {
              const sets = ex.sets ?? [];
              const done = sets.filter((s) => s.completed).length;
              return (
                <View
                  key={`${ex.name}-${exIdx}`}
                  testID={`${testID}-program-exercise-${exIdx}`}
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 12,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text className="text-foreground text-sm font-semibold">
                      {ex.name}
                    </Text>
                    <Text className="text-muted-foreground text-xs">
                      {done}/{sets.length} sets
                    </Text>
                  </View>
                  <View style={{ gap: 4, marginTop: 8 }}>
                    {sets.map((s, j) => (
                      <View
                        key={j}
                        testID={`${testID}-program-exercise-${exIdx}-set-${j}`}
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                        }}
                      >
                        <Text className="text-muted-foreground text-xs">
                          Set {s.setNumber ?? j + 1}
                        </Text>
                        <Text
                          className={`text-xs ${s.completed ? "text-foreground font-medium" : "text-muted-foreground"}`}
                        >
                          {quickSetLabel({
                            reps: s.reps,
                            weight: s.weight,
                            duration: s.duration,
                          })}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
            <Button
              testID={`${testID}-program-done`}
              variant="secondary"
              onPress={onCloseProgram}
            >
              Close
            </Button>
          </ScrollView>
        ) : (
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator testID={`${testID}-program-loading`} />
            <Text className="text-muted-foreground text-sm mt-2">
              Loading summary…
            </Text>
          </View>
        )}
      </BottomSheet>

      <BottomSheet
        visible={loadingKind === "quick" || quickSummary !== null}
        onClose={onCloseQuick}
        title={quickSummary ? quickSummary.session.title : "Session"}
        testID={`${testID}-quick`}
      >
        {quickSummary ? (
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
            <Text
              testID={`${testID}-quick-meta`}
              className="text-muted-foreground text-xs"
            >
              {formatLogDate(quickSummary.session.date)} · {quickTotalSets}{" "}
              sets logged
              {quickSummary.session.duration
                ? ` · ${quickSummary.session.duration} min`
                : ""}
            </Text>
            {(quickSummary.session.exercises ?? []).map((ex, i) => (
              <View
                key={i}
                testID={`${testID}-quick-exercise-${i}`}
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 12,
                }}
              >
                <Text className="text-foreground text-sm font-semibold">
                  {ex.name}
                </Text>
                <View style={{ gap: 4, marginTop: 6 }}>
                  {(ex.sets ?? []).map((s, j) => (
                    <View
                      key={j}
                      testID={`${testID}-quick-exercise-${i}-set-${j}`}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text className="text-muted-foreground text-xs">
                        Set {s.setNumber ?? j + 1}
                      </Text>
                      <Text
                        className={`text-xs ${s.completed ? "text-foreground font-medium" : "text-muted-foreground"}`}
                      >
                        {quickSetLabel(s)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
            <Button
              testID={`${testID}-quick-done`}
              variant="secondary"
              onPress={onCloseQuick}
            >
              Close
            </Button>
          </ScrollView>
        ) : (
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator testID={`${testID}-quick-loading`} />
            <Text className="text-muted-foreground text-sm mt-2">
              Loading session…
            </Text>
          </View>
        )}
      </BottomSheet>
    </>
  );
}

export interface UseDaySummariesResult {
  programSummary: DayProgramSummary | null;
  quickSummary: DayQuickSummary | null;
  loadingKind: "program" | "quick" | null;
  openProgramSummary: (slot: ScheduledSlot) => void;
  openQuickSummary: (item: QuickCalItem) => void;
  closeProgram: () => void;
  closeQuick: () => void;
}

/**
 * Fetch state behind the day sheets. The program read goes to
 * `GET /api/workouts/log?programId=&date=` on the COMPLETION date (a made-up
 * workout's log lives there, not on its marker — web `fetchWorkoutLog`); the
 * quick read goes to `GET /api/workouts/session?id=`. Fail-soft: a missing
 * log closes the sheet rather than hanging it open.
 */
export function useDaySummaries(): UseDaySummariesResult {
  const { token } = useAuth();
  const [programSummary, setProgramSummary] =
    useState<DayProgramSummary | null>(null);
  const [quickSummary, setQuickSummary] = useState<DayQuickSummary | null>(
    null,
  );
  const [loadingKind, setLoadingKind] = useState<"program" | "quick" | null>(
    null,
  );

  const openProgramSummary = useCallback(
    (slot: ScheduledSlot) => {
      setQuickSummary(null);
      setLoadingKind("program");
      void (async () => {
        try {
          const dateKey = programLogLookupDate(slot);
          const data = await apiFetch(
            `/api/workouts/log?programId=${encodeURIComponent(slot.programId)}&date=${encodeURIComponent(dateKey)}`,
            PastWorkoutLogResponseSchema,
            {
              baseUrl: WEBAPP_BASE_URL,
              getToken: () => token ?? undefined,
            },
          );
          if (!data?.log) {
            setLoadingKind(null);
            return;
          }
          setProgramSummary({
            slot,
            log: data.log,
            exerciseHistory: data.exerciseHistory ?? {},
          });
          setLoadingKind(null);
        } catch {
          setLoadingKind(null);
        }
      })();
    },
    [token],
  );

  const openQuickSummary = useCallback(
    (item: QuickCalItem) => {
      if (!item.sessionId) return;
      const sessionId = item.sessionId;
      setProgramSummary(null);
      setLoadingKind("quick");
      void (async () => {
        try {
          const data = await apiFetch(
            `/api/workouts/session?id=${encodeURIComponent(sessionId)}`,
            QuickSessionResponseSchema,
            {
              baseUrl: WEBAPP_BASE_URL,
              getToken: () => token ?? undefined,
            },
          );
          if (!data?.session) {
            setLoadingKind(null);
            return;
          }
          setQuickSummary({ item, session: data.session });
          setLoadingKind(null);
        } catch {
          setLoadingKind(null);
        }
      })();
    },
    [token],
  );

  const closeProgram = useCallback(() => {
    setProgramSummary(null);
    setLoadingKind(null);
  }, []);

  const closeQuick = useCallback(() => {
    setQuickSummary(null);
    setLoadingKind(null);
  }, []);

  return {
    programSummary,
    quickSummary,
    loadingKind,
    openProgramSummary,
    openQuickSummary,
    closeProgram,
    closeQuick,
  };
}

/** Local-day key for a quick item's instant (log dates are instants). */
export function quickItemLocalDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return localDateKey(d);
}
