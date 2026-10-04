import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { ChevronDown, ChevronUp, RefreshCw, Sparkles, Wand2, X } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { BottomSheet } from "@/components/BottomSheet";
import { Toggle } from "@/components/Toggle";
import { Input } from "@/components/Input";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import {
  GENERATE_DIFFICULTIES,
  GENERATE_EQUIPMENT_OPTIONS,
  GENERATE_FOCUS_LABELS,
  GENERATE_FOCUS_ORDER,
  GENERATE_PROGRAM_DAYS_PER_WEEK,
  GENERATE_PROGRAM_EXERCISES_PER_DAY,
  GENERATE_PROGRAM_WEEKS,
  GENERATE_SESSION_EXERCISES,
  defaultProgramParams,
  defaultSessionParams,
  draftProgramToProgramBody,
  generateFocusLabel,
  generateProgram as generateProgramCall,
  generateSession as generateSessionCall,
  savedProgramRoute,
  type GenerateDifficulty,
  type GenerateProgramParams,
  type GenerateSessionParams,
  type GenerateTab,
  type GeneratedProgram,
  type GeneratedSession,
} from "@/lib/programs/generate";
import {
  quickSessionOverviewHref,
  stashQuickSession,
} from "@/lib/quickSession/store";
import { CustomProgramResponseSchema, apiFetch } from "@become/api-client";
import type { z } from "zod";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { syntheticGate, useEntitlements } from "@/lib/entitlements";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { showAiConsentPrompt } from "@/lib/ai/aiConsentPrompt";
import { routeApiError } from "@/lib/errors";
import { useRouter } from "expo-router";
import {
  aiFallbackNote,
  generateAiSheetProgram,
  generateAiSheetSession,
} from "@/lib/workout/aiGenerate";

export interface GenerateSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Where the sheet was opened from — carried for analytics parity only. */
  testID?: string;
}

/**
 * GENERATE SHEET (NP-133 + NP-136).
 *
 * Native port of `webapp/components/GenerateModal.tsx`: session and program
 * tabs over the standard generator, preview, Regenerate, Start (through the
 * NP-227 overview) and Save as program with the refusal classifier (NP-010)
 * and the upgrade sheet (NP-052).
 *
 * With the AI switch on (NP-136), the request goes through the AI run client
 * (NP-038) to `/api/ai/workout/session` or `/api/ai/workout/program` first
 * and falls back to the standard generator — the web's AI path, with the
 * web's fallback-note wording.
 *
 * Rules that travel:
 * - `/api/generate/*` is never metered: no allowance line, no gate check.
 *   A 403 there without `feature` + `requiresTier` is an ordinary error —
 *   `routeApiError` files it as `forbidden` and it renders as the server's
 *   own words, never the sheet.
 * - Save as program reads `canCreate("custom-programs")`, not `allowed`,
 *   and bails (no lock, no counter, no sheet) when `enforced` is false.
 * - A generated session starts through the quick-session overview:
 *   stash with `needsName: true`, push `quickSessionOverviewHref(id)`.
 * - Consent is checked on the server before any charge: a consent refusal
 *   opens the consent prompt (NP-046) and nothing else, and declining
 *   leaves the standard generator working.
 * - An allowance refusal falls through to the standard generator and is a
 *   note, never a wall; a 429 spend cap is never an upsell.
 * - Post once per member action and never retry the POST.
 */
export function GenerateSheet({ visible, onClose, testID = "generate-sheet" }: GenerateSheetProps) {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();

  const [activeTab, setActiveTab] = useState<GenerateTab>("session");

  const [focus, setFocus] = useState<string>("full_body");
  const [difficulty, setDifficulty] = useState<GenerateDifficulty>("intermediate");
  const [equipment, setEquipment] = useState<string[]>([]);

  const [exerciseCount, setExerciseCount] = useState<number>(GENERATE_SESSION_EXERCISES.default);
  const [includeCardio, setIncludeCardio] = useState<boolean>(false);

  const [daysPerWeek, setDaysPerWeek] = useState<number>(GENERATE_PROGRAM_DAYS_PER_WEEK.default);
  const [weeks, setWeeks] = useState<number>(GENERATE_PROGRAM_WEEKS.default);
  const [exercisesPerDay, setExercisesPerDay] = useState<number>(
    GENERATE_PROGRAM_EXERCISES_PER_DAY.default,
  );

  const [session, setSession] = useState<GeneratedSession["session"] | null>(null);
  const [program, setProgram] = useState<GeneratedProgram["program"] | null>(null);
  const [expandedDay, setExpandedDay] = useState<number | null>(0);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // AI controls (NP-136): the switch plus the free-text prompt, the web's
  // `useAi` / `aiPrompt` / `aiUsed`. `fallbackNote` is an allowance refusal
  // the member walked away from WITH a result: the unmetered deterministic
  // builder ran instead. Non-blocking on purpose — it sits beside a real
  // result, so it must never raise the upgrade sheet over it.
  const [useAi, setUseAi] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiUsed, setAiUsed] = useState(false);
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);

  const {
    data: entitlements,
    canCreate,
    refresh: refreshEntitlements,
  } = useEntitlements();
  const maySaveProgram = canCreate("custom-programs");
  const enforced = entitlements ? entitlements.enforced !== false : true;

  // "1/3 this week" under Generate. Session and program share one weekly
  // allowance, so the same line sits under both buttons. Nothing renders
  // while enforcement is off, or for anyone uncapped.
  const generationsLeft = (() => {
    if (!entitlements?.enforced) return null;
    const g = entitlements.features?.["workout-generation"] ?? null;
    if (!g || g.limit === null || g.limit === undefined) return null;
    return `${Math.min(g.used ?? 0, g.limit)}/${g.limit} this week`;
  })();

  // Reset preview/error state when the sheet opens.
  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from open intent
    setSession(null);
    setProgram(null);
    setError(null);
    setFallbackNote(null);
    setSaved(false);
    setLoading(false);
    setSaving(false);
    setStarting(false);
    setAiUsed(false);
    setExpandedDay(0);
  }, [visible]);

  const switchTab = useCallback((tab: GenerateTab) => {
    setActiveTab(tab);
    setSession(null);
    setProgram(null);
    setError(null);
    setFallbackNote(null);
    setSaved(false);
    setAiUsed(false);
    setExpandedDay(0);
  }, []);

  const toggleEquipment = useCallback((value: string) => {
    setEquipment((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }, []);

  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    }),
    [token],
  );

  /** A refusal becomes the upgrade sheet only when it IS a gate; otherwise the server's words. */
  const handleFailure = useCallback((err: unknown): string | null => {
    const { handled, message } = routeApiError(err, {
      onPlanGate: (gate) => {
        showUpgradeSheet(gate.gate);
      },
    });
    return handled ? null : message;
  }, []);

  /**
   * Handle an AI-task refusal the way the web does: consent opens the
   * consent prompt (NP-046) and nothing else; a gate becomes the fallback
   * note (never the upgrade sheet — a result is about to land underneath
   * it); a 429 spend cap or any other failure falls through silently.
   * Returns the note to show, or null.
   */
  const noteForAiOutcome = useCallback(
    (
      outcome: { status: string; gate?: { error: string } | null },
      noun: "session" | "program",
    ): string | null => {
      if (outcome.status === "consent") {
        showAiConsentPrompt({
          onDecline: () => {
            // The deterministic preview below is already on its way; the
            // member simply keeps the standard path.
          },
        });
        return null;
      }
      if (outcome.status === "gate") {
        void refreshEntitlements().catch(() => {});
        return aiFallbackNote(outcome.gate?.error ?? "", noun);
      }
      return null;
    },
    [refreshEntitlements],
  );

  const runGenerateSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFallbackNote(null);
    setAiUsed(false);
    try {
      // ── AI path (when toggled) ──────────────────────────────────────────
      // Async run: POST returns a runId, the run client polls until the
      // session lands. Posts exactly ONCE per member action — no retry here.
      if (useAi) {
        try {
          const equipmentStr = equipment.length ? equipment.join(", ") : undefined;
          const outcome = await generateAiSheetSession(
            {
              ...(aiPrompt.trim() ? { prompt: aiPrompt.trim() } : {}),
              focus: generateFocusLabel(focus) ?? focus,
              ...(equipmentStr ? { equipment: equipmentStr } : {}),
              level: difficulty,
            },
            focus,
            { baseUrl: WEBAPP_BASE_URL, getToken: () => token ?? undefined },
          );
          if (outcome.status === "ai") {
            setSession({
              title: outcome.session.title,
              focus: outcome.session.focus,
              exercises: outcome.session.exercises,
            });
            setAiUsed(true);
            void refreshEntitlements().catch(() => {});
            setLoading(false);
            return;
          }
          const note = noteForAiOutcome(outcome, "session");
          if (note) setFallbackNote(note);
        } catch {
          // Network / parse error — fall through to deterministic
        }
      }
      const params: GenerateSessionParams = {
        focus,
        difficulty,
        equipment,
        exerciseCount,
        includeCardio,
      };
      const data = await generateSessionCall(params, fetchOpts);
      if (!data?.session) {
        // The note was written a moment ago, on the assumption that this
        // call always works. It didn't, so retract it rather than leave an
        // amber "built you a standard session instead" beside a red failure
        // and an empty preview.
        setFallbackNote(null);
        setError("Could not generate a session. Try again.");
        return;
      }
      setSession(data.session);
    } catch (err) {
      // Same retraction as above: no session, no note.
      setFallbackNote(null);
      const message = handleFailure(err);
      if (message) setError(message);
    } finally {
      setLoading(false);
    }
  }, [focus, difficulty, equipment, exerciseCount, includeCardio, useAi, aiPrompt, fetchOpts, handleFailure, noteForAiOutcome, refreshEntitlements, token]);

  const runGenerateProgram = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFallbackNote(null);
    setSaved(false);
    setAiUsed(false);
    try {
      // ── AI path (when toggled) ──────────────────────────────────────────
      // Same weekly allowance as a session, same answer: note it and fall
      // through to the unmetered deterministic builder.
      if (useAi) {
        try {
          const equipmentStr = equipment.length ? equipment.join(", ") : undefined;
          const focusLabel = generateFocusLabel(focus) ?? focus;
          const goal = aiPrompt.trim() || `${focusLabel} training`;
          const outcome = await generateAiSheetProgram(
            {
              goal,
              daysPerWeek,
              weeks,
              level: difficulty,
              ...(equipmentStr ? { equipment: equipmentStr } : {}),
            },
            focus,
            `${focusLabel} ${daysPerWeek}-Day Program`,
            { baseUrl: WEBAPP_BASE_URL, getToken: () => token ?? undefined },
          );
          if (outcome.status === "ai-program") {
            setProgram({
              name: outcome.program.name ?? goal,
              description:
                outcome.program.description ??
                `An AI-generated ${weeks}-week, ${daysPerWeek}-day program.`,
              focus,
              daysPerWeek: outcome.program.daysPerWeek ?? daysPerWeek,
              weeks: outcome.program.weeks ?? weeks,
              days: outcome.program.days,
            });
            setExpandedDay(0);
            setAiUsed(true);
            void refreshEntitlements().catch(() => {});
            setLoading(false);
            return;
          }
          const note = noteForAiOutcome(outcome, "program");
          if (note) setFallbackNote(note);
        } catch {
          // Network / parse error — fall through to deterministic
        }
      }
      const params: GenerateProgramParams = {
        focus,
        difficulty,
        equipment,
        daysPerWeek,
        weeks,
        exercisesPerDay,
      };
      const data = await generateProgramCall(params, fetchOpts);
      if (!data?.program) {
        // The note was written a moment ago, on the assumption that this
        // call always works. It didn't, so retract it.
        setFallbackNote(null);
        setError("Could not generate a program. Try again.");
        return;
      }
      setProgram(data.program);
      setExpandedDay(0);
    } catch (err) {
      // Same retraction as above: no program, no note.
      setFallbackNote(null);
      const message = handleFailure(err);
      if (message) setError(message);
    } finally {
      setLoading(false);
    }
  }, [focus, difficulty, equipment, daysPerWeek, weeks, exercisesPerDay, useAi, aiPrompt, fetchOpts, handleFailure, noteForAiOutcome, refreshEntitlements, token]);

  const startSession = useCallback(async () => {
    if (!session) return;
    setStarting(true);
    try {
      const id = await stashQuickSession(
        { title: session.title, focus: session.focus, exercises: session.exercises },
        { needsName: true },
      );
      onClose();
      router.push(quickSessionOverviewHref(id) as never);
    } finally {
      setStarting(false);
    }
  }, [session, onClose, router]);

  /** The cap, explained in the server's vocabulary rather than ours. */
  const raiseCapSheet = useCallback(() => {
    const entitlement = entitlements?.features?.["custom-programs"] ?? null;
    showUpgradeSheet(
      syntheticGate("custom-programs", entitlement?.requiresTier ?? "plus", entitlement),
    );
  }, [entitlements]);

  const saveProgram = useCallback(async () => {
    if (!program) return;
    // Read canCreate, not allowed, before offering Save — and bail entirely
    // when enforcement is off (the server is still the gate).
    if (!maySaveProgram && enforced) {
      raiseCapSheet();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = draftProgramToProgramBody(program, difficulty);
      const created = await apiFetch<z.infer<typeof CustomProgramResponseSchema>>(
        "/api/programs/custom",
        CustomProgramResponseSchema,
        { method: "POST", body, ...fetchOpts },
      );
      setSaved(true);
      await refreshEntitlements().catch(() => {});
      const id = created.program_id ?? created._id ?? "";
      onClose();
      if (id) {
        router.push(savedProgramRoute(id) as never);
      } else {
        router.push("/(tabs)/programming/mine" as never);
      }
    } catch (err) {
      const message = handleFailure(err);
      await refreshEntitlements().catch(() => {});
      if (message) setError(message);
    } finally {
      setSaving(false);
    }
  }, [
    program,
    difficulty,
    maySaveProgram,
    enforced,
    raiseCapSheet,
    fetchOpts,
    handleFailure,
    refreshEntitlements,
    onClose,
    router,
  ]);

  const adjust = useCallback(
    (
      value: number,
      delta: number,
      min: number,
      max: number,
      set: (n: number) => void,
    ) => {
      set(Math.max(min, Math.min(max, value + delta)));
    },
    [],
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Generate"
      testID={testID}
      accessibilityLabel="Generate a workout"
      sheetStyle={{ maxHeight: "90%" }}
    >
      <ScrollView
        testID={`${testID}-scroll`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 8, gap: 16 }}
      >
        {/* Tab control */}
        <View
          testID={`${testID}-tabs`}
          accessibilityRole="tablist"
          style={{ flexDirection: "row", gap: 8 }}
        >
          {(["session", "program"] as GenerateTab[]).map((tab) => {
            const selected = activeTab === tab;
            return (
              <Pressable
                key={tab}
                testID={`${testID}-tab-${tab}`}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={tab === "session" ? "Session" : "Program"}
                onPress={() => switchTab(tab)}
                style={[
                  minTouchTarget,
                  {
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    borderRadius: 12,
                    paddingVertical: 10,
                    backgroundColor: selected ? colors.primary : colors.muted,
                  },
                ]}
              >
                {tab === "session" ? (
                  <Wand2 size={16} color={selected ? colors["primary-foreground"] : colors.foreground} />
                ) : null}
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: selected ? colors["primary-foreground"] : colors.foreground,
                  }}
                >
                  {tab === "session" ? "Session" : "Program"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Focus */}
        <View>
          <Text
            testID={`${testID}-focus-label`}
            className="text-muted-foreground text-xs font-semibold uppercase mb-2"
          >
            Focus
          </Text>
          <View testID={`${testID}-focus-options`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {GENERATE_FOCUS_ORDER.map((key) => {
              const selected = focus === key;
              return (
                <Pressable
                  key={key}
                  testID={`${testID}-focus-${key}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={GENERATE_FOCUS_LABELS[key]}
                  onPress={() => setFocus(key)}
                  style={[
                    minTouchTarget,
                    {
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? colors.primary : colors.card,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "500",
                      color: selected ? colors["primary-foreground"] : colors.foreground,
                    }}
                  >
                    {GENERATE_FOCUS_LABELS[key]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Difficulty */}
        <View>
          <Text className="text-muted-foreground text-xs font-semibold uppercase mb-2">
            Difficulty
          </Text>
          <View testID={`${testID}-difficulty-options`} style={{ flexDirection: "row", gap: 8 }}>
            {GENERATE_DIFFICULTIES.map((d) => {
              const selected = difficulty === d;
              return (
                <Pressable
                  key={d}
                  testID={`${testID}-difficulty-${d}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={d}
                  onPress={() => setDifficulty(d)}
                  style={[
                    minTouchTarget,
                    {
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 12,
                      paddingVertical: 10,
                      backgroundColor: selected ? colors.primary : colors.muted,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      textTransform: "capitalize",
                      color: selected ? colors["primary-foreground"] : colors.foreground,
                    }}
                  >
                    {d}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Equipment */}
        <View>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <Text className="text-muted-foreground text-xs font-semibold uppercase">
              Equipment
            </Text>
            {equipment.length === 0 ? (
              <Text className="text-muted-foreground text-xs">Any equipment</Text>
            ) : null}
          </View>
          <View testID={`${testID}-equipment-options`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {GENERATE_EQUIPMENT_OPTIONS.map((opt) => {
              const selected = equipment.includes(opt.value);
              return (
                <Pressable
                  key={opt.value}
                  testID={`${testID}-equipment-${opt.value}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={opt.label}
                  onPress={() => toggleEquipment(opt.value)}
                  style={[
                    minTouchTarget,
                    {
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? colors.primary : colors.card,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "500",
                      color: selected ? colors["primary-foreground"] : colors.foreground,
                    }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Tab-specific controls */}
        {activeTab === "session" ? (
          <View style={{ gap: 16 }}>
            <StepperRow
              testID={`${testID}-exercise-count`}
              label="Exercises"
              value={exerciseCount}
              onDecrement={() =>
                adjust(exerciseCount, -1, GENERATE_SESSION_EXERCISES.min, GENERATE_SESSION_EXERCISES.max, setExerciseCount)
              }
              onIncrement={() =>
                adjust(exerciseCount, 1, GENERATE_SESSION_EXERCISES.min, GENERATE_SESSION_EXERCISES.max, setExerciseCount)
              }
            />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <Text className="text-foreground text-sm font-medium">Cardio finisher</Text>
              <Toggle
                value={includeCardio}
                onValueChange={setIncludeCardio}
                accessibilityLabel="Cardio finisher"
                testID={`${testID}-cardio`}
              />
            </View>
            <Button
              testID={`${testID}-generate-session`}
              onPress={() => void runGenerateSession()}
              disabled={loading}
              loading={loading}
              accessibilityLabel={useAi ? "Generate with AI" : "Generate session"}
            >
              {loading && useAi ? "Generating your session…" : useAi ? "✨ Generate with AI" : "Generate session"}
            </Button>

            {generationsLeft ? (
              <Text
                testID={`${testID}-allowance`}
                className="text-muted-foreground text-xs font-medium"
                style={{ textAlign: "center" }}
              >
                {generationsLeft}
              </Text>
            ) : null}

            {session ? (
              <View
                testID={`${testID}-session-preview`}
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  padding: 12,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text testID={`${testID}-session-title`} className="text-foreground text-base font-bold" style={{ flex: 1 }}>
                    {session.title}
                  </Text>
                  {aiUsed ? (
                    <View
                      testID={`${testID}-session-ai-badge`}
                      style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
                      className="rounded-full bg-primary/10 px-2 py-0.5"
                    >
                      <Sparkles size={10} color={colors.primary} />
                      <Text className="text-primary text-[10px] font-semibold">AI</Text>
                    </View>
                  ) : null}
                </View>
                {session.exercises.map((ex, i) => (
                  <View
                    key={`${ex.exerciseSlug}-${i}`}
                    testID={`${testID}-session-exercise-${i}`}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                  >
                    <Text className="text-foreground text-sm" style={{ flex: 1 }}>
                      {ex.name}
                    </Text>
                    <Text className="text-muted-foreground text-sm">
                      {ex.sets} × {ex.reps || ex.duration || "—"}
                    </Text>
                  </View>
                ))}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  <Button
                    testID={`${testID}-session-regenerate`}
                    variant="ghost"
                    onPress={() => void runGenerateSession()}
                    disabled={loading}
                    accessibilityLabel="Regenerate session"
                  >
                    Regenerate
                  </Button>
                  <View style={{ flex: 1 }}>
                    <Button
                      testID={`${testID}-session-start`}
                      onPress={() => void startSession()}
                      disabled={starting}
                      loading={starting}
                      accessibilityLabel="Start session"
                    >
                      Start session
                    </Button>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            <StepperRow
              testID={`${testID}-days-per-week`}
              label="Days per week"
              value={daysPerWeek}
              onDecrement={() =>
                adjust(daysPerWeek, -1, GENERATE_PROGRAM_DAYS_PER_WEEK.min, GENERATE_PROGRAM_DAYS_PER_WEEK.max, setDaysPerWeek)
              }
              onIncrement={() =>
                adjust(daysPerWeek, 1, GENERATE_PROGRAM_DAYS_PER_WEEK.min, GENERATE_PROGRAM_DAYS_PER_WEEK.max, setDaysPerWeek)
              }
            />
            <StepperRow
              testID={`${testID}-weeks`}
              label="Weeks"
              value={weeks}
              onDecrement={() =>
                adjust(weeks, -1, GENERATE_PROGRAM_WEEKS.min, GENERATE_PROGRAM_WEEKS.max, setWeeks)
              }
              onIncrement={() =>
                adjust(weeks, 1, GENERATE_PROGRAM_WEEKS.min, GENERATE_PROGRAM_WEEKS.max, setWeeks)
              }
            />
            <StepperRow
              testID={`${testID}-exercises-per-day`}
              label="Exercises per day"
              value={exercisesPerDay}
              onDecrement={() =>
                adjust(
                  exercisesPerDay,
                  -1,
                  GENERATE_PROGRAM_EXERCISES_PER_DAY.min,
                  GENERATE_PROGRAM_EXERCISES_PER_DAY.max,
                  setExercisesPerDay,
                )
              }
              onIncrement={() =>
                adjust(
                  exercisesPerDay,
                  1,
                  GENERATE_PROGRAM_EXERCISES_PER_DAY.min,
                  GENERATE_PROGRAM_EXERCISES_PER_DAY.max,
                  setExercisesPerDay,
                )
              }
            />
            <Button
              testID={`${testID}-generate-program`}
              onPress={() => void runGenerateProgram()}
              disabled={loading}
              loading={loading}
              accessibilityLabel={useAi ? "Generate with AI" : "Generate program"}
            >
              {loading && useAi ? "Generating your program…" : useAi ? "✨ Generate with AI" : "Generate program"}
            </Button>

            {generationsLeft ? (
              <Text
                testID={`${testID}-allowance`}
                className="text-muted-foreground text-xs font-medium"
                style={{ textAlign: "center" }}
              >
                {generationsLeft}
              </Text>
            ) : null}

            {program ? (
              <View
                testID={`${testID}-program-preview`}
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  padding: 12,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text testID={`${testID}-program-name`} className="text-foreground text-base font-bold" style={{ flex: 1 }}>
                    {program.name}
                  </Text>
                  {aiUsed ? (
                    <View
                      testID={`${testID}-program-ai-badge`}
                      style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
                      className="rounded-full bg-primary/10 px-2 py-0.5"
                    >
                      <Sparkles size={10} color={colors.primary} />
                      <Text className="text-primary text-[10px] font-semibold">AI</Text>
                    </View>
                  ) : null}
                </View>
                <Text testID={`${testID}-program-meta`} className="text-muted-foreground text-xs">
                  {program.weeks} weeks · {program.daysPerWeek} days/week
                </Text>
                {program.days.map((day, i) => {
                  const isOpen = expandedDay === i;
                  return (
                    <View
                      key={`${day.day}-${i}`}
                      testID={`${testID}-program-day-${i}`}
                      style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}
                    >
                      <Pressable
                        testID={`${testID}-program-day-${i}-toggle`}
                        accessibilityRole="button"
                        accessibilityLabel={`${day.day} ${day.title}`}
                        accessibilityState={{ expanded: isOpen }}
                        onPress={() => setExpandedDay(isOpen ? null : i)}
                        style={[
                          minTouchTarget,
                          {
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                          },
                        ]}
                      >
                        <Text className="text-foreground text-sm font-semibold">
                          {day.day} · {day.title}
                        </Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text className="text-muted-foreground text-xs">
                            {day.exercises.length} ex
                          </Text>
                          {isOpen ? (
                            <ChevronUp size={14} color={colors["muted-foreground"]} />
                          ) : (
                            <ChevronDown size={14} color={colors["muted-foreground"]} />
                          )}
                        </View>
                      </Pressable>
                      {isOpen ? (
                        <View style={{ paddingHorizontal: 12, paddingBottom: 10, gap: 6 }}>
                          {day.exercises.map((ex, j) => (
                            <View
                              key={`${ex.exerciseSlug}-${j}`}
                              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                            >
                              <Text className="text-foreground text-sm" style={{ flex: 1 }}>
                                {ex.name}
                              </Text>
                              <Text className="text-muted-foreground text-sm">
                                {ex.sets} × {ex.reps || ex.duration || "—"}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                {saved ? (
                  <Text testID={`${testID}-program-saved`} className="text-sm" style={{ color: colors.success }}>
                    Program saved! Opening…
                  </Text>
                ) : null}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  <Button
                    testID={`${testID}-program-regenerate`}
                    variant="ghost"
                    onPress={() => void runGenerateProgram()}
                    disabled={loading || saving}
                    accessibilityLabel="Regenerate program"
                  >
                    Regenerate
                  </Button>
                  <View style={{ flex: 1 }}>
                    <Button
                      testID={`${testID}-program-save`}
                      onPress={() => void saveProgram()}
                      disabled={saving || saved}
                      loading={saving}
                      accessibilityLabel="Save program"
                    >
                      {saving ? "Saving…" : "Save program"}
                    </Button>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        )}

        {loading ? (
          <View testID={`${testID}-loading`} style={{ alignItems: "center", paddingVertical: 4 }}>
            <ActivityIndicator />
          </View>
        ) : null}

        {error ? (
          <Text
            testID={`${testID}-error`}
            accessibilityRole="alert"
            className="text-sm"
            style={{ color: colors.destructive }}
          >
            {error}
          </Text>
        ) : null}

        {/* AI allowance spent, but a session/program was still built.
            Deliberately not the upgrade sheet: there IS a result on screen
            and a modal over it would read as a failure. */}
        {fallbackNote ? (
          <View
            testID={`${testID}-fallback-note`}
            className="flex-row rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5"
          >
            <Sparkles size={14} color={colors.accent} />
            <Text className="text-accent text-xs flex-1 ml-2">
              {fallbackNote}
            </Text>
          </View>
        ) : null}

        {/* ── AI toggle + prompt ── */}
        <View
          testID={`${testID}-ai-section`}
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            padding: 12,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Sparkles size={16} color={colors.primary} />
              <Text className="text-foreground text-sm font-semibold">
                Generate with AI
              </Text>
            </View>
            <Toggle
              value={useAi}
              onValueChange={setUseAi}
              accessibilityLabel={useAi ? "Disable AI generation" : "Enable AI generation"}
              testID={`${testID}-ai-toggle`}
            />
          </View>
          <Input
            testID={`${testID}-ai-prompt`}
            accessibilityLabel="Describe your goal for the AI"
            placeholder={
              activeTab === "session"
                ? "Describe your ideal session… e.g. a 30-min chest + shoulders burnout"
                : "Describe your goal… e.g. build strength for a first powerlifting meet"
            }
            value={aiPrompt}
            onChangeText={setAiPrompt}
            editable={useAi && !loading}
            multiline
            numberOfLines={2}
          />
          {useAi ? (
            <Text className="text-muted-foreground text-[11px]">
              AI generates first (~30-40 s); falls back to the standard builder automatically.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

function StepperRow({
  testID,
  label,
  value,
  onDecrement,
  onIncrement,
}: {
  testID: string;
  label: string;
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  const { colors } = useThemeTokens();
  return (
    <View
      testID={testID}
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
    >
      <Text className="text-muted-foreground text-xs font-semibold uppercase">{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable
          testID={`${testID}-decrement`}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          onPress={onDecrement}
          style={[
            minTouchTarget,
            {
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
            },
          ]}
        >
          <Text className="text-foreground text-lg font-bold">−</Text>
        </Pressable>
        <Text testID={`${testID}-value`} className="text-foreground text-base font-bold" style={{ minWidth: 24, textAlign: "center" }}>
          {value}
        </Text>
        <Pressable
          testID={`${testID}-increment`}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          onPress={onIncrement}
          style={[
            minTouchTarget,
            {
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
            },
          ]}
        >
          <Text className="text-foreground text-lg font-bold">+</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Close icon for callers that render their own header — kept for parity with the web's X. */
export function GenerateSheetCloseIcon() {
  return <X size={20} />;
}

/** Refresh affordance for callers that render their own preview rows. */
export function GenerateSheetRegenerateIcon() {
  const { colors } = useThemeTokens();
  return <RefreshCw size={14} color={colors["muted-foreground"]} />;
}

export { defaultSessionParams, defaultProgramParams };
