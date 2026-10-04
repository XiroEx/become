import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ScheduleApiResponseSchema,
  WorkoutHistoryResponseSchema,
} from "@become/api-client";
import { Button } from "@/components/Button";
import { Calendar } from "@/components/schedule/Calendar";
import { ScheduledList } from "@/components/schedule/ScheduledList";
import { RescheduleModal } from "@/components/schedule/RescheduleModal";
import { SlotActionMenu } from "@/components/schedule/SlotActionMenu";
import { SlotConfirmDialog } from "@/components/schedule/SlotConfirmDialog";
import { ShiftScheduleModal } from "@/components/programs/ShiftScheduleModal";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { toScheduledSlots } from "@/lib/schedule/scheduleSlots";
import { useScheduleMutations } from "@/lib/schedule/useScheduleMutations";
import {
  slotKey,
  slotsForDate,
  quickSessionsForDate,
  isMakeupWorkout,
  toQuickCalItems,
  type ScheduledSlot,
} from "@/lib/schedule/slotStatus";
import {
  useLocalDay,
  useOnForeground,
  tzOffsetMinutes,
} from "@/lib/time/localDay";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { subscribeProgramUpdates } from "@/lib/programs/programEvents";
import { useScreenFocus } from "@/lib/navigation/useScreenFocus";
import { WorkoutNowSheet } from "@/components/workout/WorkoutNowSheet";
import { logPlanAvailability } from "@/lib/quickSession/logPlan";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatDateHeader(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
  const weekday = DAY_NAMES[dt.getDay()] ?? "";
  const monthName = MONTH_NAMES[dt.getMonth()] ?? "";
  return `${weekday}, ${monthName} ${d ?? 1}`;
}

function formatDateShort(iso: string): string {
  const dt = new Date(iso);
  const weekday = DAY_NAMES[dt.getDay()]?.slice(0, 3) ?? "";
  const monthName = MONTH_NAMES[dt.getMonth()]?.slice(0, 3) ?? "";
  return `${weekday}, ${monthName} ${dt.getDate()}`;
}

/**
 * Calendar lives under (tabs) — shows month and week views of the member's
 * schedule slots and quick sessions colored by status; tapping a day opens
 * the day detail panel with workout and session cards.
 */
export default function CalendarIndexRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ date?: string }>();

  // Device-local today and month, rolled over on foreground resume and midnight (NP-035).
  const { day: todayDate } = useLocalDay();

  // Mode and active date navigation
  const [viewMode, setViewMode] = useState<"month" | "week">("month");

  const initialDate = useMemo(() => {
    if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      const [y, m, d] = params.date.split("-").map(Number);
      return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
    }
    const [y, m, d] = todayDate.split("-").map(Number);
    return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
  }, [params.date, todayDate]);

  const [currentDate, setCurrentDate] = useState<Date>(initialDate);
  const [selectedDate, setSelectedDate] = useState<string | null>(
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null,
  );

  // When ?date= param arrives or changes, jump to that date and select it
  useEffect(() => {
    if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      // Syncs from the route param (an external navigation), not a render cascade.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedDate(params.date);
      const [y, m, d] = params.date.split("-").map(Number);
      setCurrentDate(new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12, 0, 0));
    }
  }, [params.date]);

  // Range query for schedule endpoint matching web: from & to & tz
  const schedulePath = useMemo(() => {
    const tz = tzOffsetMinutes();
    let url = "/api/schedule?";
    if (viewMode === "month") {
      const from = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1,
      );
      const to = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        1,
      );
      from.setDate(from.getDate() - 7);
      to.setDate(to.getDate() + 7);
      url += `from=${from.toISOString()}&to=${to.toISOString()}`;
    } else {
      const weekStart = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate(),
      );
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      url += `from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}`;
    }
    if (typeof tz === "number") {
      url += `&tz=${tz}`;
    }
    return url;
  }, [viewMode, currentDate]);

  const { data, error, refetch } = useFetch(
    schedulePath,
    ScheduleApiResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  // Fetch quick session logs (parity with web GET /api/workouts/logs?includeIncomplete=true)
  const { data: logsData, refetch: refetchLogs } = useFetch(
    "/api/workouts/logs?includeIncomplete=true",
    WorkoutHistoryResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  const initialTodayRef = useRef(todayDate);
  useEffect(() => {
    if (initialTodayRef.current !== todayDate) {
      initialTodayRef.current = todayDate;
      void refetch();
      void refetchLogs();
    }
  }, [todayDate, refetch, refetchLogs]);

  useOnForeground(() => {
    void refetch();
    void refetchLogs();
  });

  useEffect(() => {
    return subscribeProgramUpdates(() => {
      void refetch();
      void refetchLogs();
    });
  }, [refetch, refetchLogs]);

  useScreenFocus(
    useCallback(() => {
      void refetch();
      void refetchLogs();
    }, [refetch, refetchLogs]),
  );

  const slots = useMemo(() => toScheduledSlots(data), [data]);
  const rawLogs =
    logsData && typeof logsData === "object" && "logs" in logsData
      ? (logsData as { logs?: any[] }).logs
      : undefined;
  const quickSessions = useMemo(
    () => toQuickCalItems(rawLogs, todayDate),
    [rawLogs, todayDate],
  );

  const mutations = useScheduleMutations({
    getToken: () => token ?? undefined,
    onSuccess: () => {
      void refetch();
      void refetchLogs();
    },
  });

  const [rescheduleSlot, setRescheduleSlot] = useState<ScheduledSlot | null>(
    null,
  );
  // The Manage sheet (web's action-menu modal) and the confirm gates behind
  // the destructive rows. `confirmKind` names which confirm is open; the slot
  // it acts on is `menuSlot` so the dialog never drifts from the row that
  // opened it. Shift has its own modal (a day count, not a yes/no).
  const [menuSlot, setMenuSlot] = useState<ScheduledSlot | null>(null);
  const [confirmKind, setConfirmKind] = useState<
    "uncomplete" | "skip" | "pause" | null
  >(null);
  const [shiftOpen, setShiftOpen] = useState(false);
  // The day Workout Now is pre-dated to (web's `quickSessionDate`): set by
  // the Log/Schedule-a-Workout buttons on the selected day, cleared on close.
  const [quickSessionDate, setQuickSessionDate] = useState<string | null>(null);
  const onConfirmReschedule = useCallback(
    (slot: ScheduledSlot, newDate: string) => {
      void mutations
        .patch({
          action: "reschedule",
          programId: slot.programId,
          workoutDate: slot.date,
          newDate,
        })
        .catch(() => {});
      setRescheduleSlot(null);
      setMenuSlot(null);
    },
    [mutations],
  );

  // Start / Do-it-now: open Track for THAT slot's day label + marker date,
  // never by array index — two slots can share a label, and the index is what
  // used to complete the neighbour (NP-087 addresses by day + sd).
  const startSlot = useCallback(
    (slot: ScheduledSlot) => {
      const dayParam = slot.dayLabel
        ? `&day=${encodeURIComponent(slot.dayLabel)}`
        : "";
      router.push(
        `/(tabs)/programming/${slot.programId}/workout/${slot.workoutIndex}/live?phase=${slot.phaseIndex}&sd=${encodeURIComponent(slot.date)}${dayParam}`,
      );
    },
    [router],
  );

  const openSlot = useCallback(
    (slot: ScheduledSlot) => {
      // Only future or today, still-scheduled slots are actionable.
      if (slot.status !== "scheduled" || slot.date < todayDate) return;
      startSlot(slot);
    },
    [startSlot, todayDate],
  );

  const closeMenu = useCallback(() => setMenuSlot(null), []);
  const closeConfirm = useCallback(() => setConfirmKind(null), []);

  // Slot-level writes: the slot is identified by its marker date + program,
  // exactly the web's `{ programId, action, workoutDate }` body. `tz` travels
  // in every body via apiFetch — screens never set it (see
  // useScheduleMutations).
  const doSkip = useCallback(
    (slot: ScheduledSlot) => {
      void mutations
        .patch({
          action: "skip",
          programId: slot.programId,
          workoutDate: slot.date,
        })
        .catch(() => {});
      setConfirmKind(null);
      setMenuSlot(null);
    },
    [mutations],
  );
  const doUnskip = useCallback(
    (slot: ScheduledSlot) => {
      void mutations
        .patch({
          action: "unskip",
          programId: slot.programId,
          workoutDate: slot.date,
        })
        .catch(() => {});
    },
    [mutations],
  );
  // Un-complete moves the slot back to scheduled and removes that day's
  // completed log on the server (route `uncomplete`), after a confirmation.
  const doUncomplete = useCallback(
    (slot: ScheduledSlot) => {
      void mutations
        .patch({
          action: "uncomplete",
          programId: slot.programId,
          workoutDate: slot.date,
        })
        .catch(() => {});
      setConfirmKind(null);
    },
    [mutations],
  );
  const doMoveNextDay = useCallback(
    (slot: ScheduledSlot) => {
      const [y, m, d] = slot.date.split("-").map(Number);
      const next = new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
      next.setDate(next.getDate() + 1);
      const pad = (n: number) => String(n).padStart(2, "0");
      const nextKey = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
      void mutations
        .patch({
          action: "reschedule",
          programId: slot.programId,
          workoutDate: slot.date,
          newDate: nextKey,
        })
        .catch(() => {});
      setMenuSlot(null);
    },
    [mutations],
  );
  const doShift = useCallback(
    (slot: ScheduledSlot, days: number) => {
      if (!Number.isInteger(days) || days === 0) return;
      void mutations
        .patch({ action: "shift", programId: slot.programId, days })
        .catch(() => {});
      setShiftOpen(false);
      setMenuSlot(null);
    },
    [mutations],
  );
  const doPause = useCallback(
    (slot: ScheduledSlot) => {
      void mutations
        .patch({ action: "pause", programId: slot.programId })
        .catch(() => {});
      setConfirmKind(null);
      setMenuSlot(null);
    },
    [mutations],
  );
  const doResume = useCallback(
    (slot: ScheduledSlot) => {
      void mutations
        .patch({ action: "resume", programId: slot.programId })
        .catch(() => {});
      setMenuSlot(null);
    },
    [mutations],
  );

  const onSelectDay = useCallback((date: string) => {
    setSelectedDate((prev) => (prev === date ? null : date));
  }, []);

  const onPrev = useCallback(() => {
    setCurrentDate((prev) => {
      if (viewMode === "month") {
        return new Date(prev.getFullYear(), prev.getMonth() - 1, 1, 12, 0, 0);
      }
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }, [viewMode]);

  const onNext = useCallback(() => {
    setCurrentDate((prev) => {
      if (viewMode === "month") {
        return new Date(prev.getFullYear(), prev.getMonth() + 1, 1, 12, 0, 0);
      }
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }, [viewMode]);

  const onGoToToday = useCallback(() => {
    const [y, m, d] = todayDate.split("-").map(Number);
    setCurrentDate(new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12, 0, 0));
    setSelectedDate(todayDate);
  }, [todayDate]);

  // Selected day items
  const daySlots = useMemo(
    () => (selectedDate ? slotsForDate(slots, selectedDate) : []),
    [slots, selectedDate],
  );
  const dayQuick = useMemo(
    () =>
      selectedDate ? quickSessionsForDate(quickSessions, selectedDate) : [],
    [quickSessions, selectedDate],
  );

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="calendar-index-route"
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text className="text-foreground text-2xl font-bold">Calendar</Text>
        {error ? (
          <Text testID="calendar-error" className="text-destructive">
            Couldn&apos;t load your schedule.
          </Text>
        ) : null}

        <Calendar
          viewMode={viewMode}
          currentDate={currentDate}
          selectedDate={selectedDate}
          todayDate={todayDate}
          slots={slots}
          quickSessions={quickSessions}
          onSelectDay={onSelectDay}
          onPrev={onPrev}
          onNext={onNext}
          onChangeViewMode={setViewMode}
          onGoToToday={onGoToToday}
        />

        {/* Selected Day Detail Panel */}
        {selectedDate ? (
          <View
            testID="calendar-day-detail"
            className="bg-card border border-border rounded-2xl p-4"
          >
            <Text
              testID="day-detail-header"
              className="text-foreground font-semibold text-base mb-3"
            >
              {formatDateHeader(selectedDate)}
            </Text>

            {/* Quick sessions on this day */}
            {dayQuick.length > 0 ? (
              <View
                style={{
                  gap: 8,
                  marginBottom: daySlots.length > 0 ? 12 : 0,
                }}
              >
                {dayQuick.map((q, idx) => (
                  <View
                    key={q.sessionId ?? idx}
                    testID={`day-detail-quick-${q.sessionId ?? idx}`}
                    className="rounded-xl border border-purple-400/40 bg-purple-400/10 p-3"
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text className="text-foreground font-medium text-sm">
                          {q.title}
                        </Text>
                        <Text className="text-muted-foreground text-xs mt-1">
                          Quick session · {q.exerciseCount}{" "}
                          {q.exerciseCount === 1 ? "exercise" : "exercises"}
                          {q.duration ? ` · ${q.duration} min` : ""}
                        </Text>
                      </View>
                      <View
                        testID={`day-detail-quick-badge-${q.sessionId ?? idx}`}
                        className={`px-2 py-0.5 rounded-full ${
                          q.status === "completed"
                            ? "bg-accent"
                            : q.status === "planned"
                              ? "bg-primary/20"
                              : q.status === "skipped"
                                ? "bg-amber-500/20"
                                : "bg-destructive/20"
                        }`}
                      >
                        <Text
                          className={`text-[10px] font-semibold ${
                            q.status === "completed"
                              ? "text-accent-foreground"
                              : q.status === "planned"
                                ? "text-primary"
                                : q.status === "skipped"
                                  ? "text-amber-500"
                                  : "text-destructive"
                          }`}
                        >
                          {q.status === "completed"
                            ? "Done"
                            : q.status === "planned"
                              ? "Scheduled"
                              : q.status === "skipped"
                                ? "Skipped"
                                : "Incomplete"}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Program workouts on this day */}
            {daySlots.length > 0 ? (
              <View style={{ gap: 10 }}>
                {daySlots.map((slot, idx) => {
                  const isMakeup =
                    slot.status === "completed" &&
                    !!slot.completedAt &&
                    isMakeupWorkout(slot.date, slot.completedAt);
                  const isPaused = slot.programStatus === "paused";
                  const isActionable =
                    slot.status === "scheduled" &&
                    slot.date >= todayDate &&
                    !isPaused;
                  const startLabel =
                    slot.status === "missed" || slot.status === "skipped"
                      ? "Do It Now"
                      : "Start Workout";

                  return (
                    <View
                      key={`${slotKey(slot)}-${idx}`}
                      testID={`day-detail-workout-${slot.programId}-${slot.workoutIndex}`}
                      className="rounded-xl border border-border p-3"
                      style={{ opacity: isPaused ? 0.6 : 1 }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text className="text-foreground font-medium text-sm">
                            {slot.dayLabel || `Day ${slot.workoutIndex + 1}`}:{" "}
                            {slot.workoutTitle || "Workout"}
                          </Text>
                          <Text className="text-muted-foreground text-xs mt-1">
                            Phase {(slot.phaseIndex ?? 0) + 1} ·{" "}
                            {slot.programName || "Program"}
                            {isPaused ? " (Paused)" : ""}
                          </Text>
                        </View>
                        <View
                          testID={`day-detail-workout-badge-${slot.programId}-${slot.workoutIndex}`}
                          className={`px-2 py-0.5 rounded-full ${
                            isPaused
                              ? "bg-amber-500/20"
                              : isMakeup
                                ? "bg-emerald-500/20"
                                : slot.status === "completed"
                                  ? "bg-accent"
                                  : slot.status === "scheduled"
                                    ? "bg-primary/20"
                                    : slot.status === "skipped"
                                      ? "bg-amber-500/20"
                                      : "bg-destructive/20"
                          }`}
                        >
                          <Text
                            className={`text-[10px] font-semibold ${
                              isPaused
                                ? "text-amber-500"
                                : isMakeup
                                  ? "text-emerald-500"
                                  : slot.status === "completed"
                                    ? "text-accent-foreground"
                                    : slot.status === "scheduled"
                                      ? "text-primary"
                                      : slot.status === "skipped"
                                        ? "text-amber-500"
                                        : "text-destructive"
                            }`}
                          >
                            {isPaused
                              ? "Paused"
                              : isMakeup
                                ? "Made Up"
                                : slot.status === "completed"
                                  ? "Done"
                                  : slot.status === "scheduled"
                                    ? "Scheduled"
                                    : slot.status === "skipped"
                                      ? "Skipped"
                                      : "Incomplete"}
                          </Text>
                        </View>
                      </View>

                      {isMakeup && slot.completedAt ? (
                        <Text
                          testID="workout-made-up-date"
                          className="text-emerald-500 text-xs mt-2"
                        >
                          Made up on {formatDateShort(slot.completedAt)}
                        </Text>
                      ) : null}

                      {/* Actions — mirrors the web day sheet: start/do-it-now by
                          day label + marker date, skip/unskip, un-complete
                          (confirmed), and the Manage sheet for reschedule /
                          shift / pause / resume. */}
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 8,
                          marginTop: 10,
                        }}
                      >
                        {isActionable ? (
                          <Button
                            testID={`day-detail-start-${slot.programId}-${slot.workoutIndex}`}
                            size="sm"
                            onPress={() => startSlot(slot)}
                          >
                            Start Workout
                          </Button>
                        ) : null}
                        {slot.status === "missed" ||
                        slot.status === "skipped" ? (
                          <Button
                            testID={`day-detail-start-${slot.programId}-${slot.workoutIndex}`}
                            size="sm"
                            onPress={() => startSlot(slot)}
                          >
                            {startLabel}
                          </Button>
                        ) : null}
                        {slot.status === "missed" && !isPaused ? (
                          <Button
                            testID={`day-detail-skip-${slot.programId}-${slot.workoutIndex}`}
                            variant="secondary"
                            size="sm"
                            onPress={() => {
                              setMenuSlot(slot);
                              setConfirmKind("skip");
                            }}
                          >
                            Skip It
                          </Button>
                        ) : null}
                        {slot.status === "completed" ? (
                          <Button
                            testID={`day-detail-uncomplete-${slot.programId}-${slot.workoutIndex}`}
                            variant="secondary"
                            size="sm"
                            onPress={() => {
                              setMenuSlot(slot);
                              setConfirmKind("uncomplete");
                            }}
                          >
                            Un-complete
                          </Button>
                        ) : null}
                        {slot.status === "skipped" ? (
                          <Button
                            testID={`day-detail-unskip-${slot.programId}-${slot.workoutIndex}`}
                            variant="secondary"
                            size="sm"
                            onPress={() => doUnskip(slot)}
                          >
                            Un-skip
                          </Button>
                        ) : null}
                        <Button
                          testID={`day-detail-manage-${slot.programId}-${slot.workoutIndex}`}
                          variant="secondary"
                          size="sm"
                          onPress={() => setMenuSlot(slot)}
                        >
                          Manage
                        </Button>
                        <Button
                          testID={`day-detail-reschedule-${slot.programId}-${slot.workoutIndex}`}
                          variant="secondary"
                          size="sm"
                          onPress={() => setRescheduleSlot(slot)}
                        >
                          Reschedule
                        </Button>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {daySlots.length === 0 && dayQuick.length === 0 ? (
              <Text
                testID="day-detail-rest"
                className="text-muted-foreground text-sm"
              >
                Rest day — no workouts scheduled.
              </Text>
            ) : null}
            {/* Log / Schedule a Workout on this day (web's QuickSessionModal
                pre-dated to the tapped day): past days log, future days plan,
                today allows both. */}
            {(() => {
              if (!selectedDate) return null;
              const { canLog, canPlan } = logPlanAvailability(
                selectedDate,
                todayDate,
              );
              if (!canLog && !canPlan) return null;
              return (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {canLog ? (
                    <Button
                      testID="day-detail-log-workout"
                      size="sm"
                      onPress={() => setQuickSessionDate(selectedDate)}
                    >
                      Log a Workout
                    </Button>
                  ) : null}
                  {canPlan ? (
                    <Button
                      testID="day-detail-schedule-workout"
                      variant="secondary"
                      size="sm"
                      onPress={() => setQuickSessionDate(selectedDate)}
                    >
                      Schedule a Workout
                    </Button>
                  ) : null}
                </View>
              );
            })()}
          </View>
        ) : null}

        <Button
          testID="calendar-open-settings"
          variant="secondary"
          onPress={() => router.push("/(tabs)/calendar/settings")}
        >
          Schedule settings
        </Button>
        <View>
          <Text className="text-foreground font-semibold mb-2">Upcoming</Text>
          <ScheduledList
            slots={slots}
            onSelectSlot={openSlot}
            onReschedule={setRescheduleSlot}
          />
        </View>
      </ScrollView>

      {/*
        Keyed on the slot: the modal seeds its date field from `slot` with
        useState and has no re-seeding effect, so a different slot has to be a
        different element for the form to show that slot's date. Drop the key
        and rescheduling a second workout opens the first one's date.
      */}
      <RescheduleModal
        key={rescheduleSlot ? slotKey(rescheduleSlot) : "no-slot"}
        visible={rescheduleSlot !== null}
        slot={rescheduleSlot}
        onConfirm={onConfirmReschedule}
        onClose={() => setRescheduleSlot(null)}
      />
      {/* Manage sheet for the slot: skip / move-to-next-day / move-to-date /
          shift / pause / resume. No swap row — the server accepts it but
          neither app has a screen that sends it. */}
      <SlotActionMenu
        visible={menuSlot !== null}
        slot={menuSlot}
        programPaused={menuSlot?.programStatus === "paused"}
        pending={mutations.pending}
        onClose={closeMenu}
        onSkip={() => {
          if (!menuSlot) return;
          if (menuSlot.status === "completed") return;
          if (menuSlot.status === "skipped") {
            doUnskip(menuSlot);
            setMenuSlot(null);
            return;
          }
          setConfirmKind("skip");
        }}
        onMoveNextDay={() => {
          if (menuSlot) doMoveNextDay(menuSlot);
        }}
        onRescheduleToDate={() => {
          if (menuSlot) setRescheduleSlot(menuSlot);
        }}
        onShift={() => setShiftOpen(true)}
        onPause={() => setConfirmKind("pause")}
        onResume={() => {
          if (menuSlot) doResume(menuSlot);
        }}
      />
      {/* Shift modal: delay the whole program by N days (web default 7). */}
      <ShiftScheduleModal
        visible={shiftOpen}
        initialDays={7}
        loading={mutations.pending}
        onClose={() => setShiftOpen(false)}
        onConfirm={(days) => {
          if (menuSlot) doShift(menuSlot, days);
        }}
      />
      {/* Confirm gates — the native `window.confirm` for skip (web asks),
          un-complete (web asks) and pause (web asks). */}
      <SlotConfirmDialog
        visible={confirmKind === "uncomplete" && menuSlot !== null}
        title="Un-complete workout?"
        message="The sets you logged for it will be removed and it returns to scheduled."
        confirmLabel="Un-complete"
        pending={mutations.pending}
        onConfirm={() => {
          if (menuSlot) doUncomplete(menuSlot);
        }}
        onClose={closeConfirm}
        testID="slot-confirm-uncomplete"
      />
      <SlotConfirmDialog
        visible={confirmKind === "skip" && menuSlot !== null}
        title="Skip workout?"
        message="It’ll be marked skipped and won’t count as completed."
        confirmLabel="Skip"
        pending={mutations.pending}
        onConfirm={() => {
          if (menuSlot) doSkip(menuSlot);
        }}
        onClose={closeConfirm}
        testID="slot-confirm-skip"
      />
      <SlotConfirmDialog
        visible={confirmKind === "pause" && menuSlot !== null}
        title="Pause program?"
        message="All its workouts are frozen until you resume."
        confirmLabel="Pause"
        pending={mutations.pending}
        onConfirm={() => {
          if (menuSlot) doPause(menuSlot);
        }}
        onClose={closeConfirm}
        testID="slot-confirm-pause"
      />
      {/* Workout Now pre-dated to the selected day (NP-076): the sheet hands
          the date to the NP-227 overview's Log/Plan panel via `?date=`. */}
      <WorkoutNowSheet
        testID="calendar-workout-now-sheet"
        visible={quickSessionDate !== null}
        onClose={() => setQuickSessionDate(null)}
        date={quickSessionDate ?? undefined}
      />
    </SafeAreaView>
  );
}
