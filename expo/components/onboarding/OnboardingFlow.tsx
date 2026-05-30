import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
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

function OptionRow({
  testID,
  label,
  selected,
  onPress,
}: {
  testID: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`p-3 rounded-xl border mb-2 ${
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

  const onNext = () => {
    if (step < TOTAL_STEPS) setStep((s) => s + 1);
    else void onComplete(profile);
  };

  return (
    <View style={{ flex: 1 }} testID={testID}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text testID={`${testID}-step-indicator`} className="text-muted-foreground text-sm">
          Step {step} of {TOTAL_STEPS}
        </Text>

        {step === 1 ? (
          <View>
            <Text className="text-foreground text-xl font-bold mb-3">
              What&apos;s your main goal?
            </Text>
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
        ) : null}

        {step === 2 ? (
          <View>
            <Text className="text-foreground text-xl font-bold mb-3">
              How experienced are you?
            </Text>
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
        ) : null}

        {step === 3 ? (
          <View>
            <Text className="text-foreground text-xl font-bold mb-3">
              A bit about you
            </Text>
            {SEX_OPTIONS.map((o) => (
              <OptionRow
                key={o.value}
                testID={`${testID}-sex-${o.value}`}
                label={o.label}
                selected={profile.biologicalSex === o.value}
                onPress={() => set({ biologicalSex: o.value })}
              />
            ))}
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
            <Text className="text-foreground text-xl font-bold mb-3">
              What equipment do you have?
            </Text>
            {EQUIPMENT_OPTIONS.map((o) => (
              <OptionRow
                key={o.value}
                testID={`${testID}-equipment-${o.value}`}
                label={o.label}
                selected={(profile.equipmentAccess ?? []).includes(o.value)}
                onPress={() => toggleEquipment(o.value)}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={{ flexDirection: "row", gap: 8, padding: 16 }}>
        {step > 1 ? (
          <Button
            testID={`${testID}-back`}
            variant="secondary"
            onPress={() => setStep((s) => Math.max(1, s - 1))}
          >
            Back
          </Button>
        ) : null}
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
  );
}
