import { useState } from "react";
import { View, Pressable, ScrollView } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { announce } from "@/lib/a11y/announce";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import {
  GOAL_OPTIONS,
  EXPERIENCE_OPTIONS,
  SEX_OPTIONS,
  EQUIPMENT_OPTIONS,
  TOTAL_STEPS,
  type OnboardingProfile,
  type EquipmentType,
} from "@/lib/onboarding/steps";

export interface OnboardingFlowProps {
  /** Fired with the assembled profile when the user finishes the last step. */
  onComplete: (profile: OnboardingProfile) => void | Promise<void>;
  submitting?: boolean;
  testID?: string;
}

/**
 * The question each step asks, in one place: the heading renders it and the
 * step announcement speaks it, so a VoiceOver user is told what changed when
 * the whole screen is replaced by the next question.
 */
export const STEP_QUESTIONS: readonly string[] = [
  "What's your main goal?",
  "How experienced are you?",
  "A bit about you",
  "What equipment do you have?",
];

function OptionRow({
  testID,
  label,
  selected,
  multiple = false,
  onPress,
}: {
  testID: string;
  label: string;
  selected: boolean;
  /** A step where more than one answer is allowed — a checkbox, not a radio. */
  multiple?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      // The ROLE carries the shape of the question: one answer of several
      // (radio) or as many as apply (checkbox). It used to be "button" with
      // `selected`, which VoiceOver reads as a button that happens to be
      // highlighted — nothing said that picking one un-picks the others.
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected, selected }}
      accessibilityLabel={label}
      style={minTouchTarget}
      className={`p-3 rounded-xl border mb-2 justify-center ${
        selected ? "border-primary bg-primary/10" : "border-border bg-card"
      }`}
    >
      <Text className={selected ? "text-primary font-semibold" : "text-foreground"}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * 4-step onboarding questionnaire (goal → experience → body stats → equipment),
 * mirroring the webapp. Assembles an OnboardingProfile and hands it to
 * onComplete on the final step.
 */
export function OnboardingFlow({
  onComplete,
  submitting = false,
  testID = "onboarding",
}: OnboardingFlowProps) {
  const [step, setStep] = useState<number>(1);
  const [profile, setProfile] = useState<OnboardingProfile>({});

  const set = (patch: Partial<OnboardingProfile>) =>
    setProfile((p) => ({ ...p, ...patch }));

  const toggleEquipment = (value: EquipmentType) =>
    setProfile((p) => {
      const cur = p.equipmentAccess ?? [];
      return {
        ...p,
        equipmentAccess: cur.includes(value)
          ? cur.filter((e) => e !== value)
          : [...cur, value],
      };
    });

  const canAdvance =
    (step === 1 && !!profile.fitnessGoal) ||
    (step === 2 && !!profile.experienceLevel) ||
    (step === 3 && !!profile.biologicalSex) ||
    (step === 4 && (profile.equipmentAccess?.length ?? 0) > 0);

  /** Move to `next` and say so: the screen is replaced, so nothing else would. */
  const goToStep = (next: number) => {
    setStep(next);
    announce(`Step ${next} of ${TOTAL_STEPS}. ${STEP_QUESTIONS[next - 1]}`);
  };

  const onNext = () => {
    if (step < TOTAL_STEPS) goToStep(step + 1);
    else void onComplete(profile);
  };

  return (
    <View style={{ flex: 1 }} testID={testID}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text
          testID={`${testID}-step-indicator`}
          accessibilityLiveRegion="polite"
          className="text-muted-foreground text-sm"
        >
          Step {step} of {TOTAL_STEPS}
        </Text>

        {step === 1 ? (
          <View>
            <Text
              accessibilityRole="header"
              className="text-foreground text-xl font-bold mb-3"
            >
              {STEP_QUESTIONS[0]}
            </Text>
            <View accessibilityRole="radiogroup" accessibilityLabel={STEP_QUESTIONS[0]}>
              {GOAL_OPTIONS.map((o) => (
                <OptionRow
                  key={o.value}
                  testID={`${testID}-goal-${o.value}`}
                  label={o.label}
                  selected={profile.fitnessGoal === o.value}
                  onPress={() => set({ fitnessGoal: o.value })}
                />
              ))}
            </View>
          </View>
        ) : null}

        {step === 2 ? (
          <View>
            <Text
              accessibilityRole="header"
              className="text-foreground text-xl font-bold mb-3"
            >
              {STEP_QUESTIONS[1]}
            </Text>
            <View accessibilityRole="radiogroup" accessibilityLabel={STEP_QUESTIONS[1]}>
              {EXPERIENCE_OPTIONS.map((o) => (
                <OptionRow
                  key={o.value}
                  testID={`${testID}-experience-${o.value}`}
                  label={o.label}
                  selected={profile.experienceLevel === o.value}
                  onPress={() => set({ experienceLevel: o.value })}
                />
              ))}
            </View>
          </View>
        ) : null}

        {step === 3 ? (
          <View>
            <Text
              accessibilityRole="header"
              className="text-foreground text-xl font-bold mb-3"
            >
              {STEP_QUESTIONS[2]}
            </Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Biological sex">
              {SEX_OPTIONS.map((o) => (
                <OptionRow
                  key={o.value}
                  testID={`${testID}-sex-${o.value}`}
                  label={o.label}
                  selected={profile.biologicalSex === o.value}
                  onPress={() => set({ biologicalSex: o.value })}
                />
              ))}
            </View>
            <Input
              testID={`${testID}-birth-year`}
              label="Birth year (optional)"
              keyboardType="number-pad"
              value={profile.birthYear ? String(profile.birthYear) : ""}
              onChangeText={(t) => {
                const n = Number(t);
                set({ birthYear: Number.isFinite(n) && t !== "" ? n : undefined });
              }}
              placeholder="1990"
            />
          </View>
        ) : null}

        {step === 4 ? (
          <View>
            <Text
              accessibilityRole="header"
              className="text-foreground text-xl font-bold mb-3"
            >
              {STEP_QUESTIONS[3]}
            </Text>
            {EQUIPMENT_OPTIONS.map((o) => (
              <OptionRow
                key={o.value}
                testID={`${testID}-equipment-${o.value}`}
                label={o.label}
                multiple
                selected={(profile.equipmentAccess ?? []).includes(o.value)}
                onPress={() => toggleEquipment(o.value)}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* Each button gets a SHARE of the row (`flex: 1`), not its intrinsic
          width: at the largest Dynamic Type size "Back" and "Finish" together
          are wider than the screen, and a Text in a row does not wrap unless
          the row gives it a width to wrap inside. */}
      <View style={{ flexDirection: "row", gap: 8, padding: 16 }}>
        {step > 1 ? (
          <View style={{ flex: 1 }}>
            <Button
              testID={`${testID}-back`}
              variant="secondary"
              onPress={() => goToStep(Math.max(1, step - 1))}
            >
              Back
            </Button>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button
            testID={`${testID}-next`}
            onPress={onNext}
            disabled={!canAdvance || submitting}
            loading={submitting && step === TOTAL_STEPS}
          >
            {step < TOTAL_STEPS ? "Next" : submitting ? "Saving…" : "Finish"}
          </Button>
        </View>
      </View>
    </View>
  );
}
