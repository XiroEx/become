import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import {
  CircleSlash,
  Eye,
  Hand,
  RefreshCcw,
  Search,
  Shield,
  Zap,
} from "lucide-react-native";
import {
  apiFetch,
  MindJournalCreateResponseSchema,
  MindJournalResponseSchema,
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
import { celebrationHaptic } from "@/lib/feedback/haptics";
import { mindAccentColor } from "@/lib/mind/accents";
import { reflectOnAnswers } from "@/lib/mind/reflect";
import { dailyPick } from "@/lib/mind/rotation";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { tzOffsetMinutes } from "@/lib/time/localDay";

const DONE_TEXT = "Caught. That’s the skill.";

interface AntiSabotageProtocol {
  id: string;
  title: string;
  blurb: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  steps: GuidedStep[];
}

const PROTOCOLS: AntiSabotageProtocol[] = [
  {
    id: "pattern-recognition",
    title: "Pattern Recognition",
    blurb: "Name the pattern — it can’t survive the light.",
    Icon: Search,
    steps: [
      {
        title: "Where does it usually hit?",
        body: "Pick the moment your old pattern strikes the most.",
        choices: [
          "Right at the start",
          "The messy middle",
          "Just before the win",
          "When no one’s watching",
        ],
      },
      {
        title: "What’s your pattern?",
        inputPrompt: "What’s your pattern?",
        body: "The exact feeling or trigger that makes you stop — in your words.",
        placeholder: "e.g. I quit the second it stops being exciting",
      },
      {
        title: "Now it’s named.",
        body: "A pattern you can name is one you can see coming. Next time it starts, you’ll catch it.",
      },
    ],
  },
  {
    id: "stop-lying",
    title: "Stop Lying to Yourself",
    blurb: "Self-deception is the most expensive habit.",
    Icon: Eye,
    steps: [
      {
        title: "Sixty honest seconds.",
        body: "Not about anyone else — about you. Your effort, your habits, your excuses.",
      },
      {
        title: "Where are you fooling yourself?",
        inputPrompt: "Where are you fooling yourself?",
        body: "The thing you know isn’t true but keep telling yourself anyway.",
        placeholder: "e.g. “I’ll start Monday”",
      },
      {
        title: "You can’t fix what you won’t admit.",
        body: "You just admitted it. That’s the hard part done.",
      },
    ],
  },
  {
    id: "action-override",
    title: "Action Override",
    blurb: "You can’t think your way to action.",
    Icon: Zap,
    steps: [
      {
        title: "Stop planning.",
        body: "You’ve thought about this enough. Readiness is a myth.",
      },
      {
        title: "What’s your smallest move?",
        inputPrompt: "What’s your smallest move?",
        body: "The tiniest physical action you can take toward it in the next 5 minutes.",
        placeholder: "e.g. Open the doc and write one line",
      },
      {
        title: "Go do it. Right now.",
        body: "Close this, do the thing, come back. Motion creates momentum — nothing else does.",
      },
    ],
  },
  {
    id: "break-the-loop",
    title: "Break the Loop",
    blurb: "Interrupt the signal, interrupt the loop.",
    Icon: RefreshCcw,
    steps: [
      {
        title: "Change something physical.",
        body: "Stand up. Different room. Ten push-ups. Glass of water. Pick one.",
      },
      {
        title: "Do it now.",
        body: "The loop you’re in is a signal pattern. You just scrambled it.",
      },
    ],
  },
];

const FEARS: { trigger: string; questions: string[] }[] = [
  {
    trigger: "I'm scared I'll fail",
    questions: [
      "What specifically do you think will go wrong?",
      "What is the actual worst case — and could you recover from it?",
      "What has you assume failure over success?",
      "What would you do if you knew you could not fail?",
    ],
  },
  {
    trigger: "I don't think I'm good enough",
    questions: [
      "Good enough compared to what standard?",
      "Was that standard set by you — or someone else?",
      "What evidence contradicts this belief?",
      "If a friend said this about themselves, what would you tell them?",
    ],
  },
  {
    trigger: "I'm afraid of what people will think",
    questions: [
      "Whose opinion, specifically, are you worried about?",
      "Do they control your outcomes — or just your feelings?",
      "If you succeed, will their opinion change?",
      "If they’re watching closely enough to judge, aren’t they impressed by the attempt?",
    ],
  },
  {
    trigger: "I don't have enough time",
    questions: [
      "How much time does this actually require per day?",
      "What are you spending time on that matters less?",
      "Is time the real constraint — or energy and clarity?",
      "What is the cost of NOT making time for this?",
    ],
  },
];

export default function AntiSabotageDashboard() {
  const { colors } = useThemeTokens();
  const { token } = useAuth();
  const [entries, setEntries] = useState<TrackRecordEntry[]>([]);
  const [reps, setReps] = useState<number | null>(null);
  const { unlocked: justUnlocked, dismiss: dismissUnlock } =
    useProtocolUnlocks(PROTOCOLS, reps);
  const [caught, setCaught] = useState(0);
  const [flow, setFlow] = useState<{
    title: string;
    kind: string;
    steps: GuidedStep[];
    aiGenerated?: boolean;
  } | null>(null);
  const [catching, setCatching] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const load = useCallback(async () => {
    try {
      const tz = tzOffsetMinutes();
      const res = await apiFetch(
        "/api/mind/journal?system=anti-sabotage&limit=8",
        MindJournalResponseSchema,
        {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          tz,
        },
      );
      const raw = res.entries ?? [];
      setEntries(
        raw.map((e) => ({
          id: String(e.id ?? e._id ?? ""),
          title: e.title,
          kind: e.kind,
          createdAt: e.createdAt ?? new Date().toISOString(),
        })),
      );
      const counts = (res.counts ?? {}) as Record<string, number>;
      setCaught(counts["pattern-catch"] ?? 0);
      const sum = Object.values(counts).reduce((a, b) => a + b, 0);
      setReps(sum);
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync state from server fetch
    void load();
  }, [load]);

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
          system: "anti-sabotage",
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

  const catchPattern = async () => {
    if (catching || cooldown > 0) return;
    setCatching(true);
    setCaught((c) => c + 1);
    setCooldown(45);
    celebrationHaptic();
    await saveJournal("pattern-catch", "Caught a pattern mid-act", []);
    setCatching(false);
  };

  const runAiFlow = async (
    topic: string,
    fallbackProtocol: AntiSabotageProtocol | undefined,
  ) => {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const r = await runAiTask("/api/ai/mind/flow", {
        system: "anti-sabotage",
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
      // fall through
    } finally {
      setAiLoading(false);
    }

    if (fallbackProtocol) {
      setFlow({
        title: fallbackProtocol.title,
        kind: "protocol",
        steps: fallbackProtocol.steps,
      });
    }
  };

  const featuredInterrupt = dailyPick(PROTOCOLS, 3) ?? PROTOCOLS[0];

  if (flow) {
    return (
      <GuidedFlow
        title={flow.title}
        steps={flow.steps}
        accentColor={mindAccentColor("anti-sabotage")}
        doneText={DONE_TEXT}
        onReflect={
          flow.aiGenerated || flow.kind !== "protocol"
            ? undefined
            : (a) => reflectOnAnswers("Anti-Sabotage session", a)
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
          void saveJournal(kind, flowTitle, answers);
        }}
      />
    );
  }

  return (
    <View testID="anti-sabotage-dashboard" className="gap-5">
      <ProtocolUnlockModal
        unlocked={justUnlocked}
        onDismiss={dismissUnlock}
        accentColor={colors.accent}
      />

      <SystemHero
        Icon={Shield}
        title="Anti-Sabotage"
        tagline="Catch the pattern before it kills progress"
        statValue={caught}
        statLabel="patterns caught"
        colorClass="text-orange-500"
        bgClass="border-orange-500/20 bg-orange-500/10"
        iconColor={colors.accent}
        testID="mind-system-hero"
      />

      {/* Adaptive session */}
      <AdaptiveSession
        loading={aiLoading}
        onStart={() =>
          void runAiFlow(
            featuredInterrupt?.title ?? "interrupt a self-sabotage pattern",
            featuredInterrupt,
          )
        }
        colorClass="text-orange-500"
        bgClass="border-orange-500/20 bg-orange-500/10"
        title="Aimed at catching the pattern before it kills progress."
        subtitle="Shaped by what usually stops you."
        testID="mind-adaptive-session"
      />

      {/* One-tap catch */}
      <View className="gap-2">
        <Pressable
          testID="mind-anti-sabotage-catch-button"
          accessibilityRole="button"
          accessibilityLabel={
            cooldown > 0
              ? `Caught — stay sharp (${cooldown}s)`
              : "I caught myself doing it"
          }
          disabled={catching || cooldown > 0}
          onPress={() => void catchPattern()}
          className={`flex-row items-center justify-center gap-2 rounded-2xl py-4 active:opacity-90 ${
            cooldown > 0 ? "bg-muted" : "bg-orange-500"
          }`}
        >
          <Hand
            size={20}
            color={cooldown > 0 ? colors.accent : colors["primary-foreground"]}
          />
          <Text
            className={`text-base font-bold ${
              cooldown > 0 ? "text-muted-foreground" : "text-white"
            }`}
          >
            {cooldown > 0
              ? `Caught — stay sharp (${cooldown}s)`
              : "I caught myself doing it"}
          </Text>
        </Pressable>
        <Text className="text-center text-[11px] text-muted-foreground">
          {cooldown > 0
            ? "Logged. Catch the next one when it actually happens."
            : "Old pattern showed up and you noticed? Tap it. Noticing IS the win."}
        </Text>
      </View>

      {/* Interrupt protocols */}
      <View className="gap-2">
        <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Interrupt protocols
        </Text>
        <View className="gap-2">
          {PROTOCOLS.map((p, i) => (
            <ToolkitCard
              key={p.id}
              Icon={p.Icon}
              title={p.title}
              blurb={p.blurb}
              colorClass="text-orange-500"
              iconColor={colors.accent}
              locked={i >= 1 + (reps ?? 0)}
              lockedHint={`Locked — do ${i - (reps ?? 0)} more rep${i - (reps ?? 0) === 1 ? "" : "s"} in Anti-Sabotage to unlock`}
              onClick={() =>
                setFlow({ title: p.title, kind: "protocol", steps: p.steps })
              }
              testID={`mind-toolkit-card-${p.id}`}
            />
          ))}
        </View>
      </View>

      {/* Fear breakdowns */}
      <View className="gap-2">
        <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Break down a fear
        </Text>
        <View className="gap-2">
          {FEARS.map((f) => {
            const slug = f.trigger.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            return (
              <ToolkitCard
                key={f.trigger}
                Icon={CircleSlash}
                title={f.trigger}
                blurb="4 questions. Your answers get saved."
                colorClass="text-orange-500"
                iconColor={colors.accent}
                testID={`mind-fear-card-${slug}`}
                onClick={() =>
                  setFlow({
                    title: f.trigger,
                    kind: "fear-breakdown",
                    steps: f.questions.map((q, i) => ({
                      title: q,
                      inputPrompt: q,
                      body:
                        i === 0
                          ? `Your fear: “${f.trigger}.” Answer each one honestly — this is just for you.`
                          : undefined,
                      placeholder: "Answer honestly — just for you…",
                    })),
                  })
                }
              />
            );
          })}
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
