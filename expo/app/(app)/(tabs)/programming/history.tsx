import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from "react-native";
import type { z } from "zod";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, Clock, Dumbbell, History, Pencil, Sparkles } from "lucide-react-native";
import {
  PastWorkoutLogResponseSchema,
  QuickSessionResponseSchema,
  WorkoutHistoryResponseSchema,
  apiFetch,
  type QuickSession,
  type StoredWorkoutLog,
  type WorkoutHistoryEntry,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useScreenFocus } from "@/lib/navigation/useScreenFocus";
import { ScreenState } from "@/components/ScreenState";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import {
  HISTORY_FILTERS,
  countHistoryLogs,
  filterHistoryLogs,
  formatHistoryDateLabel,
  historyRowKey,
  type HistoryFilter,
} from "@/lib/history/history";
import { openHistoryQuickSession } from "@/lib/history/openHistoryQuick";
import { TrainingLogCorrectionSheet } from "@/components/workout/TrainingLogCorrectionSheet";
import {
  correctableFromQuickSession,
  correctableFromStoredLog,
  type CorrectableWorkout,
} from "@/lib/workout/correction";

/**
 * TRAINING HISTORY (NP-112).
 *
 * Native port of `webapp/app/dashboard/history/HistoryClient.tsx`:
 *
 *   - `GET /api/workouts/logs` in history mode (completed sessions only, the
 *     whole history in one response). The route has no paging, so the list is
 *     a virtualised `FlatList` with pull to refresh.
 *   - filters All / Programs / Quick with counts, labels Today, Yesterday, a
 *     weekday or a date (device-local day — log dates are instants).
 *   - program rows open the program; quick rows reopen the session:
 *     completed ones as a repeat (a fresh draft that can never overwrite the
 *     historical log), incomplete ones resumed in place.
 *
 * The server's order is the order: the client never re-sorts, so the native
 * list shows the same sessions in the same order as the web.
 */

function HistoryRow({
  log,
  index,
  onOpenProgram,
  onOpenQuick,
  onCorrect,
  correcting,
  opening,
}: {
  log: WorkoutHistoryEntry;
  index: number;
  onOpenProgram: (programId: string) => void;
  onOpenQuick: (log: WorkoutHistoryEntry) => void;
  onCorrect: (log: WorkoutHistoryEntry) => void;
  correcting: boolean;
  opening: string | null;
}) {
  const { colors, tint } = useThemeTokens();
  const isQuick = log.kind === "quick";
  const busy = opening === historyRowKey(log, index);
  const label = formatHistoryDateLabel(log.date);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Pressable
        testID={`history-row-${isQuick ? "quick" : "program"}-${log.sessionId ?? log.date}-${index}`}
        accessibilityRole="button"
        accessibilityLabel={`${log.title}, ${label}, ${log.exerciseCount} ${log.exerciseCount === 1 ? "exercise" : "exercises"}${log.duration ? `, ${log.duration} minutes` : ""}`}
        accessibilityHint={isQuick ? "Reopens this session" : "Opens this program"}
        onPress={() =>
          isQuick
            ? onOpenQuick(log)
            : log.programId
              ? onOpenProgram(log.programId)
              : onOpenQuick(log)
        }
        disabled={busy}
        style={[minTouchTarget, { flex: 1, opacity: busy ? 0.6 : 1 }]}
      >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          padding: 16,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            backgroundColor: isQuick
              ? tint("accent", 0.15)
              : tint("success", 0.15),
          }}
        >
          {isQuick ? (
            <Sparkles size={20} color={colors.accent} />
          ) : (
            <Dumbbell size={20} color={colors.success} />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              className="text-foreground text-sm font-semibold"
              style={[WRAPPABLE_TEXT, { flexShrink: 1 }]}
              numberOfLines={1}
            >
              {log.title}
            </Text>
            <View
              style={{
                borderRadius: 999,
                paddingHorizontal: 6,
                paddingVertical: 2,
                flexShrink: 0,
                backgroundColor: isQuick
                  ? tint("accent", 0.15)
                  : tint("success", 0.15),
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "500",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  color: isQuick ? colors.accent : colors.success,
                }}
              >
                {isQuick ? "Quick" : "Program"}
              </Text>
            </View>
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 2,
              gap: 12,
            }}
          >
            <Text className="text-muted-foreground text-xs">{label}</Text>
            <Text className="text-muted-foreground text-xs">
              {log.exerciseCount} {log.exerciseCount === 1 ? "exercise" : "exercises"}
            </Text>
            {log.duration ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Clock size={12} color={colors["muted-foreground"]} />
                <Text className="text-muted-foreground text-xs">
                  {log.duration} min
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
      </Pressable>
        {/* A finished log can be corrected in place — the row itself keeps its
            open/reopen tap, so the pencil is its own target beside it. */}
        {log.completed ? (
          <Pressable
            testID={`history-correct-${log.sessionId ?? log.date}-${index}`}
            accessibilityRole="button"
            accessibilityLabel={`Correct ${log.title}`}
            accessibilityHint="Fix a mistyped set in this finished workout"
            disabled={correcting}
            onPress={() => onCorrect(log)}
            style={[
              minTouchTarget,
              {
                width: 40,
                height: 40,
                borderRadius: 12,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                flexShrink: 0,
                opacity: correcting ? 0.6 : 1,
              },
            ]}
          >
            {correcting ? (
              <ActivityIndicator size="small" color={colors["muted-foreground"]} />
            ) : (
              <Pencil size={16} color={colors["muted-foreground"]} />
            )}
          </Pressable>
        ) : null}
    </View>
  );
}

export interface HistoryRouteProps {
  /** DI for tests — the history payload, skipping the network. */
  initialLogs?: WorkoutHistoryEntry[] | null;
  /** DI for tests — the auth token. */
  tokenForTests?: string | null;
}

export default function HistoryRoute({
  initialLogs,
  tokenForTests,
}: HistoryRouteProps = {}) {
  const { colors, tint } = useThemeTokens();
  const router = useRouter();
  const { token: authToken } = useAuth();
  const token = tokenForTests !== undefined ? tokenForTests : authToken;

  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  // The log being corrected: the row plus its logged sets, fetched from the
  // single-log read (the history list carries counts, not sets).
  const [correcting, setCorrecting] = useState<CorrectableWorkout | null>(null);
  const [correctingKey, setCorrectingKey] = useState<string | null>(null);
  const [correctError, setCorrectError] = useState<string | null>(null);

  const history = useFetch<z.infer<typeof WorkoutHistoryResponseSchema>>(
    "/api/workouts/logs",
    WorkoutHistoryResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token || initialLogs !== undefined,
    },
  );

  // Refetch when the screen regains focus (a finished workout lands here).
  useScreenFocus(
    useCallback(() => {
      if (initialLogs === undefined && token) {
        void history.refetch();
      }
    }, [initialLogs, token, history]),
  );

  const logs = useMemo(
    () => initialLogs ?? history.data?.logs ?? [],
    [initialLogs, history.data?.logs],
  );
  const counts = useMemo(() => countHistoryLogs(logs), [logs]);
  const filtered = useMemo(
    () => filterHistoryLogs(logs, filter),
    [logs, filter],
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await history.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [history]);

  const onOpenProgram = useCallback(
    (programId: string) => {
      router.push(`/(tabs)/programming/${encodeURIComponent(programId)}`);
    },
    [router],
  );

  const onOpenQuick = useCallback(
    async (log: WorkoutHistoryEntry, index?: number) => {
      const key = historyRowKey(log, index ?? logs.indexOf(log));
      if (opening) return;
      setOpening(key);
      setOpenError(null);
      try {
        const href = await openHistoryQuickSession(
          {
            sessionId: log.sessionId,
            title: log.title,
            ...(log.focus ? { focus: log.focus } : {}),
            ...(log.favorite ? { favorite: true } : {}),
            completed: log.completed,
            ...(log.exercises ? { exercises: log.exercises } : {}),
          },
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        if (href) {
          router.push(href as never);
        } else {
          setOpenError("That session isn't available anymore.");
        }
      } finally {
        setOpening(null);
      }
    },
    [logs, opening, router, token],
  );

  // Correct a finished log. The history list carries counts, not sets — so
  // the logged sets are read back first: a quick log from the session read,
  // a program log from the past-log read (matched on its UTC calendar day,
  // the same day the route files it under). The PATCH then rewrites the log
  // and the server recomputes PRs from the corrected history.
  const correctingRef = useRef<string | null>(null);
  const onCorrect = useCallback(
    async (log: WorkoutHistoryEntry) => {
      const key = log.sessionId ?? log.date;
      if (correctingRef.current) return;
      correctingRef.current = key;
      setCorrectingKey(key);
      setCorrectError(null);
      try {
        const opts = {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        };
        if (log.kind === "quick" && log.sessionId) {
          const res = await apiFetch<z.infer<typeof QuickSessionResponseSchema>>(
            `/api/workouts/session?id=${encodeURIComponent(log.sessionId)}`,
            QuickSessionResponseSchema,
            opts,
          );
          const data: QuickSession | null = res.session;
          if (!data) {
            setCorrectError("That session isn't available anymore.");
            return;
          }
          setCorrecting(correctableFromQuickSession(data));
          return;
        }
        if (log.kind !== "quick" && log.programId) {
          const day = log.date.slice(0, 10);
          const res = await apiFetch<z.infer<typeof PastWorkoutLogResponseSchema>>(
            `/api/workouts/log?programId=${encodeURIComponent(log.programId)}&date=${encodeURIComponent(day)}`,
            PastWorkoutLogResponseSchema,
            opts,
          );
          const data: StoredWorkoutLog | null = res.log;
          if (!data) {
            setCorrectError("That workout isn't available anymore.");
            return;
          }
          setCorrecting(correctableFromStoredLog(data));
          return;
        }
        setCorrectError("That workout can't be corrected here.");
      } catch {
        setCorrectError("Could not load that workout. Check your connection and try again.");
      } finally {
        correctingRef.current = null;
        setCorrectingKey(null);
      }
    },
    [token],
  );

  const loading = history.loading && logs.length === 0 && initialLogs === undefined;
  const hasData = logs.length > 0;
  const isEmpty = !loading && !history.error && filtered.length === 0;

  const emptyMessage =
    filter === "quick"
      ? "Start a Quick Session and it will show up here."
      : filter === "program"
        ? "Complete a program workout and it will show up here."
        : "Your completed workouts will appear here.";

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="history-route"
    >
      <ScreenState
        loading={loading}
        error={hasData ? null : history.error}
        onRetry={() => void history.refetch()}
        hasData={hasData}
        empty={isEmpty && filtered.length === 0 && logs.length === 0}
        emptyTitle="No sessions yet"
        emptyMessage={emptyMessage}
        testID="history-screen-state"
      >
        <View style={{ flex: 1, padding: 16 }}>
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <Pressable
              testID="history-back-button"
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => router.back()}
              style={[
                minTouchTarget,
                {
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  justifyContent: "center",
                  alignItems: "center",
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}
            >
              <ChevronLeft size={20} color={colors.foreground} />
            </Pressable>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <History size={22} color={colors.success} />
              <Text
                accessibilityRole="header"
                className="text-foreground text-2xl font-bold"
              >
                History
              </Text>
            </View>
          </View>
          <Text className="text-muted-foreground text-sm mt-2">
            Every session you&apos;ve completed — programs and quick workouts.
          </Text>

          <View
            testID="history-filters"
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 16,
              marginBottom: 12,
            }}
          >
            {HISTORY_FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <Pressable
                  key={f.key}
                  testID={`history-filter-${f.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter by ${f.label}, ${counts[f.key]} sessions`}
                  accessibilityState={{ selected: active }}
                  onPress={() => setFilter(f.key)}
                  style={[
                    minTouchTarget,
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      borderRadius: 999,
                      paddingHorizontal: 14,
                      paddingVertical: 6,
                      backgroundColor: active ? colors.success : colors.card,
                      borderWidth: 1,
                      borderColor: active ? colors.success : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: active
                        ? colors["primary-foreground"]
                        : colors.foreground,
                    }}
                  >
                    {f.label}
                  </Text>
                  <View
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 6,
                      backgroundColor: active
                        ? tint("success", 0.35)
                        : colors.muted,
                    }}
                  >
                    <Text
                      testID={`history-filter-${f.key}-count`}
                      style={{
                        fontSize: 12,
                        color: active
                          ? colors["primary-foreground"]
                          : colors["muted-foreground"],
                      }}
                    >
                      {counts[f.key]}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {openError ? (
            <Text
              testID="history-open-error"
              accessibilityRole="alert"
              className="text-destructive text-sm mb-2"
            >
              {openError}
            </Text>
          ) : null}
          {correctError ? (
            <Text
              testID="history-correction-error"
              accessibilityRole="alert"
              className="text-destructive text-sm mb-2"
            >
              {correctError}
            </Text>
          ) : null}

          {filtered.length === 0 && logs.length > 0 ? (
            <View
              testID="history-filter-empty"
              style={{ alignItems: "center", paddingVertical: 32, gap: 8 }}
            >
              <Dumbbell size={28} color={colors["muted-foreground"]} />
              <Text className="text-foreground text-base font-semibold">
                No sessions yet
              </Text>
              <Text className="text-muted-foreground text-sm text-center">
                {emptyMessage}
              </Text>
            </View>
          ) : (
            <FlatList
              testID="history-list"
              data={filtered}
              keyExtractor={(item, i) => historyRowKey(item, i)}
              renderItem={({ item, index }) => (
                <HistoryRow
                  log={item}
                  index={index}
                  onOpenProgram={onOpenProgram}
                  onOpenQuick={(log) => void onOpenQuick(log, index)}
                  onCorrect={(log) => void onCorrect(log)}
                  correcting={correctingKey === (item.sessionId ?? item.date)}
                  opening={opening}
                />
              )}
              ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
              contentContainerStyle={{ paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => void onRefresh()}
                  tintColor={colors.foreground}
                />
              }
              windowSize={7}
              maxToRenderPerBatch={10}
              initialNumToRender={12}
              removeClippedSubviews
            />
          )}
        </View>
      </ScreenState>
      {correcting ? (
        <TrainingLogCorrectionSheet
          key={correcting.sessionId ?? correcting.rawDate}
          workout={correcting}
          onClose={() => setCorrecting(null)}
          onSaved={async () => {
            setCorrecting(null);
            await history.refetch();
          }}
          authToken={token}
        />
      ) : null}
    </SafeAreaView>
  );
}
