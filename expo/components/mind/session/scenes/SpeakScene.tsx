import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Check, Mic } from "lucide-react-native";
import { Text } from "@/components/Text";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";
import { affirmLine } from "@/components/mind/session/scenes/HoldToAffirmScene";
import { WriteAffirm } from "@/components/mind/session/scenes/WriteAffirm";
import { useSpeechMatch } from "@/hooks/useSpeechMatch";
import { lightHaptic, type HapticFn } from "@/lib/feedback/haptics";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * SPEAK SCENE (NP-099)
 *
 * Say the declaration out loud and watch it come true on screen.
 * Uses live speech recognition (expo-speech-recognition via useSpeechMatch):
 * words light up optimistically as you speak, and it locks in once you've said
 * enough (PASS = 0.85).
 *
 * Where speech is unsupported or the mic is blocked, it degrades to a 2600ms
 * hold-while-you-say-it ring. "Lock it in anyway" is always available while
 * listening for mis-hears, and "Prefer to write it?" switches to WriteAffirm mode.
 */

export const PASS = 0.85;
export const FALLBACK_HOLD_MS = 2600;
export const HOLD_TICK_MS = 50;

const RADIUS = 54;
const CIRC = 2 * Math.PI * RADIUS;

export interface SpeakSceneProps extends MindSceneProps {
  /** Injectable haptic fn for testing. */
  haptic?: HapticFn;
}

export function SpeakScene({
  move,
  onDone,
  haptic = lightHaptic,
  testID = "mind-speak-scene",
}: SpeakSceneProps): React.JSX.Element {
  const { colors } = useThemeTokens();
  const [writeMode, setWriteMode] = useState(false);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setDone(true);
    haptic();
    setTimeout(() => {
      onDone();
    }, 1100);
  }, [haptic, onDone]);

  const statement = move.statement?.trim() || affirmLine(move);
  const sm = useSpeechMatch(statement, { threshold: PASS, onPassed: finish });
  const words = statement.split(/\s+/).filter(Boolean);
  const showHighlight = started || done;

  const begin = () => {
    setStarted(true);
    sm.start();
  };

  // ── No-speech fallback: hold while you say it out loud ──
  const [held, setHeld] = useState(0);
  const [holding, setHolding] = useState(false);

  useEffect(() => {
    if (!holding || done) return;
    const interval = setInterval(() => {
      setHeld((prev) => {
        const next = prev + HOLD_TICK_MS;
        if (next >= FALLBACK_HOLD_MS) {
          clearInterval(interval);
          finish();
          return FALLBACK_HOLD_MS;
        }
        return next;
      });
    }, HOLD_TICK_MS);
    return () => clearInterval(interval);
  }, [holding, done, finish]);

  const pressHold = useCallback(() => {
    if (doneRef.current) return;
    setHeld(0);
    setHolding(true);
  }, []);

  const releaseHold = useCallback(() => {
    if (doneRef.current) return;
    setHolding(false);
    setHeld(0);
  }, []);

  if (writeMode) {
    return (
      <WriteAffirm
        statement={statement}
        onDone={onDone}
        testID={`${testID}-write`}
      />
    );
  }

  const micBlocked =
    sm.error === "not-allowed" || sm.error === "service-not-allowed";
  const holdPct = Math.min(1, held / FALLBACK_HOLD_MS);

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
        paddingVertical: 32,
      }}
    >
      <View className="flex-row items-center gap-1.5">
        <Mic size={14} color={colors["muted-foreground"]} />
        <Text className="text-xs uppercase tracking-widest text-muted-foreground">
          {move.title}
        </Text>
      </View>

      {/* Statement — plain until you start, then optimistic highlight */}
      <Text
        testID={`${testID}-statement`}
        className="mt-6 max-w-sm text-center text-2xl font-bold leading-snug text-foreground"
      >
        “
        {words.map((w, i) => {
          const status = sm.statuses[i] ?? "pending";
          const statusColor = !showHighlight
            ? undefined
            : status === "matched"
              ? colors.success
              : status === "missed"
                ? colors.accent
                : colors["muted-foreground"];
          return (
            <Text
              key={i}
              testID={`${testID}-word-${i}`}
              style={
                statusColor
                  ? {
                      color: statusColor,
                      opacity: status === "pending" ? 0.35 : 1,
                    }
                  : undefined
              }
            >
              {w}
              {i < words.length - 1 ? " " : ""}
            </Text>
          );
        })}
        ”
      </Text>

      {/* ── Done ── */}
      {done ? (
        <View testID={`${testID}-done`} className="mt-12 items-center">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-muted">
            <Check size={40} color={colors.success} strokeWidth={3} />
          </View>
          <Text className="mt-5 text-sm font-semibold text-success">
            Locked in.
          </Text>
        </View>
      ) : !sm.supported || micBlocked ? (
        // ── Fallback: hold while you say it ──
        <View testID={`${testID}-fallback`} className="mt-12 items-center">
          <Pressable
            testID={`${testID}-hold-button`}
            accessibilityRole="button"
            accessibilityLabel="Hold while you say it"
            accessibilityHint="Press and hold until the ring fills"
            onPressIn={pressHold}
            onPressOut={releaseHold}
            className="relative h-32 w-32 items-center justify-center rounded-full"
          >
            <Svg
              width={120}
              height={120}
              viewBox="0 0 120 120"
              style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}
            >
              <Circle
                cx={60}
                cy={60}
                r={RADIUS}
                fill="none"
                stroke={colors.border}
                strokeWidth={6}
              />
              <Circle
                cx={60}
                cy={60}
                r={RADIUS}
                fill="none"
                stroke={colors.success}
                strokeWidth={6}
                strokeLinecap="round"
                strokeDasharray={`${CIRC} ${CIRC}`}
                strokeDashoffset={CIRC * (1 - holdPct)}
              />
            </Svg>
            <View className="h-24 w-24 items-center justify-center rounded-full bg-muted px-2">
              <Text className="text-center text-xs font-semibold text-foreground">
                Hold &amp; say it
              </Text>
            </View>
          </Pressable>
          <Text className="mt-6 max-w-xs text-center text-sm text-muted-foreground">
            {micBlocked
              ? "Mic blocked — say it out loud and hold the circle."
              : "Say it out loud and hold the circle."}
          </Text>
          <Pressable
            testID={`${testID}-prefer-write-fallback`}
            onPress={() => setWriteMode(true)}
            accessibilityRole="button"
            className="mt-4 py-2"
          >
            <Text className="text-xs font-medium text-muted-foreground underline">
              Prefer to write it?
            </Text>
          </Pressable>
        </View>
      ) : !started ? (
        // ── Idle: tap to start ──
        <View testID={`${testID}-idle`} className="mt-12 items-center">
          <Pressable
            testID={`${testID}-start-button`}
            accessibilityRole="button"
            accessibilityLabel="Start"
            onPress={begin}
            className="h-28 w-28 items-center justify-center rounded-full bg-muted active:scale-95"
          >
            <Mic size={40} color={colors.foreground} />
          </Pressable>
          <Text className="mt-6 text-sm text-muted-foreground">
            Tap, then say it out loud
          </Text>
          <Pressable
            testID={`${testID}-prefer-write`}
            onPress={() => setWriteMode(true)}
            accessibilityRole="button"
            className="mt-4 py-2"
          >
            <Text className="text-xs font-medium text-muted-foreground underline">
              Prefer to write it?
            </Text>
          </Pressable>
        </View>
      ) : (
        // ── Listening ──
        <View testID={`${testID}-listening`} className="mt-12 items-center">
          <View className="h-28 w-28 items-center justify-center rounded-full bg-muted">
            <Mic size={40} color={colors.primary} />
          </View>
          <Text className="mt-6 text-sm text-muted-foreground">
            Say it like you mean it…
          </Text>
          <Pressable
            testID={`${testID}-lock-anyway`}
            accessibilityRole="button"
            accessibilityLabel="Lock it in anyway"
            onPress={finish}
            className="mt-5 py-2"
          >
            <Text className="text-sm font-medium text-muted-foreground">
              Lock it in anyway
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
