import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { Dumbbell, History, RefreshCw, Sparkles, Zap } from "lucide-react-native";
import { useRouter } from "expo-router";
import {
  apiFetch,
  GenerateSessionRequestSchema,
  GenerateSessionResponseSchema,
  WorkoutHistoryResponseSchema,
  type GenerateSessionResponse,
  type WorkoutHistoryEntry,
} from "@become/api-client";
import type { DraftExercise } from "@become/core";
import { Text } from "@/components/Text";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { localDateKey } from "@/lib/time/localDay";
import {
  logPlanAvailability,
  QUICK_SESSION_DATE_RE,
} from "@/lib/quickSession/logPlan";
import {
  quickSessionOverviewHref,
  stashQuickSession,
} from "@/lib/quickSession/store";
import { showAiConsentPrompt } from "@/lib/ai/aiConsentPrompt";
import { useEntitlements } from "@/lib/entitlements";
import {
  aiFallbackNote,
  generateAiSession,
} from "@/lib/workout/aiGenerate";

/**
 * WORKOUT NOW SHEET (NP-076 + NP-136).
 *
 * Native port of `webapp/components/QuickSessionModal.tsx`: the member picks
 * a focus, gets a deterministic preview from `POST /api/generate/session`
 * (permanently unmetered, so it works for every member including a free one
 * past the AI allowance), can Regenerate for a different session, can repeat
 * one of the five most recent quick sessions without regenerating, and hands
 * off to the NP-227 overview.
 *
 * With the AI switch on (NP-136), the request goes through the AI run client
 * (NP-038) to `POST /api/ai/workout/session` first and falls back to the
 * standard generator — the web's AI path, with the web's fallback-note
 * wording.
 *
 * Rules that travel from the web:
 *  - The coach-curated glutes session bypasses the generator entirely.
 *  - A repeat reuses the log's own title + exercises (source 'saved', with
 *    `sourceSessionId` kept apart from the fresh sessionId); only a legacy
 *    log with no stored exercises falls back to regenerating from its focus.
 *  - `date` (a local YYYY-MM-DD, set when opened from a calendar day)
 *    pre-fills the overview's Log/Plan date via `?date=`; the heading reads
 *    "Schedule a Workout" (future) / "Log a Workout" (past) / "Workout Now".
 *  - Consent is checked on the server before any charge: a consent refusal
 *    opens the consent prompt (NP-046) and nothing else, and declining
 *    leaves the standard generator working.
 *  - An allowance refusal falls through to the standard generator and is a
 *    note, never a wall; a 429 spend cap is never an upsell.
 *  - Post once per member action and never retry the POST.
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

export const QUICK_FOCUS_LABELS: Record<QuickFocusKey, string> = {
  full_body: "Full Body",
  push: "Push",
  pull: "Pull",
  legs: "Legs",
  glutes: "Glutes",
  upper: "Upper Body",
  lower: "Lower Body",
  core: "Core",
  arms: "Arms",
  cardio: "Cardio",
};

export const QUICK_FOCUS_BLURBS: Record<QuickFocusKey, string> = {
  full_body: "A bit of everything",
  push: "Chest, shoulders, triceps",
  pull: "Back, rear delts, biceps",
  legs: "Quads, hamstrings, glutes",
  glutes: "Glutes, hips & posterior chain",
  upper: "Chest, back, shoulders, arms",
  lower: "Quads, hams, glutes, calves",
  core: "Abs, obliques, stability",
  arms: "Biceps & triceps",
  cardio: "Conditioning & intervals",
};

const FOCUS_KEYS = new Set<string>(QUICK_FOCUS_ORDER as readonly string[]);

function isQuickFocusKey(v: unknown): v is QuickFocusKey {
  return typeof v === "string" && FOCUS_KEYS.has(v);
}

/** The five most recent quick sessions — the sheet's repeat list. */
export const RECENT_QUICK_SESSIONS_LIMIT = 5;

export function pickRecentQuickSessions(
  logs: WorkoutHistoryEntry[],
): WorkoutHistoryEntry[] {
  return logs.filter((l) => l.kind === "quick").slice(0, RECENT_QUICK_SESSIONS_LIMIT);
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

export interface WorkoutNowPreview {
  title: string;
  focus?: string;
  exercises: DraftExercise[];
}

interface CuratedExercise {
  exerciseSlug: string;
  name: string;
  trackingType: string;
  sets: number;
  reps: string;
  primaryMuscles?: string[];
  movementPatterns?: string[];
  equipment?: string[];
  laterality?: string;
  groupId?: string;
  groupType?: string;
  groupLabel?: string;
}

/**
 * The coach-curated glutes session — a verbatim port of
 * `webapp/lib/quickSession/curatedGlutes.ts`. Bypasses generation entirely
 * for this one focus; every other focus is algorithmic.
 */
const GLUTES_SUPERSET_GROUP_ID = "glutes-quick-superset";

export function curatedGlutesSession(): WorkoutNowPreview {
  const exercises: CuratedExercise[] = [
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
      groupId: GLUTES_SUPERSET_GROUP_ID,
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
      groupId: GLUTES_SUPERSET_GROUP_ID,
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
  ];
  return {
    title: "Glutes Session",
    focus: "glutes",
    exercises: exercises as DraftExercise[],
  };
}

export interface WorkoutNowSheetProps {
  visible: boolean;
  onClose: () => void;
  /**
   * Local YYYY-MM-DD to pre-fill the resulting session's Log/Plan date with —
   * set when opened from a specific Calendar day rather than "workout now".
   */
  date?: string;
  testID?: string;
}

export function workoutNowTitle(date: string | undefined, today: string): string {
  if (!date || date === today) return "Workout Now";
  const { canLog, canPlan } = logPlanAvailability(date, today);
  return canPlan && !canLog ? "Schedule a Workout" : "Log a Workout";
}

export function WorkoutNowSheet({
  visible,
  onClose,
  date,
  testID = "workout-now-sheet",
}: WorkoutNowSheetProps) {
  const today = localDateKey();

  // Reset transient state when the sheet closes: the body remounts on the
  // next open, so focus/preview/recents reset by construction. The close
  // transition is an external navigation (a route param / a day tap), not a
  // render cascade.
  const [resetKey, setResetKey] = useState(0);
  const handleClose = useCallback(() => {
    setResetKey((k) => k + 1);
    onClose();
  }, [onClose]);

  return (
    <BottomSheet
      testID={testID}
      visible={visible}
      onClose={handleClose}
      title={workoutNowTitle(date, today)}
    >
      <WorkoutNowBody
        key={resetKey}
        date={date}
        today={today}
        onClose={handleClose}
        testID={testID}
      />
    </BottomSheet>
  );
}

function WorkoutNowBody({
  date,
  today,
  onClose,
  testID,
}: {
  date: string | undefined;
  today: string;
  onClose: () => void;
  testID: string;
}) {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [recentQuick, setRecentQuick] = useState<WorkoutHistoryEntry[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [selectedFocus, setSelectedFocus] = useState<QuickFocusKey | null>(null);
  const [preview, setPreview] = useState<WorkoutNowPreview | null>(null);
  const [generating, setGenerating] = useState(false);
  const [repeating, setRepeating] = useState(false);
  const [starting, setStarting] = useState(false);
  // AI switch (NP-136): with it on, the request goes to
  // `/api/ai/workout/session` first, then falls back to the standard
  // generator. `aiUsed` marks a preview that really is AI-written.
  const [useAi, setUseAi] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);
  // An allowance refusal the member walked away from WITH a session: the
  // unmetered deterministic builder ran instead. Shown inline, never as the
  // upgrade sheet — there is a preview underneath it.
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);
  const activeGenRef = useRef(0);
  const { refresh: refreshEntitlements } = useEntitlements();

  // Load the five most recent quick sessions on mount — a network sync from
  // outside React, never derived during render.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(
          "/api/workouts/logs?withExercises=true",
          WorkoutHistoryResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        if (cancelled) return;
        setRecentQuick(pickRecentQuickSessions(res.logs ?? []));
      } catch {
        /* best-effort */
      } finally {
        if (!cancelled) setLoadingRecent(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Generate a preview for a focus (does NOT start it). Regenerate is the
  // same call again with no seed, so the server mints a fresh one and the
  // session differs.
  const generateFor = useCallback(
    async (focus: QuickFocusKey) => {
      setError(null);
      setFallbackNote(null);
      setSelectedFocus(focus);
      setPreview(null);
      setAiUsed(false);
      setGenerating(true);
      const genId = ++activeGenRef.current;

      // Coach-curated fixed session (bypasses the generator entirely).
      if (focus === "glutes") {
        setPreview(curatedGlutesSession());
        setGenerating(false);
        return;
      }

      // ── AI path (when toggled) ──────────────────────────────────────────
      // Async run: POST returns a runId, the run client polls until the
      // session lands. Posts exactly ONCE per member action — no retry here.
      if (useAi) {
        try {
          const outcome = await generateAiSession(
            QUICK_FOCUS_LABELS[focus],
            focus,
            { baseUrl: WEBAPP_BASE_URL, getToken: () => token ?? undefined },
          );
          if (genId !== activeGenRef.current) return; // stale
          if (outcome.status === "ai") {
            setPreview({
              title: outcome.session.title,
              focus: outcome.session.focus,
              exercises: outcome.session.exercises,
            });
            setAiUsed(true);
            void refreshEntitlements().catch(() => {});
            setGenerating(false);
            return;
          }
          if (outcome.status === "consent") {
            // Permission, not pricing — the consent prompt and nothing else.
            // Declining leaves the standard generator working: fall through.
            showAiConsentPrompt({
              onDecline: () => {
                // The deterministic preview below is already on its way; the
                // member simply keeps the standard path.
              },
            });
          } else if (outcome.status === "gate") {
            // Out of AI generations for the week. Fall THROUGH to the
            // deterministic route: /api/generate/session is unmetered by
            // design (it is the fallback every AI route degrades to), so the
            // member still gets a session and the refusal is a note rather
            // than a dead end.
            setFallbackNote(
              aiFallbackNote(outcome.gate?.error ?? "", "session"),
            );
            void refreshEntitlements().catch(() => {});
          }
          // A 429 spend cap or an unusable AI answer falls through silently.
        } catch {
          /* fall through to deterministic */
        }
        if (genId !== activeGenRef.current) return;
      }

      try {
        const body = { focus };
        if (!GenerateSessionRequestSchema.safeParse(body).success) {
          if (genId !== activeGenRef.current) return;
          setError("Couldn't build that session. Try again.");
          return;
        }
        const data: GenerateSessionResponse = await apiFetch(
          "/api/generate/session",
          GenerateSessionResponseSchema,
          {
            method: "POST",
            body,
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        if (genId !== activeGenRef.current) return;
        if (!data?.session) {
          // The note was written a moment ago, on the assumption that this
          // call always works. It didn't, so retract it rather than leave
          // an amber "built you a standard session instead" above a red
          // error and an empty preview.
          setFallbackNote(null);
          setError("Couldn't build that session. Try again.");
          return;
        }
        setPreview({
          title: data.session.title,
          focus: data.session.focus,
          exercises: data.session.exercises as DraftExercise[],
        });
      } catch {
        if (genId !== activeGenRef.current) return;
        // Same retraction as above: no session, no note.
        setFallbackNote(null);
        setError("Network error. Try again.");
      } finally {
        if (genId === activeGenRef.current) setGenerating(false);
      }
    },
    [token, useAi, refreshEntitlements],
  );

  // Start the previewed session — stash, then hand off to the NP-227
  // overview (which carries the calendar `date` through as `?date=`).
  const startPreview = useCallback(async () => {
    if (!preview || starting) return;
    setStarting(true);
    try {
      const id = await stashQuickSession(
        {
          title: preview.title,
          ...(preview.focus ? { focus: preview.focus } : {}),
          exercises: preview.exercises,
          source: "generated",
        },
        { needsName: true },
      );
      const validDate = date && QUICK_SESSION_DATE_RE.test(date) ? date : undefined;
      router.push(
        quickSessionOverviewHref(id, validDate ? { date: validDate } : undefined) as never,
      );
      onClose();
    } finally {
      setStarting(false);
    }
  }, [preview, starting, date, router, onClose]);

  // Repeat a recent session — genuinely repeats it: same title, same
  // exercises, no regeneration. Only a legacy log with no stored exercises
  // falls back to rebuilding from its focus.
  const repeatRecent = useCallback(
    async (log: WorkoutHistoryEntry) => {
      const focus: QuickFocusKey = isQuickFocusKey(log.focus) ? log.focus : "full_body";
      setError(null);

      if (log.exercises?.length) {
        setRepeating(true);
        try {
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
          const validDate =
            date && QUICK_SESSION_DATE_RE.test(date) ? date : undefined;
          router.push(
            quickSessionOverviewHref(
              id,
              validDate ? { date: validDate } : undefined,
            ) as never,
          );
          onClose();
        } finally {
          setRepeating(false);
        }
        return;
      }

      setRepeating(true);
      try {
        const data: GenerateSessionResponse = await apiFetch(
          "/api/generate/session",
          GenerateSessionResponseSchema,
          {
            method: "POST",
            body: { focus },
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        const id = await stashQuickSession(
          {
            title: data.session.title,
            ...(data.session.focus ? { focus: data.session.focus } : {}),
            exercises: data.session.exercises as DraftExercise[],
            source: "generated",
          },
          { needsName: true },
        );
        const validDate = date && QUICK_SESSION_DATE_RE.test(date) ? date : undefined;
        router.push(
          quickSessionOverviewHref(id, validDate ? { date: validDate } : undefined) as never,
        );
        onClose();
      } catch {
        setError("Couldn't rebuild that session. Try again.");
      } finally {
        setRepeating(false);
      }
    },
    [date, router, onClose, token],
  );

  const busy = generating || repeating || starting;

  return (
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <Text testID={`${testID}-error`} className="text-destructive text-sm">
            {error}
          </Text>
        ) : null}

        {/* 1. My Sessions */}
        <View>
          <View className="flex-row items-center mb-2">
            <History size={14} color={colors["muted-foreground"]} />
            <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide ml-1.5">
              My Sessions
            </Text>
          </View>
          {loadingRecent ? (
            <View style={{ gap: 6 }}>
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  testID={`${testID}-recent-skeleton-${i}`}
                  className="h-14 rounded-xl bg-muted animate-pulse"
                />
              ))}
            </View>
          ) : recentQuick.length === 0 ? (
            <Text
              testID={`${testID}-recent-empty`}
              className="text-muted-foreground text-sm"
            >
              No sessions yet — pick a focus below to build your first one.
            </Text>
          ) : (
            <View style={{ gap: 6 }}>
              {recentQuick.map((log, i) => (
                <Pressable
                  key={`${log.title}-${log.date}-${i}`}
                  testID={`${testID}-repeat-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Repeat ${log.title}`}
                  onPress={() => void repeatRecent(log)}
                  disabled={busy}
                  className="flex-row items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5"
                >
                  <View className="flex-1 mr-3">
                    <Text className="text-foreground text-sm font-medium" numberOfLines={1}>
                      {log.title}
                    </Text>
                    <Text className="text-muted-foreground text-xs">
                      {shortDate(log.date)} · {log.exerciseCount}{" "}
                      {log.exerciseCount === 1 ? "exercise" : "exercises"}
                    </Text>
                  </View>
                  <Text className="text-primary text-xs font-semibold">Repeat</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* 2. Quick start by focus */}
        <View>
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
              Quick start by focus
            </Text>
            {/* AI toggle (NP-136): with it on, the request goes to
                `/api/ai/workout/session` first, then falls back to the
                standard generator. */}
            <Pressable
              testID={`${testID}-ai-toggle`}
              accessibilityRole="switch"
              accessibilityState={{ checked: useAi, disabled: busy }}
              accessibilityLabel={useAi ? "Disable AI generation" : "Enable AI generation"}
              onPress={() => {
                setUseAi((v) => !v);
                // Reset the preview so the member re-taps a chip with the new setting.
                setPreview(null);
                setSelectedFocus(null);
                setAiUsed(false);
                setFallbackNote(null);
              }}
              disabled={busy}
              className={`flex-row items-center rounded-full px-2.5 py-1 ${
                useAi ? "bg-primary" : "border border-border bg-card"
              }`}
            >
              <Sparkles
                size={12}
                color={useAi ? colors["primary-foreground"] : colors["muted-foreground"]}
              />
              <Text
                className={`text-[11px] font-semibold ml-1 ${
                  useAi ? "text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {useAi ? "AI on" : "AI"}
              </Text>
            </Pressable>
          </View>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {QUICK_FOCUS_ORDER.map((key) => {
              const active = selectedFocus === key;
              return (
                <Pressable
                  key={key}
                  testID={`${testID}-focus-${key}`}
                  accessibilityRole="button"
                  accessibilityLabel={QUICK_FOCUS_LABELS[key]}
                  onPress={() => void generateFor(key)}
                  disabled={busy}
                  className={`flex-row items-center rounded-2xl border px-3.5 py-2 ${
                    active ? "border-primary bg-primary/10" : "border-border bg-card"
                  }`}
                >
                  <Dumbbell size={14} color={colors.primary} />
                  <View className="ml-1.5">
                    <Text className="text-foreground text-sm font-semibold">
                      {QUICK_FOCUS_LABELS[key]}
                    </Text>
                    <Text className="text-muted-foreground text-[10px]">
                      {QUICK_FOCUS_BLURBS[key]}
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
              className="mt-3 rounded-2xl border border-border bg-card p-4"
            >
              {generating ? (
                <View className="flex-row items-center justify-center py-6" style={{ gap: 8 }}>
                  <ActivityIndicator testID={`${testID}-preview-loading`} />
                  <Text className="text-muted-foreground text-sm">
                    {useAi
                      ? `Generating your ${QUICK_FOCUS_LABELS[selectedFocus].toLowerCase()} session with AI…`
                      : `Building your ${QUICK_FOCUS_LABELS[selectedFocus].toLowerCase()} session…`}
                  </Text>
                </View>
              ) : preview ? (
                <>
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center flex-1 mr-2" style={{ gap: 6 }}>
                      <Text
                        testID={`${testID}-preview-title`}
                        className="text-foreground text-sm font-semibold flex-1"
                      >
                        {preview.title}
                      </Text>
                      {aiUsed ? (
                        <View
                          testID={`${testID}-preview-ai-badge`}
                          className="flex-row items-center rounded-full bg-primary/10 px-1.5 py-0.5"
                        >
                          <Sparkles size={10} color={colors.primary} />
                          <Text className="text-primary text-[9px] font-semibold ml-0.5">
                            AI
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="text-muted-foreground text-xs">
                      {preview.exercises.length} exercises
                    </Text>
                  </View>
                  {/* Allowance spent, but a session was still built.
                      Deliberately not the upgrade sheet: there IS a result
                      on screen and a modal over it would read as a failure. */}
                  {fallbackNote ? (
                    <View
                      testID={`${testID}-fallback-note`}
                      className="flex-row rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5 mb-3"
                    >
                      <Sparkles size={14} color={colors.accent} />
                      <Text className="text-accent text-xs flex-1 ml-2">
                        {fallbackNote}
                      </Text>
                    </View>
                  ) : null}
                  <View style={{ gap: 4 }} className="mb-3">
                    {preview.exercises.map((ex, idx) => (
                      <View
                        key={`${ex.exerciseSlug}-${idx}`}
                        testID={`${testID}-preview-exercise-${idx}`}
                        className="flex-row items-center justify-between"
                      >
                        <Text className="text-foreground text-sm flex-1 mr-3" numberOfLines={1}>
                          {ex.name}
                        </Text>
                        <Text className="text-muted-foreground text-xs">
                          {ex.sets} × {ex.reps || ex.duration || "—"}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View className="flex-row items-center" style={{ gap: 8 }}>
                    <Button
                      testID={`${testID}-regenerate`}
                      variant="secondary"
                      onPress={() => selectedFocus && void generateFor(selectedFocus)}
                      disabled={busy}
                    >
                      <View className="flex-row items-center" style={{ gap: 6 }}>
                        <RefreshCw size={14} color={colors.foreground} />
                        <Text className="text-foreground text-sm font-semibold">Regenerate</Text>
                      </View>
                    </Button>
                    <View className="flex-1">
                      <Button
                        testID={`${testID}-start`}
                        onPress={() => void startPreview()}
                        disabled={busy}
                      >
                        <View className="flex-row items-center justify-center" style={{ gap: 6 }}>
                          <Zap size={14} color={colors["primary-foreground"]} />
                          <Text className="text-white text-sm font-semibold">Start session</Text>
                        </View>
                      </Button>
                    </View>
                  </View>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
  );
}
