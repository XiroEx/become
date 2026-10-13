import { useCallback, useEffect, useRef, useState } from "react";
import { Modal as RNModal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import {
  Activity,
  Check,
  Focus,
  Pause,
  Play,
  RotateCcw,
  Timer,
  VolumeX,
  Waves,
  Wind,
  X,
  Zap,
} from "lucide-react-native";
import {
  apiFetch,
  MindJournalCreateResponseSchema,
  MindJournalResponseSchema,
  MindStateResponseSchema,
  type MindState,
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
import { lightHaptic } from "@/lib/feedback/haptics";
import { mindAccentColor } from "@/lib/mind/accents";
import { recentFeelingLabel } from "@/lib/mind/recentFeeling";
import { reflectOnAnswers } from "@/lib/mind/reflect";
import { dailyPick } from "@/lib/mind/rotation";
import { onDarkForeground, tintToken } from "@/lib/theme/tokens";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { tzOffsetMinutes } from "@/lib/time/localDay";

const DONE_TEXT = "Back in the room.";

// The breath player's fixed dark stage (NP-298) — see `GuidedFlow.tsx`'s own
// comment for why this is a bare `Modal` with literal `bg-black`/`text-white`
// classes rather than a themed inline screen.
const BREATH_WHITE = onDarkForeground;
const BREATH_WHITE_15 = tintToken("foreground", "dark", 0.15);
const RING_R = 46;
const RING_C = 2 * Math.PI * RING_R;

function useSafeAreaInsetsOrZero() {
  try {
    return useSafeAreaInsets();
  } catch {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
}

// ── Breath protocols ──────────────────────────────────────────────────────────

interface BreathPhase {
  label: string;
  durationMs: number;
  instruction: string;
}

interface BreathProtocol {
  id: string;
  name: string;
  tagline: string;
  bestFor: string;
  rounds: number;
  phases: BreathPhase[];
}

const BREATH: BreathProtocol[] = [
  {
    id: "physiological",
    name: "Physiological Sigh",
    tagline: "Fastest reset",
    bestFor: "Instant stress relief",
    rounds: 3,
    phases: [
      {
        label: "Inhale",
        durationMs: 2000,
        instruction: "Breathe in through your nose",
      },
      {
        label: "Inhale+",
        durationMs: 1000,
        instruction: "Small extra sniff — fill your lungs completely",
      },
      {
        label: "Exhale",
        durationMs: 6000,
        instruction: "Long slow exhale through your mouth — fully empty",
      },
    ],
  },
  {
    id: "box",
    name: "Box Breathing",
    tagline: "Steady & sharp",
    bestFor: "Stress & pre-performance",
    rounds: 4,
    phases: [
      {
        label: "Inhale",
        durationMs: 4000,
        instruction: "Breathe in slowly through your nose",
      },
      { label: "Hold", durationMs: 4000, instruction: "Hold — lungs full" },
      {
        label: "Exhale",
        durationMs: 4000,
        instruction: "Breathe out slowly through your mouth",
      },
      { label: "Hold", durationMs: 4000, instruction: "Hold — lungs empty" },
    ],
  },
  {
    id: "478",
    name: "4-7-8",
    tagline: "Deep calm",
    bestFor: "Wind down & sleep",
    rounds: 4,
    phases: [
      {
        label: "Inhale",
        durationMs: 4000,
        instruction: "Breathe in quietly through your nose",
      },
      { label: "Hold", durationMs: 7000, instruction: "Hold your breath" },
      {
        label: "Exhale",
        durationMs: 8000,
        instruction: "Exhale completely through your mouth",
      },
    ],
  },
];

function BreathSession({
  protocol,
  onExit,
  onDone,
}: {
  protocol: BreathProtocol;
  onExit: () => void;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsetsOrZero();
  const accent = mindAccentColor("state-shift");
  const [round, setRound] = useState(1);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [done, setDone] = useState(false);
  // The progress ring's clock. Every write happens inside the interval's own
  // callback below (an async tick, not the effect's synchronous body), which
  // is the same shape the ORIGINAL `setPhaseIdx`/`setRound`/`setDone` calls
  // already used — never a direct `setState` in the effect body itself
  // (`react-hooks/set-state-in-effect`, see AGENTS.md) and never a `Date.now()`
  // / ref read during render (`react-hooks/purity` / `react-hooks/refs`).
  const [elapsedMs, setElapsedMs] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentPhase = protocol.phases[phaseIdx];
  const duration = currentPhase?.durationMs ?? 4000;

  useEffect(() => {
    lightHaptic();
    const start = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      if (elapsed >= duration) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setElapsedMs(0); // the NEXT phase's clock starts fresh
        const nextPhase = phaseIdx + 1;
        if (nextPhase < protocol.phases.length) {
          setPhaseIdx(nextPhase);
        } else if (round + 1 <= protocol.rounds) {
          setRound(round + 1);
          setPhaseIdx(0);
        } else {
          setDone(true);
        }
      } else {
        setElapsedMs(elapsed);
      }
    }, 100);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [phaseIdx, round, duration, protocol.phases.length, protocol.rounds]);

  // The progress ring sweeps the current phase so a hold never looks frozen —
  // the native twin of the web's `BreathScene` ring (`mindBreathScene.test.tsx`).
  const progress = Math.min(1, elapsedMs / duration);

  return (
    <RNModal
      testID="breath-session-modal"
      visible
      animationType="fade"
      onRequestClose={onExit}
    >
      <View
        testID="breath-session-screen"
        className="flex-1 items-center justify-center bg-black px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        {done ? (
          <View testID="breath-session-done" className="items-center gap-4">
            <View className="h-20 w-20 items-center justify-center rounded-full bg-white/10 mb-2">
              <Check size={40} color={accent} strokeWidth={3} />
            </View>
            <Text className="text-xl font-bold text-white text-center">
              {DONE_TEXT}
            </Text>
            <Text className="text-sm text-white/60 text-center">
              {protocol.rounds} rounds complete
            </Text>
            <Pressable
              testID="breath-session-finish"
              accessibilityRole="button"
              accessibilityLabel="Finish"
              onPress={onDone}
              className="mt-6 rounded-2xl bg-white px-8 py-3.5"
            >
              <Text className="text-base font-semibold text-black">
                Finish
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Pressable
              testID="breath-session-exit"
              accessibilityRole="button"
              accessibilityLabel="Exit breath session"
              onPress={onExit}
              className="absolute right-5 top-5 h-10 w-10 items-center justify-center rounded-full bg-white/10"
            >
              <X size={18} color={BREATH_WHITE} />
            </Pressable>
            <Text className="text-xs font-semibold uppercase tracking-widest text-white/40">
              {protocol.name}
            </Text>
            <Text className="mt-1 text-sm text-white/60 mb-8">
              Round {round} of {protocol.rounds}
            </Text>

            <View className="h-44 w-44 items-center justify-center my-4">
              <Svg
                width={176}
                height={176}
                viewBox="0 0 100 100"
                style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}
              >
                <Circle
                  cx="50"
                  cy="50"
                  r={RING_R}
                  fill="none"
                  stroke={BREATH_WHITE_15}
                  strokeWidth="4"
                />
                <Circle
                  testID="breath-session-ring"
                  cx="50"
                  cy="50"
                  r={RING_R}
                  fill="none"
                  stroke={accent}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  strokeDashoffset={RING_C * (1 - progress)}
                />
              </Svg>
              <Text className="text-2xl font-bold text-white">
                {currentPhase?.label}
              </Text>
            </View>

            <Text className="mt-6 max-w-xs text-center text-sm text-white/60">
              {currentPhase?.instruction}
            </Text>
          </>
        )}
      </View>
    </RNModal>
  );
}

// ── Focus timer ───────────────────────────────────────────────────────────────

const FOCUS_DURATIONS = [
  { label: "5m", seconds: 5 * 60 },
  { label: "10m", seconds: 10 * 60 },
  { label: "25m", seconds: 25 * 60 },
  { label: "45m", seconds: 45 * 60 },
];

function FocusRow() {
  const { colors } = useThemeTokens();
  const accent = mindAccentColor("state-shift");
  const [selectedSeconds, setSelectedSeconds] = useState(25 * 60);
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            setRunning(false);
            setDone(true);
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const select = (s: number) => {
    setSelectedSeconds(s);
    setRemaining(s);
    setRunning(false);
    setDone(false);
  };

  const mins = Math.floor(remaining / 60)
    .toString()
    .padStart(2, "0");
  const secs = (remaining % 60).toString().padStart(2, "0");

  return (
    <View
      testID="mind-focus-mode"
      className="rounded-2xl border border-border bg-card p-4"
    >
      <View className="mb-2.5 flex-row items-center gap-1.5">
        <Timer size={14} color={accent} />
        <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Focus mode
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        <View className="flex-1 flex-row gap-1.5">
          {FOCUS_DURATIONS.map((d) => (
            <Pressable
              key={d.label}
              accessibilityRole="button"
              accessibilityLabel={`Focus for ${d.label}`}
              onPress={() => select(d.seconds)}
              disabled={running}
              className={`flex-1 rounded-xl py-2 items-center justify-center ${
                selectedSeconds === d.seconds
                  ? "bg-cyan-500"
                  : "bg-muted"
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  selectedSeconds === d.seconds
                    ? "text-white"
                    : "text-muted-foreground"
                }`}
              >
                {d.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className="flex-row items-center gap-1.5 shrink-0">
          {running || (remaining < selectedSeconds && !done) ? (
            <Text className="w-12 text-center text-sm font-bold tabular-nums text-foreground">
              {mins}:{secs}
            </Text>
          ) : null}

          {done ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset timer"
              onPress={() => select(selectedSeconds)}
              className="h-9 w-9 items-center justify-center rounded-xl bg-success/15"
            >
              <Check size={16} color={colors.success} strokeWidth={3} />
            </Pressable>
          ) : running ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pause focus timer"
              onPress={() => setRunning(false)}
              className="h-9 w-9 items-center justify-center rounded-xl bg-muted"
            >
              <Pause size={16} color={colors.foreground} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={remaining < selectedSeconds ? "Resume focus timer" : "Start focus timer"}
              onPress={() => {
                setDone(false);
                setRunning(true);
              }}
              className="h-9 flex-row items-center gap-1.5 rounded-xl bg-cyan-500 px-3"
            >
              <Play size={14} color={colors["primary-foreground"]} />
              <Text className="text-xs font-bold text-white">
                {remaining < selectedSeconds ? "Resume" : "Start"}
              </Text>
            </Pressable>
          )}

          {remaining < selectedSeconds && !running && !done ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset timer"
              onPress={() => {
                setRunning(false);
                setDone(false);
                setRemaining(selectedSeconds);
              }}
              className="h-9 w-9 items-center justify-center rounded-xl bg-muted"
            >
              <RotateCcw size={14} color={colors["muted-foreground"]} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ── Reset protocols ───────────────────────────────────────────────────────────

const RESET_FLOWS: {
  id: string;
  title: string;
  blurb: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  steps: GuidedStep[];
}[] = [
  {
    id: "name-next-action",
    title: "Name the Next Action",
    blurb: "What is the next action? Only that.",
    Icon: Focus,
    steps: [
      {
        title: "What’s weighing on you right now?",
        inputPrompt: "What’s weighing on you right now?",
        body: "Dump the whole thing here — the pile that’s scrambling your head.",
        placeholder: "e.g. Everything with the project feels behind",
      },
      {
        title: "The one next physical action.",
        inputPrompt: "The one next physical action.",
        body: "Not the plan — the single move you can make in the next 10 minutes.",
        placeholder: "e.g. Open the doc and write the first line",
      },
      {
        title: "Do only that.",
        body: "The rest waits. One action collapses the fog — the next one appears once you move.",
      },
    ],
  },
  {
    id: "act-or-react",
    title: "Act or React?",
    blurb: "Are you choosing — or just responding?",
    Icon: Activity,
    steps: [
      {
        title: "Right now — are you acting or reacting?",
        body: "Be honest. Reacting is running someone else’s script.",
        choices: ["Choosing", "Reacting", "Not sure"],
      },
      {
        title: "One conscious choice you can make.",
        inputPrompt: "One conscious choice you can make.",
        body: "Small is fine. It just has to be chosen, not automatic.",
        placeholder: "e.g. Put the phone in the other room",
      },
      {
        title: "Make it now.",
        body: "That’s the snap back — one deliberate move, and you’re driving again.",
      },
    ],
  },
  {
    id: "cut-the-noise",
    title: "Cut the Noise",
    blurb: "Silence is the sharpest tool.",
    Icon: VolumeX,
    steps: [
      {
        title: "Phone face down. Every tab closed.",
        body: "No input for the next minute. Nothing to react to.",
      },
      {
        title: "Sixty seconds of nothing.",
        body: "Set a timer if you need to. Just sit. Let the static settle.",
        scale: { min: 1, max: 5, minLabel: "Still buzzing", maxLabel: "Quiet" },
      },
      {
        title: "Now the one thing that matters.",
        body: "Head’s clearer. Move to it before the noise creeps back.",
      },
    ],
  },
  {
    id: "move-to-shift",
    title: "Move to Shift",
    blurb: "Move the body, move the mind.",
    Icon: Zap,
    steps: [
      {
        title: "You can’t feel low after you move.",
        body: "State follows the body faster than it follows thought. Let’s use that.",
      },
      {
        title: "Pick your move.",
        body: "One of these, right now — not later.",
        choices: [
          "10 push-ups",
          "10 jumping jacks",
          "Walk + 5 deep breaths",
          "Shoulders back, big chest breath ×5",
        ],
      },
      {
        title: "Go. Come back moved.",
        body: "Do it, then return. Notice your state is already different.",
      },
    ],
  },
  {
    id: "snap-out",
    title: "Snap Out of It",
    blurb: "This is a moment, not your identity.",
    Icon: Waves,
    steps: [
      {
        title: "This is a moment — not who you are.",
        body: "The feeling is weather, not the sky. It’s already moving through.",
      },
      {
        title: "What are you making it mean?",
        inputPrompt: "What are you making it mean?",
        body: "Name the story you’re attaching to the feeling. Seeing it loosens it.",
        placeholder: "e.g. That one bad session means I’m falling off",
      },
      {
        title: "Breathe it out — then choose.",
        body: "4 in, 4 hold, 4 out, three times. Say it once out loud: “This is a moment.” Then make your next move from the sky, not the weather.",
      },
    ],
  },
  {
    id: "protect-the-state",
    title: "Protect the State",
    blurb: "You’re dialed in — don’t waste it.",
    Icon: Focus,
    steps: [
      {
        title: "You’re locked in. This is rare fuel.",
        body: "This is the state everything gets built in. Spend it on purpose.",
      },
      {
        title: "What’s the one thing to attack now?",
        inputPrompt: "What’s the one thing to attack now?",
        body: "The highest-leverage thing your dialed-in self should hit while it lasts.",
        placeholder: "e.g. The workout, then the hard task I’ve been dodging",
      },
      {
        title: "Go — before it fades.",
        body: "Close this and pour the state straight into that. Momentum protects momentum.",
      },
    ],
  },
];

const UNLOCKABLE_RESETS = RESET_FLOWS.filter((f) => f.id !== "protect-the-state");

const STATES: {
  state: MindState;
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
  reset: { breath: string } | { flow: string };
}[] = [
  {
    state: "stressed",
    label: "Stressed",
    Icon: Waves,
    reset: { breath: "physiological" },
  },
  {
    state: "distracted",
    label: "Scattered",
    Icon: Focus,
    reset: { flow: "name-next-action" },
  },
  {
    state: "low_energy",
    label: "Drained",
    Icon: Zap,
    reset: { flow: "move-to-shift" },
  },
  {
    state: "locked_in",
    label: "Dialed in",
    Icon: Activity,
    reset: { flow: "protect-the-state" },
  },
];

export default function StateShiftDashboard() {
  // NP-299: the web colours this dashboard's icons in its own cyan everywhere
  // (hero, state tiles, breathwork/reset toolkit cards, the adaptive sparkle),
  // never the generic accent (amber) — see `mindAccentColor`'s own comment.
  const accent = mindAccentColor("state-shift");
  const { token } = useAuth();
  const [entries, setEntries] = useState<TrackRecordEntry[]>([]);
  const [reps, setReps] = useState<number | null>(null);
  const { unlocked: justUnlocked, dismiss: dismissUnlock } =
    useProtocolUnlocks(UNLOCKABLE_RESETS, reps);
  const [shifts, setShifts] = useState(0);
  const [lastState, setLastState] = useState<MindState | null>(null);
  const [lastFeeling, setLastFeeling] = useState<string | null>(null);
  const [flow, setFlow] = useState<{
    title: string;
    steps: GuidedStep[];
    aiGenerated?: boolean;
  } | null>(null);
  const [breath, setBreath] = useState<BreathProtocol | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sr, jr] = await Promise.allSettled([
        apiFetch("/api/mind/state", MindStateResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          tz: tzOffsetMinutes(),
        }),
        apiFetch("/api/mind/journal?system=state-shift&limit=8", MindJournalResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        }),
      ]);

      if (sr.status === "fulfilled") {
        const logs = sr.value.logs ?? [];
        setShifts(logs.length);
        if (logs[0]) {
          setLastState(logs[0].state as MindState);
          setLastFeeling(logs[0].feeling?.trim() || null);
        }
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
        body: {
          system: "state-shift",
          kind: "protocol",
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

  const openReset = (reset: { breath: string } | { flow: string }) => {
    if ("breath" in reset) {
      const p = BREATH.find((b) => b.id === reset.breath);
      if (p) setBreath(p);
    } else {
      const f = RESET_FLOWS.find((x) => x.id === reset.flow);
      if (f) setFlow({ title: f.title, steps: f.steps });
    }
  };

  const pickState = (s: (typeof STATES)[0]) => {
    setShifts((n) => n + 1);
    const previous = lastState;
    setLastState(s.state);
    setLastFeeling(s.label);

    void apiFetch("/api/mind/state", MindStateResponseSchema, {
      method: "POST",
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      body: {
        state: s.state,
        feeling: s.label,
        ...(previous ? { previousState: previous } : {}),
      },
      tz: tzOffsetMinutes(),
    }).catch(() => {});

    openReset(s.reset);
  };

  const runAiFlow = async (
    topic: string,
    fallback: (typeof RESET_FLOWS)[0],
  ) => {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const r = await runAiTask("/api/ai/mind/flow", {
        system: "state-shift",
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
      // fall through without error
    } finally {
      setAiLoading(false);
    }
    setFlow({ title: fallback.title, steps: fallback.steps });
  };

  const featured = dailyPick(RESET_FLOWS, 1);

  if (breath) {
    return (
      <BreathSession
        protocol={breath}
        onExit={() => setBreath(null)}
        onDone={() => {
          const name = breath.name;
          setBreath(null);
          void save(name, []);
        }}
      />
    );
  }

  if (flow) {
    return (
      <GuidedFlow
        title={flow.title}
        steps={flow.steps}
        accentColor={mindAccentColor("state-shift")}
        doneText={DONE_TEXT}
        onReflect={
          flow.aiGenerated
            ? undefined
            : (a) => reflectOnAnswers("State Shift reset", a)
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

  const lastLabel = lastState
    ? recentFeelingLabel(lastState, lastFeeling)
    : undefined;

  return (
    <View testID="state-shift-dashboard" className="gap-5">
      <ProtocolUnlockModal
        unlocked={justUnlocked}
        onDismiss={dismissUnlock}
        accentColor={accent}
      />

      <SystemHero
        Icon={Wind}
        title="State Shift"
        tagline="Snap back to now — shift your state"
        statValue={shifts}
        statLabel="shifts"
        colorClass="text-cyan-500"
        bgClass="border-cyan-500/30 bg-cyan-500/10"
        iconColor={accent}
      />

      {/* Where's your head right now? */}
      <View
        testID="mind-state-check"
        className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4"
      >
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-xs font-semibold uppercase tracking-widest text-cyan-500">
            Where’s your head right now?
          </Text>
          {lastLabel ? (
            <Text className="text-[11px] font-semibold text-muted-foreground">
              last: {lastLabel}
            </Text>
          ) : null}
        </View>

        <View className="flex-row flex-wrap gap-2">
          {STATES.map((s) => {
            const SIcon = s.Icon;
            return (
              <Pressable
                key={s.state}
                testID={`mind-state-tile-${s.state}`}
                accessibilityRole="button"
                onPress={() => pickState(s)}
                className="w-[48%] flex-row items-center gap-2.5 rounded-xl border border-border bg-card p-3 active:opacity-80"
              >
                <View className="h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15">
                  <SIcon size={16} color={accent} />
                </View>
                <Text className="text-sm font-semibold text-foreground">
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text className="mt-2 text-[11px] text-muted-foreground">
          Name it and we’ll take you straight into the reset that fits.
        </Text>
      </View>

      {/* Today's adaptive session */}
      <AdaptiveSession
        loading={aiLoading}
        onStart={() =>
          runAiFlow(
            "shift my current state right now",
            featured ?? RESET_FLOWS[0]!,
          )
        }
        colorClass="text-cyan-500"
        bgClass="border-cyan-500/30 bg-cyan-500/10"
        iconColor={accent}
        subtitle="A reset shaped by your recent state check-ins and reflections."
      />

      {/* Guided breathwork */}
      <View>
        <Text className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Guided breathwork
        </Text>
        <View className="gap-2">
          {BREATH.map((b) => (
            <ToolkitCard
              key={b.id}
              Icon={Wind}
              title={b.name}
              blurb={`${b.rounds} rounds · ${b.bestFor}`}
              colorClass="text-cyan-500"
              iconColor={accent}
              onClick={() => setBreath(b)}
            />
          ))}
        </View>
      </View>

      {/* Focus mode */}
      <FocusRow />

      {/* Reset protocols */}
      <View>
        <Text className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Reset protocols
        </Text>
        <View className="gap-2">
          {UNLOCKABLE_RESETS.map((f, i) => (
            <ToolkitCard
              key={f.id}
              Icon={f.Icon}
              title={f.title}
              blurb={f.blurb}
              colorClass="text-cyan-500"
              iconColor={accent}
              locked={i >= 1 + (reps ?? 0)}
              lockedHint={`Locked — do ${i - (reps ?? 0)} more rep${
                i - (reps ?? 0) === 1 ? "" : "s"
              } in State Shift to unlock`}
              onClick={() => setFlow({ title: f.title, steps: f.steps })}
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
