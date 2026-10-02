import { useCallback, useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import {
  Check,
  Eye,
  Fingerprint,
  Flame,
  Pencil,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Skull,
  Sparkles,
  TrendingUp,
} from "lucide-react-native";
import {
  apiFetch,
  MindIdentityResponseSchema,
  MindJournalCreateResponseSchema,
  MindJournalResponseSchema,
  MindWinCreateResponseSchema,
  MindWinsResponseSchema,
} from "@become/api-client";
import { Text } from "@/components/Text";
import GuidedFlow, { type GuidedStep } from "@/components/mind/system/GuidedFlow";
import ProtocolUnlockModal, {
  useProtocolUnlocks,
} from "@/components/mind/system/ProtocolUnlock";
import {
  AdaptiveSession,
  SystemHero,
  ToolkitCard,
  TrackRecord,
  type TrackRecordEntry,
} from "@/components/mind/system/SystemDashboard";
import { runAiTask } from "@/lib/ai/runClient";
import { validateGuidedSteps } from "@/lib/ai/sanitize";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { reflectOnAnswers } from "@/lib/mind/reflect";
import { dailyPick } from "@/lib/mind/rotation";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { tzOffsetMinutes } from "@/lib/time/localDay";

const DONE_TEXT = "That’s who you are now.";

// ── Identity protocols ────────────────────────────────────────────────────────

const PROTOCOLS: {
  id: string;
  title: string;
  blurb: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  steps: GuidedStep[];
}[] = [
  {
    id: "kill-the-old",
    title: "Kill the Old Version",
    blurb: "The old you would stop here. You don’t.",
    Icon: Skull,
    steps: [
      {
        title: "Where does the old you show up most?",
        body: "The version that quits, makes excuses, settles. Pick where it strikes.",
        choices: [
          "First sign of discomfort",
          "When it stops being fun",
          "When no one’s watching",
          "When you’re tired",
        ],
      },
      {
        title: "What does the old you do there?",
        inputPrompt: "What does the old you do there?",
        body: "Name the exact move — the skip, the scroll, the excuse. See it clearly.",
        placeholder: "e.g. Tells myself I’ll start tomorrow",
      },
      {
        title: "Now do the opposite.",
        body: "You just watched the old you. The new you acts now — one choice, the other direction. Go make it.",
      },
    ],
  },
  {
    id: "future-self",
    title: "Future Self",
    blurb: "See it clearly. Then become it.",
    Icon: Eye,
    steps: [
      {
        title: "Twelve months out.",
        body: "Close your eyes for a moment. Not what you have — how you move, speak, and carry yourself.",
      },
      {
        title: "Who are you then?",
        inputPrompt: "Who are you then?",
        body: "Describe that person in the present tense, like they’re already here.",
        placeholder: "e.g. I train without negotiating. I keep my word to myself.",
      },
      {
        title: "You just rehearsed being them.",
        body: "Your nervous system can’t tell rehearsal from real. Carry one thing about them into the next hour.",
      },
    ],
  },
  {
    id: "identity-install",
    title: "Identity Installation",
    blurb: "I do what I say I will do.",
    Icon: Fingerprint,
    steps: [
      {
        title: "How true does it feel right now?",
        body: "“I do what I say I will do.” Rate it honestly — no wrong answer.",
        scale: { min: 1, max: 5, minLabel: "Not yet", maxLabel: "Dead certain" },
      },
      {
        title: "Say it as a fact.",
        body: "Not a wish — a fact. Repeat it slowly, ten times, before you move. Every rep installs it deeper.",
      },
    ],
  },
  {
    id: "act-as-if",
    title: "Act As If",
    blurb: "Act like who you’re becoming until you are them.",
    Icon: Sparkles,
    steps: [
      {
        title: "One decision your future self would make.",
        inputPrompt: "One decision your future self would make.",
        body: "In the next hour — how they’d eat, respond, or spend the time. Name one.",
        placeholder:
          "e.g. Prep tomorrow’s session tonight instead of doomscrolling",
      },
      {
        title: "Go make that one.",
        body: "That’s how you become them — one aligned choice, then another. Not someday. Now.",
      },
    ],
  },
  {
    id: "self-respect",
    title: "Self-Respect Check",
    blurb: "Would your future self respect this?",
    Icon: ShieldCheck,
    steps: [
      {
        title: "What’s the next choice you’re about to make?",
        inputPrompt: "What’s the next choice you’re about to make?",
        body: "What you eat, how you spend the next hour, whether you skip the thing you planned.",
        placeholder: "e.g. Skip the workout because I’m low energy",
      },
      {
        title: "Would your future self respect it?",
        body: "Be honest. This is the whole game.",
        choices: [
          "Yes — they’d be proud",
          "No — that’s comfort talking",
          "Not sure yet",
        ],
      },
      {
        title: "You already know.",
        body: "Make the choice you’ll respect tonight. That respect is the identity, compounding.",
      },
    ],
  },
  {
    id: "rewrite-story",
    title: "Rewrite the Story",
    blurb: "The story you believe becomes true.",
    Icon: RefreshCcw,
    steps: [
      {
        title: "What limiting belief runs in the background?",
        inputPrompt: "What limiting belief runs in the background?",
        body: "The quiet one that stops you before you start.",
        placeholder: "e.g. I always quit when it gets hard",
      },
      {
        title: "Where have you already proved it wrong?",
        inputPrompt: "Where have you already proved it wrong?",
        body: "One real example. Even small. Evidence beats affirmation.",
        placeholder: "e.g. I finished that 6-week block when I wanted to quit",
      },
      {
        title: "Write the new story.",
        inputPrompt: "Write the new story.",
        body: "Present tense. Confident. Built on the evidence you just named.",
        placeholder:
          "e.g. I’m someone who finishes what I start, even when it’s hard",
      },
      {
        title: "That’s what you operate from now.",
        body: "Read it back when the old story shows up. It will. You’ll be ready.",
      },
    ],
  },
];

const START_CHOICES = [
  "Starting from zero",
  "Feeling stuck",
  "Building momentum",
  "Leveling up",
];

const START_MAP: Record<string, string> = {
  "Starting from zero": "lost",
  "Feeling stuck": "stuck",
  "Building momentum": "building",
  "Leveling up": "leveling_up",
};

const CURRENT_SELF_MAP: Record<string, string> = {
  lost: "I’m starting from scratch and figuring it out.",
  stuck: "I know what to do but keep getting in my own way.",
  building: "I’ve got momentum and I’m building on it.",
  leveling_up: "I’m already moving and I want the next level.",
};

const OBSTACLE_CHOICES = [
  "I don’t know what I want",
  "I can’t stay consistent",
  "I lose motivation",
  "My environment drags me down",
];

const OBSTACLE_MAP: Record<string, string> = {
  "I don’t know what I want": "clarity",
  "I can’t stay consistent": "discipline",
  "I lose motivation": "motivation",
  "My environment drags me down": "environment",
};

const DEFINE_IDENTITY: GuidedStep[] = [
  {
    title: "Where are you starting from?",
    body: "No wrong answer — just be honest about today.",
    choices: START_CHOICES,
  },
  {
    title: "Who are you becoming?",
    inputPrompt: "Who are you becoming?",
    body: "The person on the other side of this work. Present tense — like they’re already here.",
    placeholder:
      "e.g. Someone who trains without negotiating and keeps their word",
  },
  {
    title: "What gets in the way most?",
    body: "The thing that pulls you off track more than anything else.",
    choices: OBSTACLE_CHOICES,
  },
  {
    title: "That’s the line you’re crossing.",
    body: "From who you were to who you’re becoming. We’ll build the evidence together.",
  },
];

interface IdentityProfileData {
  currentSelf: string;
  futureSelf: string;
  evolutionScore: number;
}

interface AffirmData {
  streak: number;
  longest: number;
  affirmedToday: boolean;
}

interface Win {
  win: string;
  date?: string;
}

export default function SelfImageDashboard() {
  const { colors } = useThemeTokens();
  const { token } = useAuth();
  const [profile, setProfile] = useState<IdentityProfileData | null>(null);
  const [affirm, setAffirm] = useState<AffirmData>({
    streak: 0,
    longest: 0,
    affirmedToday: false,
  });
  const [wins, setWins] = useState<Win[]>([]);
  const [entries, setEntries] = useState<TrackRecordEntry[]>([]);
  const [reps, setReps] = useState<number | null>(null);
  const { unlocked: justUnlocked, dismiss: dismissUnlock } =
    useProtocolUnlocks(PROTOCOLS, reps);

  const [winInput, setWinInput] = useState("");
  const [savingWin, setSavingWin] = useState(false);
  const [affirming, setAffirming] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [flow, setFlow] = useState<{
    title: string;
    kind: string;
    steps: GuidedStep[];
    aiGenerated?: boolean;
  } | null>(null);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<{
    futureSelf: string;
    currentSelf: string;
  }>({ futureSelf: "", currentSelf: "" });

  const openEditor = () => {
    if (profile) {
      setEditForm({
        futureSelf: profile.futureSelf,
        currentSelf: profile.currentSelf,
      });
    }
    setEditing(true);
  };

  const submitEdit = async () => {
    const futureSelf = editForm.futureSelf.trim();
    const currentSelf = editForm.currentSelf.trim();
    if (!futureSelf || !currentSelf) return;

    try {
      await apiFetch("/api/mind/identity", MindIdentityResponseSchema, {
        method: "PATCH",
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        body: { action: "edit", currentSelf, futureSelf },
        tz: tzOffsetMinutes(),
      });
      setEditing(false);
      void load();
    } catch {
      // ignore
    }
  };

  const load = useCallback(async () => {
    try {
      const tz = tzOffsetMinutes();
      const [ir, wr, jr] = await Promise.allSettled([
        apiFetch("/api/mind/identity", MindIdentityResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          tz,
        }),
        apiFetch("/api/mind/wins?limit=7", MindWinsResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        }),
        apiFetch(
          "/api/mind/journal?system=self-image&limit=8",
          MindJournalResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        ),
      ]);

      if (ir.status === "fulfilled") {
        const d = ir.value;
        if (d.profile?.onboardingCompleted) {
          setProfile({
            currentSelf: d.profile.currentSelf,
            futureSelf: d.profile.futureSelf,
            evolutionScore:
              d.evolution?.score ?? d.profile.evolutionScore ?? 0,
          });
        } else {
          setProfile(null);
        }
        if (d.affirm) setAffirm(d.affirm);
      }

      if (wr.status === "fulfilled") {
        setWins(wr.value.wins ?? []);
      }

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
      }
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (
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
          system: "self-image",
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

  const affirmToday = async () => {
    if (affirming || affirm.affirmedToday) return;
    setAffirming(true);
    setAffirm((a) => ({ ...a, affirmedToday: true, streak: a.streak + 1 }));

    try {
      const tz = tzOffsetMinutes();
      const r = await apiFetch("/api/mind/identity", MindIdentityResponseSchema, {
        method: "PATCH",
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        body: { action: "affirm", tz },
        tz,
      });
      if (r.affirm) setAffirm(r.affirm);
    } catch {
      // ignore
    } finally {
      setAffirming(false);
    }
  };

  const saveIdentity = async (
    answers: { prompt: string; answer: string }[],
  ) => {
    const startLabel = answers[0]?.answer ?? "";
    const futureSelf = (answers[1]?.answer ?? "").trim();
    const obstacleLabel = answers[2]?.answer ?? "";
    const startingPoint = START_MAP[startLabel];
    const primaryObstacle = OBSTACLE_MAP[obstacleLabel];
    if (!startingPoint || !primaryObstacle || !futureSelf) return;

    try {
      await apiFetch("/api/mind/identity", MindIdentityResponseSchema, {
        method: "PUT",
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        body: {
          currentSelf: CURRENT_SELF_MAP[startingPoint],
          futureSelf,
          primaryObstacle,
          startingPoint,
        },
        tz: tzOffsetMinutes(),
      });
      void load();
    } catch {
      // ignore
    }
  };

  const logWin = async () => {
    const win = winInput.trim();
    if (win.length < 3 || savingWin) return;
    setSavingWin(true);
    setWins((prev) => [{ win }, ...prev].slice(0, 7));
    setWinInput("");

    try {
      await apiFetch("/api/mind/wins", MindWinCreateResponseSchema, {
        method: "POST",
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        body: { win, tz: tzOffsetMinutes() },
        tz: tzOffsetMinutes(),
      });
      void load();
    } catch {
      // ignore
    } finally {
      setSavingWin(false);
    }
  };

  const runAiFlow = async (topic: string, fallback: (typeof PROTOCOLS)[0]) => {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const r = await runAiTask("/api/ai/mind/flow", {
        system: "self-image",
        topic,
      });
      const steps = validateGuidedSteps(
        (r.result as { steps?: unknown } | undefined)?.steps,
      );
      if (r.ok && steps) {
        setFlow({
          title: topic,
          kind: "protocol",
          steps,
          aiGenerated: true,
        });
        return;
      }
    } catch {
      // fall through without error
    } finally {
      setAiLoading(false);
    }
    setFlow({
      title: fallback.title,
      kind: "protocol",
      steps: fallback.steps,
    });
  };

  const featured = dailyPick(PROTOCOLS, 2);

  if (flow) {
    return (
      <GuidedFlow
        title={flow.title}
        steps={flow.steps}
        accentColor={colors.accent}
        accentClass="bg-violet-500"
        doneText={
          flow.kind === "define" ? "The line is drawn." : DONE_TEXT
        }
        onReflect={
          flow.aiGenerated || flow.kind === "define"
            ? undefined
            : (a) => reflectOnAnswers("Self-Image rep", a)
        }
        onExit={() => {
          setFlow(null);
          setAiLoading(false);
        }}
        onComplete={(answers) => {
          const kind = flow.kind;
          setFlow(null);
          setAiLoading(false);
          if (kind === "define") {
            void saveIdentity(answers);
            return;
          }
          void save(kind, flow.title, answers);
        }}
      />
    );
  }

  const evo = profile?.evolutionScore ?? 0;

  return (
    <View testID="self-image-dashboard" className="gap-5">
      <ProtocolUnlockModal
        unlocked={justUnlocked}
        onDismiss={dismissUnlock}
        accentColor={colors.accent}
      />

      <SystemHero
        Icon={Fingerprint}
        title="Self-Image"
        tagline="Kill the old self — become the new one"
        statValue={profile ? evo : "—"}
        statLabel="evolution"
        colorClass="text-violet-500"
        bgClass="border-violet-500/30 bg-violet-500/10"
        iconColor={colors.accent}
      />

      {/* Who you're becoming */}
      {profile && editing ? (
        <View
          testID="self-image-edit-form"
          className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4 gap-3"
        >
          <Text className="text-xs font-semibold uppercase tracking-widest text-violet-500">
            Edit who you’re becoming
          </Text>
          <View>
            <Text className="mb-1 text-[11px] font-semibold text-muted-foreground">
              Who you’re becoming
            </Text>
            <TextInput
              testID="self-image-edit-future"
              value={editForm.futureSelf}
              onChangeText={(t) =>
                setEditForm((f) => ({ ...f, futureSelf: t }))
              }
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </View>
          <View>
            <Text className="mb-1 text-[11px] font-semibold text-muted-foreground">
              The old self you’re leaving
            </Text>
            <TextInput
              testID="self-image-edit-current"
              value={editForm.currentSelf}
              onChangeText={(t) =>
                setEditForm((f) => ({ ...f, currentSelf: t }))
              }
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </View>
          <View className="flex-row gap-2 mt-2">
            <Pressable
              testID="self-image-edit-save"
              accessibilityRole="button"
              accessibilityLabel="Save identity"
              onPress={submitEdit}
              className="flex-1 rounded-xl bg-violet-500 py-2.5 items-center justify-center"
            >
              <Text className="text-sm font-bold text-white">Save</Text>
            </Pressable>
            <Pressable
              testID="self-image-edit-cancel"
              accessibilityRole="button"
              accessibilityLabel="Cancel editing identity"
              onPress={() => setEditing(false)}
              className="rounded-xl border border-border px-4 py-2.5 items-center justify-center"
            >
              <Text className="text-sm font-semibold text-muted-foreground">
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      ) : profile ? (
        <View
          testID="self-image-profile"
          className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4"
        >
          <View className="flex-row items-start justify-between">
            <Text className="text-xs font-semibold uppercase tracking-widest text-violet-500">
              Who you’re becoming
            </Text>
            <Pressable
              testID="self-image-edit-button"
              accessibilityRole="button"
              accessibilityLabel="Edit identity"
              onPress={openEditor}
              className="h-8 w-8 items-center justify-center rounded-full"
            >
              <Pencil size={16} color={colors.accent} />
            </Pressable>
          </View>
          <Text
            testID="self-image-future-self"
            className="mt-1 text-base font-bold text-foreground"
          >
            {profile.futureSelf}
          </Text>
          <Text
            testID="self-image-current-self"
            className="mt-1 text-xs text-muted-foreground line-through"
          >
            was: {profile.currentSelf}
          </Text>

          {/* Evolution bar */}
          <View className="mt-3">
            <View className="mb-1 flex-row items-center justify-between">
              <View className="flex-row items-center gap-1">
                <TrendingUp size={14} color={colors.accent} />
                <Text className="text-[11px] font-medium text-muted-foreground">
                  Evolution
                </Text>
              </View>
              <Text className="text-[11px] font-semibold text-muted-foreground tabular-nums">
                {evo}/100
              </Text>
            </View>
            <View className="h-2 w-full overflow-hidden rounded-full bg-violet-500/20">
              <View
                className="h-full rounded-full bg-violet-500"
                style={{ width: `${Math.min(evo, 100)}%` }}
              />
            </View>
            <Text className="mt-1 text-[11px] text-muted-foreground">
              Built by your real reps — challenges, check-ins, mission.
            </Text>
          </View>

          {/* Daily affirmation */}
          {affirm.affirmedToday ? (
            <View
              testID="self-image-affirmed-today"
              className="mt-3 flex-row items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2.5"
            >
              <Check size={18} color={colors.success} strokeWidth={3} />
              <Text className="text-sm font-semibold text-foreground">
                Affirmed today.
              </Text>
              {affirm.streak > 0 ? (
                <View className="ml-auto flex-row items-center gap-0.5 rounded-full bg-accent/15 px-2 py-0.5">
                  <Flame size={14} color={colors.accent} />
                  <Text className="text-xs font-bold text-accent">
                    {affirm.streak}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Pressable
              testID="self-image-affirm-button"
              accessibilityRole="button"
              onPress={affirmToday}
              disabled={affirming}
              className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-violet-500 py-3 active:opacity-90 disabled:opacity-60"
            >
              <Fingerprint size={16} color={colors["primary-foreground"]} />
              <Text className="text-sm font-bold text-white">
                This is me — affirm it
              </Text>
              {affirm.streak > 0 ? (
                <View className="flex-row items-center gap-0.5">
                  <Flame size={14} color={colors["primary-foreground"]} />
                  <Text className="text-sm font-bold text-white">
                    {affirm.streak}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          )}
        </View>
      ) : (
        <Pressable
          testID="self-image-define-button"
          accessibilityRole="button"
          onPress={() =>
            setFlow({
              title: "Who you’re becoming",
              kind: "define",
              steps: DEFINE_IDENTITY,
            })
          }
          className="rounded-2xl border border-dashed border-violet-500/40 p-5 items-center justify-center bg-card active:opacity-80"
        >
          <Fingerprint size={28} color={colors.accent} />
          <Text className="mt-2 text-sm font-bold text-foreground">
            Define who you’re becoming
          </Text>
          <Text className="mt-1 text-xs text-muted-foreground text-center">
            Name your old self and your future self. Everything here builds on
            it.
          </Text>
        </Pressable>
      )}

      {/* Today's adaptive session */}
      <AdaptiveSession
        loading={aiLoading}
        onStart={() =>
          runAiFlow(
            "become the person I said I would be",
            featured ?? PROTOCOLS[0]!,
          )
        }
        colorClass="text-violet-500"
        bgClass="border-violet-500/30 bg-violet-500/10"
        subtitle="Shaped by who you’re becoming and your recent reflections."
      />

      {/* Evidence wall */}
      <View testID="self-image-evidence-wall">
        <Text className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Evidence wall
        </Text>
        <View className="flex-row gap-2">
          <TextInput
            testID="self-image-win-input"
            value={winInput}
            onChangeText={setWinInput}
            placeholder="One real win from today — “I did…”"
            placeholderTextColor={colors["muted-foreground"]}
            className="flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground"
          />
          <Pressable
            testID="self-image-win-add"
            accessibilityRole="button"
            accessibilityLabel="Log evidence"
            onPress={logWin}
            disabled={savingWin || winInput.trim().length < 3}
            className="h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500 active:opacity-90 disabled:opacity-40"
          >
            <Plus size={18} color={colors["primary-foreground"]} strokeWidth={3} />
          </Pressable>
        </View>

        {wins.length > 0 ? (
          <View className="mt-2 gap-2">
            {wins.map((w, i) => (
              <View
                key={i}
                testID={`self-image-win-${i}`}
                className="flex-row items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2"
              >
                <Check size={14} color={colors.success} strokeWidth={3} />
                <Text className="text-sm text-foreground flex-1">
                  {w.win}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {/* Identity protocols */}
      <View>
        <Text className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Identity protocols
        </Text>
        <View className="gap-2">
          {PROTOCOLS.map((p, i) => (
            <ToolkitCard
              key={p.id}
              Icon={p.Icon}
              title={p.title}
              blurb={p.blurb}
              colorClass="text-violet-500"
              iconColor={colors.accent}
              locked={i >= 1 + (reps ?? 0)}
              lockedHint={`Locked — do ${i - (reps ?? 0)} more rep${
                i - (reps ?? 0) === 1 ? "" : "s"
              } in Self-Image to unlock`}
              onClick={() =>
                setFlow({
                  title: p.title,
                  kind: "protocol",
                  steps: p.steps,
                })
              }
            />
          ))}
        </View>
      </View>

      {/* Track record */}
      <View>
        <Text className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Track record
        </Text>
        <TrackRecord entries={entries} />
      </View>
    </View>
  );
}
