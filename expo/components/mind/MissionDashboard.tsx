import { useCallback, useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import {
  ArrowRight,
  Check,
  Compass,
  Flame,
  Navigation,
  Pencil,
  Search,
  UserRound,
  Zap,
} from "lucide-react-native";
import {
  apiFetch,
  MindJournalCreateResponseSchema,
  MindJournalResponseSchema,
  MindMissionResponseSchema,
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

const DONE_TEXT = "That’s the direction.";

// ── Mission protocols ─────────────────────────────────────────────────────────

const PROTOCOLS: {
  id: string;
  title: string;
  blurb: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  steps: GuidedStep[];
}[] = [
  {
    id: "find-your-why",
    title: "Find Your Why",
    blurb: "Dig past the surface reason to the real one.",
    Icon: Search,
    steps: [
      {
        title: "Why are you really doing this?",
        inputPrompt: "Why are you really doing this?",
        body: "The first answer that comes up — the surface reason.",
        placeholder: "e.g. To get in shape",
      },
      {
        title: "And why does that matter?",
        inputPrompt: "And why does that matter?",
        body: "Go one layer under the last answer. Keep pulling the thread.",
        placeholder: "e.g. So I feel in control of my life again",
      },
      {
        title: "Now the real one — what’s underneath?",
        inputPrompt: "Now the real one — what’s underneath?",
        body: "The reason that actually moves you. Say it plainly.",
        placeholder:
          "e.g. I want to become someone my future family can rely on",
      },
      {
        title: "That’s your fuel.",
        body: "That’s the reason worth moving for. Come back to it when the surface reason isn’t enough.",
      },
    ],
  },
  {
    id: "one-move",
    title: "One Move Forward",
    blurb: "Movement makes energy. Energy makes life.",
    Icon: Zap,
    steps: [
      {
        title: "Without movement there’s no energy.",
        body: "Stillness drains. One real move starts the current again. Let’s find it.",
      },
      {
        title: "Where have you gone still?",
        inputPrompt: "Where have you gone still?",
        body: "The part of your life that’s stalled or stuck right now.",
        placeholder: "e.g. I keep planning but never start",
      },
      {
        title: "The one move that creates motion.",
        inputPrompt: "The one move that creates motion.",
        body: "Small is fine — it just has to be motion, today.",
        placeholder: "e.g. Send the one message I’ve been avoiding",
      },
      {
        title: "Go make it.",
        body: "Motion makes energy; energy makes life. Take that one step now and the next one appears.",
      },
    ],
  },
  {
    id: "who-you-want",
    title: "Who You Want to Be",
    blurb: "You can become anyone. Choose on purpose.",
    Icon: UserRound,
    steps: [
      {
        title: "Who do you want to become?",
        inputPrompt: "Who do you want to become?",
        body: "Not what you want to have — who you want to be. In your own words.",
        placeholder: "e.g. Someone disciplined, present, and dependable",
      },
      {
        title: "Is today’s version acting like them?",
        body: "Honestly. No judgment — just data.",
        choices: ["Yes, mostly", "Not really", "Halfway there"],
      },
      {
        title: "Every choice is a vote.",
        body: "You become who you repeatedly act like. Cast one vote for that person in the next hour.",
      },
    ],
  },
  {
    id: "north-star",
    title: "North Star Check",
    blurb: "Did today actually point where you’re going?",
    Icon: Navigation,
    steps: [
      {
        title: "What did today actually go toward?",
        inputPrompt: "What did today actually go toward?",
        body: "Where your hours really went — not where you meant them to go.",
        placeholder: "e.g. Mostly reacting to messages and scrolling",
      },
      {
        title: "Did it move you toward your mission?",
        body: "The honest read on alignment.",
        choices: ["Yes", "Some of it", "Not really"],
      },
      {
        title: "Aim one hour tomorrow.",
        body: "You don’t need a perfect day — one hour pointed straight at the mission bends the whole week.",
      },
    ],
  },
  {
    id: "reconnect",
    title: "Reconnect to Purpose",
    blurb: "When you drift, come back to the why.",
    Icon: Flame,
    steps: [
      {
        title: "Read your why. Out loud if you can.",
        body: "Drifting means you lost contact with the reason. Let’s restore it.",
      },
      {
        title: "Say why it matters — right now.",
        inputPrompt: "Say why it matters — right now.",
        body: "In your own words, today. Not the old script — how it feels now.",
        placeholder:
          "e.g. Because I’m done being the person who starts and quits",
      },
      {
        title: "Now move while it’s lit.",
        body: "That’s the fuel. Take one step toward it before the feeling fades — motion keeps the flame going.",
      },
    ],
  },
];

const DEFINE_MISSION: GuidedStep[] = [
  {
    title: "What do you want to do with your life?",
    inputPrompt: "What do you want to do with your life?",
    body: "Your purpose — the direction you want everything to move toward. It can grow later; just name it honestly now.",
    placeholder:
      "e.g. Build a strong body and mind so I can lead and provide",
  },
  {
    title: "Why does it matter to you?",
    inputPrompt: "Why does it matter to you?",
    body: "The real reason underneath. This is the fuel that keeps you moving on hard days.",
    placeholder: "e.g. I’m done drifting — I want to be someone I respect",
  },
  {
    title: "The one thing you’ll do daily to move toward it.",
    inputPrompt: "The one thing you’ll do daily to move toward it.",
    body: "Small and repeatable. Movement is the whole point.",
    placeholder: "e.g. Train and plan tomorrow before bed",
  },
  {
    title: "That’s your direction now.",
    body: "Everything in here moves toward it. Come back daily and take your one step forward.",
  },
];

interface MissionData {
  purpose: string;
  whyItMatters: string;
  dailyAction: string;
}

interface MomentumData {
  streak: number;
  longest: number;
  movedToday: boolean;
}

export default function MissionDashboard() {
  const { colors } = useThemeTokens();
  const { token } = useAuth();
  const [mission, setMission] = useState<MissionData | null>(null);
  const [momentum, setMomentum] = useState<MomentumData>({
    streak: 0,
    longest: 0,
    movedToday: false,
  });
  const [entries, setEntries] = useState<TrackRecordEntry[]>([]);
  const [reps, setReps] = useState<number | null>(null);
  const { unlocked: justUnlocked, dismiss: dismissUnlock } =
    useProtocolUnlocks(PROTOCOLS, reps);

  const [moving, setMoving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [flow, setFlow] = useState<{
    title: string;
    kind: string;
    steps: GuidedStep[];
    aiGenerated?: boolean;
  } | null>(null);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<MissionData>({
    purpose: "",
    whyItMatters: "",
    dailyAction: "",
  });

  const openEditor = () => {
    if (mission) setEditForm({ ...mission });
    setEditing(true);
  };

  const submitEdit = async () => {
    const purpose = editForm.purpose.trim();
    const whyItMatters = editForm.whyItMatters.trim();
    const dailyAction = editForm.dailyAction.trim();
    if (!purpose || !whyItMatters || !dailyAction) return;

    try {
      await apiFetch("/api/mind/mission", MindMissionResponseSchema, {
        method: "PUT",
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        body: { purpose, whyItMatters, dailyAction },
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
      const [mr, jr] = await Promise.allSettled([
        apiFetch("/api/mind/mission", MindMissionResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          tz,
        }),
        apiFetch(
          "/api/mind/journal?system=mission&limit=8",
          MindJournalResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        ),
      ]);

      if (mr.status === "fulfilled") {
        const d = mr.value;
        if (d.mission) {
          setMission({
            purpose: d.mission.purpose,
            whyItMatters: d.mission.whyItMatters,
            dailyAction: d.mission.dailyAction,
          });
        } else {
          setMission(null);
        }
        if (d.momentum) setMomentum(d.momentum);
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
          system: "mission",
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

  const moveForward = async () => {
    if (moving || momentum.movedToday) return;
    setMoving(true);
    setMomentum((m) => ({ ...m, movedToday: true, streak: m.streak + 1 }));

    try {
      const tz = tzOffsetMinutes();
      const r = await apiFetch("/api/mind/mission", MindMissionResponseSchema, {
        method: "PATCH",
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        body: { action: "move", tz },
        tz,
      });
      if (r.momentum) setMomentum(r.momentum);
    } catch {
      // ignore
    } finally {
      setMoving(false);
    }
  };

  const saveMission = async (
    answers: { prompt: string; answer: string }[],
  ) => {
    const purpose = (answers[0]?.answer ?? "").trim();
    const whyItMatters = (answers[1]?.answer ?? "").trim();
    const dailyAction = (answers[2]?.answer ?? "").trim();
    if (!purpose || !whyItMatters || !dailyAction) return;

    try {
      await apiFetch("/api/mind/mission", MindMissionResponseSchema, {
        method: "PUT",
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        body: { purpose, whyItMatters, dailyAction },
        tz: tzOffsetMinutes(),
      });
      void load();
    } catch {
      // ignore
    }
  };

  const runAiFlow = async (topic: string, fallback: (typeof PROTOCOLS)[0]) => {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const r = await runAiTask("/api/ai/mind/flow", {
        system: "mission",
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

  const featured = dailyPick(PROTOCOLS, 4);

  if (flow) {
    return (
      <GuidedFlow
        title={flow.title}
        steps={flow.steps}
        accentColor={colors.blue}
        accentClass="bg-blue-500"
        doneText={
          flow.kind === "define" ? "Your direction is set." : DONE_TEXT
        }
        onReflect={
          flow.aiGenerated || flow.kind === "define"
            ? undefined
            : (a) => reflectOnAnswers("Mission session", a)
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
            void saveMission(answers);
            return;
          }
          void save(kind, flow.title, answers);
        }}
      />
    );
  }

  return (
    <View testID="mission-dashboard" className="gap-5">
      <ProtocolUnlockModal
        unlocked={justUnlocked}
        onDismiss={dismissUnlock}
        accentColor={colors.blue}
      />

      <SystemHero
        Icon={Compass}
        title="Mission"
        tagline="Your purpose — the direction everything moves toward"
        statValue={
          mission ? (momentum.streak > 0 ? `${momentum.streak}🔥` : "0") : "—"
        }
        statLabel="on mission"
        colorClass="text-blue-500"
        bgClass="border-blue-500/30 bg-blue-500/10"
        iconColor={colors.blue}
      />

      {/* Your Mission */}
      {mission && editing ? (
        <View
          testID="mission-edit-form"
          className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 gap-3"
        >
          <Text className="text-xs font-semibold uppercase tracking-widest text-blue-500">
            Edit your mission
          </Text>
          <View>
            <Text className="mb-1 text-[11px] font-semibold text-muted-foreground">
              Your purpose
            </Text>
            <TextInput
              testID="mission-edit-purpose"
              value={editForm.purpose}
              onChangeText={(t) => setEditForm((f) => ({ ...f, purpose: t }))}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </View>
          <View>
            <Text className="mb-1 text-[11px] font-semibold text-muted-foreground">
              Why it matters
            </Text>
            <TextInput
              testID="mission-edit-why"
              value={editForm.whyItMatters}
              onChangeText={(t) =>
                setEditForm((f) => ({ ...f, whyItMatters: t }))
              }
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </View>
          <View>
            <Text className="mb-1 text-[11px] font-semibold text-muted-foreground">
              Your daily forward move
            </Text>
            <TextInput
              testID="mission-edit-action"
              value={editForm.dailyAction}
              onChangeText={(t) =>
                setEditForm((f) => ({ ...f, dailyAction: t }))
              }
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </View>
          <View className="flex-row gap-2 mt-2">
            <Pressable
              testID="mission-edit-save"
              onPress={submitEdit}
              className="flex-1 rounded-xl bg-blue-500 py-2.5 items-center justify-center"
            >
              <Text className="text-sm font-bold text-white">Save</Text>
            </Pressable>
            <Pressable
              testID="mission-edit-cancel"
              onPress={() => setEditing(false)}
              className="rounded-xl border border-border px-4 py-2.5 items-center justify-center"
            >
              <Text className="text-sm font-semibold text-muted-foreground">
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      ) : mission ? (
        <View
          testID="mission-profile"
          className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4"
        >
          <View className="flex-row items-start justify-between">
            <Text className="text-xs font-semibold uppercase tracking-widest text-blue-500">
              Your mission
            </Text>
            <Pressable
              testID="mission-edit-button"
              accessibilityRole="button"
              accessibilityLabel="Edit mission"
              onPress={openEditor}
              className="h-8 w-8 items-center justify-center rounded-full"
            >
              <Pencil size={16} color={colors.blue} />
            </Pressable>
          </View>
          <Text
            testID="mission-purpose"
            className="mt-1 text-base font-bold text-foreground"
          >
            {mission.purpose}
          </Text>
          <Text
            testID="mission-why"
            className="mt-1 text-xs text-muted-foreground"
          >
            Why: {mission.whyItMatters}
          </Text>

          <View className="mt-3 rounded-xl border border-blue-500/20 bg-card p-3">
            <Text className="text-[10px] font-bold uppercase tracking-widest text-blue-500">
              Today’s forward move
            </Text>
            <Text
              testID="mission-daily-action"
              className="text-sm font-semibold text-foreground mt-0.5"
            >
              {mission.dailyAction}
            </Text>
          </View>

          {momentum.movedToday ? (
            <View
              testID="mission-moved-today"
              className="mt-3 flex-row items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2.5"
            >
              <Check size={18} color={colors.success} strokeWidth={3} />
              <Text className="text-sm font-semibold text-foreground">
                You moved today.
              </Text>
              {momentum.streak > 0 ? (
                <View className="ml-auto flex-row items-center gap-0.5 rounded-full bg-accent/15 px-2 py-0.5">
                  <Flame size={14} color={colors.accent} />
                  <Text className="text-xs font-bold text-accent">
                    {momentum.streak}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Pressable
              testID="mission-move-button"
              accessibilityRole="button"
              onPress={moveForward}
              disabled={moving}
              className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-blue-500 py-3 active:opacity-90 disabled:opacity-60"
            >
              <ArrowRight size={16} color={colors["primary-foreground"]} strokeWidth={3} />
              <Text className="text-sm font-bold text-white">
                I moved forward today
              </Text>
              {momentum.streak > 0 ? (
                <View className="flex-row items-center gap-0.5">
                  <Flame size={14} color={colors["primary-foreground"]} />
                  <Text className="text-sm font-bold text-white">
                    {momentum.streak}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          )}
        </View>
      ) : (
        <Pressable
          testID="mission-define-button"
          accessibilityRole="button"
          onPress={() =>
            setFlow({
              title: "Your mission",
              kind: "define",
              steps: DEFINE_MISSION,
            })
          }
          className="rounded-2xl border border-dashed border-blue-500/40 p-5 items-center justify-center bg-card active:opacity-80"
        >
          <Compass size={28} color={colors.blue} />
          <Text className="mt-2 text-sm font-bold text-foreground">
            Define your mission
          </Text>
          <Text className="mt-1 text-xs text-muted-foreground text-center">
            Your purpose, your why, your daily move. This is the fuel everything
            else runs on.
          </Text>
        </Pressable>
      )}

      {/* Today's adaptive session */}
      <AdaptiveSession
        loading={aiLoading}
        onStart={() =>
          runAiFlow(
            "move toward my mission today",
            featured ?? PROTOCOLS[0]!,
          )
        }
        colorClass="text-blue-500"
        bgClass="border-blue-500/30 bg-blue-500/10"
        subtitle="Pointed at your purpose and where you’re actually stuck."
      />

      {/* Mission protocols */}
      <View>
        <Text className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Mission protocols
        </Text>
        <View className="gap-2">
          {PROTOCOLS.map((p, i) => (
            <ToolkitCard
              key={p.id}
              Icon={p.Icon}
              title={p.title}
              blurb={p.blurb}
              colorClass="text-blue-500"
              iconColor={colors.blue}
              locked={i >= 1 + (reps ?? 0)}
              lockedHint={`Locked — do ${i - (reps ?? 0)} more rep${
                i - (reps ?? 0) === 1 ? "" : "s"
              } in Mission to unlock`}
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
