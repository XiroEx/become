import { createElement, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";
import {
  Angry,
  ArrowRight,
  BatteryLow,
  BatteryWarning,
  CloudFog,
  CloudLightning,
  CloudOff,
  CloudRain,
  Flame,
  Frown,
  Heart,
  Layers,
  Leaf,
  Meh,
  Moon,
  RotateCcw,
  Rocket,
  Shuffle,
  Target,
  Waves,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react-native";
import {
  apiFetch,
  MindStateLogResponseSchema,
  MindStateResponseSchema,
} from "@become/api-client";
import {
  feelingOrderForMood,
  isMoodLevel,
  moodOpenerLine,
  recentFeelingLabel,
  type MindState,
  type TodayMood,
} from "@become/core";
import { Text } from "@/components/Text";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";
import { announce } from "@/lib/a11y/announce";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import type { TokenName } from "@/lib/theme/tokens";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * The state check — the opening move, ported from
 * `webapp/components/mind/session/scenes/StateCheckScene.tsx` (NP-098).
 *
 * Three paths, exactly the web's:
 *  • First run (or no check-in in the last four hours): the 20-feeling grid,
 *    each feeling mapped to one of the four canonical states, logged through
 *    `POST /api/mind/state`, then a reveal built from the server's rotating
 *    recommendation (with the web's per-state fallback line).
 *  • A check-in within the window: the "Welcome back" opener — one tap to pick
 *    up with the word they actually used last time, so nothing is re-logged and
 *    no XP is spammed — or "I'm feeling different" to re-check.
 *  • A re-check that LANDS ON A DIFFERENT STATE: "What changed?" first, so the
 *    note and `previousState` travel with the log.
 *
 * It reports the state up through `onState` BEFORE the POST resolves, because
 * that is what re-opens the session (`SessionPlayer`'s `realignOpening`) and the
 * member should not wait on the network to see the session respond.
 */

/** Within this window of your last check-in, a new session skips the full grid. */
const RECENT_WINDOW_MS = 4 * 60 * 60 * 1000;

/**
 * The per-state tint, as TOKENS rather than the web's `text-red-300` /
 * `text-blue-300` (NP-123: a colour here follows the system light/dark setting).
 * `low_energy` is the one the palette cannot say — there is no blue token, and
 * zinc/red/amber/green is deliberately the whole set — so it takes the muted
 * foreground, which reads as the "flat" end of the spectrum in both modes.
 */
const TINT: Record<MindState, TokenName> = {
  stressed: "destructive",
  distracted: "accent",
  low_energy: "muted-foreground",
  locked_in: "success",
};

const TINT_CLASS: Record<MindState, string> = {
  stressed: "text-destructive",
  distracted: "text-accent",
  low_energy: "text-muted-foreground",
  locked_in: "text-success",
};

/** Canonical per-state meta for the "welcome back" opener. */
const STATE_META: Record<MindState, { label: string; Icon: LucideIcon }> = {
  stressed: { label: "stressed", Icon: CloudRain },
  distracted: { label: "distracted", Icon: Waves },
  low_energy: { label: "low energy", Icon: BatteryLow },
  locked_in: { label: "locked in", Icon: Target },
};

/**
 * 20 feelings, each mapped to a canonical state — the web's list, in the web's
 * order (a spectrum from green through blue and amber to red).
 */
export const FEELINGS: { label: string; value: MindState; Icon: LucideIcon }[] = [
  { label: "Locked in", value: "locked_in", Icon: Target },
  { label: "Energized", value: "locked_in", Icon: Zap },
  { label: "Motivated", value: "locked_in", Icon: Rocket },
  { label: "Calm", value: "locked_in", Icon: Leaf },
  { label: "Grateful", value: "locked_in", Icon: Heart },
  { label: "Low energy", value: "low_energy", Icon: BatteryLow },
  { label: "Tired", value: "low_energy", Icon: Moon },
  { label: "Drained", value: "low_energy", Icon: BatteryWarning },
  { label: "Unmotivated", value: "low_energy", Icon: CloudOff },
  { label: "Down", value: "low_energy", Icon: Frown },
  { label: "Distracted", value: "distracted", Icon: Waves },
  { label: "Scattered", value: "distracted", Icon: Shuffle },
  { label: "Restless", value: "distracted", Icon: Wind },
  { label: "Foggy", value: "distracted", Icon: CloudFog },
  { label: "Bored", value: "distracted", Icon: Meh },
  { label: "Stressed", value: "stressed", Icon: CloudRain },
  { label: "Anxious", value: "stressed", Icon: CloudLightning },
  { label: "Overwhelmed", value: "stressed", Icon: Layers },
  { label: "Frustrated", value: "stressed", Icon: Flame },
  { label: "Angry", value: "stressed", Icon: Angry },
];

/** The grid, with the bucket that matches today's dashboard mood first. */
export function orderedFeelings(mood: TodayMood | null): typeof FEELINGS {
  const order = feelingOrderForMood(mood ? mood.value : null);
  const rank = new Map(order.map((st, i) => [st, i]));
  return [...FEELINGS].sort(
    (a, b) => (rank.get(a.value) ?? 9) - (rank.get(b.value) ?? 9),
  );
}

/** The optimistic reveal line, replaced by the server's when it answers. */
const FALLBACK_MESSAGES: Record<MindState, string> = {
  stressed: "Noticing it is the first move. Let's bring the system down a notch.",
  distracted: "The scatter is normal. We'll pull the focus back to one point.",
  low_energy: "Low is data, not destiny. A little input changes the output.",
  locked_in: "This is the state to protect. Let's pour into it.",
};

/** The icon for a past check-in — the specific feeling's, when we know it. */
function recentIcon(state: MindState, feeling: string | null): LucideIcon {
  const match = feeling ? FEELINGS.find((f) => f.label === feeling) : undefined;
  return match?.Icon ?? STATE_META[state].Icon;
}

/** `Low energy` → `low-energy`, so a test can tap a feeling by name. */
export function feelingTestId(label: string): string {
  return label.toLowerCase().replace(/\s+/g, "-");
}

export function StateCheckScene({
  move,
  onDone,
  onState,
  preview = false,
  testID = "mind-state-check",
}: MindSceneProps) {
  const { colors } = useThemeTokens();
  const { token } = useAuth();

  const [chosen, setChosen] = useState<MindState | null>(null);
  const [other, setOther] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Supplementary-run state.
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [recent, setRecent] = useState<MindState | null>(null);
  // The exact word they tapped last time ("Scattered"), not the bucket it falls
  // into: twenty feelings collapse onto four states, so reading the state back
  // sounds as though the app misheard them.
  const [recentFeeling, setRecentFeeling] = useState<string | null>(null);
  // The dashboard's 1–5 mood from earlier today, when there is one. Not a Mind
  // state — the opener just reads it back and puts the matching feelings first.
  const [todayMood, setTodayMood] = useState<TodayMood | null>(null);
  const [recheck, setRecheck] = useState(false);
  // Re-check that changed state → capture "what changed?".
  const [pendingState, setPendingState] = useState<MindState | null>(null);
  const [pendingFeeling, setPendingFeeling] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // Look for a recent check-in to decide between the full grid and the quick
  // opener. `tz` is appended by the shared client from the device clock.
  useEffect(() => {
    let cancelled = false;
    const read = async (): Promise<void> => {
      try {
        const data = await apiFetch("/api/mind/state", MindStateResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        });
        if (cancelled) return;
        const mood = data.todayMood;
        if (mood && isMoodLevel(mood.value)) {
          setTodayMood({ value: mood.value, label: mood.label, at: mood.at });
        }
        const last = data.logs?.[0];
        if (
          last &&
          Date.now() - new Date(last.timestamp).getTime() < RECENT_WINDOW_MS
        ) {
          setRecent(last.state);
          setRecentFeeling(last.feeling?.trim() ? last.feeling.trim() : null);
        }
      } catch {
        /* no recent check-in → the full grid */
      } finally {
        if (!cancelled) setLoadingRecent(false);
      }
    };
    void read();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const pickOther = () => {
    if (chosen || other) return;
    setOther(true);
    setMessage("That's okay — you don't have to name it. Let's just begin.");
    onState?.("distracted", "Not sure");
  };

  /** Quick path: reuse the recent state, no re-logging (no mood / XP spam). */
  const resumeRecent = () => {
    if (!recent) return;
    // Hand the rest of the session the word they actually picked, so the whole
    // run keeps speaking their language rather than the bucket's.
    onState?.(recent, recentFeelingLabel(recent, recentFeeling));
    onDone();
  };

  const submitState = async (
    state: MindState,
    opts?: { note?: string; previousState?: MindState; feeling?: string },
  ): Promise<void> => {
    setChosen(state);
    setPendingState(null); // clear the "what changed?" gate so the reveal shows
    onState?.(state, opts?.feeling);
    const optimistic = FALLBACK_MESSAGES[state];
    setMessage(optimistic);
    announce(optimistic);
    if (preview) return; // admin lab / dry run: don't log state or grant XP
    try {
      const data = await apiFetch(
        "/api/mind/state",
        MindStateLogResponseSchema,
        {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          method: "POST",
          body: {
            state,
            // The word they actually tapped. Sending only the state is why
            // picking "Grateful" used to get the same reply as "Locked in".
            ...(opts?.feeling ? { feeling: opts.feeling } : {}),
            ...(opts?.note ? { note: opts.note } : {}),
            ...(opts?.previousState ? { previousState: opts.previousState } : {}),
          },
        },
      );
      if (data.recommendation?.message) setMessage(data.recommendation.message);
    } catch {
      /* keep the fallback line */
    }
  };

  const pick = (state: MindState, feeling: string) => {
    if (chosen || other || pendingState) return;
    setPendingFeeling(feeling);
    // A re-check that actually changed the state → ask what changed first.
    if (recheck && recent && state !== recent) {
      setPendingState(state);
      return;
    }
    void submitState(state, { feeling });
  };

  const submitNote = () => {
    if (!pendingState) return;
    void submitState(pendingState, {
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(recent ? { previousState: recent } : {}),
      ...(pendingFeeling ? { feeling: pendingFeeling } : {}),
    });
  };

  const showOpener =
    !chosen && !other && !recheck && !pendingState && recent !== null;

  // ── Loading (deciding between the opener and the grid) ──
  if (loadingRecent && !chosen && !other) {
    return (
      <View
        testID={`${testID}-loading`}
        className="flex-1 items-center justify-center"
      >
        <ActivityIndicator color={colors["muted-foreground"]} />
      </View>
    );
  }

  // ── Supplementary "welcome back" opener ──
  if (showOpener && recent) {
    const OpenerIcon = recentIcon(recent, recentFeeling);
    return (
      <View
        testID={`${testID}-opener`}
        className="flex-1 items-center justify-center px-6"
      >
        <View className="mb-5 h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card">
          {/* `createElement` and not `<OpenerIcon />`: which lucide icon this is
              is decided by the feeling they tapped, and the React compiler reads
              a JSX tag resolved at render time as a component defined during
              render (it would remount on every keystroke if it were one). */}
          {createElement(OpenerIcon, {
            size: 32,
            color: colors[TINT[recent]],
          })}
        </View>
        <Text className="text-2xl font-extrabold text-foreground">
          Welcome back
        </Text>
        <Text className="mt-2 max-w-xs text-center text-muted-foreground">
          Last check-in:{" "}
          <Text className="font-semibold text-foreground">
            {recentFeelingLabel(recent, recentFeeling)}
          </Text>
          . Pick up where you left off?
        </Text>
        <Pressable
          testID={`${testID}-resume`}
          accessibilityRole="button"
          accessibilityLabel="Let's go"
          onPress={resumeRecent}
          style={minTouchTarget}
          className="mt-9 w-full max-w-xs flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-4"
        >
          <Text className="text-base font-bold text-primary-foreground">
            Let&apos;s go
          </Text>
          <ArrowRight size={20} color={colors["primary-foreground"]} />
        </Pressable>
        <Pressable
          testID={`${testID}-recheck`}
          accessibilityRole="button"
          accessibilityLabel="I'm feeling different"
          onPress={() => setRecheck(true)}
          style={minTouchTarget}
          className="mt-3 flex-row items-center justify-center gap-1.5"
        >
          <RotateCcw size={16} color={colors["muted-foreground"]} />
          <Text className="text-sm font-medium text-muted-foreground">
            I&apos;m feeling different
          </Text>
        </Pressable>
      </View>
    );
  }

  // ── "What changed?" (the state changed on a re-check) ──
  if (pendingState) {
    return (
      <ScrollView
        testID={`${testID}-note`}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
          paddingVertical: 32,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Both ends named by the feeling actually chosen — "Scattered →
            Drained" is the shift they made; "distracted → low energy" is not
            something either of them said. */}
        <Text className="text-xs uppercase tracking-widest text-muted-foreground">
          {recent ? `${recentFeelingLabel(recent, recentFeeling)} → ` : ""}
          {pendingFeeling || STATE_META[pendingState].label}
        </Text>
        <Text className="mt-3 text-2xl font-extrabold text-foreground">
          What changed?
        </Text>
        <Text className="mt-2 max-w-xs text-center text-muted-foreground">
          A quick note on what shifted since earlier.
        </Text>
        <TextInput
          testID={`${testID}-note-input`}
          accessibilityLabel="What changed since earlier?"
          value={note}
          onChangeText={setNote}
          multiline
          placeholder="e.g. wrapped a hard call, hit the gym, bad news…"
          placeholderTextColor={colors["muted-foreground"]}
          className="mt-6 w-full max-w-sm rounded-2xl border border-border bg-card p-4 text-center text-base text-foreground"
          style={{ minHeight: 96 }}
        />
        <Pressable
          testID={`${testID}-note-continue`}
          accessibilityRole="button"
          accessibilityLabel="Continue"
          onPress={submitNote}
          style={minTouchTarget}
          className="mt-6 w-full max-w-xs flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-4"
        >
          <Text className="text-base font-bold text-primary-foreground">
            Continue
          </Text>
          <ArrowRight size={20} color={colors["primary-foreground"]} />
        </Pressable>
        <Pressable
          testID={`${testID}-note-skip`}
          accessibilityRole="button"
          accessibilityLabel="Skip the note"
          onPress={() =>
            void submitState(pendingState, {
              ...(pendingFeeling ? { feeling: pendingFeeling } : {}),
            })
          }
          style={minTouchTarget}
          className="mt-3 items-center justify-center"
        >
          <Text className="text-sm font-medium text-muted-foreground">Skip</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // ── The full grid (first run / re-check) ──
  if (!chosen && !other) {
    return (
      <ScrollView
        testID={`${testID}-grid`}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: 24,
          paddingVertical: 32,
        }}
      >
        <View className="mx-auto w-full max-w-sm">
          <Text className="text-center text-2xl font-extrabold text-foreground">
            {move.title}
          </Text>
          {todayMood && !recheck ? (
            <Text
              testID={`${testID}-mood-opener`}
              className="mt-2 text-center text-muted-foreground"
            >
              {moodOpenerLine(todayMood)}{" "}
              <Text className="text-foreground">Which of these is closest?</Text>
            </Text>
          ) : move.subtitle ? (
            <Text className="mt-2 text-center text-muted-foreground">
              {move.subtitle}
            </Text>
          ) : null}
          <View className="mt-6 flex-row flex-wrap justify-between">
            {orderedFeelings(todayMood).map(({ label, value, Icon }) => (
              <Pressable
                key={label}
                testID={`${testID}-feeling-${feelingTestId(label)}`}
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => pick(value, label)}
                className="mb-2.5 items-center justify-center gap-2 rounded-2xl border border-border bg-card py-4"
                style={{ width: "48.5%", ...minTouchTarget }}
              >
                <Icon size={24} color={colors[TINT[value]]} />
                <Text className={`text-xs font-semibold ${TINT_CLASS[value]}`}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            testID={`${testID}-other`}
            accessibilityRole="button"
            accessibilityLabel="Something else or not sure"
            onPress={pickOther}
            style={minTouchTarget}
            className="mt-4 items-center justify-center"
          >
            <Text className="text-sm font-medium text-muted-foreground">
              Something else / not sure
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  // ── Reveal ──
  return (
    <View
      testID={`${testID}-reveal`}
      accessibilityLiveRegion="polite"
      className="flex-1 items-center justify-center px-6"
    >
      <Text className="text-xs uppercase tracking-widest text-muted-foreground">
        Noted
      </Text>
      <Text
        testID={`${testID}-message`}
        className="mt-4 max-w-sm text-center text-xl font-semibold leading-relaxed text-foreground"
      >
        {message}
      </Text>
      <Pressable
        testID={`${testID}-continue`}
        accessibilityRole="button"
        accessibilityLabel="Continue"
        onPress={() => onDone()}
        style={minTouchTarget}
        className="mt-10 w-full max-w-xs flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-4"
      >
        <Text className="text-base font-bold text-primary-foreground">
          Continue
        </Text>
        <ArrowRight size={20} color={colors["primary-foreground"]} />
      </Pressable>
    </View>
  );
}

export default StateCheckScene;
