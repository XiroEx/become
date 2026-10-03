/**
 * ─── VISION, ON THE PHONE (NP-154) ───────────────────────────────────────────
 *
 * Native port of `webapp/components/mind/VisionDashboard.tsx`. Vision is the
 * one Mind tool sold as a plan feature: the future self across five domains
 * (habits, mind, body, relationships, environment), a daily alignment check,
 * and vision protocols run as guided flows.
 *
 * THE RULES THAT TRAVEL (Plus only — `FREE_LIMITS.vision.limit` is 0):
 *
 *   • the section route wraps this in the native `TierGate`, so a free member
 *     sees the teaser and never reaches this component. The server is still
 *     the gate: every write below routes its failure through `routeApiError`,
 *     and a 403 carrying `feature` + `requiresTier` raises the upgrade sheet
 *     instead of an error line.
 *   • the four doors are `GET|POST /api/mind/vision`, `PATCH { action:
 *     'align', score }`, `POST /api/mind/journal { system: 'vision' }` and
 *     `POST /api/ai/mind/flow { system: 'vision' }`. A gate from ANY of them
 *     raises the sheet.
 *   • a vision flow is never composed for a free member: the adaptive session
 *     pre-checks the entitlement before dispatching, and a gated AI answer
 *     raises the sheet WITHOUT falling back to the static protocol. A
 *     fallback flow is value delivered past the paywall.
 *
 * Reads stay open on purpose (same as the web): `GET /api/mind/vision` and the
 * journal read answer for anyone, so the teaser keeps the real shape.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import {
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
  type MindJournalEntry,
  type MindVision,
  type MindVisionAlignment,
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
import { routeApiError } from "@/lib/errors";
import {
  showUpgradeSheet,
  syntheticGate,
  useEntitlements,
} from "@/lib/entitlements";
import { reflectOnAnswers } from "@/lib/mind/reflect";
import { dailyPick } from "@/lib/mind/rotation";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { tzOffsetMinutes } from "@/lib/time/localDay";

const DONE_TEXT = "The future, coming into focus.";

type DomainKey = "habits" | "mind" | "body" | "relationships" | "environment";

const DOMAINS: {
  key: DomainKey;
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  placeholder: string;
}[] = [
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
    placeholder: "e.g. I train, plan, and sleep on schedule without negotiating",
  },
  {
    key: "relationships",
    label: "Relationships",
    Icon: Users,
    placeholder: "e.g. Present and dependable — the people I love can count on me",
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

// ── Vision protocols, the same four guided runs as the web ───────────────────

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
        placeholder: "e.g. I wake early, train, do focused work, and end the day proud",
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

const IDENTITY_PLACEHOLDER =
  "e.g. A disciplined, present leader people can count on";

type VisionForm = { identityStatement: string } & Record<DomainKey, string>;

const EMPTY_FORM: VisionForm = {
  identityStatement: "",
  body: "",
  mind: "",
  habits: "",
  relationships: "",
  environment: "",
};

const EMPTY_ALIGN: MindVisionAlignment = {
  avg7: 0,
  entries7: 0,
  todayScore: null,
  checkedToday: false,
};

export default function VisionDashboard() {
  const { colors } = useThemeTokens();
  const { token } = useAuth();
  const [vision, setVision] = useState<MindVision | null>(null);
  const [align, setAlign] = useState<MindVisionAlignment>(EMPTY_ALIGN);
  const [entries, setEntries] = useState<TrackRecordEntry[]>([]);
  const [reps, setReps] = useState<number | null>(null);
  const { unlocked: justUnlocked, dismiss: dismissUnlock } =
    useProtocolUnlocks(PROTOCOLS, reps);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<VisionForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [aligning, setAligning] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flow, setFlow] = useState<{
    title: string;
    steps: GuidedStep[];
    aiGenerated?: boolean;
  } | null>(null);

  // The client-side half of "never compose for a free member": the TierGate
  // above already keeps them out, and this stops the AI dispatch itself when
  // the snapshot says they may not use Vision.
  const { data: entitlements, feature: entitlementFor } = useEntitlements();
  const visionLocked =
    entitlements?.enforced === true &&
    entitlementFor("vision")?.allowed === false;

  const hasVision = !!(vision && vision.identityStatement);

  // A refusal becomes the upgrade sheet (NP-052); anything else comes back as
  // the server's own words for the inline error. Returns the message, or null
  // when a sheet took it over.
  const handleFailure = useCallback((err: unknown): string | null => {
    const { handled, message } = routeApiError(err, {
      onPlanGate: (gate) => {
        showUpgradeSheet(gate.gate);
      },
    });
    return handled ? null : message;
  }, []);

  const load = useCallback(async () => {
    try {
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
        }),
      ]);

      if (vr.status === "fulfilled") {
        const vd = vr.value as { vision?: MindVision | null; alignment?: MindVisionAlignment };
        setVision(vd.vision ?? null);
        if (vd.alignment) setAlign(vd.alignment);
      } else {
        handleFailure(vr.reason);
      }

      if (jr.status === "fulfilled") {
        const jd = jr.value as { entries?: MindJournalEntry[]; counts?: Record<string, number> };
        const raw = jd.entries ?? [];
        setEntries(
          raw.map((e: MindJournalEntry) => ({
            id: String(e.id ?? e._id ?? ""),
            title: e.title,
            kind: e.kind,
            createdAt: e.createdAt ?? new Date().toISOString(),
          })),
        );
        const counts = (jd.counts ?? {}) as Record<string, number>;
        setReps(Object.values(counts).reduce((a: number, b: number) => a + b, 0));
      } else {
        handleFailure(jr.reason);
      }
    } catch {
      // ignore — the next focus re-reads
    }
  }, [token, handleFailure]);

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
          system: "vision",
          kind,
          title,
          lines,
        },
        tz: tzOffsetMinutes(),
      });
      void load();
    } catch (err) {
      const message = handleFailure(err);
      if (message) setError(message);
    }
  };

  const openEditor = () => {
    setError(null);
    setForm(
      vision
        ? {
            identityStatement: vision.identityStatement ?? "",
            body: vision.body ?? "",
            mind: vision.mind ?? "",
            habits: vision.habits ?? "",
            relationships: vision.relationships ?? "",
            environment: vision.environment ?? "",
          }
        : EMPTY_FORM,
    );
    setEditing(true);
  };

  const submitVision = async () => {
    if (saving) return;
    const payload = {
      identityStatement: form.identityStatement.trim(),
      body: form.body.trim(),
      mind: form.mind.trim(),
      habits: form.habits.trim(),
      relationships: form.relationships.trim(),
      environment: form.environment.trim(),
    };
    if (!payload.identityStatement || DOMAINS.some((d) => !payload[d.key])) {
      setError("Fill in your statement and all five domains");
      return;
    }
    setSaving(true);
    setError(null);
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
      const message = handleFailure(err);
      if (message) setError(message);
    } finally {
      setSaving(false);
    }
  };

  // Daily alignment check — the vision's daily-return hook. Idempotent per
  // local day: the server replaces today's entry.
  const setAlignment = async (score: number) => {
    if (aligning) return;
    setAligning(true);
    setError(null);
    const previous = align;
    setAlign((a: MindVisionAlignment) => ({ ...a, todayScore: score, checkedToday: true }));
    try {
      const r = (await apiFetch(
        "/api/mind/vision",
        MindVisionAlignResponseSchema,
        {
          method: "PATCH",
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          body: { action: "align", score },
          tz: tzOffsetMinutes(),
        },
      )) as { alignment?: MindVisionAlignment };
      if (r.alignment) setAlign(r.alignment);
    } catch (err) {
      // Never leave an optimistic score on screen that the server refused.
      // A gate raises the sheet and paints no inline error.
      setAlign(previous);
      const message = handleFailure(err);
      if (message) setError(message);
    } finally {
      setAligning(false);
    }
  };

  const runAiFlow = async (topic: string, fallback: VisionProtocol) => {
    if (aiLoading) return;
    // Never compose a vision flow for a free member: no dispatch at all, just
    // the sheet. A gated answer below gets the same treatment — the sheet,
    // and deliberately NOT the static fallback.
    if (visionLocked) {
      showUpgradeSheet(syntheticGate("vision"));
      return;
    }
    setAiLoading(true);
    try {
      const r = await runAiTask("/api/ai/mind/flow", {
        system: "vision",
        topic,
      });
      const steps = validateGuidedSteps(
        (r.result as { steps?: unknown } | undefined)?.steps,
      );
      if (r.ok && steps) {
        setFlow({ title: topic, steps, aiGenerated: true });
        return;
      }
      if (r.gate) {
        showUpgradeSheet(r.gate);
        return;
      }
    } catch {
      // fall through to the static protocol
    } finally {
      setAiLoading(false);
    }
    setFlow({ title: fallback.title, steps: fallback.steps });
  };

  const featured = dailyPick(PROTOCOLS, 5) ?? PROTOCOLS[0]!;

  if (flow) {
    return (
      <GuidedFlow
        title={flow.title}
        steps={flow.steps}
        accentColor={colors.success}
        accentClass="bg-emerald-500"
        doneText={DONE_TEXT}
        onReflect={
          flow.aiGenerated
            ? undefined
            : (a: { prompt: string; answer: string }[]) =>
                reflectOnAnswers("Vision session", a)
        }
        onExit={() => {
          setFlow(null);
          setAiLoading(false);
        }}
        onComplete={(answers) => {
          const flowTitle = flow.title;
          setFlow(null);
          setAiLoading(false);
          void saveJournal("protocol", flowTitle, answers);
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
        statValue={hasVision && align.entries7 > 0 ? `${align.avg7}` : "—"}
        statLabel="aligned"
        colorClass="text-emerald-500"
        bgClass="border-emerald-500/30 bg-emerald-500/10"
        iconColor={colors.success}
      />

      {error ? (
        <View
          testID="vision-error"
          className="rounded-2xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5"
        >
          <Text className="text-sm text-foreground">{error}</Text>
        </View>
      ) : null}

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
              testID="vision-edit-identity"
              value={form.identityStatement}
              onChangeText={(t: string) => setForm((f: VisionForm) => ({ ...f, identityStatement: t }))}
              placeholder={IDENTITY_PLACEHOLDER}
              multiline
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </View>
          {DOMAINS.map((d) => (
            <View key={d.key}>
              <Text className="mb-1 text-[11px] font-semibold text-muted-foreground">
                {d.label}
              </Text>
              <TextInput
                testID={`vision-edit-${d.key}`}
                value={form[d.key]}
                onChangeText={(t: string) => setForm((f: VisionForm) => ({ ...f, [d.key]: t }))}
                placeholder={d.placeholder}
                multiline
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
              />
            </View>
          ))}
          <View className="flex-row gap-2 mt-2">
            <Pressable
              testID="vision-edit-save"
              accessibilityRole="button"
              accessibilityLabel="Save vision"
              onPress={() => void submitVision()}
              disabled={saving}
              className="flex-1 rounded-xl bg-emerald-500 py-2.5 items-center justify-center disabled:opacity-60"
            >
              <Text className="text-sm font-bold text-white">
                {saving ? "Saving…" : "Save vision"}
              </Text>
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
            testID="vision-statement"
            className="mt-1 text-base font-bold text-foreground"
          >
            {vision!.identityStatement}
          </Text>

          <View className="mt-3 gap-1.5">
            {DOMAINS.map((d) =>
              vision![d.key] ? (
                <View
                  key={d.key}
                  testID={`vision-domain-${d.key}`}
                  className="flex-row items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-card px-3 py-2"
                >
                  <View className="h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <d.Icon size={14} color={colors.success} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">
                      {d.label}
                    </Text>
                    <Text className="text-sm text-foreground">{vision![d.key]}</Text>
                  </View>
                </View>
              ) : null,
            )}
          </View>

          {/* Daily alignment check — the vision's daily-return hook */}
          <View
            testID="vision-align-card"
            className="mt-3 rounded-xl border border-emerald-500/20 bg-card px-3 py-2.5"
          >
            <Text
              testID="vision-align-status"
              className="text-[10px] font-bold uppercase tracking-widest text-emerald-500"
            >
              {align.checkedToday && align.todayScore !== null
                ? `Today’s alignment · ${align.todayScore}/5`
                : "How aligned was today with the vision?"}
            </Text>
            <View className="mt-2 flex-row items-center justify-between gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  testID={`vision-align-${n}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Alignment ${n} out of 5`}
                  disabled={aligning}
                  onPress={() => void setAlignment(n)}
                  className={`flex-1 items-center justify-center rounded-lg py-2.5 disabled:opacity-60 ${
                    align.todayScore === n ? "bg-emerald-500" : "bg-muted"
                  }`}
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
          testID="vision-define-button"
          accessibilityRole="button"
          accessibilityLabel="Paint your vision"
          onPress={openEditor}
          className="rounded-2xl border border-dashed border-emerald-500/40 p-5 items-center justify-center bg-card active:opacity-80"
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
          void runAiFlow("move toward the future version of me", featured)
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
          {PROTOCOLS.map((p, i) => {
            const locked = i >= 1 + (reps ?? 0);
            const remaining = i - (reps ?? 0);
            return (
              <ToolkitCard
                Icon={p.Icon}
                title={p.title}
                blurb={p.blurb}
                iconColor={colors.success}
                locked={locked}
                lockedHint={`Locked — do ${remaining} more rep${
                  remaining === 1 ? "" : "s"
                } in Vision to unlock`}
                onClick={() =>
                  setFlow({
                    title: p.title,
                    steps: p.steps,
                  })
                }
                testID={`mind-toolkit-card-${p.id}`}
              />
            );
          })}
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
