import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal as RNModal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight, Check, ChevronLeft, X } from "lucide-react-native";
import { Text } from "@/components/Text";
import { modalAnimation, useReducedMotion } from "@/lib/a11y/reducedMotion";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { onDarkForeground, resolveToken, tintToken } from "@/lib/theme/tokens";
import type { GuidedStep } from "@/lib/ai/sanitize";

export type { GuidedStep };

// GuidedFlow (NP-298) — a FULL-SCREEN DARK MODAL over the section, exactly
// like the web's `fixed inset-0 z-[100] bg-black text-white`
// (`webapp/components/mind/system/GuidedFlow.tsx`). It used to render inline
// inside the section page — light, with the header and tab bar still
// visible, and the caller's theme-driven `colors.accent`/`colors.primary`
// painting the progress bar the SAME colour for every tool (amber, the app's
// generic accent) instead of that tool's own. A bare `Modal` fixes both: it
// floats above the tab bar and header on its own, and it is always dark so a
// light-mode phone does not get a second, unintended look. The colour comes
// from the caller as `accentColor` — see `lib/mind/accents.ts`'s
// `mindAccentColor(system)`, which mirrors the web's `ACCENTS` map.
const FLOW_WHITE = onDarkForeground; // white, in both modes — the stage is always dark
const FLOW_INK = resolveToken("mind-ink", "dark"); // ink for the white CTA, static like the session player's `PLAYER_BLACK`
const FLOW_PLACEHOLDER = tintToken("foreground", "dark", 0.3); // the web's `placeholder-white/30`

/**
 * This `Modal` is bare (no navigator wraps it), so it has to add its own
 * device insets rather than lean on a `SafeAreaView`, whose insets are
 * measured for the screen BEHIND this Modal's own native window — the same
 * reasoning as `SessionPlayer`'s and `BarcodeScanner`'s own copy of this hook.
 *
 * `useSafeAreaInsets` throws without a `SafeAreaProvider` above it in the
 * tree; the real app always has one (`app/_layout.tsx`), but this component's
 * tests don't wrap one. Falling back to zero insets there keeps this a no-op
 * in tests while fixing the real device.
 */
function useSafeAreaInsetsOrZero() {
  try {
    return useSafeAreaInsets();
  } catch {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAsk(body: string | undefined, ask: string): boolean {
  if (!body) return false;
  const b = normalize(body);
  const a = normalize(ask);
  return a.length > 0 && b.includes(a);
}

export default function GuidedFlow({
  title,
  steps,
  accentColor,
  doneText = "Done. That counts.",
  onComplete,
  onExit,
  onReflect,
}: {
  title: string;
  steps: GuidedStep[];
  /** The tool's accent — see `lib/mind/accents.ts`'s `mindAccentColor(system)`. */
  accentColor?: string;
  doneText?: string;
  onComplete: (answers: { prompt: string; answer: string }[]) => void;
  onExit: () => void;
  onReflect?: (
    answers: { prompt: string; answer: string }[],
  ) => Promise<string | null>;
}) {
  const accent = accentColor ?? FLOW_WHITE;
  const insets = useSafeAreaInsetsOrZero();
  const reduceMotion = useReducedMotion();

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<
    { prompt: string; answer: string }[]
  >([]);
  const [input, setInput] = useState("");
  const [done, setDone] = useState(false);
  const [reflection, setReflection] = useState<string | null>(null);
  const [reflecting, setReflecting] = useState(false);
  const reflectStarted = useRef(false);

  const step = steps[idx] ?? { title: "" };
  const isLast = idx === steps.length - 1;
  const isChoice = Boolean(step.choices && step.choices.length > 0);
  const isScale = Boolean(step.scale);
  const isInput = Boolean(step.inputPrompt);
  const flowHasInput = steps.some((s) => Boolean(s.inputPrompt));
  const isReflectStep = isLast && Boolean(onReflect) && flowHasInput;
  const showReflectionView =
    isReflectStep && (reflecting || Boolean(reflection));

  const ask = step.inputPrompt?.trim() ?? "";
  const showAsk = isInput && Boolean(ask) && !containsAsk(step.body, ask);

  useEffect(() => {
    if (!isReflectStep || reflectStarted.current) return;
    reflectStarted.current = true;
    setReflecting(true);
    Promise.resolve(onReflect!(answers))
      .then((t) => setReflection(t && t.trim() ? t.trim() : null))
      .catch(() => setReflection(null))
      .finally(() => setReflecting(false));
  }, [isReflectStep, answers, onReflect]);

  const commit = (answer?: string) => {
    const next = [...answers];
    if (answer !== undefined) {
      next.push({ prompt: step.inputPrompt || step.title, answer });
      setAnswers(next);
      setInput("");
    }
    if (isLast) {
      setDone(true);
      setTimeout(() => onComplete(next), 400);
    } else {
      setIdx(idx + 1);
    }
  };

  const back = () => {
    if (idx === 0 || done) return;
    const prev = idx - 1;
    const prevStep = steps[prev];
    const prevProduced = Boolean(
      prevStep?.inputPrompt ||
        (prevStep?.choices && prevStep.choices.length > 0) ||
        prevStep?.scale,
    );
    if (prevProduced) {
      setInput(
        prevStep?.inputPrompt ? answers[answers.length - 1]?.answer ?? "" : "",
      );
      setAnswers((a) => a.slice(0, -1));
    } else {
      setInput("");
    }
    reflectStarted.current = false;
    setReflection(null);
    setReflecting(false);
    setIdx(prev);
  };

  return (
    <RNModal
      testID="guided-flow-screen"
      visible
      animationType={modalAnimation("fade", reduceMotion)}
      onRequestClose={onExit}
    >
      <View
        testID="guided-flow-root"
        className="flex-1 bg-black"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        {/* A faint top wash in the tool's accent — the web's radial glow,
            approximated as a flat translucent layer (RN has no CSS
            radial-gradient). Behind everything, never intercepts a touch. */}
        <View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "40%",
            backgroundColor: accent,
            opacity: 0.08,
          }}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          {/* Top bar */}
          <View className="flex-row items-center gap-3 px-4 pt-3 pb-2">
            <Pressable
              testID="guided-flow-exit"
              onPress={onExit}
              accessibilityRole="button"
              accessibilityLabel="Exit flow"
              style={minTouchTarget}
              className="shrink-0 items-center justify-center rounded-full bg-white/10"
            >
              <X size={18} color={FLOW_WHITE} />
            </Pressable>

            <Pressable
              testID="guided-flow-back"
              onPress={back}
              disabled={idx === 0 || done}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={minTouchTarget}
              className={`shrink-0 items-center justify-center rounded-full bg-white/10 ${
                idx === 0 || done ? "opacity-0" : "opacity-100"
              }`}
            >
              <ChevronLeft size={18} color={FLOW_WHITE} />
            </Pressable>

            {/* Progress bar — filled in the tool's own accent, never one
                shared colour for every tool. */}
            <View className="flex-1 flex-row gap-1.5 items-center">
              {steps.map((_, i) => (
                <View
                  key={i}
                  className="h-1 flex-1 overflow-hidden rounded-full bg-white/15"
                >
                  <View
                    testID={`guided-flow-progress-${i}-fill`}
                    style={
                      i < idx || done
                        ? { width: "100%", backgroundColor: accent }
                        : i === idx
                          ? { width: "50%", backgroundColor: accent }
                          : { width: "0%" }
                    }
                  />
                </View>
              ))}
            </View>
          </View>

          {/* Stage */}
          <ScrollView
            className="flex-1"
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              paddingHorizontal: 24,
              paddingVertical: 32,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {done ? (
              <View testID="guided-flow-done" className="items-center py-12">
                <View
                  testID="guided-flow-done-check"
                  className="h-20 w-20 items-center justify-center rounded-full mb-5"
                >
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      height: "100%",
                      width: "100%",
                      borderRadius: 999,
                      backgroundColor: accent,
                      opacity: 0.15,
                    }}
                  />
                  <Check size={40} color={accent} strokeWidth={3} />
                </View>
                <Text
                  testID="guided-flow-done-text"
                  className="text-xl font-bold text-white text-center"
                >
                  {doneText}
                </Text>
              </View>
            ) : showReflectionView ? (
              /* Adaptive close step */
              <View testID="guided-flow-reflect" className="items-center w-full">
                <Text className="text-xs font-semibold uppercase tracking-widest text-white/40 text-center">
                  {title}
                </Text>
                <Text className="mt-4 text-2xl font-extrabold text-white text-center">
                  {reflecting ? "Taking it in…" : "Here’s what I see"}
                </Text>

                {reflecting ? (
                  <View className="mt-8 flex-row items-center gap-3">
                    <ActivityIndicator size="small" color={accent} />
                    <Text className="text-sm text-white/60">
                      Reading what you wrote…
                    </Text>
                  </View>
                ) : reflection ? (
                  <Text
                    testID="guided-flow-reflect-content"
                    className="mt-4 text-base leading-relaxed text-white/80 text-center"
                  >
                    {reflection}
                  </Text>
                ) : null}

                <Pressable
                  testID="guided-flow-reflect-finish"
                  accessibilityRole="button"
                  onPress={() => commit()}
                  disabled={reflecting}
                  style={minTouchTarget}
                  className="mt-8 w-full max-w-xs flex-row items-center justify-center gap-2 rounded-2xl bg-white py-4 active:opacity-90 disabled:opacity-40"
                >
                  <Text className="text-base font-bold text-black">
                    Finish
                  </Text>
                  <ArrowRight size={18} color={FLOW_INK} />
                </Pressable>
              </View>
            ) : (
              /* Standard step */
              <View testID="guided-flow-step" className="items-center w-full">
                <Text className="text-xs font-semibold uppercase tracking-widest text-white/40 text-center">
                  {title}
                </Text>
                <Text
                  testID="guided-flow-title"
                  className="mt-4 text-2xl font-extrabold text-white text-center"
                >
                  {step.title}
                </Text>

                {step.body ? (
                  <Text
                    testID="guided-flow-body"
                    className="mt-3 text-base leading-relaxed text-white/70 text-center"
                  >
                    {step.body}
                  </Text>
                ) : null}

                {showAsk ? (
                  <Text
                    testID="guided-flow-ask"
                    className="mt-4 text-lg font-semibold text-white text-center"
                  >
                    {ask}
                  </Text>
                ) : null}

                {/* Type-an-answer */}
                {isInput ? (
                  <TextInput
                    testID="guided-flow-input"
                    value={input}
                    onChangeText={setInput}
                    placeholder={step.placeholder ?? "Type it honestly…"}
                    placeholderTextColor={FLOW_PLACEHOLDER}
                    multiline
                    numberOfLines={3}
                    className="mt-6 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-base text-white"
                  />
                ) : null}

                {/* Pick-one (choices) */}
                {isChoice ? (
                  <View className="mt-6 w-full gap-2.5">
                    {step.choices!.map((c, i) => (
                      <Pressable
                        key={c}
                        testID={`guided-flow-choice-${i}`}
                        accessibilityRole="button"
                        onPress={() => commit(c)}
                        className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3.5 active:opacity-80"
                      >
                        <Text className="text-base font-medium text-white">
                          {c}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {/* Scale */}
                {isScale ? (
                  <View className="mt-7 w-full">
                    <View className="flex-row items-center justify-between gap-2">
                      {Array.from(
                        { length: step.scale!.max - step.scale!.min + 1 },
                        (_, i) => step.scale!.min + i,
                      ).map((n) => (
                        <Pressable
                          key={n}
                          testID={`guided-flow-scale-${n}`}
                          accessibilityRole="button"
                          onPress={() => commit(String(n))}
                          className="flex-1 h-12 items-center justify-center rounded-xl border border-white/15 bg-white/5 active:opacity-80"
                        >
                          <Text className="text-lg font-bold text-white">
                            {n}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <View className="mt-2 flex-row justify-between px-1">
                      <Text className="text-[11px] text-white/40">
                        {step.scale!.minLabel}
                      </Text>
                      <Text className="text-[11px] text-white/40">
                        {step.scale!.maxLabel}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {/* Advance button for info / input steps */}
                {!isChoice && !isScale ? (
                  <Pressable
                    testID="guided-flow-next"
                    accessibilityRole="button"
                    onPress={() => commit(isInput ? input.trim() : undefined)}
                    disabled={isInput && !input.trim()}
                    style={minTouchTarget}
                    className="mt-8 w-full max-w-xs flex-row items-center justify-center gap-2 rounded-2xl bg-white py-4 active:opacity-90 disabled:opacity-40"
                  >
                    <Text className="text-base font-bold text-black">
                      {isLast ? "Finish" : "Next"}
                    </Text>
                    <ArrowRight size={18} color={FLOW_INK} />
                  </Pressable>
                ) : null}
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </RNModal>
  );
}
