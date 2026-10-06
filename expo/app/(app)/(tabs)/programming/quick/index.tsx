import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CalendarClock, Check, ChevronLeft, Pencil, Play } from "lucide-react-native";
import {
  apiFetch,
  QuickSessionPatchResponseSchema,
  WorkoutSaveResponseSchema,
  type WorkoutQuickSaveRequest,
} from "@become/api-client";
import {
  buildLoggedExercises,
  fallbackQuickSessionName,
  localDateStr,
  shouldPromptForQuickSessionName,
  type DraftExercise,
} from "@become/core";
import { Text } from "@/components/Text";
import { ExerciseAccordion } from "@/components/ExerciseAccordion";
import { NativeShareButton } from "@/components/share/NativeShareButton";
import { DatePicker } from "@/components/programs/DatePicker";
import { QuickSessionNamePrompt } from "@/components/workout/QuickSessionNamePrompt";
import { SessionEditor } from "@/components/workout/SessionEditor";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  clearQuickSession,
  quickSessionLiveHref,
  readQuickSession,
  updateQuickSession,
  type StoredQuickSession,
} from "@/lib/quickSession/store";
import {
  clearQuickProgress,
  readQuickProgress,
} from "@/lib/quickSession/progress";
import { rebuildQuickSession } from "@/lib/quickSession/rebuild";
import {
  QUICK_SESSION_DATE_RE,
  logPlanAvailability,
} from "@/lib/quickSession/logPlan";

/**
 * QUICK SESSION OVERVIEW (NP-227).
 *
 * Native port of `webapp/app/dashboard/workout/quick-session/page.tsx`:
 * the resting place for a stashed quick session. Reads the stash (rebuilding
 * from the server log via `rebuildQuickSession` when `saved=1` and there is
 * no stash), shows the title plus "Generated session"/"Saved session" and the
 * focus label, renders the exercises read-only via `ExerciseAccordion`
 * (timed work shows `sec`, not reps), and offers Start (or Continue when
 * `progress.ts` has a snapshot or `started=1`) plus the Log-or-plan panel.
 *
 * Query: `?session=&saved=1&started=1&date=YYYY-MM-DD`. A malformed `date`
 * is ignored (web `DATE_RE`). The date panel opens automatically when `date`
 * was passed.
 *
 * Editing before start (the web's `SessionEditor`, NP-137) is native here:
 * the Edit toggle swaps the read-only list for the editor; saving always
 * updates the stash (that is what Start and "Log it" read) and additionally
 * writes back to the server log when this session already exists there
 * (`saved=1`, a planned session — still a plan, not a performed workout, so
 * no `performedAt`, and the scheduled date stays where it was). A repeat
 * reopened under a fresh id keeps its `sourceSessionId`, so a rename also
 * patches the original log's title without touching its recorded exercises,
 * date or completion state. Share sits in the header row beside Edit / Log
 * or plan (NP-165), matching the web's Back / Edit / Log or plan / Share
 * top bar rather than standing alone under the title. After a Log it the
 * stash and progress are cleared; after a Plan it the member lands back on
 * the Workout tab.
 */

const FOCUS_LABELS: Record<string, string> = {
  full_body: "Full Body",
  upper: "Upper Body",
  lower: "Lower Body",
  push: "Push",
  pull: "Pull",
  legs: "Legs",
  glutes: "Glutes",
  core: "Core",
  arms: "Arms",
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  cardio: "Cardio",
};

function focusLabelFor(focus?: string): string | undefined {
  if (!focus) return undefined;
  return FOCUS_LABELS[focus];
}

function toAccordionExercise(ex: DraftExercise, index: number) {
  return {
    slug: ex.exerciseSlug || `quick-${index}`,
    name: ex.name,
    sets: ex.sets,
    reps: ex.reps || ex.duration,
    // Timed work has no reps — without this a 45-second plank renders as
    // "45 reps" (web page.tsx).
    ...(!ex.reps && ex.duration ? { repsUnit: "sec" } : {}),
    rest: ex.rest,
  };
}

export default function QuickSessionOverviewRoute() {
  const router = useRouter();
  const { colors } = useThemeTokens();
  const { token } = useAuth();
  const params = useLocalSearchParams<{
    session?: string;
    saved?: string;
    started?: string;
    date?: string;
  }>();

  const sessionId = Array.isArray(params.session)
    ? params.session[0]!
    : (params.session ?? "");
  const isSaved = params.saved === "1";
  // `started` is a fallback for devices where storage is unavailable; normal
  // resumes are detected from the progress snapshot (web page.tsx).
  const startedFromHref = params.started === "1";
  const rawDate = Array.isArray(params.date)
    ? params.date[0]
    : params.date;
  const validDateParam =
    rawDate && QUICK_SESSION_DATE_RE.test(rawDate) ? rawDate : undefined;

  const [session, setSession] = useState<StoredQuickSession | null | undefined>(
    undefined,
  );
  const [hasStarted, setHasStarted] = useState(startedFromHref);
  // Opens automatically when a specific date was requested — that is the
  // whole reason the Calendar sent the member here (web page.tsx).
  const [logOpen, setLogOpen] = useState(Boolean(validDateParam));
  const [logDate, setLogDate] = useState(validDateParam ?? localDateStr());
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Past days can only be logged, future days can only be planned, today
  // allows both (web `logPlanAvailability`).
  const { canLog, canPlan } = logPlanAvailability(logDate, localDateStr());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!sessionId) {
        if (!cancelled) setSession(null);
        return;
      }
      const stashed = await readQuickSession(sessionId);
      if (cancelled) return;
      if (stashed) {
        setSession(stashed);
        const progress = await readQuickProgress(sessionId);
        if (!cancelled) {
          setHasStarted(startedFromHref || progress !== null);
        }
        return;
      }
      if (isSaved) {
        const rebuilt = await rebuildQuickSession(sessionId, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        });
        if (!cancelled) {
          setSession(rebuilt);
          const progress = rebuilt
            ? await readQuickProgress(sessionId)
            : null;
          if (!cancelled) {
            setHasStarted(startedFromHref || progress !== null);
          }
        }
        return;
      }
      if (!cancelled) {
        setSession(null);
        setHasStarted(startedFromHref);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // Sync from outside React (route params + storage): read on mount/param
    // change, never derive during render.
  }, [sessionId, isSaved, startedFromHref, token]);

  const saveLog = useCallback(
    async (title: string, done: boolean) => {
      if (!session) return;
      setLogging(true);
      setLogError(null);
      try {
        const exercises = buildLoggedExercises(session.exercises, done);
        const totalSets = exercises.reduce((n, e) => n + e.sets.length, 0);
        const body: WorkoutQuickSaveRequest = {
          kind: "quick",
          sessionId: session.sessionId,
          title,
          needsName: done
            ? false
            : shouldPromptForQuickSessionName(session),
          ...(session.focus ? { focus: session.focus } : {}),
          ...(session.favorite ? { favorite: true } : {}),
          exercises,
          completed: done,
          ...(done
            ? { duration: Math.max(1, Math.round(totalSets * 1.5)) }
            : {}),
          performedAt: logDate,
          // This screen only ever plans or backfills — the live view is what
          // "starting" means. Marking a not-done save `started: false` keeps
          // a same-day/future plan from showing as an in-progress workout
          // (see IWorkoutLog.startedAt) until it's actually opened live.
          started: done,
          tz: new Date().getTimezoneOffset(),
        };
        await apiFetch("/api/workouts", WorkoutSaveResponseSchema, {
          method: "POST",
          body,
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        });
        if (done) {
          await clearQuickProgress(session.sessionId);
          await clearQuickSession(session.sessionId);
          router.push("/progress" as never);
        } else {
          router.push("/(tabs)/programming" as never);
        }
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Failed to save session";
        setLogError(message);
        throw new Error(message);
      } finally {
        setLogging(false);
      }
    },
    [session, logDate, token, router],
  );

  const logAsDone = useCallback(() => {
    if (!session) return;
    if (shouldPromptForQuickSessionName(session)) {
      setShowNamePrompt(true);
      return;
    }
    void saveLog(session.title, true).catch(() => {});
  }, [session, saveLog]);

  const planForLater = useCallback(() => {
    if (!session) return;
    void saveLog(session.title, false).catch(() => {});
  }, [session, saveLog]);

  // Apply an edit: always update the local stash (that is what Start workout
  // and "Log it" read), and additionally write back to the server log when
  // this session already exists there (web page.tsx `saveEdit`).
  const saveEdit = useCallback(
    async ({ title, exercises }: { title: string; exercises: DraftExercise[] }) => {
      if (!session) return;
      setSavingEdit(true);
      setEditError(null);
      try {
        if (isSaved) {
          const body: WorkoutQuickSaveRequest = {
            kind: "quick",
            sessionId: session.sessionId,
            title,
            needsName: false,
            ...(session.focus ? { focus: session.focus } : {}),
            // Still a plan, not a performed workout — no performedAt, so the
            // route leaves the scheduled date exactly where it was.
            exercises: buildLoggedExercises(exercises, false),
            completed: false,
            tz: new Date().getTimezoneOffset(),
          };
          await apiFetch("/api/workouts", WorkoutSaveResponseSchema, {
            method: "POST",
            body,
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          });
        } else if (session.sourceSessionId && title.trim() !== session.title.trim()) {
          // A completed session is reopened under a fresh id so starting it
          // again cannot overwrite history. Its source id is retained solely
          // so a rename can update the original log without touching its
          // recorded exercises, date, or completion state.
          await apiFetch("/api/workouts/session", QuickSessionPatchResponseSchema, {
            method: "PATCH",
            body: { id: session.sourceSessionId, title: title.trim() },
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          });
        }
        // Commit the local draft only after any required server write
        // succeeds; a failed request must not look saved after a reload.
        const next = await updateQuickSession(session.sessionId, { title, exercises });
        setSession(next ?? { ...session, title, exercises });
        setEditing(false);
      } catch (e) {
        setEditError(e instanceof Error ? e.message : "Failed to save changes");
      } finally {
        setSavingEdit(false);
      }
    },
    [session, isSaved, token],
  );

  const focusLabel = useMemo(
    () => focusLabelFor(session?.focus),
    [session?.focus],
  );

  // Share (NP-165): the web's quick-session page shares `{ kind: 'session',
  // session: { title, focus, exercises } }` — the client-supplied snapshot
  // the server sanitizes. One-off content has no visibility gate.
  const sessionShareBody = useMemo(() => {
    if (!session) return null;
    return {
      kind: "session" as const,
      session: {
        title: session.title,
        ...(session.focus ? { focus: session.focus } : {}),
        exercises: session.exercises.map((ex) => ({
          exerciseSlug: ex.exerciseSlug,
          name: ex.name,
          sets: ex.sets,
          reps: ex.reps,
          ...(ex.rest ? { rest: ex.rest } : {}),
          ...(ex.duration ? { duration: ex.duration } : {}),
        })),
      },
    };
  }, [session]);

  if (session === undefined) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
        testID="quick-session-overview-route"
      >
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Text
            testID="quick-session-overview-loading"
            style={{ color: colors["muted-foreground"] }}
          >
            Loading…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
        testID="quick-session-overview-route"
      >
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            paddingHorizontal: 16,
          }}
        >
          <Text
            testID="quick-session-overview-unavailable"
            accessibilityRole="header"
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: colors.foreground,
              textAlign: "center",
            }}
          >
            This session isn&apos;t available anymore
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: colors["muted-foreground"],
              textAlign: "center",
            }}
          >
            Generate a new one to get going.
          </Text>
          <Pressable
            testID="quick-session-overview-back"
            accessibilityRole="button"
            accessibilityLabel="Back to workouts"
            onPress={() => router.push("/(tabs)/programming" as never)}
            style={{
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 8,
              backgroundColor: colors.primary,
            }}
          >
            <Text style={{ color: colors["primary-foreground"], fontWeight: "600", fontSize: 14 }}>
              Back to workouts
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="quick-session-overview-route"
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingVertical: 16,
          gap: 16,
          paddingBottom: 120,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Pressable
            testID="quick-session-overview-back-btn"
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 6,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <ChevronLeft size={16} color={colors.foreground} />
            <Text
              style={{
                fontSize: 14,
                fontWeight: "500",
                color: colors.foreground,
              }}
            >
              Back
            </Text>
          </Pressable>
          <View
            testID="quick-session-overview-header-actions"
            style={{ flexDirection: "row", gap: 8 }}
          >
            <Pressable
              testID="quick-session-overview-edit-toggle"
              accessibilityRole="button"
              accessibilityLabel={editing ? "Close editor" : "Edit session"}
              accessibilityState={{ expanded: editing }}
              onPress={() => {
                setEditing((v) => !v);
                setLogOpen(false);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: editing ? colors.primary : colors.card,
                borderWidth: 1,
                borderColor: editing ? colors.primary : colors.border,
              }}
            >
              <Pencil
                size={16}
                color={editing ? colors["primary-foreground"] : colors.foreground}
              />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "500",
                  color: editing ? colors["primary-foreground"] : colors.foreground,
                }}
              >
                Edit
              </Text>
            </Pressable>
            <Pressable
              testID="quick-session-overview-log-toggle"
              accessibilityRole="button"
              accessibilityLabel="Log or plan"
              accessibilityState={{ expanded: logOpen }}
              onPress={() => {
                setLogOpen((v) => !v);
                setEditing(false);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: logOpen ? colors.primary : colors.card,
                borderWidth: 1,
                borderColor: logOpen ? colors.primary : colors.border,
              }}
            >
              <CalendarClock
                size={16}
                color={logOpen ? colors["primary-foreground"] : colors.foreground}
              />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "500",
                  color: logOpen
                    ? colors["primary-foreground"]
                    : colors.foreground,
                }}
              >
                Log or plan
              </Text>
            </Pressable>
            {sessionShareBody ? (
              <NativeShareButton
                body={sessionShareBody}
                getToken={() => token ?? undefined}
                testID="quick-session-overview-share"
              />
            ) : null}
          </View>
        </View>

        {logOpen && !editing ? (
          <View
            testID="quick-session-overview-log-panel"
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              padding: 12,
              gap: 8,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: colors["muted-foreground"],
              }}
            >
              {canLog && canPlan
                ? "Log or schedule this for"
                : canPlan
                  ? "Plan this session for"
                  : "When did you do this?"}
            </Text>
            <DatePicker
              value={logDate}
              onChange={setLogDate}
              testID="quick-session-overview-date"
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              {canLog ? (
                <Pressable
                  testID="quick-session-overview-log-it"
                  accessibilityRole="button"
                  accessibilityLabel={logging ? "Saving…" : "Log it"}
                  disabled={logging}
                  onPress={logAsDone}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    borderRadius: 8,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    backgroundColor: colors.primary,
                    opacity: logging ? 0.5 : 1,
                  }}
                >
                  <Check size={16} color={colors["primary-foreground"]} />
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: colors["primary-foreground"],
                    }}
                  >
                    {logging ? "Saving…" : "Log it"}
                  </Text>
                </Pressable>
              ) : null}
              {canPlan ? (
                <Pressable
                  testID="quick-session-overview-plan-it"
                  accessibilityRole="button"
                  accessibilityLabel={logging ? "Saving…" : "Plan it"}
                  disabled={logging}
                  onPress={planForLater}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    borderRadius: 8,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: logging ? 0.5 : 1,
                  }}
                >
                  <CalendarClock size={16} color={colors.foreground} />
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: colors.foreground,
                    }}
                  >
                    {logging ? "Saving…" : "Plan it"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {logError ? (
              <Text
                testID="quick-session-overview-log-error"
                accessibilityRole="alert"
                style={{ fontSize: 12, color: colors.destructive }}
              >
                {logError}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View>
          <Text
            testID="quick-session-overview-kind"
            style={{
              fontSize: 11,
              fontWeight: "600",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: colors.success,
            }}
          >
            {isSaved || session.source === "saved"
              ? "Saved session"
              : "Generated session"}
            {focusLabel ? ` · ${focusLabel}` : ""}
          </Text>
          <Text
            testID="quick-session-overview-title"
            accessibilityRole="header"
            style={{
              marginTop: 4,
              fontSize: 24,
              fontWeight: "700",
              color: colors.foreground,
            }}
          >
            {session.title}
          </Text>
          <Text
            style={{
              marginTop: 4,
              fontSize: 14,
              color: colors["muted-foreground"],
            }}
          >
            {session.exercises.length} exercises
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          {editing ? (
            <SessionEditor
              title={session.title}
              exercises={session.exercises}
              onSave={(next) => void saveEdit(next)}
              onCancel={() => {
                setEditing(false);
                setEditError(null);
              }}
              saving={savingEdit}
              error={editError}
              testID="quick-session-overview-editor"
            />
          ) : (
            session.exercises.map((ex, i) => (
              <ExerciseAccordion
                key={`${ex.exerciseSlug || ex.name}-${i}`}
                index={i}
                exercise={toAccordionExercise(ex, i)}
                testID="quick-session-overview"
              />
            ))
          )}
        </View>
      </ScrollView>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 24,
          paddingHorizontal: 16,
        }}
      >
        <Pressable
          testID="quick-session-overview-start"
          accessibilityRole="button"
          accessibilityLabel={
            hasStarted ? "Continue workout" : "Start workout"
          }
          onPress={() =>
            router.push(quickSessionLiveHref(session.sessionId) as never)
          }
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderRadius: 12,
            paddingVertical: 12,
            backgroundColor: colors.success,
          }}
        >
          <Play size={16} color={colors["primary-foreground"]} />
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors["primary-foreground"] }}>
            {hasStarted ? "Continue workout" : "Start workout"}
          </Text>
        </Pressable>
      </View>

      {showNamePrompt ? (
        <QuickSessionNamePrompt
          initialName={session.title}
          confirmLabel="Save name & log"
          fallbackName={fallbackQuickSessionName(logDate)}
          onConfirm={(title) => saveLog(title, true)}
          onSkip={(title) => saveLog(title, true)}
          onCancel={() => setShowNamePrompt(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}
