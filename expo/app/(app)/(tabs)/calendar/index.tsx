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
  const [manageSlot, setManageSlot] = useState<ScheduledSlot | null>(null);
  const [uncompleteSlot, setUncompleteSlot] =
    useState<ScheduledSlot | null>(null);
  const onConfirmReschedule = useCallback(
    (slot: ScheduledSlot, newDate: string) => {
      void mutations
        .patch({
          programId: slot.programId,
          action: "reschedule",
          workoutDate: slot.date,
          newDate,
        })
        .catch(() => {
          // The grid re-pulls on success; a failure leaves the day as-is.
        });
      setRescheduleSlot(null);
    },
    [mutations],
  );

  /**
   * Move one slot to the next calendar day — the web's "Move to Next Day"
   * row, which parses the slot's LOCAL marker date and advances one day.
   * The marker is a YYYY-MM-DD day, so plain calendar arithmetic on the
   * parts (never `new Date(iso)`, which reads it as UTC midnight and shifts
   * it a day backwards west of UTC) names the intended next day.
   */
  const onMoveNextDay = useCallback(
    (slot: ScheduledSlot) => {
      const [y, m, d] = slot.date.split("-").map(Number);
      const next = new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
      next.setDate(next.getDate() + 1);
      const pad = (n: number) => String(n).padStart(2, "0");
      const nextKey = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
      setManageSlot(null);
      void mutations
        .patch({
          programId: slot.programId,
          action: "reschedule",
          workoutDate: slot.date,
          newDate: nextKey,
        })
        .catch(() => undefined);
    },
    [mutations],
  );

  const onSkipSlot = useCallback(
    (slot: ScheduledSlot) => {
      setManageSlot(null);
      void mutations
        .patch({
          programId: slot.programId,
          action: "skip",
          workoutDate: slot.date,
        })
        .catch(() => undefined);
    },
    [mutations],
  );

  const onUnskipSlot = useCallback(
    (slot: ScheduledSlot) => {
      setManageSlot(null);
      void mutations
        .patch({
          programId: slot.programId,
          action: "unskip",
          workoutDate: slot.date,
        })
        .catch(() => undefined);
    },
    [mutations],
  );

  const onConfirmUncomplete = useCallback(() => {
    const slot = uncompleteSlot;
    if (!slot) return;
    setUncompleteSlot(null);
    void mutations
      .patch({
        programId: slot.programId,
        action: "uncomplete",
        workoutDate: slot.date,
      })
      .catch(() => undefined);
  }, [mutations, uncompleteSlot]);

  const onConfirmShift = useCallback(
    (slot: ScheduledSlot, days: number) => {
      setManageSlot(null);
      void mutations
        .patch({ programId: slot.programId, action: "shift", days })
        .catch(() => undefined);
    },
    [mutations],
  );

  const onPauseSlot = useCallback(
    (slot: ScheduledSlot) => {
      setManageSlot(null);
      void mutations
        .patch({ programId: slot.programId, action: "pause" })
        .catch(() => undefined);
    },
    [mutations],
  );

  const onResumeSlot = useCallback(
    (slot: ScheduledSlot) => {
      setManageSlot(null);
      void mutations
        .patch({ programId: slot.programId, action: "resume" })
        .catch(() => undefined);
    },
    [mutations],
  );

  const openSlot = useCallback(
    (slot: ScheduledSlot) => {
      // Never by array index: the route is addressed by the slot's own
      // `dayLabel` and marker date (`sd`), so completing it resolves THAT
      // slot and not a neighbouring same-label one (NP-078).
      const dayParam = slot.dayLabel
        ? `&day=${encodeURIComponent(slot.dayLabel)}`
        : "";
      // A tapped slot opens the TRACK view (NP-087) — the web's calendar links
      // to `/dashboard/workout/{id}/workout?day=…&sd=…`, every set on one
      // screen, with Live on the toggle. `sd` still names the exact slot so the
      // completion resolves THAT day and not a neighbouring same-label one.
      router.push(
        `/(tabs)/programming/${slot.programId}/workout/${slot.workoutIndex}/live?phase=${slot.phaseIndex}&sd=${encodeURIComponent(slot.date)}${dayParam}`,
      );
    },
    [router],
  );

  // The day sheet starts anything not done and not frozen: scheduled slots
  // (Start Workout), missed/skipped slots the member wants to do now
  // (Do It Now, like the web). Completed slots are done — they get
  // Un-complete instead. The Upcoming list keeps its old rule: only
  // today-or-future scheduled slots open Track.
  const canStartSlot = useCallback(
    (slot: ScheduledSlot) =>
      slot.programStatus !== "paused" &&
      (slot.status === "scheduled" ||
        slot.status === "missed" ||
        slot.status === "skipped"),
    [],
  );

  const canStartUpcoming = useCallback(
    (slot: ScheduledSlot) =>
      slot.status === "scheduled" &&
      slot.date >= todayDate &&
      slot.programStatus !== "paused",
    [todayDate],
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
                  // The web's day sheet: scheduled slots get Start + Manage;
                  // missed/skipped slots get Do It Now + Skip/Un-skip +
                  // Manage; completed slots get Un-complete + Manage.
                  // Past-day summaries and quick-session items are NP-115.
                  const startLabel =
                    slot.status === "scheduled"
                      ? "Start Workout"
                      : "Do It Now";
                  const showStart = canStartSlot(slot);
                  const showManage =
                    !isPaused &&
                    (slot.status === "scheduled" ||
                      slot.status === "missed" ||
                      slot.status === "skipped" ||
                      slot.status === "completed");

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

                      {/* Actions — mirrors the web's per-status day-sheet rows. */}
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 8,
                          marginTop: 10,
                        }}
                      >
                        {showStart ? (
                          <Button
                            testID={`day-detail-start-${slot.programId}-${slot.workoutIndex}`}
                            size="sm"
                            onPress={() => openSlot(slot)}
                          >
                            {startLabel}
                          </Button>
                        ) : null}
                        {slot.status === "completed" && !isPaused ? (
                          <Button
                            testID={`day-detail-uncomplete-${slot.programId}-${slot.workoutIndex}`}
                            variant="secondary"
                            size="sm"
                            onPress={() => setUncompleteSlot(slot)}
                          >
                            Un-complete
                          </Button>
                        ) : null}
                        {slot.status === "skipped" && !isPaused ? (
                          <Button
                            testID={`day-detail-unskip-${slot.programId}-${slot.workoutIndex}`}
                            variant="secondary"
                            size="sm"
                            onPress={() => onUnskipSlot(slot)}
                          >
                            Un-skip
                          </Button>
                        ) : null}
                        {slot.status === "missed" && !isPaused ? (
                          <Button
                            testID={`day-detail-skip-${slot.programId}-${slot.workoutIndex}`}
                            variant="secondary"
                            size="sm"
                            onPress={() => onSkipSlot(slot)}
                          >
                            Skip It
                          </Button>
                        ) : null}
                        {showManage ? (
                          <Button
                            testID={`day-detail-manage-${slot.programId}-${slot.workoutIndex}`}
                            variant="secondary"
                            size="sm"
                            onPress={() => setManageSlot(slot)}
                          >
                            Manage
                          </Button>
                        ) : null}
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
            onSelectSlot={(slot) => {
              if (canStartUpcoming(slot)) openSlot(slot);
            }}
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
      <SlotActionMenu
        key={manageSlot ? slotKey(manageSlot) : "no-manage-slot"}
        slot={manageSlot}
        loading={mutations.pending}
        onClose={() => setManageSlot(null)}
        onSkip={onSkipSlot}
        onUnskip={onUnskipSlot}
        onMoveNextDay={onMoveNextDay}
        onRescheduleToDate={(slot) => {
          setManageSlot(null);
          setRescheduleSlot(slot);
        }}
        onShift={(slot, days) => {
          onConfirmShift(slot, days);
        }}
        onPause={onPauseSlot}
        onResume={onResumeSlot}
      />
      <SlotConfirmDialog
        kind={uncompleteSlot ? "uncomplete" : null}
        slot={uncompleteSlot}
        loading={mutations.pending}
        onConfirm={onConfirmUncomplete}
        onClose={() => setUncompleteSlot(null)}
      />
    </SafeAreaView>
  );
}
