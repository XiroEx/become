import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
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
import {
  useAndroidBackHandler,
  type BackHandlerLike,
} from "@/lib/android/backHandler";
import { onDarkForeground, resolveToken, tintToken } from "@/lib/theme/tokens";
import type { GuidedStep } from "@/lib/ai/sanitize";

export type { GuidedStep };

/**
 * THE WEB'S FIXED DARK STAGE, NOT A THEMED SCREEN (NP-298).
 *
 * `webapp/components/mind/system/GuidedFlow.tsx` is `fixed inset-0 z-[100]
 * bg-black text-white` — one immersive full-screen surface over EVERYTHING
 * (no header, no tab bar) that never follows `prefers-color-scheme`, for
 * every tool intro (`ToolIntroGate`) and every guided protocol launched from
 * a dashboard's toolkit cards or its adaptive "Today's session" Begin.
 *
 * Native used to render this inline, as a themed `SafeAreaView` sitting in
 * the section page's own component tree: the header and tab bar stayed
 * visible behind it, it took `useThemeTokens()` so a light-mode phone showed
 * a light screen, and the progress bar's colour came from whichever generic
 * token a dashboard happened to pass (`colors.accent` — amber — on every
 * dashboard except Discipline/Vision, which passed `colors.primary` /
 * `colors.success`), not the tool's own identity colour.
 *
 * The fix is the exact shape of `SessionPlayer` / `BarcodeScanner`'s
 * always-dark surfaces (NP-297 / NP-321): a bare `Modal` (so there is no
 * navigator chrome behind it) painted with literal `bg-black` / `text-white`
 * Tailwind classes — not hex, see `noHexColorLiterals.test.ts` — plus the
 * handful of constants below for the few RN APIs that need an actual colour
 * VALUE rather than a class (a lucide `color` prop, `ActivityIndicator`,
 * `TextInput`'s `placeholderTextColor`), resolved against the DARK palette
 * explicitly. `accentColor` is now always the tool's own identity colour
 * (`lib/mind/accents.ts`'s `mindAccentColor()`, the native twin of the web's
 * `ACCENTS` map), not a generic theme token.
 */
const SURFACE_WHITE = onDarkForeground;
const SURFACE_WHITE_60 = tintToken("foreground", "dark", 0.6);
const SURFACE_WHITE_30 = tintToken("foreground", "dark", 0.3);
const SURFACE_BLACK = resolveToken("mind-ink", "dark");

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
  backHandler = BackHandler,
}: {
  title: string;
  steps: GuidedStep[];
  /** The tool's own identity colour — `lib/mind/accents.ts`'s `mindAccentColor()`. */
  accentColor?: string;
  doneText?: string;
  onComplete: (answers: { prompt: string; answer: string }[]) => void;
  onExit: () => void;
  onReflect?: (
    answers: { prompt: string; answer: string }[],
  ) => Promise<string | null>;
  /** DI for tests — injects `BackHandler` for Android hardware-back handling (NP-336). */
  backHandler?: BackHandlerLike;
}) {
  const insets = useSafeAreaInsetsOrZero();
  const accent = accentColor ?? SURFACE_WHITE;

  // NP-336: Android hardware back closes the flow back to the dashboard,
  // matching onRequestClose and intercepting so the parent route doesn't pop to the hub.
  useAndroidBackHandler({
    enabled: true,
    onBack: () => {
      onExit();
      return true;
    },
    backHandler,
  });

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
      testID="guided-flow-modal"
      visible
      animationType="fade"
      onRequestClose={onExit}
    >
      <View
        testID="guided-flow-screen"
        className="flex-1 bg-black"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
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
              className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10"
            >
              <X size={18} color={SURFACE_WHITE} />
            </Pressable>

            <Pressable
              testID="guided-flow-back"
              onPress={back}
              disabled={idx === 0 || done}
              accessibilityRole="button"
              accessibilityLabel="Back"
              className={`h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 ${
                idx === 0 || done ? "opacity-0" : "opacity-100"
              }`}
            >
              <ChevronLeft size={18} color={SURFACE_WHITE} />
            </Pressable>

            {/* Progress bar — the tool's own accent, not a generic token */}
            <View className="flex-1 flex-row gap-1.5 items-center">
              {steps.map((_, i) => (
                <View
                  key={i}
                  testID={`guided-flow-progress-${i}`}
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"
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
                  className="h-20 w-20 items-center justify-center rounded-full bg-white/10 mb-5"
                >
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
                    <ActivityIndicator size="small" color={SURFACE_WHITE_60} />
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
                  className="mt-8 w-full max-w-xs flex-row items-center justify-center gap-2 rounded-2xl bg-white py-4 active:opacity-90 disabled:opacity-40"
                >
                  <Text className="text-base font-bold text-black">
                    Finish
                  </Text>
                  <ArrowRight size={18} color={SURFACE_BLACK} />
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
                    placeholderTextColor={SURFACE_WHITE_30}
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
                    className="mt-8 w-full max-w-xs flex-row items-center justify-center gap-2 rounded-2xl bg-white py-4 active:opacity-90 disabled:opacity-40"
                  >
                    <Text className="text-base font-bold text-black">
                      {isLast ? "Finish" : "Next"}
                    </Text>
                    <ArrowRight size={18} color={SURFACE_BLACK} />
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
