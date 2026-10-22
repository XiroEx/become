import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Check } from "lucide-react-native";
import { Text } from "@/components/Text";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { lightHaptic, type HapticFn } from "@/lib/feedback/haptics";
import { resolveToken } from "@/lib/theme/tokens";

/**
 * ALWAYS BLACK, LIKE THE WEB. See `WinScene.tsx` — this scene renders
 * straight onto the player's fixed `bg-black` stage, so every colour is
 * pinned to the DARK palette, never the `useThemeTokens()` hook.
 */
const C = {
  border: resolveToken("border", "dark"),
  success: resolveToken("success", "dark"),
  primary: resolveToken("primary", "dark"),
} as const;

/**
 * HOLD TO AFFIRM — and, until the rest of the scenes land, the FALLBACK for
 * every move kind native cannot play yet (NP-098).
 *
 * It is the web's identity beat
 * (`webapp/components/mind/session/scenes/IdentityScene.tsx`): the line is on
 * screen, "Hold to affirm" fills a ring over 1.6 seconds, releasing early
 * resets it, and filling it locks the line in and hands back to the player.
 *
 * Why it is also the fallback: a composed plan is a CHAIN, and a beat with no
 * scene is a dead end — the member cannot reach the beats after it. The content
 * scenes (NP-103), the speech scene (NP-099) and the mirror (NP-100) each
 * replace their kind here as they land; `SessionPlayer` is the only file that
 * has to change, and until then every plan recorded on the web plays through.
 *
 * It is deliberately a RECITATION beat, so it reports no answer: inventing an
 * answer for a choice the member never made would be written into the journal as
 * though they had said it.
 */

export const HOLD_MS = 1600;
/** How often the ring is recomputed while a finger is down. */
export const HOLD_TICK_MS = 50;
/** The beat after the ring fills, before the player is handed back. */
export const HOLD_DONE_HOLD_MS = 700;

const RADIUS = 54;
const CIRC = 2 * Math.PI * RADIUS;

export interface HoldToAffirmSceneProps extends MindSceneProps {
  /** Injectable so a test can assert the tap without a haptics engine. */
  haptic?: HapticFn;
}

/**
 * The line to affirm. A move carries its words in a different field per kind —
 * the statement for an affirmation, the prompt for a reflection — and some kinds
 * carry only a title, so the subtitle is the last resort.
 */
export function affirmLine(move: MindSceneProps["move"]): string {
  const line = move.statement?.trim() || move.prompt?.trim() || move.subtitle?.trim();
  return line && line.length > 0 ? line : move.title;
}

/**
 * What is actually drawn. ONLY A STATEMENT IS QUOTED: a statement is a sentence
 * about who they are and the web prints it in quotes, while a prompt is a
 * question put TO them ("Where did you show up?") and quoting that reads as
 * though the app were saying it about itself.
 */
export function affirmDisplayLine(move: MindSceneProps["move"]): string {
  const line = affirmLine(move);
  return move.statement?.trim() ? `“${line}”` : line;
}

export function HoldToAffirmScene({
  move,
  onDone,
  haptic = lightHaptic,
  testID = "mind-hold-affirm",
}: HoldToAffirmSceneProps) {
  const [held, setHeld] = useState(0);
  const [holding, setHolding] = useState(false);
  const [affirmed, setAffirmed] = useState(false);
  const affirmedRef = useRef(false);

  // The hold clock. It runs only while a finger is down, and a release resets
  // it — the whole point of a hold is that it cannot be tapped through.
  useEffect(() => {
    if (!holding || affirmed) return;
    const id = setInterval(() => setHeld((h) => h + HOLD_TICK_MS), HOLD_TICK_MS);
    return () => clearInterval(id);
  }, [holding, affirmed]);

  // Filled → locked in.
  useEffect(() => {
    if (held < HOLD_MS || affirmedRef.current) return;
    affirmedRef.current = true;
    setHolding(false);
    setAffirmed(true);
    haptic();
    const t = setTimeout(() => onDone(), HOLD_DONE_HOLD_MS);
    return () => clearTimeout(t);
  }, [held, onDone, haptic]);

  const press = () => {
    if (affirmedRef.current) return;
    setHeld(0);
    setHolding(true);
  };

  const release = () => {
    if (affirmedRef.current) return;
    setHolding(false);
    setHeld(0);
  };

  const progress = Math.min(1, held / HOLD_MS);

  return (
    <ScrollView
      testID={testID}
      className="flex-1 bg-black"
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
        paddingVertical: 32,
      }}
    >
      <Text className="text-xs uppercase tracking-widest text-white/40">
        {move.title}
      </Text>
      <Text
        testID={`${testID}-line`}
        className="mt-6 max-w-sm text-center text-2xl font-bold leading-snug text-white"
      >
        {affirmDisplayLine(move)}
      </Text>

      <Pressable
        testID={`${testID}-button`}
        accessibilityRole="button"
        accessibilityLabel="Hold to affirm"
        accessibilityHint="Press and hold until the ring fills"
        onPressIn={press}
        onPressOut={release}
        // VoiceOver's double-tap is not a hold: an "activate" has no duration, so
        // the gesture has to have a non-gestural equivalent or the beat is
        // impossible with a screen reader on.
        onAccessibilityTap={() => {
          if (affirmedRef.current) return;
          setHeld(HOLD_MS);
        }}
        style={[minTouchTarget, { height: 128, width: 128 }]}
        className="mt-12 items-center justify-center rounded-full"
      >
        <Svg
          width={128}
          height={128}
          viewBox="0 0 120 120"
          style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}
        >
          <Circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            stroke={C.border}
            strokeWidth="6"
          />
          <Circle
            testID={`${testID}-ring`}
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            stroke={affirmed ? C.success : C.primary}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - progress)}
          />
        </Svg>
        <View className="h-24 w-24 items-center justify-center rounded-full bg-white/10">
          {affirmed ? (
            <Check testID={`${testID}-check`} size={36} color={C.success} />
          ) : (
            <Text className="px-2 text-center text-xs font-semibold text-white/80">
              Hold to affirm
            </Text>
          )}
        </View>
      </Pressable>

      <Text
        testID={`${testID}-status`}
        accessibilityLiveRegion="polite"
        className="mt-6 text-sm text-white/40"
      >
        {affirmed ? "Locked in." : "Press and hold"}
      </Text>
      {!affirmed ? (
        <Pressable
          testID={`${testID}-skip`}
          accessibilityRole="button"
          accessibilityLabel="Skip this move"
          onPress={() => onDone()}
          style={minTouchTarget}
          className="mt-3 items-center justify-center"
        >
          <Text className="text-sm font-medium text-white/40">Skip</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

export default HoldToAffirmScene;
