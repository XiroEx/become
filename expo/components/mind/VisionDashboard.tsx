import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import {
  AlertCircle,
  ArrowRight,
  Brain,
  Check,
  Dumbbell,
  Eye,
  Home,
  Pencil,
  Repeat,
  Target,
  Telescope,
  Users,
} from "lucide-react-native";
import {
  apiFetch,
  MindJournalCreateResponseSchema,
  MindJournalResponseSchema,
  MindVisionAlignResponseSchema,
  MindVisionResponseSchema,
  MindVisionSaveResponseSchema,
} from "@become/api-client";
import { Text } from "@/components/Text";
import GuidedFlow, {
  type GuidedStep,
} from "@/components/mind/system/GuidedFlow";
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
import { routeApiError } from "@/lib/errors";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { mindAccentColor } from "@/lib/mind/accents";
import { reflectOnAnswers } from "@/lib/mind/reflect";
import { dailyPick } from "@/lib/mind/rotation";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { tzOffsetMinutes } from "@/lib/time/localDay";

const DONE_TEXT = "The future, coming into focus.";

type DomainKey = "habits" | "mind" | "body" | "relationships" | "environment";

interface DomainDef {
  key: DomainKey;
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  placeholder: string;
}

const DOMAINS: DomainDef[] = [
  {
    key: "body",
    label: "Body",
    Icon: Dumbbell,
    placeholder: "e.g. Lean, strong, and energized — I move like an athlete",
  },
  {
    key: "mind",
    label: "Mind",
    Icon: Brain,
    placeholder: "e.g. Calm, focused, in control of my thoughts",
  },
  {
    key: "habits",
    label: "Habits",
    Icon: Repeat,
    placeholder:
      "e.g. I train, plan, and sleep on schedule without negotiating",
  },
  {
    key: "relationships",
    label: "Relationships",
    Icon: Users,
    placeholder:
      "e.g. Present and dependable — the people I love can count on me",
  },
  {
    key: "environment",
    label: "Environment",
    Icon: Home,
    placeholder: "e.g. Ordered space and people who pull me up, not down",
  },
];

interface VisionProtocol {
  id: string;
  title: string;
  blurb: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  steps: GuidedStep[];
}

// ── Vision protocols as guided runs (Become-voiced, never naming a source) ──
const PROTOCOLS: VisionProtocol[] = [
  {
    id: "see-future-you",
    title: "See the Future You",
    blurb: "Rehearse being them until it’s real.",
    Icon: Eye,
    steps: [
      {
        title: "Twelve months from now.",
        body: "Close your eyes for a moment. Not what you have — how you move, speak, and carry yourself.",
      },
      {
        title: "Describe a normal day as that person.",
        inputPrompt: "Describe a normal day as that person.",
        body: "Present tense, like it’s already happening. Wake-up to wind-down.",
        placeholder:
          "e.g. I wake early, train, do focused work, and end the day proud",
      },
      {
        title: "You just rehearsed it.",
        body: "Your nervous system can’t tell rehearsal from real. Carry one piece of that day into this one.",
      },
    ],
  },
  {
    id: "which-domain",
    title: "Which Domain Needs You?",
    blurb: "Aim this week at the part that’s furthest behind.",
    Icon: Target,
    steps: [
      {
        title: "Which part of your vision is furthest behind?",
        body: "The domain where today looks least like the future you.",
        choices: ["Body", "Mind", "Habits", "Relationships", "Environment"],
      },
      {
        title: "One move in that area this week.",
        inputPrompt: "One move in that area this week.",
        body: "Small and specific. It just has to close the gap a little.",
        placeholder: "e.g. Two extra training sessions; call my brother",
      },
      {
        title: "That’s the lever.",
        body: "You don’t improve everything at once — you aim at the domain that moves the whole picture. Go do that one.",
      },
    ],
  },
  {
    id: "close-the-gap",
    title: "Close the Gap",
    blurb: "Where does now differ most from the vision?",
    Icon: ArrowRight,
    steps: [
      {
        title: "The biggest gap between now and the vision.",
        inputPrompt: "The biggest gap between now and the vision.",
        body: "Name the honest distance between who you are and who you described.",
        placeholder: "e.g. I say I’m disciplined but I skip when it’s hard",
      },
      {
        title: "One thing this week to close it.",
        inputPrompt: "One thing this week to close it.",
        body: "Not the whole gap — the first real step across it.",
        placeholder: "e.g. Show up on the two days I always skip",
      },
      {
        title: "The gap closes by steps.",
        body: "Every time you act like the future you when it’s hard, the distance shrinks. Take that step.",
      },
    ],
  },
  {
    id: "act-from-vision",
    title: "Act From the Vision",
    blurb: "Make one choice the future you would make.",
    Icon: Check,
    steps: [
      {
        title: "One decision the future you would make today.",
        inputPrompt: "One decision the future you would make today.",
        body: "In the next few hours — how they’d eat, respond, or spend the time.",
        placeholder: "e.g. Prep tomorrow’s session instead of scrolling",
      },
      {
        title: "Go make it.",
        body: "You become them one aligned choice at a time. This is one. Make it now.",
      },
    ],
  },
];

interface VisionData {
  identityStatement?: string;
  habits?: string;
  mind?: string;
  body?: string;
  relationships?: string;
  environment?: string;
}

interface AlignData {
  avg7: number;
  entries7: number;
  todayScore: number | null;
  checkedToday: boolean;
}

type VisionForm = { identityStatement: string } & Record<DomainKey, string>;

const EMPTY_FORM: VisionForm = {
  identityStatement: "",
  body: "",
  mind: "",
  habits: "",
  relationships: "",
  environment: "",
};

const IDENTITY_PLACEHOLDER =
  "e.g. A disciplined, present leader people can count on";

export default function VisionDashboard() {
  const { colors } = useThemeTokens();
  const { token } = useAuth();
  const [vision, setVision] = useState<VisionData | null>(null);
  const [align, setAlign] = useState<AlignData>({
    avg7: 0,
    entries7: 0,
    todayScore: null,
    checkedToday: false,
  });
  const [entries, setEntries] = useState<TrackRecordEntry[]>([]);
  // Lifetime reps in this tool — 1 + reps protocols are open.
  const [reps, setReps] = useState<number | null>(null);
  const { unlocked: justUnlocked, dismiss: dismissUnlock } =
    useProtocolUnlocks(PROTOCOLS, reps);

  const [aligning, setAligning] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [flow, setFlow] = useState<{
    title: string;
    steps: GuidedStep[];
    aiGenerated?: boolean;
  } | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<VisionForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  // Tracks the core GET /api/mind/vision call specifically (not the
  // secondary journal fetch below) so a slow or failed request shows a
  // loading or error state instead of the empty "Paint your vision" CTA,
  // which previously meant exactly the same thing as "never set one up".
  const [visionStatus, setVisionStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  const hasVision = !!(vision && vision.identityStatement);

  const load = useCallback(async () => {
    setVisionStatus("loading");
    const tz = tzOffsetMinutes();
    const [vr, jr] = await Promise.allSettled([
      apiFetch("/api/mind/vision", MindVisionResponseSchema, {
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        tz,
      }),
      apiFetch("/api/mind/journal?system=vision&limit=8", MindJournalResponseSchema, {
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        tz,
      }),
    ]);

    if (vr.status === "fulfilled") {
      setVision(vr.value.vision ?? null);
      if (vr.value.alignment) {
        const a = vr.value.alignment;
        setAlign({
          avg7: a.avg7,
          entries7: a.entries7,
          todayScore: a.todayScore ?? null,
          checkedToday: a.checkedToday,
        });
      }
      setVisionStatus("ready");
    } else {
      setVisionStatus("error");
    }

    if (jr.status === "fulfilled") {
      const raw = jr.value.entries ?? [];
      setEntries(
        raw.map((e) => ({
          id: String(e.id ?? (e as { _id?: unknown })._id ?? ""),
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
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync state from server fetch
    void load();
  }, [load]);

  const save = async (
    title: string,
    lines: { prompt: string; answer: string }[],
  ) => {
    try {
      await apiFetch("/api/mind/journal", MindJournalCreateResponseSchema, {
        method: "POST",
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        body: { system: "vision", kind: "protocol", title, lines },
        tz: tzOffsetMinutes(),
      });
      void load();
    } catch (err) {
      // Belt and braces: TierGate already keeps a locked member out of this
      // screen, but the server is the gate and this is what it says.
      routeApiError(err, {
        onPlanGate: (gate) => {
          showUpgradeSheet(gate.gate);
        },
      });
    }
  };

  const openEditor = () => {
    if (vision) {
      setForm({
        identityStatement: vision.identityStatement ?? "",
        body: vision.body ?? "",
        mind: vision.mind ?? "",
        habits: vision.habits ?? "",
        relationships: vision.relationships ?? "",
        environment: vision.environment ?? "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setFormError(null);
    setEditing(true);
  };

  const submitVision = async () => {
    const payload = {
      identityStatement: form.identityStatement.trim(),
      body: form.body.trim(),
      mind: form.mind.trim(),
      habits: form.habits.trim(),
      relationships: form.relationships.trim(),
      environment: form.environment.trim(),
    };
    if (
      !payload.identityStatement ||
      DOMAINS.some((d) => !payload[d.key])
    ) {
      setFormError("Fill in your statement and all five domains");
      return;
    }
    setFormError(null);

    try {
      await apiFetch("/api/mind/vision", MindVisionSaveResponseSchema, {
        method: "POST",
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        body: payload,
        tz: tzOffsetMinutes(),
      });
      setEditing(false);
      void load();
    } catch (err) {
      const { handled } = routeApiError(err, {
        onPlanGate: (gate) => {
          showUpgradeSheet(gate.gate);
        },
      });
      if (!handled) setFormError("Could not save");
    }
  };

  // Daily alignment check — the vision's daily-return hook. Idempotent per day.
  const setAlignment = async (score: number) => {
    if (aligning) return;
    setAligning(true);
    const prev = align;
    setAlign((a) => ({ ...a, todayScore: score, checkedToday: true })); // optimistic
    try {
      const r = await apiFetch("/api/mind/vision", MindVisionAlignResponseSchema, {
        method: "PATCH",
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        body: { action: "align", score },
        tz: tzOffsetMinutes(),
      });
      if (r.alignment) {
        const a = r.alignment;
        setAlign({
          avg7: a.avg7,
          entries7: a.entries7,
          todayScore: a.todayScore ?? null,
          checkedToday: a.checkedToday,
        });
      }
    } catch (err) {
      routeApiError(err, {
        onPlanGate: (gate) => {
          showUpgradeSheet(gate.gate);
        },
      });
      setAlign(prev);
    } finally {
      setAligning(false);
    }
  };

  const runAiFlow = async (topic: string, fallback: VisionProtocol) => {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const r = await runAiTask("/api/ai/mind/flow", {
        system: "vision",
        topic,
      });
      // A gated member never gets a flow composed: the run client already
      // raised the upgrade sheet for the 403, so fall through to nothing.
      // `r.gate` is the verbatim 403 body; `error: "entitlement"` is the
      // run client's marker for the same refusal.
      if (r.gate || r.error === "entitlement") {
        if (r.gate) showUpgradeSheet(r.gate);
        return;
      }
      const steps = validateGuidedSteps(
        (r.result as { steps?: unknown } | undefined)?.steps,
      );
      if (r.ok && steps) {
        setFlow({ title: topic, steps, aiGenerated: true });
        return;
      }
    } catch {
      // fall through without error
    } finally {
      setAiLoading(false);
    }
    setFlow({ title: fallback.title, steps: fallback.steps });
  };

  const featured = dailyPick(PROTOCOLS, 5);

  if (flow) {
    return (
      <GuidedFlow
        title={flow.title}
        steps={flow.steps}
        accentColor={mindAccentColor("vision")}
        doneText={DONE_TEXT}
        onReflect={
          flow.aiGenerated
            ? undefined
            : (a) => reflectOnAnswers("Vision session", a)
        }
        onExit={() => {
          setFlow(null);
          setAiLoading(false);
        }}
        onComplete={(answers) => {
          const title = flow.title;
          setFlow(null);
          setAiLoading(false);
          void save(title, answers);
        }}
      />
    );
  }

  return (
    <View testID="vision-dashboard" className="gap-5">
      <ProtocolUnlockModal
        unlocked={justUnlocked}
        onDismiss={dismissUnlock}
        accentColor={colors.success}
      />

      <SystemHero
        Icon={Telescope}
        title="Vision"
        tagline="The future you — habits, mind, body, and life"
        statValue={
          hasVision && align.entries7 > 0 ? `${align.avg7}` : "—"
        }
        statLabel="aligned"
        colorClass="text-emerald-500"
        bgClass="border-emerald-500/30 bg-emerald-500/10"
        iconColor={colors.success}
      />

      {/* ── Your Vision — the powerhouse ── */}
      {editing ? (
        <View
          testID="vision-edit-form"
          className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 gap-3"
        >
          <Text className="text-xs font-semibold uppercase tracking-widest text-emerald-500">
            {hasVision ? "Edit your vision" : "Paint your vision"}
          </Text>
          <View>
            <Text className="mb-1 text-[11px] font-semibold text-muted-foreground">
              Who you’re becoming (one line)
            </Text>
            <TextInput
              testID="vision-identity-input"
              value={form.identityStatement}
              onChangeText={(t) =>
                setForm((f) => ({ ...f, identityStatement: t }))
              }
              placeholder={IDENTITY_PLACEHOLDER}
              multiline
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground"
            />
          </View>
          {DOMAINS.map((d) => (
            <View key={d.key}>
              <View className="mb-1 flex-row items-center gap-1.5">
                <d.Icon size={12} color={colors["muted-foreground"]} />
                <Text className="text-[11px] font-semibold text-muted-foreground">
                  {d.label}
                </Text>
              </View>
              <TextInput
                testID={`vision-domain-${d.key}`}
                value={form[d.key]}
                onChangeText={(t) =>
                  setForm((f) => ({ ...f, [d.key]: t }))
                }
                placeholder={d.placeholder}
                multiline
                className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground"
              />
            </View>
          ))}
          {formError ? (
            <Text testID="vision-form-error" className="text-xs text-destructive">
              {formError}
            </Text>
          ) : null}
          <View className="flex-row gap-2 mt-1">
            <Pressable
              testID="vision-save-button"
              accessibilityRole="button"
              accessibilityLabel="Save vision"
              onPress={submitVision}
              className="flex-1 rounded-xl bg-emerald-500 py-2.5 items-center justify-center"
            >
              <Text className="text-sm font-bold text-white">Save vision</Text>
            </Pressable>
            {hasVision ? (
              <Pressable
                testID="vision-edit-cancel"
                accessibilityRole="button"
                accessibilityLabel="Cancel editing vision"
                onPress={() => setEditing(false)}
                className="rounded-xl border border-border px-4 py-2.5 items-center justify-center"
              >
                <Text className="text-sm font-semibold text-muted-foreground">
                  Cancel
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : visionStatus === "loading" ? (
        <View
          testID="vision-loading"
          className="rounded-2xl border border-dashed border-emerald-500/40 p-5 items-center justify-center bg-card"
        >
          <ActivityIndicator size="small" color={colors.success} />
          <Text className="mt-2 text-xs text-muted-foreground">
            Loading your vision…
          </Text>
        </View>
      ) : visionStatus === "error" ? (
        <View
          testID="vision-error"
          className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 items-center justify-center"
        >
          <AlertCircle size={28} color={colors.destructive} />
          <Text className="mt-2 text-sm font-bold text-foreground">
            Could not load your vision
          </Text>
          <Text className="mt-1 text-xs text-muted-foreground text-center">
            Check your connection and try again.
          </Text>
          <Pressable
            testID="vision-error-retry"
            accessibilityRole="button"
            accessibilityLabel="Try again"
            onPress={() => void load()}
            className="mt-3 rounded-xl bg-emerald-500 px-4 py-2.5 items-center justify-center"
          >
            <Text className="text-sm font-bold text-white">Try again</Text>
          </Pressable>
        </View>
      ) : hasVision ? (
        <View
          testID="vision-profile"
          className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4"
        >
          <View className="flex-row items-start justify-between">
            <Text className="text-xs font-semibold uppercase tracking-widest text-emerald-500">
              The future you
            </Text>
            <Pressable
              testID="vision-edit-button"
              accessibilityRole="button"
              accessibilityLabel="Edit vision"
              onPress={openEditor}
              className="h-8 w-8 items-center justify-center rounded-full"
            >
              <Pencil size={16} color={colors.success} />
            </Pressable>
          </View>
          <Text
            testID="vision-identity"
            className="mt-1 text-base font-bold text-foreground"
          >
            {vision!.identityStatement}
          </Text>

          <View className="mt-3 gap-1.5">
            {DOMAINS.map((d) =>
              vision![d.key] ? (
                <View
                  key={d.key}
                  className="flex-row items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-card px-3 py-2"
                >
                  <View className="mt-0.5 h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
                    <d.Icon size={14} color={colors.success} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">
                      {d.label}
                    </Text>
                    <Text
                      testID={`vision-domain-text-${d.key}`}
                      className="text-sm text-foreground"
                    >
                      {vision![d.key]}
                    </Text>
                  </View>
                </View>
              ) : null,
            )}
          </View>

          {/* Daily alignment check — the vision's daily-return hook */}
          <View className="mt-3 rounded-xl border border-emerald-500/20 bg-card px-3 py-2.5">
            <Text
              testID="vision-align-status"
              className="text-[10px] font-bold uppercase tracking-widest text-emerald-500"
            >
              {align.checkedToday
                ? `Today’s alignment · ${align.todayScore}/5`
                : "How aligned was today with the vision?"}
            </Text>
            <View className="mt-2 flex-row items-center justify-between gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  testID={`vision-align-${n}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Alignment ${n} of 5`}
                  onPress={() => void setAlignment(n)}
                  disabled={aligning}
                  className={`flex-1 h-10 items-center justify-center rounded-lg ${
                    align.todayScore === n
                      ? "bg-emerald-500"
                      : "bg-muted"
                  } disabled:opacity-60`}
                >
                  <Text
                    className={`text-sm font-bold ${
                      align.todayScore === n
                        ? "text-white"
                        : "text-muted-foreground"
                    }`}
                  >
                    {n}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View className="mt-1 flex-row justify-between">
              <Text className="text-[10px] text-muted-foreground">Off track</Text>
              <Text className="text-[10px] text-muted-foreground">Living it</Text>
            </View>
          </View>
        </View>
      ) : (
        <Pressable
          testID="vision-paint-button"
          accessibilityRole="button"
          accessibilityLabel="Paint your vision"
          onPress={openEditor}
          className="rounded-2xl border border-dashed border-emerald-500/40 p-5 items-center justify-center bg-card"
        >
          <Telescope size={28} color={colors.success} />
          <Text className="mt-2 text-sm font-bold text-foreground">
            Paint your vision
          </Text>
          <Text className="mt-1 text-xs text-muted-foreground text-center">
            The future you across body, mind, habits, relationships, and
            environment. This is the powerhouse everything else runs on.
          </Text>
        </Pressable>
      )}

      {/* Today's session — adaptive + memory-aware (the headline daily action) */}
      <AdaptiveSession
        loading={aiLoading}
        onStart={() =>
          void runAiFlow(
            "move toward the future version of me",
            featured ?? PROTOCOLS[0]!,
          )
        }
        colorClass="text-emerald-500"
        bgClass="border-emerald-500/30 bg-emerald-500/10"
        subtitle="Built from the future you and where you are right now."
      />

      {/* Vision protocols — guided runs */}
      <View>
        <Text className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Vision protocols
        </Text>
        <View className="gap-2">
          {PROTOCOLS.map((p, i) => (
            <ToolkitCard
              key={p.id}
              Icon={p.Icon}
              title={p.title}
              blurb={p.blurb}
              colorClass="text-emerald-500"
              iconColor={colors.success}
              locked={i >= 1 + (reps ?? 0)}
              lockedHint={`Locked — do ${i - (reps ?? 0)} more rep${
                i - (reps ?? 0) === 1 ? "" : "s"
              } in Vision to unlock`}
              onClick={() =>
                setFlow({
                  title: p.title,
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
