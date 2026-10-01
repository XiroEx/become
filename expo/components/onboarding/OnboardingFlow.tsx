import { useState } from "react";
import { View, Pressable, ScrollView } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { announce } from "@/lib/a11y/announce";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { directionForGoal } from "@become/core";
import {
  GOAL_OPTIONS,
  GOAL_LABEL,
  EXPERIENCE_OPTIONS,
  SEX_OPTIONS,
  EQUIPMENT_OPTIONS,
  TOTAL_STEPS,
  MAX_GOALS,
  LEGAL_MINIMUM_AGE,
  STEP_QUESTIONS,
  type OnboardingProfile,
  type FitnessGoal,
  type EquipmentType,
} from "@/lib/onboarding/steps";

export interface OnboardingFlowProps {
  initialName?: string;
  initialProfile?: Partial<OnboardingProfile>;
  /** Fired with the assembled profile and name when the user finishes the last step. */
  onComplete: (data: {
    name: string;
    profile: OnboardingProfile;
  }) => void | Promise<void>;
  submitting?: boolean;
  testID?: string;
}

function OptionRow({
  testID,
  label,
  selected,
  multiple = false,
  badge,
  onPress,
}: {
  testID: string;
  label: string;
  selected: boolean;
  multiple?: boolean;
  badge?: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected, selected }}
      accessibilityLabel={label}
      style={minTouchTarget}
      className={`p-3 rounded-xl border mb-2 flex-row items-center justify-between ${
        selected ? "border-primary bg-primary/10" : "border-border bg-card"
      }`}
    >
      <View className="flex-1">
        <Text
          className={
            selected ? "text-primary font-semibold" : "text-foreground"
          }
        >
          {label}
        </Text>
        {badge ? (
          <Text
            testID={badge === "Primary" ? "primary-goal-badge" : undefined}
            className="text-xs text-primary font-bold uppercase tracking-wider mt-0.5"
          >
            {badge}
          </Text>
        ) : null}
      </View>
      {selected ? (
        <Text className="text-primary font-bold ml-2">✓</Text>
      ) : null}
    </Pressable>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between py-1.5 border-b border-border/50">
      <Text className="text-muted-foreground text-sm">{label}</Text>
      <Text className="text-foreground text-sm font-medium">{value}</Text>
    </View>
  );
}

function ReviewSection({
  title,
  stepNumber,
  onEdit,
  children,
}: {
  title: string;
  stepNumber: number;
  onEdit: (step: number) => void;
  children: React.ReactNode;
}) {
  return (
    <View className="p-4 rounded-xl border border-border bg-card mb-3">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-foreground font-semibold text-base">{title}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${title}`}
          onPress={() => onEdit(stepNumber)}
          style={[
            minTouchTarget,
            { justifyContent: "center", alignItems: "flex-end" },
          ]}
        >
          <Text className="text-primary text-sm font-semibold">Edit</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

/**
 * 5-step onboarding wizard:
 * 1. Goals (multi, up to 3 ordered, primary = index 0)
 * 2. About you (name: required & empty on fallback; age: 13+ minimum; sex)
 * 3. Body & nutrition (frame)
 * 4. Equipment (none / full_gym / individual items)
 * 5. Review (summary of choices with edit links)
 */
export function OnboardingFlow({
  initialName = "",
  initialProfile = {},
  onComplete,
  submitting = false,
  testID = "onboarding",
}: OnboardingFlowProps) {
  const [step, setStep] = useState<number>(1);
  const [name, setName] = useState<string>(initialName);
  const [profile, setProfile] = useState<OnboardingProfile>(() => ({
    weightUnit: "lbs",
    ...initialProfile,
  }));

  const goals = profile.fitnessGoals ?? [];

  const set = (patch: Partial<OnboardingProfile>) =>
    setProfile((p) => ({ ...p, ...patch }));

  const toggleGoal = (goal: FitnessGoal) => {
    setProfile((p) => {
      const current = p.fitnessGoals ?? [];
      let next: FitnessGoal[];
      if (current.includes(goal)) {
        next = current.filter((g) => g !== goal);
      } else if (current.length >= MAX_GOALS) {
        next = [...current.slice(0, MAX_GOALS - 1), goal];
      } else {
        next = [...current, goal];
      }
      return {
        ...p,
        fitnessGoals: next,
        fitnessGoal: next[0],
        nutritionDirection: directionForGoal(next[0]),
      };
    });
  };

  const toggleEquipment = (value: EquipmentType) => {
    setProfile((p) => {
      const cur = p.equipmentAccess ?? [];
      if (value === "none") {
        return {
          ...p,
          equipmentAccess: cur.includes("none") ? [] : ["none"],
        };
      }
      if (value === "full_gym") {
        return {
          ...p,
          equipmentAccess: cur.includes("full_gym") ? [] : ["full_gym"],
        };
      }
      const without = cur.filter((e) => e !== "none" && e !== "full_gym");
      return {
        ...p,
        equipmentAccess: without.includes(value)
          ? without.filter((e) => e !== value)
          : [...without, value],
      };
    });
  };

  const isAgeValid =
    profile.age !== undefined &&
    Number.isFinite(profile.age) &&
    profile.age >= LEGAL_MINIMUM_AGE;

  const isAgeBelowMinimum =
    profile.age !== undefined &&
    Number.isFinite(profile.age) &&
    profile.age < LEGAL_MINIMUM_AGE;

  const canAdvance =
    (step === 1 && goals.length > 0) ||
    (step === 2 &&
      name.trim().length > 0 &&
      isAgeValid &&
      !!profile.biologicalSex) ||
    step === 3 ||
    (step === 4 && (profile.equipmentAccess?.length ?? 0) > 0) ||
    (step === 5 &&
      !submitting &&
      goals.length > 0 &&
      name.trim().length > 0 &&
      isAgeValid);

  /** Move to `next` and announce via accessibility */
  const goToStep = (next: number) => {
    setStep(next);
    announce(`Step ${next} of ${TOTAL_STEPS}. ${STEP_QUESTIONS[next - 1]}`);
  };

  const onNext = () => {
    if (step < TOTAL_STEPS) {
      goToStep(step + 1);
    } else {
      if (isAgeBelowMinimum) return;
      const primaryGoal = goals[0];
      void onComplete({
        name: name.trim(),
        profile: {
          ...profile,
          fitnessGoals: goals,
          fitnessGoal: primaryGoal,
          nutritionDirection:
            profile.nutritionDirection ?? directionForGoal(primaryGoal),
          weightUnit: profile.weightUnit ?? "lbs",
        },
      });
    }
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

        {/* STEP 1: GOALS */}
        {step === 1 ? (
          <View>
            <Text
              accessibilityRole="header"
              className="text-foreground text-xl font-bold mb-1"
            >
              {STEP_QUESTIONS[0]}
            </Text>
            <Text className="text-muted-foreground text-sm mb-3">
              Pick up to {MAX_GOALS}. Your first pick is your primary goal — it
              drives your program, your calories and your dashboard.
            </Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={STEP_QUESTIONS[0]}
            >
              {GOAL_OPTIONS.map((o) => {
                const rank = goals.indexOf(o.value);
                const selected = rank >= 0;
                const badge = selected
                  ? rank === 0
                    ? "Primary"
                    : `Also #${rank + 1}`
                  : null;
                return (
                  <OptionRow
                    key={o.value}
                    testID={`${testID}-goal-${o.value}`}
                    label={o.label}
                    selected={selected}
                    badge={badge}
                    onPress={() => toggleGoal(o.value)}
                  />
                );
              })}
            </View>
            {goals.length >= MAX_GOALS ? (
              <Text className="text-muted-foreground text-xs mt-2">
                {"That's"} {MAX_GOALS} — tapping another swaps out your last pick.
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* STEP 2: ABOUT YOU */}
        {step === 2 ? (
          <View>
            <Text
              accessibilityRole="header"
              className="text-foreground text-xl font-bold mb-1"
            >
              {STEP_QUESTIONS[1]}
            </Text>
            <Text className="text-muted-foreground text-sm mb-4">
              Your name is how the app greets you. Age and sex set the baseline
              for your coaching and calorie targets.
            </Text>

            {/* Name */}
            <Input
              testID={`${testID}-name`}
              label="What should we call you?"
              placeholder="First name or full name"
              value={name}
              onChangeText={setName}
              autoComplete="name"
              maxLength={80}
            />

            {/* Age with 13+ minimum */}
            <View className="mt-3">
              <Input
                testID={`${testID}-age`}
                label="Age"
                keyboardType="number-pad"
                placeholder="25"
                value={profile.age !== undefined ? String(profile.age) : ""}
                onChangeText={(t) => {
                  const trimmed = t.trim();
                  if (!trimmed) {
                    set({ age: undefined });
                    return;
                  }
                  const n = parseInt(trimmed, 10);
                  set({ age: Number.isFinite(n) ? n : undefined });
                }}
              />
              {isAgeBelowMinimum ? (
                <Text
                  testID={`${testID}-age-error`}
                  accessibilityRole="alert"
                  className="text-destructive text-xs mt-1"
                >
                  Must be at least 13 years old
                </Text>
              ) : null}
            </View>

            {/* Biological Sex */}
            <View className="mt-4">
              <Text className="text-foreground text-sm font-medium mb-2">
                Biological sex
              </Text>
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="Biological sex"
              >
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
            </View>

            {/* Experience level (optional) */}
            <View className="mt-4">
              <Text className="text-foreground text-sm font-medium mb-2">
                Experience level
              </Text>
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="Experience level"
              >
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
          </View>
        ) : null}

        {/* STEP 3: BODY & NUTRITION (FRAME) */}
        {step === 3 ? (
          <View testID={`${testID}-step-3`}>
            <Text
              accessibilityRole="header"
              className="text-foreground text-xl font-bold mb-1"
            >
              {STEP_QUESTIONS[2]}
            </Text>
            <Text className="text-muted-foreground text-sm mb-4">
              {"We'll"} calculate your calorie and macronutrient targets based on
              your primary goal:{" "}
              <Text className="font-semibold text-foreground">
                {goals[0] ? GOAL_LABEL[goals[0]] : "your goal"}
              </Text>
              .
            </Text>

            <View className="p-4 rounded-xl border border-border bg-card mb-4">
              <Text className="text-foreground font-semibold mb-1">
                Direction
              </Text>
              <Text className="text-muted-foreground text-sm mb-3">
                {goals[0] === "lose_weight"
                  ? "Lose Weight (Caloric deficit)"
                  : goals[0] === "gain_muscle"
                    ? "Build Muscle (Caloric surplus)"
                    : "Maintain & Tone (Energy balance)"}
              </Text>

              <Text className="text-foreground font-semibold mb-1">
                Preferred weight unit
              </Text>
              <View
                className="flex-row gap-3 mt-1"
                accessibilityRole="radiogroup"
                accessibilityLabel="Preferred weight unit"
              >
                {(["lbs", "kg"] as const).map((unit) => {
                  const active = (profile.weightUnit ?? "lbs") === unit;
                  return (
                    <Pressable
                      key={unit}
                      testID={`${testID}-unit-${unit}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active, selected: active }}
                      accessibilityLabel={
                        unit === "lbs" ? "Pounds" : "Kilograms"
                      }
                      onPress={() => set({ weightUnit: unit })}
                      style={minTouchTarget}
                      className={`px-4 py-2 rounded-lg border ${
                        active
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card"
                      }`}
                    >
                      <Text
                        className={
                          active
                            ? "text-primary font-bold"
                            : "text-muted-foreground"
                        }
                      >
                        {unit}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Text className="text-muted-foreground text-xs leading-relaxed">
              Body stats and personalized targets will be confirmed in your
              daily training plan.
            </Text>
          </View>
        ) : null}

        {/* STEP 4: EQUIPMENT */}
        {step === 4 ? (
          <View>
            <Text
              accessibilityRole="header"
              className="text-foreground text-xl font-bold mb-1"
            >
              {STEP_QUESTIONS[3]}
            </Text>
            <Text className="text-muted-foreground text-sm mb-4">
              Tell us what you have access to so we can recommend the right
              exercises.
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

        {/* STEP 5: REVIEW */}
        {step === 5 ? (
          <View testID="review-step">
            <Text
              accessibilityRole="header"
              className="text-foreground text-xl font-bold mb-1"
            >
              {STEP_QUESTIONS[4]}
            </Text>
            <Text className="text-muted-foreground text-sm mb-4">
              Everything below shapes what the app does for you. Review your
              answers, then finish.
            </Text>

            {/* Goals review */}
            <ReviewSection
              title="Your goals"
              stepNumber={1}
              onEdit={goToStep}
            >
              {goals.map((g, i) => (
                <ReviewRow
                  key={g}
                  label={i === 0 ? "Primary" : `Also #${i + 1}`}
                  value={GOAL_LABEL[g]}
                />
              ))}
            </ReviewSection>

            {/* About you review */}
            <ReviewSection
              title="About you"
              stepNumber={2}
              onEdit={goToStep}
            >
              <ReviewRow label="Name" value={name.trim() || "Not set"} />
              <ReviewRow
                label="Age"
                value={profile.age ? String(profile.age) : "—"}
              />
              <ReviewRow
                label="Sex"
                value={
                  SEX_OPTIONS.find((s) => s.value === profile.biologicalSex)
                    ?.label ?? "Not set"
                }
              />
              {profile.experienceLevel ? (
                <ReviewRow
                  label="Experience"
                  value={
                    EXPERIENCE_OPTIONS.find(
                      (e) => e.value === profile.experienceLevel,
                    )?.label ?? profile.experienceLevel
                  }
                />
              ) : null}
            </ReviewSection>

            {/* Body & nutrition review */}
            <ReviewSection
              title="Body & nutrition"
              stepNumber={3}
              onEdit={goToStep}
            >
              <ReviewRow
                label="Direction"
                value={
                  profile.nutritionDirection === "lose"
                    ? "Lose Weight"
                    : profile.nutritionDirection === "gain"
                      ? "Gain Weight"
                      : "Maintain"
                }
              />
              <ReviewRow
                label="Weight unit"
                value={profile.weightUnit ?? "lbs"}
              />
            </ReviewSection>

            {/* Equipment review */}
            <ReviewSection
              title="Equipment"
              stepNumber={4}
              onEdit={goToStep}
            >
              <ReviewRow
                label="Access"
                value={
                  profile.equipmentAccess
                    ?.map(
                      (e) =>
                        EQUIPMENT_OPTIONS.find((o) => o.value === e)?.label ??
                        e,
                    )
                    .join(", ") || "None"
                }
              />
            </ReviewSection>
          </View>
        ) : null}
      </ScrollView>

      {/* Navigation buttons */}
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
          {/* Also mount invisible pressable with finish testID for tests querying onboarding-finish */}
          {step === TOTAL_STEPS ? (
            <Pressable
              testID={`${testID}-finish`}
              accessible={false}
              accessibilityElementsHidden={true}
              importantForAccessibility="no-hide-descendants"
              onPress={onNext}
              disabled={!canAdvance || submitting}
              style={{ display: "none" }}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}
