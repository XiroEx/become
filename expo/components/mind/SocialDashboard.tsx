// Social system dashboard — the native port of
// `webapp/components/mind/SocialDashboard.tsx` (NP-152), on the NP-151
// framework. Social is the ENVIRONMENT + RELATIONSHIPS dimension of the Mind
// arsenal: the people around you shape who you become.
//
// Same count-based shape as Anti-Sabotage: a one-tap "I reached out" logs a
// connection (the daily-return hook + pride stat), protocols run as GuidedFlows
// with the adaptive close, and the headline is the memory-aware adaptive
// session. No new backend — everything lands in the same MindJournal the web
// reads.

import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import {
  HeartHandshake,
  MessageCircle,
  TrendingUp,
  UserPlus,
  Users,
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
import { reflectOnAnswers } from "@/lib/mind/reflect";
import { dailyPick } from "@/lib/mind/rotation";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { tzOffsetMinutes } from "@/lib/time/localDay";

const DONE_TEXT = "That’s how circles change.";

/** Rotating daily nudge for the "reach out" action. */
const REACH_PROMPTS = [
  "Text someone you appreciate — tell them exactly why.",
  "Check in on someone you haven’t spoken to in a while.",
  "Ask someone about their day and actually listen.",
  "Thank someone who helped you recently.",
  "Reach out to one person who lifts you up.",
  "Send a message that has nothing to do with what you need.",
];

// ── Social protocols as guided runs ───────────────────────────────────────────

const PROTOCOLS: {
  id: string;
  title: string;
  blurb: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  steps: GuidedStep[];
}[] = [
  {
    id: "circle-audit",
    title: "Circle Audit",
    blurb: "Your environment is your fate. Know it.",
    Icon: Users,
    steps: [
      {
        title: "Who pulls you UP?",
        inputPrompt: "Who pulls you UP?",
        body: "The people who leave you more driven, clearer, better. Name them.",
        placeholder: "e.g. My training partner, my brother",
      },
      {
        title: "Who pulls you DOWN?",
        inputPrompt: "Who pulls you DOWN?",
        body: "Honest — the ones who drain you or pull you off track. Just for you.",
        placeholder: "e.g. The group that only wants to party",
      },
      {
        title: "This week — which do you adjust?",
        body: "You become the average of who you’re around. Move the dial one notch.",
        choices: [
          "More time with the first",
          "Less time with the second",
          "Both",
        ],
      },
      {
        title: "That’s the lever.",
        body: "You can’t pick your whole world, but you choose where your hours go. Spend one more on the people who raise you.",
      },
    ],
  },
  {
    id: "genuine-interest",
    title: "Genuine Interest",
    blurb: "People feel when you actually care.",
    Icon: HeartHandshake,
    steps: [
      {
        title: "Connection isn’t about you.",
        body: "The fastest way to matter to someone is to be genuinely interested in them.",
      },
      {
        title: "Who could you really check on today?",
        inputPrompt: "Who could you really check on today?",
        body: "Not to get something — to ask about THEM and mean it.",
        placeholder: "e.g. My friend who’s been going through it",
      },
      {
        title: "Reach out. Ask, then listen.",
        body: "One real question about their world. Then let them talk. That’s the whole move.",
      },
    ],
  },
  {
    id: "hard-conversation",
    title: "Hard Conversation",
    blurb: "Avoiding it is the expensive option.",
    Icon: MessageCircle,
    steps: [
      {
        title: "What conversation are you avoiding?",
        inputPrompt: "What conversation are you avoiding?",
        body: "The one you keep pushing off. Name it plainly.",
        placeholder: "e.g. Telling a friend their comments hurt",
      },
      {
        title: "The honest thing you need to say.",
        inputPrompt: "The honest thing you need to say.",
        body: "In one or two sentences — kind, but true.",
        placeholder:
          "e.g. “When you joke about my goals it stings — I need you in my corner.”",
      },
      {
        title: "Say it — kindly and directly.",
        body: "Avoidance costs more than the awkward five minutes. The relationship gets lighter the moment it’s said.",
      },
    ],
  },
  {
    id: "raise-average",
    title: "Raise Your Average",
    blurb: "You’re the average of your five closest.",
    Icon: TrendingUp,
    steps: [
      {
        title: "Average is contagious.",
        body: "So is excellence. The people you’re around set the ceiling you think is normal.",
      },
      {
        title: "Who would raise your average?",
        inputPrompt: "Who would raise your average?",
        body: "Someone whose standards or energy pull you up — how do you get more time with them?",
        placeholder: "e.g. Ask the guy who’s consistent to train together",
      },
      {
        title: "Go make the ask.",
        body: "Proximity is a choice. Get closer to the people already living what you want.",
      },
    ],
  },
  {
    id: "set-standard",
    title: "Set the Standard",
    blurb: "Influence flows both ways — you shape them too.",
    Icon: UserPlus,
    steps: [
      {
        title: "You’re someone’s environment too.",
        body: "The way you show up raises or lowers the people around you. That’s power.",
      },
      {
        title: "How do you want to show up for them?",
        inputPrompt: "How do you want to show up for them?",
        body: "The kind of presence you want to be for the people you love.",
        placeholder: "e.g. Dependable, encouraging, the one who shows up",
      },
      {
        title: "Be that today.",
        body: "Lead by living it. The circle rises when someone in it decides to.",
      },
    ],
  },
];

/** Cooldown so the reach-out can't be tapped into a meaningless number. */
const REACH_COOLDOWN_S = 30;

export default function SocialDashboard() {
  const { colors } = useThemeTokens();
  const { token } = useAuth();

  const [entries, setEntries] = useState<TrackRecordEntry[]>([]);
  // Lifetime reps in this tool — 1 + reps protocols are open.
  const [reps, setReps] = useState<number | null>(null);
  const { unlocked: justUnlocked, dismiss: dismissUnlock } =
    useProtocolUnlocks(PROTOCOLS, reps);
  const [connections, setConnections] = useState(0);
  const [reachedToday, setReachedToday] = useState(false);
  const [reaching, setReaching] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [flow, setFlow] = useState<{
    title: string;
    steps: GuidedStep[];
    aiGenerated?: boolean;
  } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch(
        "/api/mind/journal?system=social&limit=8",
        MindJournalResponseSchema,
        {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        },
      );
      const raw = d.entries ?? [];
      setEntries(
        raw.map((e) => ({
          id: String(e.id ?? e._id ?? ""),
          title: e.title,
          kind: e.kind,
          createdAt: e.createdAt ?? new Date().toISOString(),
        })),
      );
      const counts = (d.counts ?? {}) as Record<string, number>;
      setConnections(counts["connect"] ?? 0);
      setReps(Object.values(counts).reduce((a, b) => a + b, 0));
      const todayStr = new Date().toDateString();
      setReachedToday(
        raw.some(
          (e) =>
            e.kind === "connect" &&
            new Date(e.createdAt ?? 0).toDateString() === todayStr,
        ),
      );
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync track record from the server fetch
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
        body: { system: "social", kind, title, lines },
        tz: tzOffsetMinutes(),
      });
      void load();
    } catch {
      // ignore
    }
  };

  // One-tap connection log — the pride stat + daily hook.
  const markReached = async () => {
    if (reaching || cooldown > 0) return;
    setReaching(true);
    setConnections((c) => c + 1); // optimistic
    setReachedToday(true);
    setCooldown(REACH_COOLDOWN_S);
    await save("connect", "Reached out to someone", []);
    setReaching(false);
  };

  const runAiFlow = async (topic: string, fallback: (typeof PROTOCOLS)[0]) => {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const r = await runAiTask("/api/ai/mind/flow", {
        system: "social",
        topic,
      });
      const steps = validateGuidedSteps(
        (r.result as { steps?: unknown } | undefined)?.steps,
      );
      if (r.ok && steps) {
        setFlow({ title: topic, steps, aiGenerated: true });
        return;
      }
    } catch {
      // fall through without surfacing an error
    } finally {
      setAiLoading(false);
    }
    setFlow({ title: fallback.title, steps: fallback.steps });
  };

  const reachPrompt = dailyPick(REACH_PROMPTS, 6) ?? REACH_PROMPTS[0]!;
  const featured = dailyPick(PROTOCOLS, 6);

  if (flow) {
    return (
      <GuidedFlow
        title={flow.title}
        steps={flow.steps}
        accentColor={colors.accent}
        accentClass="bg-pink-500"
        doneText={DONE_TEXT}
        onReflect={
          flow.aiGenerated
            ? undefined
            : (a) => reflectOnAnswers("Social session", a)
        }
        onExit={() => {
          setFlow(null);
          setAiLoading(false);
        }}
        onComplete={(answers) => {
          const title = flow.title;
          setFlow(null);
          setAiLoading(false);
          void save("protocol", title, answers);
        }}
      />
    );
  }

  return (
    <View testID="social-dashboard" className="gap-5">
      <ProtocolUnlockModal
        unlocked={justUnlocked}
        onDismiss={dismissUnlock}
        accentColor={colors.accent}
      />

      <SystemHero
        Icon={Users}
        title="Social"
        tagline="Your environment is your fate — build the circle on purpose"
        statValue={connections}
        statLabel="connections"
        colorClass="text-pink-500"
        bgClass="border-pink-500/30 bg-pink-500/10"
        iconColor={colors.accent}
      />

      {/* Reach out today — the daily-return hook */}
      <View
        testID="social-reach-out"
        className="rounded-2xl border border-pink-500/30 bg-pink-500/10 p-4"
      >
        <Text className="text-xs font-semibold uppercase tracking-widest text-pink-500">
          Reach out today
        </Text>
        <Text
          testID="social-reach-prompt"
          className="mt-2 text-base font-bold leading-snug text-foreground"
        >
          {reachPrompt}
        </Text>
        {reachedToday ? (
          <View
            testID="social-reached-today"
            className="mt-3 flex-row items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-3 py-2.5"
          >
            <HeartHandshake size={18} color={colors.success} />
            <Text className="text-sm font-semibold text-foreground">
              You reached out today.
            </Text>
            <Text className="ml-auto text-xs font-semibold text-muted-foreground">
              {connections} total
            </Text>
          </View>
        ) : (
          <Pressable
            testID="social-reach-button"
            accessibilityRole="button"
            accessibilityLabel="I reached out"
            onPress={() => void markReached()}
            disabled={reaching || cooldown > 0}
            className={`mt-3 w-full flex-row items-center justify-center gap-2 rounded-xl py-3 active:opacity-90 ${
              cooldown > 0 ? "bg-muted" : "bg-pink-500"
            }`}
          >
            <HeartHandshake
              size={16}
              color={
                cooldown > 0
                  ? colors["muted-foreground"]
                  : colors["primary-foreground"]
              }
            />
            <Text
              className={`text-sm font-bold ${
                cooldown > 0 ? "text-muted-foreground" : "text-white"
              }`}
            >
              {cooldown > 0
                ? `Logged — stay connected (${cooldown}s)`
                : "I reached out"}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Today's session — adaptive + memory-aware */}
      <AdaptiveSession
        loading={aiLoading}
        onStart={() =>
          void runAiFlow(
            "strengthen the relationships and environment around me",
            featured ?? PROTOCOLS[0]!,
          )
        }
        colorClass="text-pink-500"
        bgClass="border-pink-500/30 bg-pink-500/10"
        subtitle="Built from your circle and where you want to go."
      />

      {/* Social protocols — guided runs */}
      <View>
        <Text className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Social protocols
        </Text>
        <View className="gap-2">
          {PROTOCOLS.map((p, i) => (
            <ToolkitCard
              key={p.id}
              Icon={p.Icon}
              title={p.title}
              blurb={p.blurb}
              colorClass="text-pink-500"
              iconColor={colors.accent}
              locked={i >= 1 + (reps ?? 0)}
              lockedHint={`Locked — do ${i - (reps ?? 0)} more rep${
                i - (reps ?? 0) === 1 ? "" : "s"
              } in Social to unlock`}
              onClick={() => setFlow({ title: p.title, steps: p.steps })}
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
