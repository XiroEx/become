import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Camera, Check, Mic } from "lucide-react-native";
import { Text } from "@/components/Text";
import type { MindSceneProps } from "@/components/mind/session/scenes/types";
import {
  affirmLine,
  HOLD_TICK_MS,
} from "@/components/mind/session/scenes/HoldToAffirmScene";
import { WriteAffirm } from "@/components/mind/session/scenes/WriteAffirm";
import { useSpeechMatch } from "@/hooks/useSpeechMatch";
import { lightHaptic, type HapticFn } from "@/lib/feedback/haptics";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { onDarkForeground } from "@/lib/theme/tokens";

/**
 * MIRROR SCENE (NP-100).
 *
 * A port of `webapp/components/mind/session/scenes/MirrorScene.tsx`: look at
 * yourself while you say the statement out loud. The front camera fills the
 * black stage as a mirrored preview (video only — no capture, nothing
 * recorded or uploaded), the statement sits over it, live speech recognition
 * (expo-speech-recognition via useSpeechMatch) lights the words as you speak,
 * and it locks in once you've said enough (PASS = 0.6, the web's threshold).
 *
 * Fallbacks, same as the web:
 * - Camera denied (or no camera): no video, not a blocked session — the beat
 *   still completes over a black stage ("Camera off — say it anyway.").
 * - Speech unsupported or mic blocked: press-and-hold to affirm (1800 ms).
 * - "Write instead" switches to WriteAffirm mode.
 *
 * Rules that travel:
 * - Nothing from the camera leaves the device (preview only, never captured).
 * - The camera stops the moment the beat passes (the preview unmounts on
 *   done) or the scene unmounts (unmounting the CameraView releases it).
 *
 * COLOURS. A viewfinder is a camera surface, not app chrome: it is black on
 * every phone in either mode, the way the web's mirror stage is black with
 * white text. Tailwind's `bg-black` + `text-white/…` classes carry that
 * without a literal, which is what NP-123 bans — literals, not black. The
 * word highlight reuses the speech tokens (`success` / `accent`), exactly
 * like SpeakScene, and the ring uses `onDarkForeground` — white in both modes,
 * because the viewfinder is dark in both modes. (It used to use
 * `primary-foreground`, which was white in both modes only because `primary`
 * was the brand red; NP-313 made `primary` the web's neutral, so the ink on an
 * always-dark surface names the dark palette instead.)
 */

export const MIRROR_PASS = 0.6;
export const MIRROR_HOLD_MS = 1800;
export const MIRROR_DONE_MS = 1000;

const RADIUS = 54;
const CIRC = 2 * Math.PI * RADIUS;

export interface MirrorSceneProps extends MindSceneProps {
  /** Injectable haptic fn for testing. */
  haptic?: HapticFn;
  /** Injection point; the app leaves it unset (`useCameraPermissions`). */
  permissionImpl?: typeof useCameraPermissions;
  /** Injection point; the app leaves it unset (`CameraView`). */
  cameraImpl?: typeof CameraView;
}

export function MirrorScene({
  move,
  onDone,
  haptic = lightHaptic,
  permissionImpl = useCameraPermissions,
  cameraImpl: CameraImpl = CameraView,
  testID = "mind-mirror-scene",
}: MirrorSceneProps): React.JSX.Element {
  const { colors } = useThemeTokens();
  const [writeMode, setWriteMode] = useState(false);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);

  // ── Front camera (best-effort, video only) ──
  const [permission, requestPermission] = permissionImpl();
  useEffect(() => {
    if (permission == null) {
      requestPermission().catch(() => {});
    }
    // The permission hook owns the dialog; ask once, when still unknown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission]);
  const cameraOn = permission?.granted === true;
  // The preview lives only while the beat is live: unmounting the CameraView
  // is what releases the camera, on pass and on scene unmount alike.
  const showCamera = cameraOn && !done;

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setDone(true);
    haptic();
    setTimeout(() => {
      onDone();
    }, MIRROR_DONE_MS);
  }, [haptic, onDone]);

  // Live speech recognition (the mic capture is the speech module's own, so
  // the video-only camera preview never contends for the mic).
  const statement = move.statement?.trim() || affirmLine(move);
  const sm = useSpeechMatch(statement, {
    threshold: MIRROR_PASS,
    onPassed: finish,
  });
  const words = statement.split(/\s+/).filter(Boolean);
  const showHighlight = started || done;

  // Stop listening once the beat passes or the scene unmounts. The engine
  // lives outside React, so stopping it is a sync-from-outside-React effect.
  useEffect(() => {
    if (!done) return;
    sm.stop();
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      sm.stop();
    };
    // The speech engine lives outside React; stop it once, on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        if (next >= MIRROR_HOLD_MS) {
          clearInterval(interval);
          finish();
          return MIRROR_HOLD_MS;
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
  const useSpeech = sm.supported && !micBlocked;
  const holdPct = Math.min(1, held / MIRROR_HOLD_MS);

  return (
    <View testID={testID} className="flex-1 bg-black">
      {/* Camera background (mirrored). Preview only — never captured. */}
      {showCamera ? (
        <CameraImpl
          testID={`${testID}-camera`}
          facing="front"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            transform: [{ scaleX: -1 }],
          }}
        />
      ) : null}
      {/* Dim so the statement reads over a face. */}
      <View
        pointerEvents="none"
        className="bg-black/40"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
          paddingVertical: 32,
        }}
      >
        <View className="flex-row items-center gap-1.5">
          <Camera size={14} color={onDarkForeground} />
          <Text className="text-xs uppercase tracking-widest text-white/60">
            {cameraOn ? "Look at yourself" : "Mirror"}
          </Text>
        </View>

        {/* Statement — plain until you start, then optimistic highlight */}
        <Text
          testID={`${testID}-statement`}
          className="mt-6 max-w-sm text-center text-2xl font-bold leading-snug text-white"
        >
          &ldquo;
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
          &rdquo;
        </Text>
        {!cameraOn && permission != null ? (
          <Text
            testID={`${testID}-no-camera`}
            className="mt-3 text-center text-xs text-white/50"
          >
            Camera off — say it anyway.
          </Text>
        ) : null}

        {/* ── Done ── */}
        {done ? (
          <View testID={`${testID}-done`} className="mt-12 items-center">
            <View className="h-20 w-20 items-center justify-center rounded-full bg-white/15">
              <Check size={40} color={colors.success} strokeWidth={3} />
            </View>
            <Text className="mt-5 text-sm font-semibold text-success">
              Locked in.
            </Text>
          </View>
        ) : !useSpeech ? (
          // ── Fallback: hold while you say it ──
          <View testID={`${testID}-fallback`} className="mt-12 items-center">
            <Pressable
              testID={`${testID}-hold-button`}
              accessibilityRole="button"
              accessibilityLabel="Hold to affirm"
              accessibilityHint="Press and hold until the ring fills"
              onPressIn={pressHold}
              onPressOut={releaseHold}
              className="relative h-32 w-32 items-center justify-center rounded-full"
            >
              <Svg
                width={120}
                height={120}
                viewBox="0 0 120 120"
                style={{
                  position: "absolute",
                  transform: [{ rotate: "-90deg" }],
                }}
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
                  stroke={onDarkForeground}
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeDasharray={`${CIRC} ${CIRC}`}
                  strokeDashoffset={CIRC * (1 - holdPct)}
                />
              </Svg>
              <View className="h-24 w-24 items-center justify-center rounded-full bg-white/15 px-2">
                <Text className="text-center text-xs font-semibold text-white">
                  Hold to affirm
                </Text>
              </View>
            </Pressable>
            <Text className="mt-6 max-w-xs text-center text-sm text-white/60">
              {micBlocked
                ? "Mic blocked — affirm it anyway."
                : "Say it like you mean it."}
            </Text>
            <Pressable
              testID={`${testID}-write-instead-fallback`}
              onPress={() => setWriteMode(true)}
              accessibilityRole="button"
              className="mt-4 py-2"
            >
              <Text className="text-xs font-medium text-white/50 underline">
                Write instead
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
              className="h-28 w-28 items-center justify-center rounded-full bg-white/15 active:scale-95"
            >
              <Mic size={40} color={onDarkForeground} />
            </Pressable>
            <Text className="mt-6 text-sm text-white/60">
              Tap, then say it out loud
            </Text>
          </View>
        ) : (
          // ── Listening ──
          <View testID={`${testID}-listening`} className="mt-12 items-center">
            <View className="h-28 w-28 items-center justify-center rounded-full bg-white/15">
              <Mic size={40} color={colors.primary} />
            </View>
            <Text className="mt-6 text-sm text-white/60">
              Say it like you mean it…
            </Text>
            <Pressable
              testID={`${testID}-lock-anyway`}
              accessibilityRole="button"
              accessibilityLabel="Lock it in anyway"
              onPress={finish}
              className="mt-5 py-2"
            >
              <Text className="text-sm font-medium text-white/50">
                Lock it in anyway
              </Text>
            </Pressable>
          </View>
        )}

        {!done && useSpeech ? (
          <Pressable
            testID={`${testID}-write-instead`}
            onPress={() => setWriteMode(true)}
            accessibilityRole="button"
            className="mt-5 py-2"
          >
            <Text className="text-xs font-medium text-white/50 underline">
              Write instead
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

export default MirrorScene;
