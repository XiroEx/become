import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowRight,
  Check,
  Clock,
  Flame,
  Lock,
} from "lucide-react-native";
import {
  apiFetch,
  MindIdentityResponseSchema,
  MindProgressResponseSchema,
  MindSessionSaveResponseSchema,
  MindSessionStateResponseSchema,
  MindStateResponseSchema,
  MindMissionResponseSchema,
  ProgressMoodResponseSchema,
  type MindChapterSessions,
  type MindLevelProgress,
  type MindState,
  type ProgressMoodPoint,
} from "@become/api-client";
import {
  CHAPTERS,
  composeSession,
  dayOfYear,
  findProtocol,
  getPathSession,
  getUnlockedSystems,
  isMoodLevel,
  seedStateForMood,
  shouldAutoStartMindSession,
  suggestActions,
  syntheticGate,
  type MindSessionPlan,
  type MoveKind,
  type SessionContext,
  type SuggestedAction,
  type TodayMood,
} from "@become/core";
import { Text } from "@/components/Text";
import { Avatar } from "@/components/Avatar";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { MoodHistoryStrip } from "@/components/mind/MoodHistoryStrip";
import { IdentityOnboarding } from "@/components/mind/IdentityOnboarding";
import { SessionPlayer } from "@/components/mind/session/SessionPlayer";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { tzOffsetMinutes, useLocalDay } from "@/lib/time/localDay";
import {
  invalidateMindSession,
  invalidateMindSuggestions,
  readMindPlanCache,
  readMindSuggestionsCache,
  warmMindSession,
  writeMindSuggestionsCache,
} from "@/lib/mind/sessionCache";
import { precomposeMindSession } from "@/lib/mind/precompose";
import { runAiTask } from "@/lib/ai/runClient";

export interface MindRouteProps {
  testID?: string;
}

interface ProgressData {
  chapter: number;
  xp: number;
  unlockedSystems: string[];
  vision: { identityStatement?: string } | null;
  level: number;
  levelProgress: MindLevelProgress | null;
  mainSessionCount: number;
  sessionsIntoChapter: MindChapterSessions | null;
  mainSessionAvailable: boolean;
  nextMainSessionAt: number | null;
}

/** "in 12h 30m" until the next main session unlocks (null once available). */
function untilLabel(ts: number | null): string | null {
  if (!ts) return null;
  const ms = ts - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}

export const MOVE_CHIP: Record<string, string> = {
  "state-check": "Check in",
  breath: "Breathe",
  identity: "Affirm",
  win: "Win",
  challenge: "Challenge",
  mission: "Mission",
  vision: "Vision",
  antisabotage: "Anti-sabotage",
  social: "Social",
  mirror: "Mirror",
  choice: "Choice",
  type: "Type",
  speak: "Speak",
  assemble: "Assemble",
  compose: "Compose",
  acknowledge: "Acknowledge",
  interrogative: "Ask",
  contrast: "Contrast",
};

/**
 * Mind Home (NP-097).
 *
 * Runs first-time identity intake if onboardingCompleted is false, then displays:
 * - Mind streak in header
 * - Level progress bar and visual chapter progression
 * - Today's session card with move chips and Begin
 * - Lock card with UpgradeSheet when server reports `locked: true`
 * - Cooldown label when `mainSessionAvailable: false`
 * - Resumes unfinished session from `PUT /api/mind/session { seed, plan, tz }`
 * - `become://mind?start=1` auto-start
 * - Re-reads on local day change via `useLocalDay` (NP-035)
 */
export default function MindRoute({ testID = "mind-route" }: MindRouteProps) {
  const router = useRouter();
  const { colors } = useThemeTokens();
  const { token, user } = useAuth();
  const localDay = useLocalDay();
  const params = useLocalSearchParams<{ start?: string }>();
  const autoStart = params.start === "1";

  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [streak, setStreak] = useState(0);
  const [sessionLock, setSessionLock] = useState<{ limit: number } | null>(null);
  const [resumable, setResumable] = useState<{
    seed: number;
    plan: MindSessionPlan;
  } | null>(null);

  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [sessionSeed, setSessionSeed] = useState<number | null>(null);
  const [recentState, setRecentState] = useState<MindState | null>(null);
  const [recentFeeling, setRecentFeeling] = useState<string | null>(null);
  const [recentKinds, setRecentKinds] = useState<string[]>([]);
  const [moodToday, setMoodToday] = useState<TodayMood | null>(null);
  const [missionAction, setMissionAction] = useState<string | null>(null);
  const [lastBreathAt, setLastBreathAt] = useState<number | null>(null);
  const [mainSessionAvailable, setMainSessionAvailable] = useState<boolean | null>(
    null,
  );
  const [nextMainSessionAt, setNextMainSessionAt] = useState<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [points, setPoints] = useState<ProgressMoodPoint[]>([]);
  const [loadedAt, setLoadedAt] = useState<number>(0);

  // Pre-composed AI Mind plan (NP-102); null falls back to deterministic plan
  const [aiPlan, setAiPlan] = useState<MindSessionPlan | null>(null);
  // Post-session suggested next protocols (AI-picked with deterministic fallback)
  const [aiSuggestions, setAiSuggestions] = useState<SuggestedAction[] | null>(
    null,
  );
  const [suggFetching, setSuggFetching] = useState(false);

  const autoStartedRef = useRef(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadedAt(Date.now());
    try {
      const tzParam = localDay.tz ?? tzOffsetMinutes();
      const [
        identityRes,
        progressRes,
        sessionRes,
        stateRes,
        missionRes,
        userProgressRes,
      ] = await Promise.allSettled([
        apiFetch("/api/mind/identity", MindIdentityResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          tz: tzParam,
        }),
        apiFetch("/api/mind/progress", MindProgressResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          tz: tzParam,
        }),
        apiFetch(
          `/api/mind/session?tz=${tzParam ?? ""}`,
          MindSessionStateResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
            tz: tzParam,
          },
        ),
        apiFetch(
          `/api/mind/state?tz=${tzParam ?? ""}`,
          MindStateResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
            tz: tzParam,
          },
        ),
        apiFetch("/api/mind/mission", MindMissionResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          tz: tzParam,
        }),
        apiFetch("/api/progress", ProgressMoodResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        }),
      ]);

      if (identityRes.status === "fulfilled") {
        setOnboarded(!!identityRes.value?.profile?.onboardingCompleted);
      } else {
        setOnboarded(false);
      }

      if (progressRes.status === "fulfilled") {
        const p = progressRes.value;
        setProgress({
          chapter: p.chapter ?? 1,
          xp: p.xp ?? 0,
          unlockedSystems:
            p.unlockedSystems ?? getUnlockedSystems(p.chapter ?? 1),
          vision: p.vision ?? null,
          level: p.level ?? 1,
          levelProgress: p.levelProgress ?? null,
          mainSessionCount: p.mainSessionCount ?? 0,
          sessionsIntoChapter: p.sessionsIntoChapter ?? null,
          mainSessionAvailable: p.mainSessionAvailable ?? true,
          nextMainSessionAt: p.nextMainSessionAt ?? null,
        });
      }

      if (sessionRes.status === "fulfilled") {
        const s = sessionRes.value;
        setStreak(s.streak ?? 0);
        setLastBreathAt(
          typeof s.lastBreathAt === "number" ? s.lastBreathAt : null,
        );
        setRecentKinds(Array.isArray(s.recentKinds) ? s.recentKinds : []);
        if (s.resume?.plan && typeof s.resume?.seed === "number") {
          setResumable({
            seed: s.resume.seed,
            plan: s.resume.plan as MindSessionPlan,
          });
        } else {
          setResumable(null);
        }
        setSessionLock(
          s.locked === true && typeof s.sessionsLimit === "number"
            ? { limit: s.sessionsLimit }
            : null,
        );
        if (typeof s.mainSessionAvailable === "boolean") {
          setMainSessionAvailable(s.mainSessionAvailable);
        }
        if (typeof s.nextMainSessionAt === "number") {
          setNextMainSessionAt(s.nextMainSessionAt);
        }
      }

      if (stateRes.status === "fulfilled") {
        const st = stateRes.value;
        const last =
          Array.isArray(st.logs) && st.logs.length > 0 ? st.logs[0] : null;
        if (last?.state) setRecentState(last.state as MindState);
        if (typeof last?.feeling === "string") setRecentFeeling(last.feeling);
        const mood = st.todayMood as TodayMood | null | undefined;
        if (mood && isMoodLevel(mood.value)) {
          setMoodToday(mood);
          const lastAt = last?.timestamp ? new Date(last.timestamp).getTime() : 0;
          if (mood.at > lastAt) {
            const seeded = seedStateForMood(mood.value);
            if (seeded) {
              setRecentState(seeded);
              setRecentFeeling(mood.label);
            }
          }
        }
      }

      if (missionRes.status === "fulfilled") {
        const m = missionRes.value;
        setMissionAction(m?.mission?.dailyAction ?? null);
      }

      if (userProgressRes.status === "fulfilled") {
        setPoints(userProgressRes.value?.moodData ?? []);
      }
    } catch (err) {
      console.error("Error loading mind home:", err);
    } finally {
      setLoading(false);
    }
  }, [token, localDay.tz]);

  // Re-read session state when local day changes (NP-035)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync session and progress from server fetch and local day
    void load();
  }, [load, localDay.day]);

  // Context composed for deterministic session
  const sessionContext = useMemo<SessionContext | null>(() => {
    if (!progress) return null;
    return {
      chapter: progress.chapter,
      unlockedSystems: progress.unlockedSystems,
      recentState,
      recentFeeling,
      moodToday,
      missionAction,
      identityStatement: progress.vision?.identityStatement ?? null,
      recentKinds,
      pathFocus: getPathSession(progress.mainSessionCount),
      dayOfYear: dayOfYear(loadedAt > 0 ? new Date(loadedAt) : undefined),
      seed: sessionSeed ?? undefined,
      now: loadedAt > 0 ? loadedAt : undefined,
      lastBreathAt,
    };
  }, [
    progress,
    recentState,
    recentFeeling,
    moodToday,
    missionAction,
    sessionSeed,
    lastBreathAt,
    recentKinds,
    loadedAt,
  ]);

  const plan = useMemo<MindSessionPlan | null>(
    () => (sessionContext ? composeSession(sessionContext) : null),
    [sessionContext],
  );

  // Adopt the AI-composed session if one is cached. Generation itself runs in
  // the background on APP OPEN / foreground — we never block the Mind view on it.
  // If the cache is empty (first run, or a workout/nutrition log invalidated it),
  // kick a cooldown-gated, silent warm so the next view shows the fresh AI plan;
  // meanwhile the deterministic plan renders instantly.
  useEffect(() => {
    if (!progress || aiPlan) return;
    let cancelled = false;
    void (async () => {
      const cache = await readMindPlanCache();
      if (cancelled) return;
      if (cache?.plan) {
        setAiPlan(cache.plan);
        return;
      }
      await precomposeMindSession();
      if (cancelled) return;
      const c = await readMindPlanCache();
      if (c?.plan) {
        setAiPlan(c.plan);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [progress, aiPlan]);

  const effectivePlan = resumable ? resumable.plan : (aiPlan ?? plan);

  const deterministicSuggestions = useMemo(
    () =>
      progress
        ? suggestActions({
            state: recentState,
            unlocked: progress.unlockedSystems,
            seed: dayOfYear(loadedAt > 0 ? new Date(loadedAt) : undefined),
          })
        : [],
    [progress, recentState, loadedAt],
  );

  // After a session (i.e. in the 20h cooldown), ask the AI to
  // pick 3 next protocols from the user's state + tendencies. CACHED in
  // AsyncStorage until the next session completes (max 12h) so revisiting the
  // page doesn't refetch — settles to deterministic set if the AI fails.
  // Silent run (never raises consent or gate).
  useEffect(() => {
    if (
      !progress ||
      (mainSessionAvailable ?? progress.mainSessionAvailable ?? true) ||
      aiSuggestions
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const cached = await readMindSuggestionsCache();
      if (cancelled) return;
      if (cached) {
        const valid = cached.filter((s) => findProtocol(s.system, s.id));
        if (valid.length === 3) {
          setAiSuggestions(valid);
          return;
        }
      }
      setSuggFetching(true);
      try {
        const r = await runAiTask(
          "/api/ai/mind/suggestions",
          {
            context: {
              state: recentState,
              recentKinds,
              unlockedSystems: progress.unlockedSystems,
            },
          },
          { silent: true },
        );
        if (cancelled) return;
        const raw =
          r.ok && r.result
            ? (
                r.result as {
                  suggestions?: {
                    system: string;
                    protocolId: string;
                    reason?: string;
                  }[];
                }
              ).suggestions
            : null;
        const valid = (Array.isArray(raw) ? raw : [])
          .map((x) => {
            const p = findProtocol(x.system, x.protocolId);
            return p
              ? { ...p, reason: (x.reason || "").trim() || p.blurb }
              : null;
          })
          .filter((x): x is SuggestedAction => x !== null)
          .slice(0, 3);
        if (valid.length === 3) {
          setAiSuggestions(valid);
          await writeMindSuggestionsCache(valid);
        }
      } catch {
        // Fall back to deterministic
      } finally {
        if (!cancelled) setSuggFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [progress, mainSessionAvailable, recentState, recentKinds, aiSuggestions]);

  const available = sessionLock
    ? false
    : (mainSessionAvailable ?? progress?.mainSessionAvailable ?? true);

  const cooldownLabel = untilLabel(
    nextMainSessionAt ?? progress?.nextMainSessionAt ?? null,
  );

  const begin = useCallback(() => {
    if (sessionLock) {
      showUpgradeSheet(
        syntheticGate("mind-sessions", "plus", {
          limit: sessionLock.limit,
          remaining: 0,
          resetsAt: null,
          window: "lifetime",
        }),
      );
      return;
    }
    if (resumable) {
      setSessionSeed(resumable.seed);
      setAiPlan(resumable.plan);
      setPlaying(true);
      return;
    }
    const seed = Date.now();
    setSessionSeed(seed);
    setPlaying(true);
    const planToStore = effectivePlan;
    if (planToStore) {
      void apiFetch("/api/mind/session", MindSessionSaveResponseSchema, {
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        method: "PUT",
        body: {
          seed,
          plan: planToStore as never,
          tz: localDay.tz ?? tzOffsetMinutes(),
        },
      }).catch(() => {});
    }
  }, [sessionLock, resumable, effectivePlan, localDay.tz, token]);

  // Auto-start for ?start=1 (dashboard mindset tile, pushes, widgets)
  useEffect(() => {
    if (
      !shouldAutoStartMindSession({
        autoStart,
        alreadyStarted: autoStartedRef.current,
        loading,
        playing,
        onboarded,
        available,
        hasPlan: !!effectivePlan,
      })
    ) {
      return;
    }
    autoStartedRef.current = true;
    begin();
  }, [
    autoStart,
    loading,
    playing,
    onboarded,
    available,
    effectivePlan,
    begin,
  ]);

  if (loading && onboarded === null) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
        testID={testID}
      >
        <View className="flex-1 items-center justify-center p-6">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (onboarded === false) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
        testID={testID}
      >
        <View style={{ flex: 1, padding: 16 }}>
          <IdentityOnboarding
            onComplete={() => {
              setOnboarded(true);
              void load();
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const ps = getPathSession(progress?.mainSessionCount ?? 0);
  const chapter = progress?.chapter ?? 1;
  const chapterName = CHAPTERS[chapter - 1]?.name ?? "";
  const level = progress?.level ?? 1;
  const levelProgress = progress?.levelProgress ?? null;
  const sessionsIntoChapter = progress?.sessionsIntoChapter ?? null;

  const sessionLabel = ps
    ? `Session ${ps.n} of 50 · ${CHAPTERS[ps.chapter - 1]?.name ?? ""}`
    : "Today's session";

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID={testID}
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        {/* Header: Title, Mind streak, and Profile avatar button */}
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-foreground text-2xl font-bold">Mind</Text>
            <Text className="text-muted-foreground text-sm">
              Daily mindset &amp; focus
            </Text>
          </View>
          <View className="flex-row items-center gap-3">
            {streak > 0 ? (
              <View
                testID="mind-streak-badge"
                className="flex-row items-center gap-1 rounded-full bg-primary/10 px-3 py-1"
              >
                <Flame size={16} color={colors.primary} />
                <Text className="text-sm font-bold text-primary">
                  {streak}
                </Text>
              </View>
            ) : null}
            <Pressable
              testID="mind-header-profile"
              accessibilityRole="button"
              accessibilityLabel="Profile"
              onPress={() => router.push("/(tabs)/profile" as never)}
              style={[
                minTouchTarget,
                { alignItems: "center", justifyContent: "center" },
              ]}
              className="rounded-full border border-border p-0.5"
            >
              <Avatar
                icon={typeof user?.profileIcon === "string" ? user.profileIcon : null}
                imageUrl={typeof user?.avatarUrl === "string" ? user.avatarUrl : null}
                size={32}
                testID="mind-header-avatar"
              />
            </Pressable>
          </View>
        </View>

        {/* Level progress bar */}
        {levelProgress ? (
          <View testID="mind-level-bar">
            <View className="flex-row items-center gap-3">
              <View className="rounded-md bg-purple-100 dark:bg-purple-950/50 px-2 py-0.5">
                <Text className="text-xs font-extrabold text-purple-600 dark:text-purple-400">
                  Lv {level}
                </Text>
              </View>
              <View className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <View
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${Math.min(100, Math.max(0, levelProgress.pct))}%`,
                  }}
                />
              </View>
              <Text className="text-xs font-medium text-muted-foreground">
                {levelProgress.xpToNext} XP
              </Text>
            </View>
          </View>
        ) : null}

        {/* Chapter progression (visual path) */}
        {available ? (
          <View testID="mind-chapter-path">
            <View className="flex-row items-center">
              {CHAPTERS.map((c, i) => {
                const done = c.id < chapter;
                const current = c.id === chapter;
                return (
                  <View
                    key={c.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      flex: i > 0 ? 1 : 0,
                    }}
                  >
                    {i > 0 && (
                      <View
                        className={`h-0.5 flex-1 ${
                          c.id <= chapter ? "bg-primary" : "bg-muted"
                        }`}
                      />
                    )}
                    <View
                      className={`h-7 w-7 rounded-full items-center justify-center ${
                        done
                          ? "bg-primary"
                          : current
                          ? "border-2 border-primary bg-background"
                          : "bg-muted"
                      }`}
                    >
                      {done ? (
                        <Check size={14} color={colors["primary-foreground"]} />
                      ) : (
                        <Text
                          className={`text-xs font-bold ${
                            current ? "text-primary" : "text-muted-foreground"
                          }`}
                        >
                          {c.id}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
            <Text className="mt-2 text-xs font-medium text-muted-foreground">
              Ch.{chapter} · {chapterName}
              {chapter < CHAPTERS.length && sessionsIntoChapter
                ? ` — ${sessionsIntoChapter.done}/${sessionsIntoChapter.needed} sessions to Ch.${chapter + 1}`
                : " — final chapter"}
            </Text>
          </View>
        ) : (
          <View className="flex-row items-center gap-2">
            <Text className="text-xs font-semibold text-muted-foreground">
              Ch.{chapter} · {chapterName}
            </Text>
          </View>
        )}

        {sessionLock ? (
          /* Lock Card: Free member with sessions >= sessionsLimit */
          <Pressable
            testID="mind-lock-card"
            accessibilityRole="button"
            accessibilityLabel={`Session ${sessionLock.limit + 1} locked. See Plus`}
            onPress={() =>
              showUpgradeSheet(
                syntheticGate("mind-sessions", "plus", {
                  limit: sessionLock.limit,
                  remaining: 0,
                  resetsAt: null,
                  window: "lifetime",
                }),
              )
            }
            className="rounded-3xl border border-dashed border-border bg-card p-6"
          >
            <View className="flex-row items-center gap-2">
              <Lock size={16} color={colors["muted-foreground"]} />
              <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Session {sessionLock.limit + 1}
              </Text>
            </View>
            <Text className="text-foreground text-2xl font-extrabold mt-2">
              You&apos;ve finished your first {sessionLock.limit} sessions
            </Text>
            <Text className="text-muted-foreground text-sm mt-2">
              Every chapter after this one, plus Vision, comes with Plus.
            </Text>
            <View
              testID="mind-lock-see-plus"
              className="mt-6 flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 px-6"
            >
              <Text className="text-base font-bold text-primary-foreground">
                See Plus
              </Text>
              <ArrowRight size={18} color={colors["primary-foreground"]} />
            </View>
          </Pressable>
        ) : available && effectivePlan ? (
          /* Main Session Card */
          <View
            testID="mind-session-card"
            accessibilityRole="summary"
            className="rounded-3xl bg-card border border-border p-6 shadow-sm"
          >
            <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {sessionLabel}
            </Text>
            <Text
              testID="mind-session-title"
              className="text-foreground text-2xl font-extrabold mt-2"
            >
              {effectivePlan.intro.title}
            </Text>
            <Text
              testID="mind-session-subtitle"
              className="text-muted-foreground text-sm mt-1"
            >
              {effectivePlan.intro.subtitle}
            </Text>
            <View className="mt-4 flex-row flex-wrap gap-2">
              {effectivePlan.moves.map((m) => (
                <View
                  key={m.id}
                  testID={`mind-move-chip-${m.kind}`}
                  className="rounded-full bg-primary/10 border border-primary/20 px-3 py-1"
                >
                  <Text className="text-xs font-semibold text-primary">
                    {MOVE_CHIP[m.kind as MoveKind] ?? m.kind}
                  </Text>
                </View>
              ))}
            </View>
            <Pressable
              testID="mind-session-begin"
              accessibilityRole="button"
              accessibilityLabel="Begin session"
              onPress={begin}
              className="mt-6 flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 px-6"
            >
              <Text className="text-base font-bold text-primary-foreground">
                Begin
              </Text>
              <ArrowRight size={18} color={colors["primary-foreground"]} />
            </Pressable>
          </View>
        ) : (
          /* Cooldown Card */
          <View
            testID="mind-cooldown-card"
            className="rounded-3xl border border-border bg-card p-6"
          >
            <View className="flex-row items-center gap-2">
              <Clock size={16} color={colors["muted-foreground"]} />
              <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Session completed
              </Text>
            </View>
            <Text className="text-foreground text-xl font-bold mt-2">
              Today&apos;s session is done
            </Text>
            <Text
              testID="mind-cooldown-label"
              className="text-muted-foreground text-sm mt-1"
            >
              Next session {cooldownLabel ?? "unlocks tomorrow"}
            </Text>
          </View>
        )}

        {/* Suggested Next Moves during cooldown (NP-102) */}
        {!available &&
        (aiSuggestions ?? deterministicSuggestions).length > 0 ? (
          <View testID="mind-suggested-actions" className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-foreground text-sm font-semibold uppercase tracking-wider">
                Suggested Next Moves
              </Text>
              {suggFetching ? (
                <Text
                  testID="mind-sugg-loading"
                  className="text-xs text-muted-foreground"
                >
                  tuning…
                </Text>
              ) : null}
            </View>
            {(aiSuggestions ?? deterministicSuggestions).map((action) => (
              <View
                key={`${action.system}-${action.id}`}
                testID={`mind-suggested-action-${action.id}`}
                className="rounded-2xl border border-border bg-card p-4 gap-1"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-bold text-primary uppercase">
                    {action.system}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {action.title}
                  </Text>
                </View>
                <Text className="text-sm text-foreground font-medium">
                  {action.reason}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Recent moods (kept below the card until NP-105 ships) */}
        <View testID="mind-recent-moods">
          <Text className="text-foreground font-semibold mb-2">
            Recent moods
          </Text>
          <MoodHistoryStrip points={points} />
        </View>
      </ScrollView>

      {/* The session itself (NP-098): a full-screen modal over the home, so the
          plan is PLAYED rather than listed. `sessionContext` is what lets the
          live check-in re-open the opening — without it the session would be
          stuck on whatever state yesterday's compose was built for. */}
      {playing && effectivePlan ? (
        <SessionPlayer
          plan={effectivePlan}
          {...(sessionContext ? { sessionContext } : {})}
          tz={localDay.tz ?? tzOffsetMinutes()}
          onExit={() => {
            setPlaying(false);
            setResumable(null);
            setAiPlan(null);
            setAiSuggestions(null);
            // Finished a session → drop the cache and warm a fresh one in the
            // background (non-blocking), so the next view shows a new AI session.
            void invalidateMindSession();
            void invalidateMindSuggestions();
            void warmMindSession();
            void load();
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}
