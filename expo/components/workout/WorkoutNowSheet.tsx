import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Dumbbell, History, RefreshCw, Zap } from "lucide-react-native";
import {
  apiFetch,
  GenerateSessionResponseSchema,
  WorkoutHistoryResponseSchema,
  type GenerateSessionResponse,
  type WorkoutHistoryEntry,
} from "@become/api-client";
import type { DraftExercise } from "@become/core";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { BottomSheet } from "@/components/BottomSheet";
import { SafeAreaView } from "react-native-safe-area-context";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { localDateKey } from "@/lib/time/localDay";
import { logPlanAvailability } from "@/lib/quickSession/logPlan";
import {
  quickSessionOverviewHref,
  stashQuickSession,
} from "@/lib/quickSession/store";

/**
 * WORKOUT NOW SHEET (NP-076).
 *
 * Native port of `webapp/components/QuickSessionModal.tsx` WITHOUT the AI
 * switch (NP-136 adds it): pick a focus, get a deterministic preview from
 * `POST /api/generate/session` (permanently unmetered, so it works for every
 * member including a free one past the AI allowance), Regenerate for a
 * different session, then hand off to the NP-227 overview. The five most
 * recent quick sessions (`GET /api/workouts/logs?withExercises=true`) can be
 * repeated WITHOUT regenerating: same title, same exercises.
 *
 * Opened from a calendar day it pre-fills that date for the overview's Log/Plan
 * panel (`?date=` on the overview href). The sheet reads `?quick=1` (Workout
 * tab) and `?date=` (Calendar day) from its own route params, so the three
 * entries — dashboard tile, Workout tab, calendar day — all land here.
 *
 * Rules that travel from the web:
 *  - the coach-curated glutes session bypasses the generator entirely;
 *  - a repeat with stored exercises never calls the generator;
 *  - a legacy log with no stored exercises is rebuilt from its focus;
 *  - Regenerate is a fresh POST with no seed, so the server mints a new one
 *    and the session differs.
 */

export const QUICK_FOCUS_ORDER = [
  "full_body",
  "push",
  "pull",
  "legs",
  "glutes",
  "upper",
  "lower",
  "core",
  "arms",
  "cardio",
] as const;

export type QuickFocusKey = (typeof QUICK_FOCUS_ORDER)[number];

export const QUICK_FOCUS_DEFS: Record<
  QuickFocusKey,
  { key: QuickFocusKey; label: string; blurb: string }
> = {
  full_body: { key: "full_body", label: "Full Body", blurb: "A bit of everything" },
  push: { key: "push", label: "Push", blurb: "Chest, shoulders, triceps" },
  pull: { key: "pull", label: "Pull", blurb: "Back, rear delts, biceps" },
  legs: { key: "legs", label: "Legs", blurb: "Quads, hamstrings, glutes" },
  glutes: { key: "glutes", label: "Glutes", blurb: "Glutes, hips & posterior chain" },
  upper: { key: "upper", label: "Upper Body", blurb: "Chest, back, shoulders, arms" },
  lower: { key: "lower", label: "Lower Body", blurb: "Quads, hams, glutes, calves" },
  core: { key: "core", label: "Core", blurb: "Abs, obliques, stability" },
  arms: { key: "arms", label: "Arms", blurb: "Biceps & triceps" },
  cardio: { key: "cardio", label: "Cardio", blurb: "Conditioning & intervals" },
};

const FOCUS_KEYS = new Set<string>(QUICK_FOCUS_ORDER as readonly string[]);

export function isQuickFocusKey(v: unknown): v is QuickFocusKey {
  return typeof v === "string" && FOCUS_KEYS.has(v);
}

/** The five most recent quick sessions the sheet offers to repeat. */
export const RECENT_QUICK_SESSIONS_LIMIT = 5;

export function pickRecentQuickSessions(
  logs: WorkoutHistoryEntry[],
): WorkoutHistoryEntry[] {
  return logs
    .filter((l) => l.kind === "quick")
    .slice(0, RECENT_QUICK_SESSIONS_LIMIT);
}

const SUPERSET_GROUP_ID = "glutes-quick-superset";

/**
 * The coach-curated glutes session (`webapp/lib/quickSession/curatedGlutes.ts`).
 * The algorithmic generator kept surfacing quad-dominant compounds for a
 * session named "Glutes", so this focus bypasses generation entirely. The
 * shape is copied field-for-field; the web module is server-adjacent and not
 * in `@become/core`, so the copy lives here with the sheet that reads it.
 */
export function curatedGlutesSession(): {
  title: string;
  focus: QuickFocusKey;
  exercises: DraftExercise[];
} {
  return {
    title: "Glutes Session",
    focus: "glutes",
    exercises: [
      {
        exerciseSlug: "belt-squat",
        name: "Belt Squat",
        trackingType: "reps_weight",
        sets: 3,
        reps: "10",
        primaryMuscles: ["quads", "glutes"],
        movementPatterns: ["squat"],
      },
      {
        exerciseSlug: "hip-thrust",
        name: "Hip Thrust",
        trackingType: "reps_weight",
        sets: 3,
        reps: "12",
        primaryMuscles: ["glutes"],
        movementPatterns: ["hinge"],
      },
      {
        exerciseSlug: "b-stance-rdl",
        name: "B-Stance RDL",
        trackingType: "reps_weight",
        sets: 3,
        reps: "8 per side",
        laterality: "unilateral",
        primaryMuscles: ["hamstrings", "glutes"],
        movementPatterns: ["hinge"],
        equipment: ["dumbbell"],
        groupId: SUPERSET_GROUP_ID,
        groupType: "superset",
        groupLabel: "Superset",
      },
      {
        exerciseSlug: "step-up",
        name: "Step-Up",
        trackingType: "reps_weight",
        sets: 3,
        reps: "8 per side",
        laterality: "unilateral",
        primaryMuscles: ["quads", "glutes"],
        movementPatterns: ["lunge"],
        equipment: ["box"],
        groupId: SUPERSET_GROUP_ID,
        groupType: "superset",
        groupLabel: "Superset",
      },
      {
        exerciseSlug: "hyperextension",
        name: "Hyperextension",
        trackingType: "reps_weight",
        sets: 3,
        reps: "12",
        primaryMuscles: ["glutes", "hamstrings"],
        movementPatterns: ["hip_extension"],
      },
      {
        exerciseSlug: "hip-abduction-machine",
        name: "Hip Abduction Machine",
        trackingType: "reps_weight",
        sets: 3,
        reps: "8 (fwd / upright / back)",
        primaryMuscles: ["abductors", "glutes"],
        equipment: ["hip_abduction_machine"],
      },
    ],
  };
}

export interface WorkoutNowSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Local YYYY-MM-DD to pre-fill the overview's Log/Plan date with. */
  date?: string;
  testID?: string;
}

export interface WorkoutNowSheetDeps {
  baseUrl?: string;
  getToken?: () => string | undefined | Promise<string | undefined>;
  fetchImpl?: typeof fetch;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function WorkoutNowSheet({
  visible,
  onClose,
  date,
  testID = "workout-now-sheet",
  deps,
}: WorkoutNowSheetProps & { deps?: WorkoutNowSheetDeps }) {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [recentQuick, setRecentQuick] = useState<WorkoutHistoryEntry[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [selectedFocus, setSelectedFocus] = useState<QuickFocusKey | null>(null);
  const [preview, setPreview] = useState<GenerateSessionResponse["session"] | null>(
    null,
  );
  const [generating, setGenerating] = useState(false);
  const [repeating, setRepeating] = useState(false);
  const activeGenRef = useRef(0);

  // Reset transient state when the sheet toggles.
  useEffect(() => {
    if (!visible) {
      // Syncs from the sheet's own visibility (an external open/close), not a
      // render cascade.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      activeGenRef.current += 1; // cancel any in-flight generation
      setError(null);
      setRecentQuick([]);
      setSelectedFocus(null);
      setPreview(null);
      setGenerating(false);
      setRepeating(false);
    }
  }, [visible]);

  // Load the five most recent quick sessions when opened.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoadingRecent(true);
    (async () => {
      try {
        const data = await apiFetch(
          "/api/workouts/logs?withExercises=true",
          WorkoutHistoryResponseSchema,
          {
            baseUrl: deps?.baseUrl ?? WEBAPP_BASE_URL,
            getToken: deps?.getToken ?? (() => token ?? undefined),
            ...(deps?.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
          },
        );
        if (cancelled) return;
        setRecentQuick(pickRecentQuickSessions(data.logs ?? []));
      } catch {
        /* best-effort */
      } finally {
        if (!cancelled) setLoadingRecent(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, token, deps]);

  const generateFor = useCallback(
    async (focus: QuickFocusKey) => {
      setError(null);
      setSelectedFocus(focus);
      setPreview(null);
      setGenerating(true);
      const genId = ++activeGenRef.current;

      // Coach-curated fixed session (bypasses the generator entirely).
      if (focus === "glutes") {
        setPreview(curatedGlutesSession());
        setGenerating(false);
        return;
      }

      try {
        const data = await apiFetch(
          "/api/generate/session",
          GenerateSessionResponseSchema,
          {
            method: "POST",
            body: { focus },
            baseUrl: deps?.baseUrl ?? WEBAPP_BASE_URL,
            getToken: deps?.getToken ?? (() => token ?? undefined),
            ...(deps?.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
          },
        );
        if (genId !== activeGenRef.current) return;
        if (!data?.session) {
          setError("Couldn't build that session. Try again.");
          return;
        }
        setPreview(data.session);
      } catch {
        if (genId !== activeGenRef.current) return;
        setError("Network error. Try again.");
      } finally {
        if (genId === activeGenRef.current) setGenerating(false);
      }
    },
    [token, deps],
  );

  const startPreview = useCallback(async () => {
    if (!preview) return;
    const id = await stashQuickSession(
      {
        title: preview.title,
        ...(preview.focus ? { focus: preview.focus } : {}),
        exercises: preview.exercises as DraftExercise[],
      },
      { needsName: true },
    );
    router.push(quickSessionOverviewHref(id, { date }) as never);
    onClose();
  }, [preview, router, onClose, date]);

  // Genuinely repeats it: same title, same exercises — never a regeneration.
  const repeatRecent = useCallback(
    async (log: WorkoutHistoryEntry) => {
      const focus: QuickFocusKey = isQuickFocusKey(log.focus)
        ? log.focus
        : "full_body";
      setError(null);

      if (log.exercises?.length) {
        const id = await stashQuickSession(
          {
            title: log.title,
            focus,
            exercises: log.exercises as DraftExercise[],
            source: "saved",
          },
          {
            needsName: false,
            ...(log.sessionId ? { sourceSessionId: log.sessionId } : {}),
          },
        );
        router.push(quickSessionOverviewHref(id, { date }) as never);
        onClose();
        return;
      }

      // Legacy log with no stored exercises — rebuild one from its focus.
      setRepeating(true);
      try {
        const data = await apiFetch(
          "/api/generate/session",
          GenerateSessionResponseSchema,
          {
            method: "POST",
            body: { focus },
            baseUrl: deps?.baseUrl ?? WEBAPP_BASE_URL,
            getToken: deps?.getToken ?? (() => token ?? undefined),
            ...(deps?.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
          },
        );
        const id = await stashQuickSession(
          {
            title: data.session.title,
            ...(data.session.focus ? { focus: data.session.focus } : {}),
            exercises: data.session.exercises as DraftExercise[],
          },
          { needsName: true },
        );
        router.push(quickSessionOverviewHref(id, { date }) as never);
        onClose();
      } catch {
        setError("Network error. Try again.");
      } finally {
        setRepeating(false);
      }
    },
    [router, onClose, date, token, deps],
  );

  const busy = generating || repeating;
  const today = localDateKey();

  const title = useMemo(() => {
    if (!date || date === today) return "Workout Now";
    const { canLog, canPlan } = logPlanAvailability(date, today);
    return canPlan && !canLog ? "Schedule a Workout" : "Log a Workout";
  }, [date, today]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      testID={testID}
      accessibilityLabel={title}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 16, paddingBottom: 8 }}
      >
        {error ? (
          <Text testID={`${testID}-error`} className="text-destructive text-sm">
            {error}
          </Text>
        ) : null}

        {/* ── 1. My Sessions ── */}
        <View>
          <View className="flex-row items-center gap-1.5 mb-2">
            <History size={14} color={colors["muted-foreground"]} />
            <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
              My Sessions
            </Text>
          </View>
          {loadingRecent ? (
            <View style={{ gap: 6 }}>
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  testID={`${testID}-recent-skeleton-${i}`}
                  className="h-14 rounded-xl bg-muted"
                />
              ))}
            </View>
          ) : recentQuick.length === 0 ? (
            <View
              testID={`${testID}-recent-empty`}
              className="rounded-xl border border-dashed border-border px-4 py-4"
            >
              <Text className="text-foreground text-sm font-semibold">
                No sessions yet
              </Text>
              <Text className="text-muted-foreground text-xs">
                Pick a focus below to build your first session
              </Text>
            </View>
          ) : (
            <View style={{ gap: 6 }}>
              {recentQuick.map((log, i) => (
                <Pressable
                  key={`${log.title}-${log.date}-${i}`}
                  testID={`${testID}-recent-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Repeat ${log.title}`}
                  disabled={busy}
                  onPress={() => void repeatRecent(log)}
                  className="flex-row items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5"
                  style={busy ? { opacity: 0.5 } : undefined}
                >
                  <View className="flex-1 mr-3">
                    <Text
                      className="text-foreground text-sm font-medium"
                      numberOfLines={1}
                    >
                      {log.title}
                    </Text>
                    <Text className="text-muted-foreground text-xs">
                      {shortDate(log.date)} · {log.exerciseCount}{" "}
                      {log.exerciseCount === 1 ? "exercise" : "exercises"}
                    </Text>
                  </View>
                  <Text className="text-primary text-xs font-semibold">
                    Repeat
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* ── 2. Quick start by focus (select → preview → start) ── */}
        <View>
          <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide mb-2">
            Quick start by focus
          </Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {QUICK_FOCUS_ORDER.map((key) => {
              const def = QUICK_FOCUS_DEFS[key];
              const active = selectedFocus === key;
              return (
                <Pressable
                  key={key}
                  testID={`${testID}-focus-${key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${def.label}: ${def.blurb}`}
                  accessibilityState={{ selected: active }}
                  disabled={busy}
                  onPress={() => void generateFor(key)}
                  className={`flex-row items-center gap-1.5 rounded-2xl border px-3.5 py-2 ${
                    active ? "border-primary bg-primary/10" : "border-border bg-muted"
                  }`}
                  style={busy ? { opacity: 0.5 } : undefined}
                >
                  <Dumbbell size={14} color={colors.accent} />
                  <View>
                    <Text className="text-foreground text-sm font-semibold">
                      {def.label}
                    </Text>
                    <Text className="text-muted-foreground text-[10px]">
                      {def.blurb}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Preview of the selected focus */}
          {selectedFocus ? (
            <View
              testID={`${testID}-preview`}
              className="mt-3 rounded-2xl border border-border bg-muted p-4"
            >
              {generating ? (
                <View className="flex-row items-center justify-center py-6" style={{ gap: 8 }}>
                  <Text
                    testID={`${testID}-preview-loading`}
                    className="text-muted-foreground text-sm"
                  >
                    Building your{" "}
                    {QUICK_FOCUS_DEFS[selectedFocus].label.toLowerCase()}{" "}
                    session…
                  </Text>
                </View>
              ) : preview ? (
                <View>
                  <View className="flex-row items-center justify-between mb-2">
                    <Text
                      testID={`${testID}-preview-title`}
                      className="text-foreground text-sm font-semibold flex-1 mr-2"
                    >
                      {preview.title}
                    </Text>
                    <Text className="text-muted-foreground text-xs">
                      {preview.exercises.length}{" "}
                      {preview.exercises.length === 1 ? "exercise" : "exercises"}
                    </Text>
                  </View>
                  <View style={{ gap: 4 }} className="mb-3">
                    {preview.exercises.map((ex, idx) => (
                      <View
                        key={`${ex.exerciseSlug}-${idx}`}
                        testID={`${testID}-preview-exercise-${idx}`}
                        className="flex-row items-center justify-between"
                      >
                        <Text
                          className="text-foreground text-sm flex-1 mr-3"
                          numberOfLines={1}
                        >
                          {ex.name}
                        </Text>
                        <Text className="text-muted-foreground text-xs">
                          {ex.sets} × {ex.reps || ex.duration || "—"}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View className="flex-row items-center" style={{ gap: 8 }}>
                    <Pressable
                      testID={`${testID}-regenerate`}
                      accessibilityRole="button"
                      accessibilityLabel="Regenerate session"
                      disabled={busy}
                      onPress={() => {
                        if (selectedFocus) void generateFor(selectedFocus);
                      }}
                      className="flex-row items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2.5"
                      style={busy ? { opacity: 0.5 } : undefined}
                    >
                      <RefreshCw size={16} color={colors.foreground} />
                      <Text className="text-foreground text-sm font-semibold">
                        Regenerate
                      </Text>
                    </Pressable>
                    <View className="flex-1">
                      <Button
                        testID={`${testID}-start`}
                        disabled={busy}
                        onPress={() => void startPreview()}
                        accessibilityLabel={`Start session: ${preview.title}`}
                      >
                        <View className="flex-row items-center" style={{ gap: 6 }}>
                          <Dumbbell
                            size={16}
                            color={colors["primary-foreground"]}
                          />
                          <Text className="text-primary-foreground text-sm font-semibold">
                            Start session
                          </Text>
                        </View>
                      </Button>
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* The pre-filled day, when opened from a calendar day. */}
        {date && date !== today ? (
          <View className="flex-row items-center gap-1.5">
            <Zap size={14} color={colors.primary} />
            <Text
              testID={`${testID}-prefilled-date`}
              className="text-muted-foreground text-xs"
            >
              For {date}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}
