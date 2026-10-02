import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowRight, Check, ChevronLeft, X } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { GuidedStep } from "@/lib/ai/sanitize";

export type { GuidedStep };

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
  accentClass,
  doneText = "Done. That counts.",
  onComplete,
  onExit,
  onReflect,
}: {
  title: string;
  steps: GuidedStep[];
  accentColor?: string;
  accentClass?: string;
  doneText?: string;
  onComplete: (answers: { prompt: string; answer: string }[]) => void;
  onExit: () => void;
  onReflect?: (
    answers: { prompt: string; answer: string }[],
  ) => Promise<string | null>;
}) {
  const { colors } = useThemeTokens();
  const accent = accentColor ?? colors.primary;
  const barColor = accentClass ?? "bg-primary";

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
    <SafeAreaView
      testID="guided-flow-screen"
      className="flex-1 bg-background"
      edges={["top", "bottom"]}
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
            className="h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted"
          >
            <X size={18} color={colors.foreground} />
          </Pressable>

          <Pressable
            testID="guided-flow-back"
            onPress={back}
            disabled={idx === 0 || done}
            accessibilityRole="button"
            accessibilityLabel="Back"
            className={`h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted ${
              idx === 0 || done ? "opacity-0" : "opacity-100"
            }`}
          >
            <ChevronLeft size={18} color={colors.foreground} />
          </Pressable>

          {/* Progress bar */}
          <View className="flex-1 flex-row gap-1.5 items-center">
            {steps.map((_, i) => (
              <View
                key={i}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
              >
                <View
                  className={`h-full rounded-full ${
                    i < idx || done ? barColor : i === idx ? `${barColor} opacity-50` : "opacity-0"
                  }`}
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
                className="h-20 w-20 items-center justify-center rounded-full bg-muted mb-5"
              >
                <Check size={40} color={accent} strokeWidth={3} />
              </View>
              <Text
                testID="guided-flow-done-text"
                className="text-xl font-bold text-foreground text-center"
              >
                {doneText}
              </Text>
            </View>
          ) : showReflectionView ? (
            /* Adaptive close step */
            <View testID="guided-flow-reflect" className="items-center w-full">
              <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground text-center">
                {title}
              </Text>
              <Text className="mt-4 text-2xl font-extrabold text-foreground text-center">
                {reflecting ? "Taking it in…" : "Here’s what I see"}
              </Text>

              {reflecting ? (
                <View className="mt-8 flex-row items-center gap-3">
                  <ActivityIndicator size="small" color={accent} />
                  <Text className="text-sm text-muted-foreground">
                    Reading what you wrote…
                  </Text>
                </View>
              ) : reflection ? (
                <Text
                  testID="guided-flow-reflect-content"
                  className="mt-4 text-base leading-relaxed text-foreground text-center"
                >
                  {reflection}
                </Text>
              ) : null}

              <Pressable
                testID="guided-flow-reflect-finish"
                accessibilityRole="button"
                onPress={() => commit()}
                disabled={reflecting}
                className="mt-8 w-full max-w-xs flex-row items-center justify-center gap-2 rounded-2xl bg-foreground py-4 active:opacity-90 disabled:opacity-40"
              >
                <Text className="text-base font-bold text-background">
                  Finish
                </Text>
                <ArrowRight size={18} color={colors.background} />
              </Pressable>
            </View>
          ) : (
            /* Standard step */
            <View testID="guided-flow-step" className="items-center w-full">
              <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground text-center">
                {title}
              </Text>
              <Text
                testID="guided-flow-title"
                className="mt-4 text-2xl font-extrabold text-foreground text-center"
              >
                {step.title}
              </Text>

              {step.body ? (
                <Text
                  testID="guided-flow-body"
                  className="mt-3 text-base leading-relaxed text-muted-foreground text-center"
                >
                  {step.body}
                </Text>
              ) : null}

              {showAsk ? (
                <Text
                  testID="guided-flow-ask"
                  className="mt-4 text-lg font-semibold text-foreground text-center"
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
                  placeholderTextColor={colors["muted-foreground"]}
                  multiline
                  numberOfLines={3}
                  className="mt-6 w-full rounded-2xl border border-border bg-card px-4 py-3 text-base text-foreground"
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
                      className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 active:opacity-80"
                    >
                      <Text className="text-base font-medium text-foreground">
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
                        className="flex-1 h-12 items-center justify-center rounded-xl border border-border bg-card active:opacity-80"
                      >
                        <Text className="text-lg font-bold text-foreground">
                          {n}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <View className="mt-2 flex-row justify-between px-1">
                    <Text className="text-[11px] text-muted-foreground">
                      {step.scale!.minLabel}
                    </Text>
                    <Text className="text-[11px] text-muted-foreground">
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
                  className="mt-8 w-full max-w-xs flex-row items-center justify-center gap-2 rounded-2xl bg-foreground py-4 active:opacity-90 disabled:opacity-40"
                >
                  <Text className="text-base font-bold text-background">
                    {isLast ? "Finish" : "Next"}
                  </Text>
                  <ArrowRight size={18} color={colors.background} />
                </Pressable>
              ) : null}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
