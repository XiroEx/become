import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ScheduleApiResponseSchema,
  WorkoutHistoryResponseSchema,
} from "@become/api-client";
import { Button } from "@/components/Button";
import { Calendar } from "@/components/schedule/Calendar";
import { DaySummarySheets } from "@/components/schedule/DaySummarySheets";
import { QuickSessionMenu } from "@/components/schedule/QuickSessionMenu";
import { RescheduleModal } from "@/components/schedule/RescheduleModal";
import { SlotActionMenu } from "@/components/schedule/SlotActionMenu";
import { SlotConfirmDialog } from "@/components/schedule/SlotConfirmDialog";
import { ShiftScheduleModal } from "@/components/programs/ShiftScheduleModal";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { toScheduledSlots } from "@/lib/schedule/scheduleSlots";
import {
  addLocalDaysToKey,
  deleteQuickSession,
  moveQuickSession,
  skipQuickSession,
} from "@/lib/schedule/quickSessionDay";
import { rebuildQuickSession } from "@/lib/quickSession/rebuild";
import { logPlanAvailability } from "@/lib/quickSession/logPlan";
import {
  quickSessionOverviewHref,
  stashQuickSessionWithId,
} from "@/lib/quickSession/store";
import { useScheduleMutations } from "@/lib/schedule/useScheduleMutations";
import {
  slotKey,
  slotsForDate,
  quickSessionsForDate,
  isMakeupWorkout,
  toQuickCalItems,
  type QuickCalItem,
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

// Matches the web's `Completed {time}` line on a completed (non-makeup) day
// card (CalendarClient.tsx: `toLocaleTimeString('en-US', { hour: 'numeric',
// minute: '2-digit' })`) — native previously showed no time at all (NP-292).
function formatCompletedTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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
  // Workout Now from a calendar day: the sheet pre-fills that day for Log it
  // or Plan it (web `quickSessionDate`), mirroring QuickSessionModal's `date`.
  const [workoutNowDate, setWorkoutNowDate] = useState<string | null>(null);
  // The Manage sheet (web's action-menu modal) and the confirm gates behind
  // the destructive rows. `confirmKind` names which confirm is open; the slot
  // it acts on is `menuSlot` so the dialog never drifts from the row that
  // opened it. Shift has its own modal (a day count, not a yes/no).
  const [menuSlot, setMenuSlot] = useState<ScheduledSlot | null>(null);
  const [confirmKind, setConfirmKind] = useState<
    "uncomplete" | "skip" | "pause" | "quick-skip" | "quick-delete" | null
  >(null);
  const [shiftOpen, setShiftOpen] = useState(false);
  // Quick-session day state (NP-115): the Manage sheet's session, its move
  // date picker, the two summaries, and the continue-in-flight marker.
  const [quickMenu, setQuickMenu] = useState<QuickCalItem | null>(null);
  const [quickDateOpen, setQuickDateOpen] = useState(false);
  const [quickPending, setQuickPending] = useState(false);
  const [summarySlot, setSummarySlot] = useState<ScheduledSlot | null>(null);
  const [summaryQuick, setSummaryQuick] = useState<QuickCalItem | null>(null);
  const [quickOpening, setQuickOpening] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const getToken = useCallback(() => token ?? undefined, [token]);
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

  const closeMenu = useCallback(() => setMenuSlot(null), []);
  const closeConfirm = useCallback(() => setConfirmKind(null), []);
  const closeQuickMenu = useCallback(() => {
    setQuickMenu(null);
    setQuickDateOpen(false);
  }, []);

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

  // Quick-session writes (NP-115) — the web's reDateQuick / skipQuick /
  // deleteQuick through `@/lib/schedule/quickSessionDay`, then a re-pull of
  // the grid so the session lands on its new day on both apps.
  const refreshQuick = useCallback(() => {
    void refetch();
    void refetchLogs();
  }, [refetch, refetchLogs]);

  const doQuickMove = useCallback(
    async (session: QuickCalItem, date: string) => {
      if (!session.sessionId || quickPending) return;
      setQuickPending(true);
      setQuickError(null);
      try {
        const ok = await moveQuickSession(session.sessionId, date, {
          getToken,
        });
        if (ok) {
          closeQuickMenu();
          refreshQuick();
        } else {
          setQuickError("Couldn't move this session.");
        }
      } catch {
        setQuickError("Couldn't move this session.");
      } finally {
        setQuickPending(false);
      }
    },
    [closeQuickMenu, getToken, quickPending, refreshQuick],
  );

  const doQuickMoveNextDay = useCallback(
    (session: QuickCalItem) => {
      const next = addLocalDaysToKey(session.date.slice(0, 10), 1);
      if (next) void doQuickMove(session, next);
    },
    [doQuickMove],
  );

  const doQuickSkip = useCallback(
    async (session: QuickCalItem, skipped: boolean) => {
      if (!session.sessionId || quickPending) return;
      setQuickPending(true);
      setQuickError(null);
      try {
        const ok = await skipQuickSession(session.sessionId, skipped, {
          getToken,
        });
        if (ok) {
          setConfirmKind(null);
          closeQuickMenu();
          refreshQuick();
        } else {
          setQuickError("Couldn't update this session.");
        }
      } catch {
        setQuickError("Couldn't update this session.");
      } finally {
        setQuickPending(false);
      }
    },
    [closeQuickMenu, getToken, quickPending, refreshQuick],
  );

  const doQuickDelete = useCallback(
    async (session: QuickCalItem) => {
      if (!session.sessionId || quickPending) return;
      setQuickPending(true);
      setQuickError(null);
      try {
        const ok = await deleteQuickSession(session.sessionId, { getToken });
        if (ok) {
          setConfirmKind(null);
          closeQuickMenu();
          refreshQuick();
        } else {
          setQuickError("Couldn't delete this session.");
        }
      } catch {
        setQuickError("Couldn't delete this session.");
      } finally {
        setQuickPending(false);
      }
    },
    [closeQuickMenu, getToken, quickPending, refreshQuick],
  );

  // Continue a quick session under its OWN sessionId (the web's
  // `continueQuickSession`): rebuilding stashes the draft under the same id,
  // so finishing it completes the same log. Opens the NP-227 overview with
  // saved=1&started=1 — the log already exists server-side.
  const continueQuick = useCallback(
    async (session: QuickCalItem) => {
      if (!session.sessionId || quickOpening) return;
      setQuickOpening(session.sessionId);
      setQuickError(null);
      try {
        const rebuilt = await rebuildQuickSession(session.sessionId, {
          baseUrl: WEBAPP_BASE_URL,
          getToken,
        });
        if (!rebuilt) {
          setQuickError("This session isn't available.");
          return;
        }
        await stashQuickSessionWithId(
          {
            title: rebuilt.title,
            ...(rebuilt.focus ? { focus: rebuilt.focus } : {}),
            exercises: rebuilt.exercises,
          },
          session.sessionId,
          { needsName: rebuilt.needsName },
        );
        router.push(
          quickSessionOverviewHref(session.sessionId, {
            saved: true,
            started: true,
          }) as never,
        );
      } catch {
        setQuickError("Couldn't open this session.");
      } finally {
        setQuickOpening(null);
      }
    },
    [getToken, quickOpening, router],
  );

  const onSelectDay = useCallback((date: string) => {
    setSelectedDate((prev) => (prev === date ? null : date));
  }, []);

  // Changing the visible range invalidates the selected day: the schedule
  // fetch is keyed on the visible range (`schedulePath` above), so a day
  // selected before the jump may no longer be in `slots` at all — showing it
  // anyway reads as a scheduled/completed day gone stale to "Rest day" (the
  // Oct 3 bug, NP-292). Clearing it is simpler and safer than threading a
  // second targeted fetch for one day that may not even still be visible.
  const onPrev = useCallback(() => {
    setSelectedDate(null);
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
    setSelectedDate(null);
    setCurrentDate((prev) => {
      if (viewMode === "month") {
        return new Date(prev.getFullYear(), prev.getMonth() + 1, 1, 12, 0, 0);
      }
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }, [viewMode]);

  // Switching month/week also changes the visible (and fetched) range — same
  // staleness risk as onPrev/onNext.
  const onChangeViewMode = useCallback((mode: "month" | "week") => {
    setSelectedDate(null);
    setViewMode(mode);
  }, []);

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
          onChangeViewMode={onChangeViewMode}
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
                    <Pressable
                      testID={`day-detail-quick-open-${q.sessionId ?? idx}`}
                      accessibilityRole="button"
                      accessibilityLabel={
                        q.status === "completed"
                          ? `View summary for ${q.title}`
                          : `Continue ${q.title}`
                      }
                      disabled={!q.sessionId}
                      onPress={() => {
                        if (!q.sessionId) return;
                        if (q.status === "completed") {
                          setSummaryQuick(q);
                        } else {
                          void continueQuick(q);
                        }
                      }}
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
                    </Pressable>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 8,
                        marginTop: 10,
                      }}
                    >
                      {q.status === "completed" ? (
                        <Button
                          testID={`day-detail-quick-summary-${q.sessionId ?? idx}`}
                          variant="secondary"
                          size="sm"
                          disabled={!q.sessionId}
                          onPress={() => setSummaryQuick(q)}
                        >
                          View Summary
                        </Button>
                      ) : (
                        <Button
                          testID={`day-detail-quick-continue-${q.sessionId ?? idx}`}
                          size="sm"
                          disabled={!q.sessionId || quickOpening === q.sessionId}
                          loading={quickOpening === q.sessionId}
                          onPress={() => {
                            if (q.sessionId) void continueQuick(q);
                          }}
                        >
                          {q.status === "incomplete" ? "Continue" : "Start Workout"}
                        </Button>
                      )}
                      <Button
                        testID={`day-detail-quick-manage-${q.sessionId ?? idx}`}
                        variant="secondary"
                        size="sm"
                        disabled={!q.sessionId}
                        onPress={() => {
                          setQuickMenu(q);
                          setQuickDateOpen(false);
                          setQuickError(null);
                        }}
                      >
                        Manage
                      </Button>
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
                      {!isMakeup && slot.status === "completed" && slot.completedAt ? (
                        <Text
                          testID={`day-detail-completed-at-${slot.programId}-${slot.workoutIndex}`}
                          className="text-accent-foreground text-xs mt-2"
                        >
                          Completed {formatCompletedTime(slot.completedAt)}
                        </Text>
                      ) : null}

                      {/* Actions — mirrors the web day sheet: start/do-it-now by
                          day label + marker date, skip/unskip, un-complete
                          (confirmed), and the Manage sheet for reschedule /
                          shift / pause / resume. No standalone Reschedule row:
                          web reaches reschedule through this same Manage sheet
                          (NP-292) — a second button duplicated it. */}
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
                        {slot.status === "completed" ? (
                          <Button
                            testID={`day-detail-summary-${slot.programId}-${slot.workoutIndex}`}
                            variant="success"
                            size="sm"
                            onPress={() => setSummarySlot(slot)}
                          >
                            View Summary
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
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {daySlots.length === 0 && dayQuick.length === 0 ? (
              <View testID="day-detail-rest">
                <Text className="text-muted-foreground text-sm">
                  Rest day — no workouts scheduled.
                </Text>
                {/* Web's rest-day actions (NP-292): "Log a Workout" for a
                    date that has already happened, "Schedule a Workout" for
                    one still ahead — both for today, since it is both. Each
                    opens the same Workout Now sheet pre-filled for this day
                    (NP-076); the sheet's own title already reads
                    "Log a Workout" / "Schedule a Workout" / "Workout Now"
                    from `workoutNowTitle`, so these labels and that title
                    never drift apart. */}
                {selectedDate ? (
                  (() => {
                    const { canLog, canPlan } = logPlanAvailability(
                      selectedDate,
                      todayDate,
                    );
                    return (
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 8,
                          marginTop: 12,
                        }}
                      >
                        {canLog ? (
                          <Button
                            testID="day-detail-log-workout"
                            size="sm"
                            onPress={() => setWorkoutNowDate(selectedDate)}
                          >
                            Log a Workout
                          </Button>
                        ) : null}
                        {canPlan ? (
                          <Button
                            testID="day-detail-schedule-workout"
                            variant="secondary"
                            size="sm"
                            onPress={() => setWorkoutNowDate(selectedDate)}
                          >
                            Schedule a Workout
                          </Button>
                        ) : null}
                      </View>
                    );
                  })()
                ) : null}
              </View>
            ) : null}
            {quickError ? (
              <Text testID="day-detail-quick-error" className="text-destructive text-sm mt-2">
                {quickError}
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
      <WorkoutNowSheet
        visible={workoutNowDate !== null}
        onClose={() => setWorkoutNowDate(null)}
        date={workoutNowDate ?? undefined}
        testID="calendar-workout-now-sheet"
      />
      {/* Quick-session Manage sheet (NP-115): move / skip / delete. */}
      <QuickSessionMenu
        key={quickMenu?.sessionId ?? "no-quick"}
        visible={quickMenu !== null}
        session={quickMenu}
        pending={quickPending}
        datePickerOpen={quickDateOpen}
        onToggleDatePicker={() => setQuickDateOpen((v) => !v)}
        onMoveNextDay={() => {
          if (quickMenu) doQuickMoveNextDay(quickMenu);
        }}
        onMoveToDate={(date) => {
          if (quickMenu) void doQuickMove(quickMenu, date);
        }}
        onSkip={() => setConfirmKind("quick-skip")}
        onUnskip={() => {
          if (quickMenu) void doQuickSkip(quickMenu, false);
        }}
        onDelete={() => setConfirmKind("quick-delete")}
        onClose={closeQuickMenu}
      />
      {/* Skip / delete confirm gates for a quick session — the native
          `window.confirm` (the web asks before both). */}
      <SlotConfirmDialog
        visible={confirmKind === "quick-skip" && quickMenu !== null}
        title="Skip session?"
        message="It’ll be marked skipped and won’t count as done."
        confirmLabel="Skip"
        pending={quickPending}
        onConfirm={() => {
          if (quickMenu) void doQuickSkip(quickMenu, true);
        }}
        onClose={closeConfirm}
        testID="quick-confirm-skip"
      />
      <SlotConfirmDialog
        visible={confirmKind === "quick-delete" && quickMenu !== null}
        title="Delete session?"
        message="This can’t be undone."
        confirmLabel="Delete"
        pending={quickPending}
        onConfirm={() => {
          if (quickMenu) void doQuickDelete(quickMenu);
        }}
        onClose={closeConfirm}
        testID="quick-confirm-delete"
      />
      {/* Past-day summaries (NP-115): the program log on its completion date
          through the NP-086 summary, and the quick session read. */}
      <DaySummarySheets
        programSlot={summarySlot}
        quickSession={summaryQuick}
        getToken={getToken}
        onCloseProgram={() => setSummarySlot(null)}
        onCloseQuick={() => setSummaryQuick(null)}
        onViewLog={() => {
          setSummarySlot(null);
          setSummaryQuick(null);
          router.replace("/progress" as never);
        }}
        onViewJourney={(programId) => {
          setSummarySlot(null);
          router.push(
            `/(tabs)/programming/${encodeURIComponent(programId)}/journey` as never,
          );
        }}
      />
    </SafeAreaView>
  );
}
