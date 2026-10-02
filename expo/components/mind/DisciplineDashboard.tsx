import { useCallback, useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import {
  Check,
  Crosshair,
  Eye,
  Flame,
  Gauge,
  Megaphone,
  Plus,
  ShieldCheck,
  Soup,
  Sword,
  Trash2,
} from "lucide-react-native";
import {
  apiFetch,
  MindDisciplineResponseSchema,
  MindJournalCreateResponseSchema,
  MindJournalResponseSchema,
  MindNonNegotiableCreateResponseSchema,
  MindNonNegotiablePatchResponseSchema,
  MindNonNegotiablesResponseSchema,
  type MindNonNegotiable,
} from "@become/api-client";
import { Text } from "@/components/Text";
import GuidedFlow, { type GuidedStep } from "@/components/mind/system/GuidedFlow";
import ProtocolUnlockModal, {
  useProtocolUnlocks,
} from "@/components/mind/system/ProtocolUnlock";
import {
  AdaptiveSession,
  DailyDrop,
  SystemHero,
  ToolkitCard,
  TrackRecord,
  type TrackRecordEntry,
} from "@/components/mind/system/SystemDashboard";
import { runAiTask } from "@/lib/ai/runClient";
import { validateGuidedSteps } from "@/lib/ai/sanitize";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { celebrationHaptic, lightHaptic } from "@/lib/feedback/haptics";
import { reflectOnAnswers } from "@/lib/mind/reflect";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { tzOffsetMinutes } from "@/lib/time/localDay";

const DONE_TEXT = "That’s how it’s built.";

interface DisciplineProtocol {
  id: string;
  title: string;
  blurb: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  steps: GuidedStep[];
}

const PROTOCOLS: DisciplineProtocol[] = [
  {
    id: "do-it-anyway",
    title: "Do It Anyway",
    blurb: "Feelings are data, not instructions.",
    Icon: Flame,
    steps: [
      {
        title: "What’s the resistance?",
        body: "Name what’s really in the way right now.",
        choices: ["Tired", "Bored", "Scared", "Too busy", "Just don’t want to"],
      },
      {
        title: "What are you dodging?",
        inputPrompt: "What are you dodging?",
        body: "The exact thing you keep pushing off — the workout, the call, the task. Be specific.",
        placeholder: "e.g. The leg workout I keep skipping",
      },
      {
        title: "Go execute it.",
        body: "Every time you do what you said regardless of how you feel, you become someone who does what they say.",
      },
    ],
  },
  {
    id: "eat-the-frog",
    title: "Eat the Frog",
    blurb: "Hardest thing first. The day is won.",
    Icon: Soup,
    steps: [
      {
        title: "What’s your frog today?",
        inputPrompt: "What’s your frog today?",
        body: "Your “frog” is the hardest, ugliest, most-avoided task on your plate right now.",
        placeholder: "e.g. Finish the proposal I’ve been avoiding",
      },
      {
        title: "Eat it first.",
        body: "No phone, no food, no “quick” anything until that one’s started. The momentum carries the whole day.",
      },
    ],
  },
  {
    id: "find-your-40",
    title: "Find Your 40%",
    blurb: "When you think you’re done, you’re at 40%.",
    Icon: Gauge,
    steps: [
      {
        title: "Your tank has more.",
        body: "That “done” feeling is your comfort system talking, not your real limit. It’s lying to you.",
      },
      {
        title: "What’s your one-more?",
        inputPrompt: "What’s your one-more?",
        body: "One more rep, one more minute, one more step past where you wanted to quit. Name it.",
        placeholder: "e.g. 5 more minutes on the run",
      },
      {
        title: "Go get it.",
        body: "Just that next checkpoint. Once you’re there, you’ll find another.",
      },
    ],
  },
  {
    id: "cold-reality",
    title: "Cold Reality",
    blurb: "Where you are is the result of what you’ve done.",
    Icon: Eye,
    steps: [
      {
        title: "Sixty brutally honest seconds.",
        body: "No blame. No excuses. Just the facts about where you actually are right now.",
      },
      {
        title: "What got you here?",
        inputPrompt: "What got you here?",
        body: "The habits and choices — good and bad — that built your current situation. Own all of it.",
        placeholder: "e.g. Late nights, skipped mornings, no real plan",
      },
      {
        title: "Now decide.",
        body: "What changes if you keep those habits? What changes if you don’t? You already know.",
      },
    ],
  },
  {
    id: "excuse-callout",
    title: "Excuse Callout",
    blurb: "An excuse is a lie told too many times.",
    Icon: Megaphone,
    steps: [
      {
        title: "What’s your excuse?",
        inputPrompt: "What’s your excuse?",
        body: "Say the exact thing you’re about to tell yourself to get out of it.",
        placeholder: "e.g. I’m too tired to train today",
      },
      {
        title: "Is it true — or is it comfort?",
        body: "Discomfort is not danger. That excuse has a solution, and somewhere you already know what it is.",
      },
      {
        title: "Do it anyway.",
        body: "You’ll respect yourself more at the end of the day. Your future self is watching this exact decision.",
      },
    ],
  },
];

const SET_NONNEGOTIABLE: GuidedStep[] = [
  {
    title: "Draw a line you won’t cross.",
    body: "A non-negotiable is the floor you defend no matter what — not the goal, the standard beneath it.",
  },
  {
    title: "What’s your line?",
    inputPrompt: "What’s your line?",
    body: "One standard you refuse to drop below, in your own words.",
    placeholder: "e.g. I train even on bad days",
  },
  {
    title: "That’s your standard now.",
    body: "Standards you defend become identity. Defend this one today.",
  },
];

const FIGHT_LABELS: Record<number, string> = {
  1: "Coasting",
  2: "Light",
  3: "Solid",
  4: "Hard",
  5: "All in",
};

const FIGHT_CHECK: GuidedStep[] = [
  {
    title: "How hard are you willing to go today?",
    body: "No wrong answer — just be honest about today’s fight.",
    scale: { min: 1, max: 5, minLabel: "Coasting", maxLabel: "All in" },
  },
  {
    title: "Now back it up.",
    body: "A number is a promise to yourself. Make today match it.",
  },
];

interface TodayChallenge {
  challenge: string;
  completed: boolean;
}

export default function DisciplineDashboard() {
  const { colors } = useThemeTokens();
  const { token } = useAuth();
  const [entries, setEntries] = useState<TrackRecordEntry[]>([]);
  const [reps, setReps] = useState<number | null>(null);
  const { unlocked: justUnlocked, dismiss: dismissUnlock } =
    useProtocolUnlocks(PROTOCOLS, reps);
  const [today, setToday] = useState<TodayChallenge | null>(null);
  const [nonNegs, setNonNegs] = useState<MindNonNegotiable[]>([]);
  const [fightToday, setFightToday] = useState<number | null>(null);
  const [marking, setMarking] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [inlineText, setInlineText] = useState("");
  const [flow, setFlow] = useState<{
    title: string;
    kind: string;
    steps: GuidedStep[];
    aiGenerated?: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const tz = tzOffsetMinutes();
      const [jr, cr, nr] = await Promise.allSettled([
        apiFetch(
          "/api/mind/journal?system=discipline&limit=8",
          MindJournalResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
            tz,
          },
        ),
        apiFetch("/api/mind/discipline", MindDisciplineResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          tz,
        }),
        apiFetch(
          "/api/mind/non-negotiables",
          MindNonNegotiablesResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
            tz,
          },
        ),
      ]);

      if (jr.status === "fulfilled") {
        const raw = jr.value.entries ?? [];
        setEntries(
          raw.map((e) => ({
            id: String(e.id ?? e._id ?? ""),
            title: e.title,
            kind: e.kind,
            createdAt: e.createdAt ?? new Date().toISOString(),
          })),
        );
        const counts = jr.value.counts ?? {};
        const sum = Object.values(counts as Record<string, number>).reduce(
          (a, b) => a + b,
          0,
        );
        setReps(sum);

        const todayStr = new Date().toDateString();
        const fc = raw.find(
          (e) =>
            e.kind === "fight-check" &&
            new Date(e.createdAt ?? "").toDateString() === todayStr,
        );
        const v = fc?.lines?.[0]?.answer ? Number(fc.lines[0].answer) : NaN;
        setFightToday(Number.isFinite(v) ? v : null);
      }

      if (cr.status === "fulfilled") {
        const d = cr.value;
        if (d.challenge) {
          setToday({
            challenge: d.challenge.challenge,
            completed: !!d.challenge.completed,
          });
        }
      }

      if (nr.status === "fulfilled") {
        setNonNegs(nr.value.items ?? []);
      }
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync state from server fetch
    void load();
  }, [load]);

  const heldToday = nonNegs.filter((n) => n.checkedToday).length;
  const topStreak = nonNegs.reduce((m, n) => Math.max(m, n.currentStreak), 0);

  const saveJournal = async (
    kind: string,
    title: string,
    lines: { prompt: string; answer: string }[],
  ) => {
    try {
      await apiFetch("/api/mind/journal", MindJournalCreateResponseSchema, {
        method: "POST",
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        body: {
          system: "discipline",
          kind,
          title,
          lines,
        },
        tz: tzOffsetMinutes(),
      });
      void load();
    } catch {
      // ignore
    }
  };

  const createNonNeg = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      celebrationHaptic();
      await apiFetch(
        "/api/mind/non-negotiables",
        MindNonNegotiableCreateResponseSchema,
        {
          method: "POST",
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          body: { text: trimmed },
          tz: tzOffsetMinutes(),
        },
      );
      setInlineText("");
      void load();
    } catch {
      // ignore
    }
  };

  const checkNonNeg = async (n: MindNonNegotiable) => {
    if (n.checkedToday) return;
    celebrationHaptic();
    setNonNegs((prev) =>
      prev.map((x) =>
        x.id === n.id
          ? { ...x, checkedToday: true, currentStreak: x.currentStreak + 1 }
          : x,
      ),
    );
    try {
      await apiFetch(
        "/api/mind/non-negotiables",
        MindNonNegotiablePatchResponseSchema,
        {
          method: "PATCH",
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          body: { id: n.id, action: "check" },
          tz: tzOffsetMinutes(),
        },
      );
      void load();
    } catch {
      // ignore
    }
  };

  const removeNonNeg = async (id: string) => {
    lightHaptic();
    setNonNegs((prev) => prev.filter((x) => x.id !== id));
    try {
      await apiFetch(
        "/api/mind/non-negotiables",
        MindNonNegotiablePatchResponseSchema,
        {
          method: "PATCH",
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          body: { id, action: "deactivate" },
          tz: tzOffsetMinutes(),
        },
      );
      void load();
    } catch {
      // ignore
    }
  };

  const markChallengeDone = async () => {
    if (marking || !today || today.completed) return;
    setMarking(true);
    celebrationHaptic();
    setToday({ ...today, completed: true });
    try {
      await apiFetch("/api/mind/discipline", MindDisciplineResponseSchema, {
        method: "POST",
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        body: { action: "complete" },
        tz: tzOffsetMinutes(),
      });
      await saveJournal("did-the-hard-thing", today.challenge, []);
    } catch {
      // ignore
    }
    setMarking(false);
  };

  const runAiFlow = async (topic: string) => {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const r = await runAiTask("/api/ai/mind/flow", {
        system: "discipline",
        topic,
      });
      const steps = validateGuidedSteps(
        (r.result as { steps?: unknown } | undefined)?.steps,
      );
      if (r.ok && steps) {
        setFlow({ title: topic, kind: "protocol", steps, aiGenerated: true });
        return;
      }
    } catch {
      // fall through to static fallback
    } finally {
      setAiLoading(false);
    }

    setFlow({
      title: PROTOCOLS[0]!.title,
      kind: "protocol",
      steps: PROTOCOLS[0]!.steps,
    });
  };

  if (flow) {
    return (
      <GuidedFlow
        title={flow.title}
        steps={flow.steps}
        accentColor={colors.primary}
        accentClass="bg-red-500"
        doneText={DONE_TEXT}
        onReflect={
          flow.aiGenerated || flow.kind !== "protocol"
            ? undefined
            : (a) => reflectOnAnswers("Discipline drill", a)
        }
        onExit={() => {
          setFlow(null);
          setAiLoading(false);
        }}
        onComplete={(answers) => {
          const kind = flow.kind;
          const flowTitle = flow.title;
          setFlow(null);
          setAiLoading(false);

          if (kind === "nonnegotiable") {
            const line = answers[0]?.answer?.trim();
            if (line) void createNonNeg(line);
            return;
          }

          if (kind === "fight-check") {
            const v = Number(answers[0]?.answer);
            if (Number.isFinite(v)) setFightToday(v);
            void saveJournal(kind, flowTitle, answers);
            return;
          }

          void saveJournal(kind, flowTitle, answers);
        }}
      />
    );
  }

  return (
    <View testID="discipline-dashboard" className="gap-5">
      <ProtocolUnlockModal
        unlocked={justUnlocked}
        onDismiss={dismissUnlock}
        accentColor={colors.primary}
      />

      <SystemHero
        Icon={Sword}
        title="Discipline"
        tagline="Hold your own line — do the hard thing"
        statValue={topStreak > 0 ? `${topStreak}🔥` : "—"}
        statLabel="best streak"
        colorClass="text-red-500"
        bgClass="border-red-500/20 bg-red-500/10"
        iconColor={colors.primary}
        testID="mind-system-hero"
      />

      {/* Non-negotiables list */}
      <View testID="mind-nonnegs-section" className="gap-2.5">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Your non-negotiables
          </Text>
          {nonNegs.length > 0 ? (
            <Text
              testID="mind-nonnegs-held-count"
              className="text-[11px] font-semibold text-muted-foreground"
            >
              {heldToday}/{nonNegs.length} held today
            </Text>
          ) : null}
        </View>

        <View className="gap-2">
          {nonNegs.map((n) => (
            <View
              key={n.id}
              testID={`mind-nonneg-item-${n.id}`}
              className={`flex-row items-center gap-3 rounded-2xl border p-3.5 ${
                n.checkedToday
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : "border-border bg-card"
              }`}
            >
              <Pressable
                testID={`mind-nonneg-check-${n.id}`}
                accessibilityRole="button"
                accessibilityLabel={
                  n.checkedToday ? "Held today" : "Mark held today"
                }
                onPress={() => void checkNonNeg(n)}
                className={`h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                  n.checkedToday
                    ? "border-emerald-500 bg-emerald-500"
                    : "border-muted-foreground/40 bg-transparent"
                }`}
              >
                {n.checkedToday ? (
                  <Check
                    size={16}
                    color={colors["primary-foreground"]}
                    strokeWidth={3}
                  />
                ) : null}
              </Pressable>

              <Text
                testID={`mind-nonneg-text-${n.id}`}
                className={`min-w-0 flex-1 text-sm font-medium ${
                  n.checkedToday
                    ? "text-muted-foreground line-through"
                    : "text-foreground"
                }`}
              >
                {n.text}
              </Text>

              {n.currentStreak > 0 ? (
                <View
                  testID={`mind-nonneg-streak-${n.id}`}
                  className="flex-row items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5"
                >
                  <Flame size={12} color={colors.accent} />
                  <Text className="text-xs font-bold text-orange-500">
                    {n.currentStreak}
                  </Text>
                </View>
              ) : null}

              <Pressable
                testID={`mind-nonneg-remove-${n.id}`}
                accessibilityRole="button"
                accessibilityLabel="Remove"
                onPress={() => void removeNonNeg(n.id)}
                className="shrink-0 p-1"
              >
                <Trash2 size={16} color={colors["muted-foreground"]} />
              </Pressable>
            </View>
          ))}
        </View>

        {nonNegs.length === 0 ? (
          <View
            testID="mind-nonnegs-empty"
            className="rounded-2xl border border-dashed border-border p-4 items-center justify-center"
          >
            <Text className="text-center text-xs text-muted-foreground">
              No lines drawn yet. Set the standards you refuse to drop below — then check them off daily and build a streak.
            </Text>
          </View>
        ) : null}

        {nonNegs.length < 7 ? (
          <View className="gap-2">
            <View className="flex-row items-center gap-2 rounded-2xl border border-border bg-card px-3.5 py-2">
              <TextInput
                testID="mind-nonneg-input"
                value={inlineText}
                onChangeText={setInlineText}
                placeholder="e.g. I train even on bad days"
                placeholderTextColor={colors["muted-foreground"]}
                className="flex-1 text-sm text-foreground py-1"
                onSubmitEditing={() => void createNonNeg(inlineText)}
              />
              <Pressable
                testID="mind-nonneg-add"
                accessibilityRole="button"
                accessibilityLabel="Add non-negotiable"
                onPress={() => void createNonNeg(inlineText)}
                className="h-8 w-8 items-center justify-center rounded-xl bg-red-500/20"
              >
                <Plus size={16} color={colors.primary} />
              </Pressable>
            </View>

            <Pressable
              testID="mind-nonneg-draw-button"
              accessibilityRole="button"
              accessibilityLabel="Draw a new line"
              onPress={() =>
                setFlow({
                  title: "Set a non-negotiable",
                  kind: "nonnegotiable",
                  steps: SET_NONNEGOTIABLE,
                })
              }
              className="flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-red-500/40 py-3 active:bg-red-500/10"
            >
              <ShieldCheck size={16} color={colors.primary} />
              <Text className="text-sm font-semibold text-red-500">
                Draw a new line
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* Daily fight check */}
      {fightToday != null ? (
        <Pressable
          testID="mind-fight-check-logged"
          accessibilityRole="button"
          accessibilityLabel="Fight check logged"
          onPress={() =>
            setFlow({
              title: "Fight check",
              kind: "fight-check",
              steps: FIGHT_CHECK,
            })
          }
          className="w-full flex-row items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 active:opacity-90"
        >
          <View className="h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20">
            <Crosshair size={20} color={colors.success} />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">
              Daily fight check · logged
            </Text>
            <Text className="text-sm font-bold text-foreground">
              Today: {fightToday}/5 — {FIGHT_LABELS[fightToday] ?? ""}
            </Text>
            <Text className="text-xs text-muted-foreground">
              Tap to change your answer.
            </Text>
          </View>
          <Check size={18} color={colors.success} strokeWidth={3} />
        </Pressable>
      ) : (
        <DailyDrop
          Icon={Crosshair}
          eyebrow="Daily fight check"
          title="How hard will you go today?"
          blurb="One tap. Sets the bar for the day."
          ctaLabel="Check"
          colorClass="text-red-500"
          iconColor={colors.primary}
          testID="mind-fight-check-drop"
          onClick={() =>
            setFlow({
              title: "Fight check",
              kind: "fight-check",
              steps: FIGHT_CHECK,
            })
          }
        />
      )}

      {/* Today's hard thing */}
      <View
        testID="mind-hard-thing-card"
        className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 gap-2"
      >
        <Text className="text-xs font-semibold uppercase tracking-widest text-red-500">
          Today’s hard thing
        </Text>
        <Text
          testID="mind-hard-thing-title"
          className="text-base font-bold text-foreground"
        >
          {today?.challenge ?? "Loading your hard thing…"}
        </Text>
        {today?.completed ? (
          <View
            testID="mind-hard-thing-done"
            className="flex-row items-center gap-2 pt-1"
          >
            <Check size={18} color={colors.success} strokeWidth={3} />
            <Text className="text-sm font-semibold text-emerald-500">
              Done today. Respect.
            </Text>
          </View>
        ) : (
          <View className="gap-2 pt-1">
            <Pressable
              testID="mind-hard-thing-done-btn"
              accessibilityRole="button"
              accessibilityLabel="I did it"
              disabled={marking || !today}
              onPress={() => void markChallengeDone()}
              className="flex-row items-center justify-center gap-2 rounded-xl bg-red-500 py-3 active:opacity-90"
            >
              <Check
                size={16}
                color={colors["primary-foreground"]}
                strokeWidth={3}
              />
              <Text className="text-sm font-bold text-white">I did it</Text>
            </Pressable>

            <Pressable
              testID="mind-hard-thing-fallback-btn"
              accessibilityRole="button"
              accessibilityLabel="Not feeling it"
              onPress={() =>
                setFlow({
                  title: PROTOCOLS[0]!.title,
                  kind: "protocol",
                  steps: PROTOCOLS[0]!.steps,
                })
              }
              className="items-center py-1"
            >
              <Text className="text-xs font-medium text-red-500/90">
                Not feeling it? →
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Adaptive session */}
      <AdaptiveSession
        loading={aiLoading}
        onStart={() => void runAiFlow("do the hard thing I am avoiding today")}
        colorClass="text-red-500"
        bgClass="border-red-500/30 bg-red-500/10"
        title="Aimed at the hard thing you’ve actually been dodging."
        subtitle="Shaped by your standards and today’s challenge."
        testID="mind-adaptive-session"
      />

      {/* Protocols */}
      <View className="gap-2">
        <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Discipline protocols
        </Text>
        <View className="gap-2">
          {PROTOCOLS.map((p, i) => (
            <ToolkitCard
              key={p.id}
              Icon={p.Icon}
              title={p.title}
              blurb={p.blurb}
              colorClass="text-red-500"
              iconColor={colors.primary}
              locked={i >= 1 + (reps ?? 0)}
              lockedHint={`Locked — do ${i - (reps ?? 0)} more rep${i - (reps ?? 0) === 1 ? "" : "s"} in Discipline to unlock`}
              onClick={() =>
                setFlow({ title: p.title, kind: "protocol", steps: p.steps })
              }
              testID={`mind-toolkit-card-${p.id}`}
            />
          ))}
        </View>
      </View>

      {/* Track record */}
      <View className="gap-2">
        <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Track record
        </Text>
        <TrackRecord entries={entries} testID="mind-track-record" />
      </View>
    </View>
  );
}
