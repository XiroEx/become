import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  Eye,
  Minus,
  Pause,
  Play,
  RotateCcw,
  Wind,
  type LucideIcon,
} from "lucide-react-native";
import { BREATH_PROTOCOLS, type BreathPhase } from "@become/core";
import { Text } from "@/components/Text";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { lightHaptic, type HapticFn } from "@/lib/feedback/haptics";
import type { TokenName } from "@/lib/theme/tokens";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * The breath pacer, ported from
 * `webapp/components/mind/session/scenes/BreathScene.tsx` (NP-098).
 *
 * THE TIMING IS THE PROTOCOL'S, AND THE PROTOCOL IS THE WEB'S. Every phase
 * label, every `durationMs` and every round count comes from `BREATH_PROTOCOLS`
 * in `@become/core` — the vendored copy of `webapp/lib/mind/moves.ts` (NP-062) —
 * and the player has already resolved which protocol this is from the live
 * check-in (`breathForState`), so the same answer gets the same breathing on
 * both clients. Nothing about a protocol is written down twice.
 *
 * Two screens, as on the web:
 *  • Ready: the name, what it is for, the description, the phase rhythm as
 *    pills, the round count, then Start / Preview one round / Skip.
 *  • Running: round N of M, the phase, a countdown, the instruction, a ring that
 *    sweeps the phase (so a hold never looks frozen), Pause/Resume, Restart and
 *    Skip — then the completion beat, which hands over after 1.9s.
 *
 * What native adds: ONE LIGHT HAPTIC PER PHASE CHANGE. A browser cannot ask for
 * one; a phone can, and with your eyes shut the tap is the instruction.
 */

const SMALL = 0.55;
const LARGE = 1;
const RING_R = 46;
const RING_C = 2 * Math.PI * RING_R;
/** How often the countdown + ring are recomputed while a phase runs. */
export const BREATH_TICK_MS = 100;
/** The completion beat, before the player is handed back (the web's number). */
export const BREATH_DONE_HOLD_MS = 1900;

type Mode = "ready" | "preview" | "run";
type Kind = "in" | "out" | "hold";

/** Inhale / exhale / hold, read off the protocol's own label (the web's rule). */
export function kindOf(label: string): Kind {
  if (/inhale/i.test(label)) return "in";
  if (/exhale/i.test(label)) return "out";
  return "hold";
}

/**
 * Per-phase visual language. The web's violet / blue / green becomes
 * primary / muted / success, because a colour in native comes from a token so it
 * can follow the system light-dark setting (NP-123).
 */
const PHASE_STYLE: Record<Kind, { token: TokenName; chip: string; Icon: LucideIcon }> = {
  in: { token: "primary", chip: "text-primary", Icon: ArrowUp },
  hold: { token: "muted-foreground", chip: "text-muted-foreground", Icon: Minus },
  out: { token: "success", chip: "text-success", Icon: ArrowDown },
};

/** `2200` → `2.2s`, `4000` → `4s` — the web's `secs()`. */
export function secs(ms: number): string {
  const s = ms / 1000;
  return Number.isInteger(s) ? `${s}s` : `${s.toFixed(1)}s`;
}

export interface BreathSceneProps extends MindSceneProps {
  /** Injectable so a test can assert the per-phase tap without a haptics engine. */
  haptic?: HapticFn;
}

export function BreathScene({
  protocol,
  onDone,
  haptic = lightHaptic,
  testID = "mind-breath",
}: BreathSceneProps) {
  const { colors } = useThemeTokens();
  const reduce = useReducedMotion();
  // The web's fallback when a protocol somehow fails to resolve.
  const p = protocol ?? BREATH_PROTOCOLS.sigh!;

  const [mode, setMode] = useState<Mode>("ready");
  const [paused, setPaused] = useState(false);
  const [round, setRound] = useState(1);
  const [phaseIdx, setPhaseIdx] = useState(0);
  /**
   * Milliseconds into the current phase — the clock for the countdown and the
   * ring — tagged with the phase INSTANCE (`beat`) it is counting.
   *
   * The tag is not decoration: the stepper's timeout and this clock's interval
   * both come due on the millisecond a phase ends, so the last tick of the
   * OUTGOING phase lands after the incoming one has already started and used to
   * be counted against it. One tick is 100ms of silent drift per phase.
   */
  const [clock, setClock] = useState<{ beat: number; ms: number }>({
    beat: 0,
    ms: 0,
  });
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);

  const isPreview = mode === "preview";
  const phase: BreathPhase =
    p.phases[phaseIdx] ?? p.phases[0] ?? { label: "Breathe", durationMs: 4000, instruction: "" };
  const kind = kindOf(phase.label);
  const style = PHASE_STYLE[kind];

  /**
   * The orb size per phase: big once an inhale has happened, small after an
   * exhale, and a hold keeps whatever the phase before it left — the web's
   * `phaseScales`, expressed as a lookup backwards rather than a running
   * variable (the React compiler forbids reassigning one across a render).
   */
  const phaseScales = useMemo(
    () =>
      p.phases.map((_ph, i) => {
        const last = p.phases
          .slice(0, i + 1)
          .reverse()
          .find((ph) => /inhale|exhale/i.test(ph.label));
        return last && /inhale/i.test(last.label) ? LARGE : SMALL;
      }),
    [p],
  );

  // `useState` and not `useRef`: a ref may not be READ during render, and the
  // value has to be handed to the orb's style on every one of them.
  const [orbScale] = useState(() => new Animated.Value(SMALL));

  /** Start the clock over on a NEW beat, so the outgoing phase's last tick is ignored. */
  const restartClock = () => setClock((c) => ({ beat: c.beat + 1, ms: 0 }));

  const begin = (m: "preview" | "run") => {
    setRound(1);
    setPhaseIdx(0);
    restartClock();
    setPaused(false);
    setDone(false);
    doneRef.current = false;
    setMode(m);
  };

  const backToReady = () => {
    setMode("ready");
    setRound(1);
    setPhaseIdx(0);
    restartClock();
    setPaused(false);
  };

  /**
   * One phase done. Identical to the web's stepper: walk the phases, then the
   * rounds, then finish (a preview is one round and returns to the ready card).
   */
  const advance = () => {
    restartClock();
    const lastPhase = phaseIdx >= p.phases.length - 1;
    if (!lastPhase) {
      setPhaseIdx((i) => i + 1);
      return;
    }
    const totalRounds = isPreview ? 1 : p.rounds;
    if (round < totalRounds) {
      setRound((r) => r + 1);
      setPhaseIdx(0);
    } else if (isPreview) {
      backToReady();
    } else {
      setDone(true);
    }
  };

  // Phase stepper — the protocol's own `durationMs` is the only timing there is.
  useEffect(() => {
    if (mode === "ready" || paused || done) return;
    const t = setTimeout(advance, phase.durationMs);
    return () => clearTimeout(t);
    // `advance` closes over the phase/round it was built for; re-created each
    // time one of those changes, which is exactly when the timer is re-armed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isPreview, paused, phaseIdx, round, clock.beat, phase.durationMs, p.phases.length, p.rounds, done]);

  // The in-phase clock, so a 7-second hold keeps moving rather than freezing.
  useEffect(() => {
    if (mode === "ready" || paused || done) return;
    const beat = clock.beat;
    const id = setInterval(() => {
      setClock((c) =>
        c.beat === beat
          ? { beat, ms: Math.min(phase.durationMs, c.ms + BREATH_TICK_MS) }
          : c,
      );
    }, BREATH_TICK_MS);
    return () => clearInterval(id);
  }, [mode, paused, clock.beat, phase.durationMs, done]);

  // One light tap per phase change (and on start / resume), which is the
  // instruction for anyone breathing with their eyes shut.
  useEffect(() => {
    if (mode === "ready" || paused || done) return;
    haptic();
  }, [mode, paused, clock.beat, done, haptic]);

  // The orb breathes with the phase: the animation lasts exactly as long as the
  // phase does, and Reduce Motion turns it into a cut rather than a crawl.
  useEffect(() => {
    if (mode === "ready" || done) {
      orbScale.setValue(SMALL);
      return;
    }
    const target = phaseScales[phaseIdx] ?? SMALL;
    if (reduce || paused) {
      orbScale.setValue(target);
      return;
    }
    const animation = Animated.timing(orbScale, {
      toValue: target,
      duration: phase.durationMs,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [mode, done, paused, reduce, phaseIdx, phaseScales, phase.durationMs, orbScale]);

  // Finish shortly after the last real round, so the completion beat lands.
  useEffect(() => {
    if (!done || doneRef.current) return;
    doneRef.current = true;
    const t = setTimeout(onDone, BREATH_DONE_HOLD_MS);
    return () => clearTimeout(t);
  }, [done, onDone]);

  const elapsed = clock.ms;
  const progress = Math.min(1, elapsed / phase.durationMs);
  const secondsLeft = Math.max(
    1,
    Math.ceil((phase.durationMs - elapsed) / 1000),
  );

  // ── Ready / "get ready" ──
  if (mode === "ready") {
    return (
      <ScrollView
        testID={`${testID}-ready`}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: 24,
          paddingVertical: 32,
        }}
      >
        <View className="mx-auto w-full max-w-sm items-center">
          <View className="mb-5 h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Wind size={28} color={colors.foreground} />
          </View>
          <Text
            testID={`${testID}-name`}
            className="text-center text-3xl font-extrabold text-foreground"
          >
            {p.name}
          </Text>
          <View className="mt-2 rounded-full bg-muted px-3 py-1">
            <Text className="text-xs font-semibold text-muted-foreground">
              {p.bestFor}
            </Text>
          </View>
          <Text className="mt-4 text-center text-sm leading-relaxed text-muted-foreground">
            {p.description}
          </Text>

          {/* Phase rhythm breakdown — the protocol, read out loud. */}
          <View className="mt-6 flex-row flex-wrap justify-center gap-2">
            {p.phases.map((ph, i) => {
              const st = PHASE_STYLE[kindOf(ph.label)];
              const PIcon = st.Icon;
              return (
                <View
                  key={`${ph.label}-${i}`}
                  testID={`${testID}-phase-pill-${i}`}
                  className="flex-row items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5"
                >
                  <PIcon size={14} color={colors[st.token]} />
                  <Text className="text-xs font-medium text-foreground">
                    {ph.label} · {secs(ph.durationMs)}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text
            testID={`${testID}-rounds`}
            className="mt-3 text-xs uppercase tracking-widest text-muted-foreground"
          >
            {p.rounds} rounds
          </Text>

          <Pressable
            testID={`${testID}-start`}
            accessibilityRole="button"
            accessibilityLabel="Start"
            onPress={() => begin("run")}
            style={minTouchTarget}
            className="mt-8 w-full flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-4"
          >
            <Play size={20} color={colors["primary-foreground"]} />
            <Text className="text-base font-bold text-primary-foreground">
              Start
            </Text>
          </Pressable>
          <Pressable
            testID={`${testID}-preview`}
            accessibilityRole="button"
            accessibilityLabel="Preview one round"
            onPress={() => begin("preview")}
            style={minTouchTarget}
            className="mt-3 w-full flex-row items-center justify-center gap-2 rounded-2xl border border-border py-3"
          >
            <Eye size={16} color={colors.foreground} />
            <Text className="text-sm font-semibold text-foreground">
              Preview one round
            </Text>
          </Pressable>
          <Pressable
            testID={`${testID}-skip`}
            accessibilityRole="button"
            accessibilityLabel="Skip the breathing"
            onPress={() => onDone()}
            style={minTouchTarget}
            className="mt-3 items-center justify-center"
          >
            <Text className="text-sm font-medium text-muted-foreground">Skip</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  // ── Running ──
  return (
    <View testID={`${testID}-run`} className="flex-1 items-center px-6">
      {/* Header — anchored just above the orb, so the orb sits at the true
          vertical centre of the stage. */}
      <View className="flex-1 items-center justify-end pb-8">
        <Text className="text-xs uppercase tracking-widest text-muted-foreground">
          {p.name}
        </Text>
        <Text
          testID={`${testID}-round`}
          className="mt-1 text-sm text-muted-foreground"
        >
          {isPreview
            ? "Preview"
            : done
              ? `${p.rounds} rounds complete`
              : `Round ${round} of ${p.rounds}`}
        </Text>
      </View>

      {/* Orb / completion visual */}
      <View className="h-72 w-72 items-center justify-center">
        {done ? (
          <View testID={`${testID}-done`} className="items-center justify-center">
            <View className="h-36 w-36 items-center justify-center rounded-full border border-success bg-muted">
              <Check size={64} color={colors.success} />
            </View>
            <Text className="mt-4 text-lg font-bold text-foreground">Nice.</Text>
          </View>
        ) : (
          <>
            {/* Breathing orb (grows on an inhale, holds steady on a hold) */}
            <Animated.View
              accessible={false}
              importantForAccessibility="no"
              style={{
                position: "absolute",
                height: 224,
                width: 224,
                borderRadius: 112,
                backgroundColor: colors.muted,
                transform: [{ scale: orbScale }],
              }}
            />

            {/* Progress ring — sweeps the current phase, holds included */}
            <Svg
              width={288}
              height={288}
              viewBox="0 0 100 100"
              style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}
            >
              <Circle
                cx="50"
                cy="50"
                r={RING_R}
                fill="none"
                stroke={colors.border}
                strokeWidth="2.5"
              />
              <Circle
                testID={`${testID}-ring`}
                cx="50"
                cy="50"
                r={RING_R}
                fill="none"
                stroke={colors[style.token]}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - (paused ? 0 : progress))}
              />
            </Svg>

            {/* Centre text */}
            <View className="items-center">
              <Text
                testID={`${testID}-phase`}
                className={`text-2xl font-bold ${paused ? "text-muted-foreground" : style.chip}`}
              >
                {paused ? "Paused" : phase.label}
              </Text>
              {!paused ? (
                <>
                  <Text
                    testID={`${testID}-countdown`}
                    className="mt-1 text-3xl font-extrabold text-foreground"
                  >
                    {secondsLeft}
                  </Text>
                  <Text
                    style={{ maxWidth: 160 }}
                    className="mt-1 text-center text-xs text-muted-foreground"
                  >
                    {phase.instruction}
                  </Text>
                </>
              ) : null}
            </View>
          </>
        )}
      </View>

      {/* Controls — anchored just below the orb */}
      <View className="flex-1 items-center justify-start pt-8">
        {!done ? (
          <View className="w-full items-center gap-3">
            <View className="flex-row items-center justify-center gap-3">
              <Pressable
                testID={`${testID}-pause`}
                accessibilityRole="button"
                accessibilityLabel={paused ? "Resume" : "Pause"}
                onPress={() => {
                  // Resuming restarts the phase it was paused in, which is what
                  // the web does too (its stepper re-arms on the same change).
                  if (paused) restartClock();
                  setPaused((v) => !v);
                }}
                style={minTouchTarget}
                className="flex-row items-center justify-center gap-1.5 rounded-full bg-muted px-4 py-2"
              >
                {paused ? (
                  <Play size={16} color={colors.foreground} />
                ) : (
                  <Pause size={16} color={colors.foreground} />
                )}
                <Text className="text-sm font-medium text-foreground">
                  {paused ? "Resume" : "Pause"}
                </Text>
              </Pressable>
              <Pressable
                testID={`${testID}-restart`}
                accessibilityRole="button"
                accessibilityLabel="Restart"
                onPress={() => begin(isPreview ? "preview" : "run")}
                style={minTouchTarget}
                className="flex-row items-center justify-center gap-1.5 rounded-full bg-muted px-4 py-2"
              >
                <RotateCcw size={16} color={colors.foreground} />
                <Text className="text-sm font-medium text-foreground">
                  Restart
                </Text>
              </Pressable>
            </View>
            {isPreview ? (
              <Pressable
                testID={`${testID}-back`}
                accessibilityRole="button"
                accessibilityLabel="Back to the breathing details"
                onPress={backToReady}
                style={minTouchTarget}
                className="items-center justify-center"
              >
                <Text className="text-sm font-medium text-muted-foreground">
                  Back
                </Text>
              </Pressable>
            ) : (
              <Pressable
                testID={`${testID}-skip-running`}
                accessibilityRole="button"
                accessibilityLabel="Skip the breathing"
                onPress={() => onDone()}
                style={minTouchTarget}
                className="flex-row items-center justify-center gap-1"
              >
                <Text className="text-sm font-medium text-muted-foreground">
                  Skip
                </Text>
                <ArrowRight size={16} color={colors["muted-foreground"]} />
              </Pressable>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default BreathScene;
