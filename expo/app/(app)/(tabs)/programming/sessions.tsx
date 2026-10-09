import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Bookmark,
  Calendar,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  GripVertical,
  Pencil,
  Plus,
  Sparkles,
  Upload,
  Zap,
} from "lucide-react-native";
import type { z } from "zod";
import {
  FavoriteOrderRequestSchema,
  FavoriteOrderResponseSchema,
  PlannedWorkoutsResponseSchema,
  QuickSessionPatchResponseSchema,
  QuickSessionResponseSchema,
  WorkoutHistoryResponseSchema,
  apiFetch,
  type FavoriteOrderResponse,
  type PlannedQuickSession,
  type QuickSession,
  type QuickSessionPatchRequest,
  type WorkoutHistoryEntry,
} from "@become/api-client";
import { generateSession as generateSessionCall } from "@/lib/programs/generate";
import { Text } from "@/components/Text";
import { ScreenState } from "@/components/ScreenState";
import { AllowanceCounter } from "@/components/entitlements/AllowanceCounter";
import { AllowanceLock } from "@/components/entitlements/AllowanceLock";
import { PasteImportSheet, type ImportOutcome } from "@/components/workout/PasteImportSheet";
import { TrainingLogCorrectionSheet } from "@/components/workout/TrainingLogCorrectionSheet";
import { correctableFromQuickSession, type CorrectableWorkout } from "@/lib/workout/correction";
import { importSessionFromText } from "@/lib/workout/importWorkoutRun";
import { useEntitlements } from "@/lib/entitlements";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { routeApiError } from "@/lib/errors";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { setImportedSessionDraft } from "@/lib/quickSession/importHandoff";
import {
  quickSessionOverviewHref,
  stashQuickSession,
  stashQuickSessionWithId,
} from "@/lib/quickSession/store";
import {
  formatPlannedDate,
  formatSessionDate,
  isHubFocusKey,
  moveInArray,
  sortFavoritesFirst,
  type HubPlannedSession,
  type HubSession,
} from "@/lib/quickSession/sessionsHub";

/**
 * SESSIONS HUB — saved, starred and planned sessions (NP-134).
 *
 * Native port of the Sessions tab in
 * `webapp/app/dashboard/workout/hub/HubClient.tsx`:
 *
 *   • `GET /api/workouts/logs?withExercises=true` lists the member's quick
 *     sessions (program logs are filtered out, exactly as the web does);
 *     `GET /api/workouts/planned` lists sessions planned for later days.
 *   • Star/unstar with `PATCH /api/workouts/session { id, favorite }`.
 *     Starring is gated by `custom-sessions` through `requireQuota`;
 *     UNSTARRING is always free, so a member at 3 of 3 always has a way back
 *     under the cap. A gate refusal rolls the star back and raises the
 *     upgrade sheet (NP-052); anything else is the server's own words.
 *   • Reorder favorites with `PATCH /api/workouts/favorite-order` (the FULL
 *     new order, optimistic with rollback — the web's `onFavoriteDragEnd`).
 *   • Tapping a saved session reopens THAT session (same title, same
 *     exercises) under a NEW id, so finishing the repeat cannot overwrite the
 *     historical log it was copied from. Very old logs without exercises fall
 *     back to regenerating (`POST /api/generate/session`, never metered).
 *   • Tapping a planned session starts it under its OWN session id, so
 *     finishing it consumes the plan rather than creating a new log.
 *   • Entry points to the session builder (NP-137, native) and import
 *     (NP-243, native — the paste sheet opens in place and hands a
 *     resolved draft to the builder). No "Generate a session instead" row
 *     here (NP-279): the web's Sessions tab (`HubClient.tsx`) has none —
 *     Generate stays reachable from the Workout tab's own home
 *     (`app/(app)/(tabs)/programming/index.tsx`, NP-133).
 */

type HistoryResponse = z.infer<typeof WorkoutHistoryResponseSchema>;
type PlannedResponse = z.infer<typeof PlannedWorkoutsResponseSchema>;

// The Workout Hub tab switcher (NP-239) — native counterpart of the web's
// segmented `TABS` control in `HubClient.tsx`. The web keeps all three
// panels mounted behind `?tab=`; native already routes Exercises, Sessions
// and Programs as their own screens, so this switches by pushing between
// them instead. Sessions is always the active tab here since this IS that
// screen.
type HubTabKey = "exercises" | "sessions" | "programs";
const HUB_TABS: { key: HubTabKey; label: string; route: string; icon: typeof Dumbbell }[] = [
  { key: "exercises", label: "Exercises", route: "/(tabs)/programming/exercises", icon: Dumbbell },
  { key: "sessions", label: "Sessions", route: "/(tabs)/programming/sessions", icon: Zap },
  { key: "programs", label: "Programs", route: "/(tabs)/programming/mine", icon: Sparkles },
];

function toHubSession(log: WorkoutHistoryEntry): HubSession {
  return {
    kind: log.kind,
    title: log.title,
    ...(log.focus ? { focus: log.focus } : {}),
    date: log.date,
    ...(log.duration != null ? { duration: log.duration } : {}),
    exerciseCount: log.exerciseCount,
    ...(log.sessionId ? { sessionId: log.sessionId } : {}),
    ...(log.favorite ? { favorite: true } : {}),
    ...(log.exercises ? { exercises: log.exercises } : {}),
  };
}

function toHubPlanned(p: PlannedQuickSession): HubPlannedSession {
  return {
    sessionId: p.sessionId,
    title: p.title,
    ...(p.focus ? { focus: p.focus } : {}),
    date: p.date,
    exerciseCount: p.exerciseCount,
    exercises: p.exercises,
    ...(p.needsName !== undefined ? { needsName: p.needsName } : {}),
  };
}

export default function SessionsHubRoute() {
  const { colors, tint } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();

  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    }),
    [token],
  );

  const history = useFetch<HistoryResponse>("/api/workouts/logs?withExercises=true", WorkoutHistoryResponseSchema, {
    ...fetchOpts,
    skip: !token,
  });
  const plannedFetch = useFetch<PlannedResponse>("/api/workouts/planned", PlannedWorkoutsResponseSchema, {
    ...fetchOpts,
    skip: !token,
  });

  const [sessions, setSessions] = useState<HubSession[]>([]);
  const [planned, setPlanned] = useState<HubPlannedSession[]>([]);
  // Manual drag order for favorited sessions — sessionIds, in display order.
  // A favorite not listed here (never dragged, or just starred) sorts by date
  // among the other un-ordered favorites, still above every non-favorite.
  const [favoriteOrder, setFavoriteOrder] = useState<string[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const [togglingFavorite, setTogglingFavorite] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  // The log being corrected: the row plus its logged sets, fetched from the
  // session read (the hub list carries prescriptions, not logged sets).
  const [correcting, setCorrecting] = useState<CorrectableWorkout | null>(null);
  const [correctingError, setCorrectingError] = useState<string | null>(null);
  const [loadingCorrection, setLoadingCorrection] = useState<string | null>(null);

  const {
    data: entitlements,
    refresh: refreshEntitlements,
  } = useEntitlements();
  const enforced = entitlements ? entitlements.enforced !== false : true;

  // Refusals route through the same classifier every screen uses: a plan-gate
  // raises the upgrade sheet (NP-052) and anything else comes back as the
  // server's own words. `routeApiError` without a provider would drop the
  // gate, so the sheet is raised here directly.
  const handleFailure = useCallback((err: unknown): string | null => {
    const { handled, message } = routeApiError(err, {
      onPlanGate: (gate) => {
        showUpgradeSheet(gate.gate);
      },
    });
    return handled ? null : message;
  }, []);

  // Mirror the server lists locally so star/unstar and reorder stay
  // optimistic (the list is the whole point of "quick access").
  /* eslint-disable react-hooks/set-state-in-effect -- sync optimistic local state with server fetch */
  useEffect(() => {
    if (history.data) {
      setSessions(
        history.data.logs
          .filter((l: WorkoutHistoryEntry) => l.kind === "quick")
          .map(toHubSession),
      );
      setFavoriteOrder(history.data.favoriteSessionOrder ?? []);
    }
  }, [history.data]);
  useEffect(() => {
    if (plannedFetch.data) {
      setPlanned((plannedFetch.data.planned ?? []).map(toHubPlanned));
    }
  }, [plannedFetch.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Coming back from the overview/live (or a change on another device) must
  // not paint a stale list. Re-read on focus.
  const refetchHistory = history.refetch;
  const refetchPlanned = plannedFetch.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetchHistory();
      void refetchPlanned();
    }, [refetchHistory, refetchPlanned]),
  );
  useFocusEffect(
    useCallback(() => {
      void refreshEntitlements().catch(() => {});
    }, [refreshEntitlements]),
  );

  const { favorites: favoriteSessions, others: otherSessions } = useMemo(
    () => sortFavoritesFirst(sessions, favoriteOrder),
    [sessions, favoriteOrder],
  );

  // Star/unstar a session from the list. Optimistic, with a rollback + error
  // if the PATCH fails. Starring is capped on free; UNSTARRING never is, so a
  // gate refusal here always means "your starred-session slots are full" —
  // that gets the same rollback but an upsell rather than a bare error.
  //
  // `togglingRef` (not state) guards re-entry: the closure `log` is the row as
  // rendered, so reading `togglingFavorite` state here would close over a
  // stale value and double-fire.
  const togglingRef = useRef<string | null>(null);
  const toggleFavorite = useCallback(
    async (log: HubSession) => {
      const id = log.sessionId;
      if (!id || togglingRef.current || opening) return;
      const next = !log.favorite;
      togglingRef.current = id;
      setTogglingFavorite(id);
      setActionError(null);
      setSessions((prev) => prev.map((s) => (s.sessionId === id ? { ...s, favorite: next } : s)));
      try {
        const body: QuickSessionPatchRequest = { id, favorite: next };
        await apiFetch<z.infer<typeof QuickSessionPatchResponseSchema>>(
          "/api/workouts/session",
          QuickSessionPatchResponseSchema,
          { method: "PATCH", body, ...fetchOpts },
        );
      } catch (err) {
        setSessions((prev) => prev.map((s) => (s.sessionId === id ? { ...s, favorite: !next } : s)));
        const message = handleFailure(err);
        if (message) setActionError(message);
      } finally {
        togglingRef.current = null;
        setTogglingFavorite(null);
      }
    },
    [opening, fetchOpts, handleFailure],
  );

  // Reorder within Favorites only. Optimistic + persisted as the FULL new
  // favorite order, same pattern as toggleFavorite above. The server answers
  // with what it stored (trimmed, de-duplicated), so render that.
  const moveFavorite = useCallback(
    async (sessionId: string, direction: -1 | 1) => {
      const ids = favoriteSessions.map((s) => s.sessionId);
      const from = ids.indexOf(sessionId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= ids.length) return;
      const next = moveInArray(ids, from, to);
      const prev = favoriteOrder;
      setFavoriteOrder(next);
      setActionError(null);
      try {
        const data = await apiFetch<FavoriteOrderResponse>(
          "/api/workouts/favorite-order",
          FavoriteOrderResponseSchema,
          {
            method: "PATCH",
            body: FavoriteOrderRequestSchema.parse({ order: next }),
            ...fetchOpts,
          },
        );
        setFavoriteOrder(data.favoriteSessionOrder ?? next);
      } catch (err) {
        setFavoriteOrder(prev);
        const message = handleFailure(err);
        if (message) setActionError(message);
      }
    },
    [favoriteSessions, favoriteOrder, fetchOpts, handleFailure],
  );

  // Open a planned session under its OWN sessionId so finishing it consumes
  // the plan (updates the same log to completed) rather than creating a new one.
  const startPlanned = useCallback(
    async (p: HubPlannedSession) => {
      if (opening) return;
      setOpening(p.sessionId);
      setActionError(null);
      try {
        await stashQuickSessionWithId(
          {
            title: p.title,
            ...(isHubFocusKey(p.focus) ? { focus: p.focus } : {}),
            exercises: p.exercises,
            source: "saved",
          },
          p.sessionId,
          { needsName: p.needsName },
        );
        // saved: it already exists server-side under this id, so edits write back.
        router.push(quickSessionOverviewHref(p.sessionId, { saved: true }) as never);
      } finally {
        setOpening(null);
      }
    },
    [opening, router],
  );

  // Tapping a past session opens THAT session — same title, same exercises.
  // Opened under a NEW sessionId on purpose: a save matches the log by
  // sessionId and updates it in place, so reusing the completed log's id
  // would overwrite that day's history the moment the repeat is finished.
  const openSession = useCallback(
    async (log: HubSession) => {
      const key = log.sessionId ?? log.date;
      if (opening) return;
      setOpening(key);
      setActionError(null);
      try {
        if (log.exercises?.length) {
          const id = await stashQuickSession(
            {
              title: log.title,
              ...(isHubFocusKey(log.focus) ? { focus: log.focus } : {}),
              exercises: log.exercises,
              source: "saved",
            },
            {
              needsName: false,
              ...(log.sessionId ? { sourceSessionId: log.sessionId } : {}),
              ...(log.favorite ? { favorite: true } : {}),
            },
          );
          router.push(quickSessionOverviewHref(id) as never);
          return;
        }
        // Legacy log with no stored exercises — nothing to reopen, so fall
        // back to generating a fresh session from its focus. The generator is
        // never metered, so a refusal here is an ordinary error, never the
        // upgrade sheet.
        try {
          const data = await generateSessionCall(
            {
              focus: isHubFocusKey(log.focus) ? log.focus : "full_body",
              difficulty: "intermediate",
              equipment: [],
              exerciseCount: 5,
              includeCardio: false,
            },
            fetchOpts,
          );
          if (!data?.session) throw new Error("no session");
          const id = await stashQuickSession(
            {
              title: data.session.title,
              ...(isHubFocusKey(data.session.focus) ? { focus: data.session.focus } : {}),
              exercises: data.session.exercises,
              source: "generated",
            },
            { needsName: true },
          );
          router.push(quickSessionOverviewHref(id) as never);
        } catch (err) {
          const message = handleFailure(err);
          if (message) setActionError(message);
        }
      } finally {
        setOpening(null);
      }
    },
    [opening, fetchOpts, handleFailure, router],
  );

  // Correct a finished quick session. The hub list carries prescriptions
  // (what to do next time), not logged sets — so the logged sets are read
  // back from `GET /api/workouts/session?id=` first, and the sheet edits
  // that. The PATCH then rewrites the log and the server recomputes PRs.
  const correctingRef = useRef(false);
  const openCorrection = useCallback(
    async (log: HubSession) => {
      const id = log.sessionId;
      if (!id || correctingRef.current) return;
      correctingRef.current = true;
      setLoadingCorrection(id);
      setCorrectingError(null);
      try {
        const res = await apiFetch<z.infer<typeof QuickSessionResponseSchema>>(
          `/api/workouts/session?id=${encodeURIComponent(id)}`,
          QuickSessionResponseSchema,
          { ...fetchOpts },
        );
        const data: QuickSession | null = res.session;
        if (!data) {
          setCorrectingError("That session isn't available anymore.");
          return;
        }
        setCorrecting(correctableFromQuickSession(data));
      } catch (err) {
        const message = handleFailure(err);
        if (message) setCorrectingError(message);
      } finally {
        correctingRef.current = false;
        setLoadingCorrection(null);
      }
    },
    [fetchOpts, handleFailure],
  );

  // The session builder (NP-137) is native now — the Build button opens the
  // in-app builder route. Import (NP-243) opens the paste sheet in place.
  const openBuilder = useCallback(() => {
    router.push("/(tabs)/programming/quick/build" as never);
  }, [router]);
  const openImport = useCallback(() => {
    setShowImport(true);
  }, []);

  // Runs the AI import once (NP-242) and, on a resolved session, sets the
  // handoff and navigates to the builder BEFORE this resolves — so by the
  // time the sheet sees `ok` and closes itself, the builder is already the
  // active screen underneath it. A gate refusal raises the existing upgrade
  // path; the sheet treats that the same as `consent` (close, let the other
  // sheet take over) rather than inventing a second error state for it.
  const handleImportSubmit = useCallback(
    async (text: string): Promise<ImportOutcome> => {
      const outcome = await importSessionFromText(text, fetchOpts);
      if (outcome.status === "ok") {
        setImportedSessionDraft({
          title: outcome.session.title,
          exercises: outcome.session.exercises,
          unresolved: outcome.session.unresolved,
        });
        router.push("/(tabs)/programming/quick/build" as never);
      } else if (outcome.status === "gate") {
        showUpgradeSheet(outcome.gate);
      }
      return outcome;
    },
    [fetchOpts, router],
  );

  const loading = (history.loading && sessions.length === 0) || (plannedFetch.loading && planned.length === 0);
  const fetchError = history.error ?? plannedFetch.error;
  const retry = useCallback(() => {
    void history.refetch();
    void plannedFetch.refetch();
  }, [history, plannedFetch]);
  const renderSessionRow = (log: HubSession, opts?: { favoriteIndex?: number; favoriteCount?: number }) => {
    const id = log.sessionId ?? `${log.title}-${log.date}`;
    const busy = opening === (log.sessionId ?? log.date);
    const toggling = togglingFavorite === log.sessionId;
    const favIndex = opts?.favoriteIndex;
    const favCount = opts?.favoriteCount ?? 0;
    return (
      <View
        key={id}
        testID={`sessions-row-${log.sessionId ?? id}`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          padding: 12,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          marginBottom: 12,
          opacity: busy ? 0.6 : 1,
        }}
      >
        {favIndex !== undefined ? (
          <View style={{ flexDirection: "column", gap: 2 }}>
            <Pressable
              testID={`sessions-move-up-${log.sessionId}`}
              accessibilityRole="button"
              accessibilityLabel={`Move ${log.title} up in favorites`}
              disabled={favIndex <= 0}
              onPress={() => void moveFavorite(log.sessionId!, -1)}
              style={{ padding: 6, opacity: favIndex <= 0 ? 0.3 : 1, ...minTouchTarget }}
            >
              <ChevronLeft color={colors["muted-foreground"]} size={16} strokeWidth={2} style={{ transform: [{ rotate: "90deg" }] }} />
            </Pressable>
            <Pressable
              testID={`sessions-move-down-${log.sessionId}`}
              accessibilityRole="button"
              accessibilityLabel={`Move ${log.title} down in favorites`}
              disabled={favIndex >= favCount - 1}
              onPress={() => void moveFavorite(log.sessionId!, 1)}
              style={{ padding: 6, opacity: favIndex >= favCount - 1 ? 0.3 : 1, ...minTouchTarget }}
            >
              <ChevronLeft color={colors["muted-foreground"]} size={16} strokeWidth={2} style={{ transform: [{ rotate: "-90deg" }] }} />
            </Pressable>
          </View>
        ) : null}
        <Pressable
          testID={`sessions-open-${log.sessionId ?? id}`}
          accessibilityRole="button"
          accessibilityLabel={`Open session ${log.title}`}
          onPress={() => void openSession(log)}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.muted,
            }}
          >
            <Sparkles color={colors.primary} size={20} strokeWidth={1.5} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
              {log.title}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
              <Text className="text-muted-foreground text-xs">
                <Calendar color={colors["muted-foreground"]} size={12} strokeWidth={1.5} /> {formatSessionDate(log.date)}
              </Text>
              <Text className="text-muted-foreground text-xs">
                {log.exerciseCount} {log.exerciseCount === 1 ? "exercise" : "exercises"}
              </Text>
              {log.duration ? (
                <Text className="text-muted-foreground text-xs">
                  <Clock color={colors["muted-foreground"]} size={12} strokeWidth={1.5} /> {log.duration} min
                </Text>
              ) : null}
            </View>
          </View>
          {busy ? (
            <ActivityIndicator size="small" color={colors["muted-foreground"]} />
          ) : (
            <ChevronRight color={colors["muted-foreground"]} size={16} strokeWidth={1.5} />
          )}
        </Pressable>
        {log.sessionId ? (
          <Pressable
            testID={`sessions-correct-${log.sessionId}`}
            accessibilityRole="button"
            accessibilityLabel={`Correct ${log.title}`}
            accessibilityHint="Fix a mistyped set in this finished session"
            disabled={loadingCorrection === log.sessionId}
            onPress={() => void openCorrection(log)}
            style={{ padding: 8, ...minTouchTarget }}
          >
            {loadingCorrection === log.sessionId ? (
              <ActivityIndicator size="small" color={colors["muted-foreground"]} />
            ) : (
              <Pencil color={colors["muted-foreground"]} size={20} strokeWidth={1.5} />
            )}
          </Pressable>
        ) : null}
        {log.sessionId ? (
          <Pressable
            testID={`sessions-favorite-${log.sessionId}`}
            accessibilityRole="button"
            accessibilityLabel={log.favorite ? "Remove from favorites" : "Add to favorites"}
            disabled={toggling}
            onPress={() => void toggleFavorite(log)}
            style={{ padding: 8, ...minTouchTarget }}
          >
            {toggling ? (
              <ActivityIndicator size="small" color={colors["muted-foreground"]} />
            ) : (
              <Bookmark
                color={log.favorite ? colors.primary : colors["muted-foreground"]}
                fill={log.favorite ? colors.primary : "transparent"}
                size={20}
                strokeWidth={1.5}
              />
            )}
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="sessions-hub-route"
    >
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <Pressable
            testID="sessions-hub-back"
            accessibilityRole="button"
            accessibilityLabel="Back to workout"
            onPress={() => router.back()}
            style={{ padding: 8, ...minTouchTarget }}
          >
            <ChevronLeft color={colors.foreground} size={22} strokeWidth={2} />
          </Pressable>
          <Text className="text-foreground text-2xl font-bold">Sessions</Text>
        </View>

        {/* Workout Hub tab switcher: Exercises / Sessions / Programs (NP-239) */}
        <View
          testID="sessions-hub-tabs"
          style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}
        >
          {HUB_TABS.map((t) => {
            const active = t.key === "sessions";
            const Icon = t.icon;
            return (
              <Pressable
                key={t.key}
                testID={`sessions-hub-tab-${t.key}`}
                accessibilityRole="button"
                accessibilityLabel={`${t.label} tab`}
                accessibilityState={{ selected: active }}
                disabled={active}
                onPress={() => {
                  if (!active) router.push(t.route as never);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 14,
                  height: 32,
                  borderRadius: 16,
                  // The web's active tab is `bg-green-500` (HubClient.tsx), not
                  // the neutral `primary` NP-313 moved the rest of the app to —
                  // this hub keeps its own green identity.
                  backgroundColor: active ? colors.success : colors.muted,
                  ...minTouchTarget,
                }}
              >
                <Icon
                  color={active ? colors["primary-foreground"] : colors["muted-foreground"]}
                  size={14}
                  strokeWidth={2}
                />
                <Text
                  className="text-xs font-semibold"
                  style={{ color: active ? colors["primary-foreground"] : colors["muted-foreground"] }}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {enforced ? (
          <View testID="sessions-allowance" style={{ marginBottom: 12 }}>
            <AllowanceCounter feature="custom-sessions" testID="sessions-allowance-counter" />
          </View>
        ) : null}

        {actionError ? (
          <View
            testID="sessions-action-error"
            style={{
              padding: 12,
              borderRadius: 12,
              backgroundColor: colors.muted,
              marginBottom: 12,
            }}
          >
            <Text className="text-foreground text-sm">{actionError}</Text>
          </View>
        ) : null}
        {correctingError ? (
          <View
            testID="sessions-correction-error"
            style={{
              padding: 12,
              borderRadius: 12,
              backgroundColor: colors.muted,
              marginBottom: 12,
            }}
          >
            <Text
              testID="sessions-correction-error-text"
              accessibilityRole="alert"
              className="text-foreground text-sm"
            >
              {correctingError}
            </Text>
          </View>
        ) : null}

        <ScreenState
          loading={loading}
          error={fetchError}
          onRetry={retry}
          hasData={sessions.length > 0 || planned.length > 0}
          testID="sessions-hub-state"
        >
          {/* Planned (upcoming) sessions — future-dated ones set with "Log or
              plan". Tap to review + start; finishing consumes the plan. */}
          {planned.length > 0 ? (
            <View style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                {/* The web's "Planned" heading icon is `text-emerald-600
                    dark:text-emerald-400` (HubClient.tsx) — this app's own
                    green family is `success`, not the neutral `primary`. */}
                <CalendarClock color={colors.success} size={16} strokeWidth={1.5} />
                <Text className="text-foreground text-lg font-semibold">Planned</Text>
              </View>
              {planned.map((p) => {
                const busy = opening === p.sessionId;
                return (
                  <Pressable
                    key={p.sessionId}
                    testID={`sessions-planned-${p.sessionId}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Start planned session ${p.title}`}
                    onPress={() => void startPlanned(p)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      padding: 12,
                      borderRadius: 16,
                      borderWidth: 1,
                      // A 4px green LEFT accent, same pattern as the
                      // recommended-program card (ProgramsCatalog.tsx) —
                      // the web's planned `Card accent="success"` 3px stripe.
                      borderLeftWidth: 4,
                      borderColor: colors.border,
                      borderLeftColor: colors.success,
                      backgroundColor: colors.card,
                      marginBottom: 12,
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        alignItems: "center",
                        justifyContent: "center",
                        // The web's tile is `bg-emerald-100 dark:bg-emerald-900/30`
                        // with an emerald icon — a tinted wash of the same
                        // green the stripe and heading use, not the neutral
                        // `muted` every other row's tile uses.
                        backgroundColor: tint("success", 0.15),
                      }}
                    >
                      <CalendarClock color={colors.success} size={20} strokeWidth={1.5} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                        {p.title}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
                        {/* The web puts a `Calendar` icon before the green
                            date text (HubClient.tsx's `inline-flex` span) —
                            native had the text alone. */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Calendar color={colors.success} size={12} strokeWidth={1.5} />
                          <Text className="text-xs font-medium" style={{ color: colors.success }}>
                            {formatPlannedDate(p.date)}
                          </Text>
                        </View>
                        <Text className="text-muted-foreground text-xs">
                          {p.exerciseCount} {p.exerciseCount === 1 ? "exercise" : "exercises"}
                        </Text>
                      </View>
                    </View>
                    {busy ? (
                      <ActivityIndicator size="small" color={colors["muted-foreground"]} />
                    ) : (
                      <ChevronRight color={colors["muted-foreground"]} size={16} strokeWidth={1.5} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* Header + create toggle (mirrors the web's Exercises tab) */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text className="text-foreground text-lg font-semibold">Your sessions</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                testID="sessions-import"
                accessibilityRole="button"
                accessibilityLabel="Import a session"
                onPress={openImport}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 14,
                  height: 36,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Upload color={colors["muted-foreground"]} size={16} strokeWidth={1.5} />
                <Text className="text-muted-foreground text-sm font-semibold">Import</Text>
              </Pressable>
              <Pressable
                testID="sessions-build"
                accessibilityRole="button"
                accessibilityLabel="Build a session"
                onPress={openBuilder}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 16,
                  height: 36,
                  borderRadius: 18,
                  // The web's Build button is `bg-green-600` (HubClient.tsx),
                  // not the neutral `primary` NP-313 moved everything else to.
                  backgroundColor: colors.success,
                }}
              >
                <Plus color={colors["primary-foreground"]} size={16} strokeWidth={2} />
                <Text className="text-sm font-semibold" style={{ color: colors["primary-foreground"] }}>
                  Build
                </Text>
              </Pressable>
            </View>
          </View>

          {/* NP-279: the web's Sessions tab (HubClient.tsx) has no "Generate
              a session" row — Generate stays reachable from the Workout tab's
              own entry point (app/(app)/(tabs)/programming/index.tsx). This
              row was a native-only addition this visual pass drops to match. */}

          {sessions.length === 0 ? (
            // Dashed empty-state card — matches the web's `EmptyState`
            // (rounded-2xl, dashed border without opaque card fill, icon circle)
            // so the hub never paints bare "No sessions yet" text with nowhere
            // to go: the Import/Build header above and the hub tabs stay reachable.
            <View
              testID="sessions-hub-empty"
              style={{
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 16,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: colors.border,
                padding: 32,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.muted,
                  marginBottom: 12,
                }}
              >
                <Zap color={colors["muted-foreground"]} size={24} strokeWidth={1.5} />
              </View>
              <Text className="text-foreground text-sm font-semibold text-center">
                No sessions yet
              </Text>
              <Text
                className="text-muted-foreground text-xs text-center"
                style={{ marginTop: 4, maxWidth: 280 }}
              >
                Tap Build to create your first session.
              </Text>
            </View>
          ) : (
            <>
              {favoriteSessions.length > 0 ? (
                <View style={{ marginBottom: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <Bookmark color={colors.primary} fill={colors.primary} size={12} strokeWidth={1.5} />
                    <Text className="text-muted-foreground text-xs font-semibold uppercase">Favorites</Text>
                  </View>
                  {favoriteSessions.map((log, i) =>
                    renderSessionRow(log, { favoriteIndex: i, favoriteCount: favoriteSessions.length }),
                  )}
                </View>
              ) : null}

              {otherSessions.length > 0 ? (
                <View>
                  {otherSessions.map((log) => renderSessionRow(log))}
                </View>
              ) : null}
            </>
          )}

          {enforced ? (
            <View style={{ marginTop: 8 }}>
              <AllowanceLock
                feature="custom-sessions"
                testID="sessions-allowance-lock"
                onPress={(gate) => showUpgradeSheet(gate)}
              />
            </View>
          ) : null}
        </ScreenState>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, opacity: 0 }}>
          <GripVertical color={colors["muted-foreground"]} size={12} strokeWidth={1.5} />
        </View>
      </ScrollView>

      <PasteImportSheet
        visible={showImport}
        kind="session"
        onSubmit={handleImportSubmit}
        onClose={() => setShowImport(false)}
        testID="sessions-import-sheet"
      />
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

// Re-exported for tests: the PATCH body this screen sends when starring.
// `QuickSessionPatchRequestSchema` is the contract; this is the shape.
export type { QuickSessionPatchRequest };
