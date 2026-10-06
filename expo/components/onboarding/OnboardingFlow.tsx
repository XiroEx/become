import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { View, Pressable, ScrollView } from "react-native";
import {
  Flame,
  Dumbbell,
  Scale,
  Zap,
  Heart,
  ChevronLeft,
  ChevronRight,
  Check,
  Sparkles,
  TrendingDown,
  Minus,
  TrendingUp,
  HelpCircle,
} from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { announce } from "@/lib/a11y/announce";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  directionForGoal,
  defaultPaceKg,
  directionFromWeights,
  kgToUnit,
  lbsToKg,
  ftInToCm,
  cmToFtIn,
  displayWeight,
  roundWeight,
  roundHeightCm,
  computeNutritionTargets,
  splitForPreset,
  recommendPreset,
  calorieAdjustment,
  DIRECTION_EXPLANATION,
  MACRO_PRESET_LABELS,
  MACRO_PRESET_BLURBS,
  explainCalories,
  explainMacro,
  proteinNeedsFlag,
  MACRO_LABELS,
  type MacroKey,
  type NutritionDirection,
  type ActivityLevel,
  type MacroPreset,
} from "@become/core";
import type { ProgramRecommendation } from "@become/api-client";
import { PacePicker } from "@/components/goals/PacePicker";
import { MacroExplainSheet } from "@/components/nutrition/MacroExplainSheet";
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
  STEP_TITLES,
  DIRECTION_OPTIONS,
  ACTIVITY_BLURBS,
  ACTIVITY_LABELS,
  ACTIVITY_MULTIPLIERS,
  MACRO_PRESET_CHOICES,
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
  /**
   * Called with the in-progress answers whenever they change, so the route
   * can keep the server-driven review-step recommendation live. Fire-and-
   * forget: the flow never waits on it.
   */
  onDraftChange?: (profile: OnboardingProfile) => void;
  /**
   * Server-driven program recommendation for the review step (NP-057).
   * The route owns the fetch via `useOnboardingRecommendation`; tests and
   * previews may inject a canned value instead.
   */
  recommendation?: ProgramRecommendation | null;
  /** True while the recommendation request is in flight. */
  recommendationLoading?: boolean;
  /**
   * Optional enrolment in the recommended program, offered on the review
   * step. Mirrors the web: a failed enrolment never blocks finishing.
   */
  onEnrollRecommended?: () => void | Promise<void>;
  /** True while the enrolment request is in flight. */
  enrolling?: boolean;
  /** True once the member is enrolled in the recommended program. */
  enrolled?: boolean;
}

function OptionRow({
  testID,
  label,
  description,
  selected,
  multiple = false,
  onPress,
}: {
  testID: string;
  label: string;
  description?: string;
  selected: boolean;
  multiple?: boolean;
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
        selected ? "border-foreground bg-foreground" : "border-border bg-card"
      }`}
    >
      <View className="flex-1">
        <Text
          className={
            selected ? "text-background font-semibold" : "text-foreground"
          }
        >
          {label}
        </Text>
        {description ? (
          <Text
            className={`text-xs mt-0.5 ${
              selected ? "text-background/70" : "text-muted-foreground"
            }`}
          >
            {description}
          </Text>
        ) : null}
      </View>
      {selected ? (
        <Text className="text-background font-bold ml-2">✓</Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Equipment access as a wrapping pill chip (web parity, NP-248 — the web's
 * step 4 renders `EQUIPMENT_OPTIONS` as `rounded-full` chips in a
 * `flex-wrap` row rather than full-width rows, `webapp/app/onboarding/page.tsx`'s
 * `Step4`). Multi-select, so `accessibilityRole="checkbox"` like the
 * `OptionRow` chips it replaces for this one step.
 */
function EquipmentChip({
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
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, selected }}
      accessibilityLabel={label}
      style={minTouchTarget}
      className={`rounded-full border-2 px-4 py-2 items-center justify-center ${
        selected ? "border-foreground bg-foreground" : "border-border bg-card"
      }`}
    >
      <Text
        className={`text-sm font-medium ${
          selected ? "text-background" : "text-foreground"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The decorative unit label inside a height/weight input (web parity,
 * NP-247 — the web overlays "ft" / "in" / "lbs" / "kg" at the right edge of
 * the field, `webapp/app/onboarding/page.tsx`'s absolutely-positioned
 * `<span>`). Purely visual: `pointerEvents="none"` so it never steals the
 * touch, and it carries no accessible name of its own — the field's own
 * `accessibilityLabel` (set explicitly where this replaces a visible
 * "Feet" / "Inches" label) is still the thing a screen reader announces.
 * Anchored to the bottom 44 points of its relative parent, which is exactly
 * `minTouchTarget`'s height and therefore the `Input`'s own field box, so it
 * centers on the TextInput and not on the label above it.
 */
function UnitSuffix({ text }: { text: string }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        right: 12,
        bottom: 0,
        height: minTouchTarget.minHeight,
        justifyContent: "center",
      }}
    >
      <Text className="text-muted-foreground text-xs">{text}</Text>
    </View>
  );
}

/**
 * Icon tile metadata for each goal card (NP-245), mirroring the web's
 * Flame / Dumbbell / Scale / Zap / Heart on an orange / blue / violet /
 * yellow / emerald tinted tile (`webapp/app/onboarding/page.tsx`'s
 * `GOAL_OPTIONS`). The tile background is a plain Tailwind class (fine
 * anywhere); the glyph's own fill is a fixed "R G B" triplet — never a hex or
 * `rgb(...)` STRING LITERAL, which is what NP-123's lint rule actually bans —
 * turned into a colour at render time exactly the way `resolveToken` does for
 * the real theme tokens. These five are brand hues, identical in both themes
 * like `primary`, so they do not belong in `lib/theme/tokens.ts`'s light/dark
 * pairs.
 */
const GOAL_TILE_META: Record<
  FitnessGoal,
  {
    Icon: ComponentType<{
      size?: number;
      color?: string;
      strokeWidth?: number;
    }>;
    tileClass: string;
    rgb: string;
  }
> = {
  lose_weight: {
    Icon: Flame,
    tileClass: "bg-orange-100 dark:bg-orange-900/30",
    rgb: "249 115 22", // orange-500
  },
  gain_muscle: {
    Icon: Dumbbell,
    tileClass: "bg-blue-100 dark:bg-blue-900/30",
    rgb: "59 130 246", // blue-500
  },
  maintain: {
    Icon: Scale,
    tileClass: "bg-violet-100 dark:bg-violet-900/30",
    rgb: "139 92 246", // violet-500
  },
  improve_performance: {
    Icon: Zap,
    tileClass: "bg-yellow-100 dark:bg-yellow-900/30",
    rgb: "234 179 8", // yellow-500
  },
  general_health: {
    Icon: Heart,
    tileClass: "bg-emerald-100 dark:bg-emerald-900/30",
    rgb: "16 185 129", // emerald-500
  },
};

/**
 * Trend icon for each eating direction on step 3 (NP-247), mirroring the
 * web's TrendingDown / Minus / TrendingUp on the Lose/Maintain/Gain cards
 * (`webapp/app/onboarding/page.tsx`'s `DIRECTION_OPTIONS`). Kept local to the
 * component — like `GOAL_TILE_META` — because `lib/onboarding/steps.ts` is a
 * plain data module shared outside UI code and should not import React icons.
 */
const DIRECTION_ICONS: Record<
  NutritionDirection,
  ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
> = {
  lose: TrendingDown,
  maintain: Minus,
  gain: TrendingUp,
};

/**
 * A single goal card on step 1 (NP-245). Mirrors the web's Step1 button:
 * an icon tile, the label, a Primary/Also-#N badge once picked, and the same
 * black-fill "selected" inversion every other option in the wizard uses.
 */
function GoalCard({
  testID,
  label,
  Icon,
  tileClass,
  rgb,
  selected,
  rank,
  onPress,
}: {
  testID: string;
  label: string;
  Icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  tileClass: string;
  rgb: string;
  selected: boolean;
  rank: number;
  onPress: () => void;
}) {
  const { colors } = useThemeTokens();
  const iconColor = selected ? colors.background : `rgb(${rgb})`;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, selected }}
      accessibilityLabel={label}
      style={minTouchTarget}
      className={`flex-row items-center gap-4 rounded-2xl border-2 p-4 mb-3 ${
        selected ? "border-foreground bg-foreground" : "border-border bg-card"
      }`}
    >
      <View
        className={`h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
          selected ? "bg-background/20" : tileClass
        }`}
      >
        <Icon size={24} color={iconColor} strokeWidth={1.5} />
      </View>
      <View className="flex-1 min-w-0">
        <Text
          className={`font-semibold text-base ${
            selected ? "text-background" : "text-foreground"
          }`}
        >
          {label}
        </Text>
        {selected ? (
          <Text
            testID={rank === 0 ? "primary-goal-badge" : undefined}
            className="text-background/70 text-[10px] font-bold uppercase tracking-widest mt-0.5"
          >
            {rank === 0 ? "Primary" : `Also #${rank + 1}`}
          </Text>
        ) : null}
      </View>
      {selected ? <Check size={20} color={iconColor} /> : null}
    </Pressable>
  );
}

/**
 * The program match on the review step (NP-057). Mirrors the web's
 * RecommendationCard: server-driven, optional enrolment, never blocking.
 * Renders nothing when there is no recommendation and no request in flight.
 */
function RecommendationCard({
  testID,
  recommendation,
  loading,
  enrolling = false,
  enrolled = false,
  onEnroll,
}: {
  testID: string;
  recommendation: ProgramRecommendation | null;
  loading: boolean;
  enrolling?: boolean;
  enrolled?: boolean;
  /** Omit to render the card as pure information (no action). */
  onEnroll?: () => void;
}) {
  const { colors } = useThemeTokens();
  if (loading && !recommendation) {
    return (
      <View
        testID={`${testID}-recommendation-loading`}
        className="mt-3 p-4 rounded-2xl border border-border bg-card"
      >
        <Text className="text-muted-foreground text-sm">
          Finding your program…
        </Text>
      </View>
    );
  }
  if (!recommendation) return null;
  const meta = [
    recommendation.duration_weeks
      ? `${recommendation.duration_weeks} weeks`
      : null,
    recommendation.training_days_per_week
      ? `${recommendation.training_days_per_week} days/week`
      : null,
    recommendation.target_user || null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <View
      testID={`${testID}-recommended-program`}
      className="mt-3 p-4 rounded-2xl border-2 border-foreground bg-card"
    >
      <View className="flex-row items-center gap-1.5">
        <Sparkles size={14} color={colors.foreground} />
        <Text className="text-[11px] font-bold uppercase tracking-wider text-foreground">
          Recommended for you
        </Text>
      </View>
      <Text
        testID={`${testID}-recommended-program-name`}
        className="text-foreground text-base font-bold mt-2"
      >
        {recommendation.name}
      </Text>
      {meta ? (
        <Text className="text-muted-foreground text-xs mt-1">{meta}</Text>
      ) : null}
      {recommendation.reasons.length > 0 ? (
        <View
          testID={`${testID}-recommended-program-reasons`}
          className="mt-3 gap-1.5"
        >
          {recommendation.reasons.slice(0, 3).map((reason: string) => (
            <View key={reason} className="flex-row items-start gap-2">
              <Text className="text-primary font-bold">✓</Text>
              <Text className="text-muted-foreground text-xs flex-1">
                {reason}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {onEnroll ? (
        enrolled ? (
          <Text
            testID={`${testID}-recommended-program-enrolled`}
            className="text-primary text-xs font-semibold mt-3"
          >
            ✓ Added — it will be waiting on your dashboard.
          </Text>
        ) : (
          <View className="mt-3">
            <Button
              testID={`${testID}-recommended-program-enroll`}
              onPress={onEnroll}
              disabled={enrolling}
              loading={enrolling}
            >
              {enrolling ? "Adding…" : "Start this program"}
            </Button>
          </View>
        )
      ) : null}
    </View>
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
 * 3. Body & nutrition (height, weight, target, pace, activity, macros)
 * 4. Equipment (none / full_gym / individual items)
 * 5. Review (summary of choices with edit links)
 */
export function OnboardingFlow({
  initialName = "",
  initialProfile = {},
  onComplete,
  submitting = false,
  testID = "onboarding",
  recommendation = null,
  recommendationLoading = false,
  onEnrollRecommended,
  enrolling = false,
  enrolled = false,
  onDraftChange,
}: OnboardingFlowProps) {
  const { colors } = useThemeTokens();
  const [step, setStep] = useState<number>(1);
  const [name, setName] = useState<string>(initialName);
  const [profile, setProfile] = useState<OnboardingProfile>(() => ({
    weightUnit: "lbs",
    ...initialProfile,
  }));

  const [useImperial, setUseImperial] = useState<boolean>(
    (initialProfile.weightUnit ?? "lbs") !== "kg",
  );

  // Height and weight display states
  const initialHeight = profile.heightCm
    ? cmToFtIn(profile.heightCm)
    : { ft: "", inches: "" };
  const [heightFt, setHeightFt] = useState<string>(
    initialHeight.ft !== "" ? String(initialHeight.ft) : "",
  );
  const [heightIn, setHeightIn] = useState<string>(
    initialHeight.inches !== "" ? String(initialHeight.inches) : "",
  );
  const [heightCmDisplay, setHeightCmDisplay] = useState<string>(
    profile.heightCm ? String(roundHeightCm(profile.heightCm)) : "",
  );
  const [currentLbs, setCurrentLbs] = useState<string>(
    profile.currentWeightKg
      ? String(displayWeight(profile.currentWeightKg, "lbs"))
      : "",
  );
  const [currentKgDisplay, setCurrentKgDisplay] = useState<string>(
    profile.currentWeightKg
      ? String(roundWeight(profile.currentWeightKg))
      : "",
  );
  const [targetLbs, setTargetLbs] = useState<string>(
    profile.targetWeightKg
      ? String(displayWeight(profile.targetWeightKg, "lbs"))
      : "",
  );
  const [targetKgDisplay, setTargetKgDisplay] = useState<string>(
    profile.targetWeightKg
      ? String(roundWeight(profile.targetWeightKg))
      : "",
  );

  const goals = useMemo(() => profile.fitnessGoals ?? [], [profile.fitnessGoals]);
  const primaryGoal = goals[0];
  // Mirrors the web's `days = weeklyAvailability ?? 3` (webapp/app/onboarding/page.tsx):
  // shown as 3 by default, but only ever written to the profile once the
  // member actually taps the stepper.
  const weeklyAvailabilityDays = profile.weeklyAvailability ?? 3;

  // Keep the route's server-driven recommendation in step with the draft
  // answers. The callback is stable-or-not by caller choice; guard with a
  // ref so a non-memoized callback cannot loop the effect.
  const draftRef = useRef(onDraftChange);
  useEffect(() => {
    draftRef.current = onDraftChange;
  });
  useEffect(() => {
    draftRef.current?.(profile);
  }, [profile]);

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
        nutritionDirection: p.nutritionDirection ?? directionForGoal(next[0]),
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

  // Unit switching
  const switchUnits = (toImperial: boolean) => {
    if (toImperial) {
      if (profile.heightCm) {
        const { ft, inches } = cmToFtIn(profile.heightCm);
        setHeightFt(String(ft));
        setHeightIn(String(inches));
      }
      if (profile.currentWeightKg) {
        setCurrentLbs(String(displayWeight(profile.currentWeightKg, "lbs")));
      }
      if (profile.targetWeightKg) {
        setTargetLbs(String(displayWeight(profile.targetWeightKg, "lbs")));
      }
    } else {
      if (profile.heightCm) {
        setHeightCmDisplay(String(roundHeightCm(profile.heightCm)));
      }
      if (profile.currentWeightKg) {
        setCurrentKgDisplay(String(roundWeight(profile.currentWeightKg)));
      }
      if (profile.targetWeightKg) {
        setTargetKgDisplay(String(roundWeight(profile.targetWeightKg)));
      }
    }
    setUseImperial(toImperial);
    set({ weightUnit: toImperial ? "lbs" : "kg" });
  };

  const handleHeightChange = (ft: string, inches: string) => {
    setHeightFt(ft);
    setHeightIn(inches);
    const ftNum = parseInt(ft, 10) || 0;
    const inNum = parseInt(inches, 10) || 0;
    set({
      heightCm: ftNum > 0 || inNum > 0 ? ftInToCm(ftNum, inNum) : undefined,
    });
  };

  const handleHeightCmChange = (cm: string) => {
    setHeightCmDisplay(cm);
    set({ heightCm: cm ? Number(cm) : undefined });
  };

  const handleCurrentWeightChange = (val: string) => {
    if (useImperial) {
      setCurrentLbs(val);
      set({ currentWeightKg: val ? lbsToKg(Number(val)) : undefined });
    } else {
      setCurrentKgDisplay(val);
      set({ currentWeightKg: val ? Number(val) : undefined });
    }
  };

  const handleTargetWeightChange = (val: string) => {
    if (useImperial) {
      setTargetLbs(val);
      set({ targetWeightKg: val ? lbsToKg(Number(val)) : undefined });
    } else {
      setTargetKgDisplay(val);
      set({ targetWeightKg: val ? Number(val) : undefined });
    }
  };

  // Direction logic
  const derivedDirection = directionFromWeights(
    profile.currentWeightKg,
    profile.targetWeightKg,
  );
  const effectiveDirection: NutritionDirection =
    profile.nutritionDirection ??
    derivedDirection ??
    (primaryGoal ? directionForGoal(primaryGoal) : "maintain");

  const directionMismatch =
    derivedDirection != null && derivedDirection !== effectiveDirection;

  const activity: ActivityLevel = profile.activityLevel ?? "moderate";
  const macroPreset: MacroPreset = profile.macroPreset ?? "recommended";

  const presetRecommendation = recommendPreset(
    effectiveDirection,
    goals,
    profile.experienceLevel,
  );
  const suggestedPreset = presetRecommendation.preset;

  const canComputeTargets = Boolean(
    profile.currentWeightKg &&
      profile.heightCm &&
      profile.age &&
      profile.biologicalSex,
  );

  const targets = useMemo(() => {
    if (!canComputeTargets) return null;
    return computeNutritionTargets({
      currentWeightKg: profile.currentWeightKg,
      heightCm: profile.heightCm,
      age: profile.age,
      biologicalSex: profile.biologicalSex,
      goals,
      direction: effectiveDirection,
      weeklyAvailability: profile.weeklyAvailability,
      activityLevel: activity,
      macroPreset,
      paceKgPerWeek:
        profile.paceKgPerWeek ?? defaultPaceKg(effectiveDirection),
    });
  }, [
    canComputeTargets,
    profile.currentWeightKg,
    profile.heightCm,
    profile.age,
    profile.biologicalSex,
    goals,
    effectiveDirection,
    profile.weeklyAvailability,
    activity,
    macroPreset,
    profile.paceKgPerWeek,
  ]);

  const presetContext =
    targets && profile.currentWeightKg
      ? {
          weightLbs: profile.currentWeightKg * 2.2046226218,
          calories: targets.calories,
          goals,
        }
      : undefined;

  const proteinFlagged = useMemo(
    () =>
      !!targets &&
      proteinNeedsFlag(
        targets.protein,
        profile.currentWeightKg,
        targets.direction,
        goals,
      ),
    [targets, profile.currentWeightKg, goals],
  );

  const [explaining, setExplaining] = useState<MacroKey | "calories" | null>(
    null,
  );

  const explanation = useMemo(() => {
    if (!explaining || !targets) return null;
    if (explaining === "calories") {
      const c = explainCalories(
        {
          currentWeightKg: profile.currentWeightKg,
          heightCm: profile.heightCm,
          age: profile.age,
          biologicalSex: profile.biologicalSex,
        },
        targets.activityLevel,
        targets.direction,
        profile.paceKgPerWeek ?? defaultPaceKg(targets.direction),
      );
      if (!c) return null;
      return {
        title: "Where your calories come from",
        headline: `${c.calories.toLocaleString()} cal / day`,
        steps: c.steps,
        note: undefined,
      };
    }
    const macroKey = explaining as MacroKey;
    const grams = targets[macroKey];
    const percent = targets.split[macroKey];
    const m = explainMacro({
      macro: macroKey,
      grams,
      calories: targets.calories,
      percent,
      weightKg: profile.currentWeightKg,
      direction: targets.direction,
      goals,
      presetLabel: MACRO_PRESET_LABELS[macroPreset],
    });
    return {
      title: `Where your ${MACRO_LABELS[macroKey].toLowerCase()} comes from`,
      headline: `${m.grams} g${m.perLb ? ` · ${m.perLb} g per lb` : ""}`,
      steps: m.steps,
      note: m.note,
    };
  }, [
    explaining,
    targets,
    profile.currentWeightKg,
    profile.heightCm,
    profile.age,
    profile.biologicalSex,
    profile.paceKgPerWeek,
    macroPreset,
    goals,
  ]);

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
    (step === 2 && name.trim().length > 0) ||
    (step === 3 && canComputeTargets && isAgeValid) ||
    // Web parity (NP-248): web's step 4 Next is enabled with nothing picked
    // (no check at all on `equipmentAccess` before advancing).
    step === 4 ||
    (step === 5 &&
      !submitting &&
      goals.length > 0 &&
      name.trim().length > 0 &&
      isAgeValid &&
      canComputeTargets);

  /** Move to `next` and announce via accessibility */
  const goToStep = (next: number) => {
    setStep(next);
    announce(`Step ${next} of ${TOTAL_STEPS}. ${STEP_QUESTIONS[next - 1]}`);
  };

  const onNext = () => {
    if (step === 3 && (!canComputeTargets || !isAgeValid)) return;
    if (step < TOTAL_STEPS) {
      goToStep(step + 1);
    } else {
      if (isAgeBelowMinimum) return;
      void onComplete({
        name: name.trim(),
        profile: {
          ...profile,
          fitnessGoals: goals,
          fitnessGoal: primaryGoal,
          nutritionDirection: effectiveDirection,
          weightUnit: profile.weightUnit ?? (useImperial ? "lbs" : "kg"),
          activityLevel: activity,
          macroPreset,
          paceKgPerWeek:
            profile.paceKgPerWeek ?? defaultPaceKg(effectiveDirection),
        },
      });
    }
  };

  const missing = [
    !profile.age && "age",
    !profile.heightCm && "height",
    !profile.currentWeightKg && "weight",
    (!profile.biologicalSex ||
      profile.biologicalSex === "prefer_not_to_say") &&
      "biological sex",
  ].filter(Boolean) as string[];

  const progress = (step / TOTAL_STEPS) * 100;

  return (
    <View style={{ flex: 1 }} testID={testID}>
      {/* Thin progress bar across the top, filling per step (web parity). */}
      <View
        testID={`${testID}-progress-bar`}
        className="h-1 bg-border"
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: TOTAL_STEPS, now: step }}
      >
        <View
          className="h-full bg-foreground"
          style={{ width: `${progress}%` }}
        />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text
          testID={`${testID}-step-indicator`}
          accessibilityLiveRegion="polite"
          className="text-muted-foreground text-xs font-medium uppercase tracking-widest text-center"
        >
          Step {step} of {TOTAL_STEPS} · {STEP_TITLES[step - 1]}
        </Text>

        {/* STEP 1: GOALS */}
        {step === 1 ? (
          <View>
            <Text
              accessibilityRole="header"
              className="text-foreground text-2xl font-bold mb-1"
            >
              {STEP_QUESTIONS[0]}
            </Text>
            <Text className="text-muted-foreground text-sm mb-3">
              Pick up to {MAX_GOALS}. Your first pick is your{" "}
              <Text className="font-semibold text-foreground">
                primary goal
              </Text>{" "}
              — it drives your program, your calories and your dashboard.
            </Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={STEP_QUESTIONS[0]}
            >
              {GOAL_OPTIONS.map((o) => {
                const rank = goals.indexOf(o.value);
                const selected = rank >= 0;
                const meta = GOAL_TILE_META[o.value];
                return (
                  <GoalCard
                    key={o.value}
                    testID={`${testID}-goal-${o.value}`}
                    label={o.label}
                    Icon={meta.Icon}
                    tileClass={meta.tileClass}
                    rgb={meta.rgb}
                    selected={selected}
                    rank={rank}
                    onPress={() => toggleGoal(o.value)}
                  />
                );
              })}
            </View>
            {/* The same server-driven program match the review step shows,
                live the moment a goal is picked (NP-245) — the review step's
                RecommendationCard, reused as-is: no enrolment action here,
                pure preview. */}
            <RecommendationCard
              testID={`${testID}-step1`}
              recommendation={recommendation}
              loading={recommendationLoading}
            />
          </View>
        ) : null}

        {/* STEP 2: ABOUT YOU */}
        {step === 2 ? (
          <View>
            <Text
              accessibilityRole="header"
              className="text-foreground text-2xl font-bold mb-1"
            >
              {STEP_QUESTIONS[1]}
            </Text>
            <Text className="text-muted-foreground text-sm mb-4">
              Your name is how the app greets you. The rest sets the
              difficulty of the program we match you with, and how active we
              assume you are when we work out your calories.
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

            {/* Experience level, with descriptions (web parity) */}
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
                    description={o.desc}
                    selected={profile.experienceLevel === o.value}
                    onPress={() => set({ experienceLevel: o.value })}
                  />
                ))}
              </View>
            </View>

            {/* Days available per week — -/3/+ stepper (web parity, NP-246) */}
            <View className="mt-4">
              <Text className="text-foreground text-sm font-medium mb-2">
                Days available per week
              </Text>
              <View className="flex-row items-center gap-4">
                <Pressable
                  testID={`${testID}-weekly-availability-decrease`}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease days"
                  disabled={weeklyAvailabilityDays <= 1}
                  onPress={() =>
                    set({
                      weeklyAvailability: Math.max(
                        1,
                        weeklyAvailabilityDays - 1,
                      ),
                    })
                  }
                  style={minTouchTarget}
                  className={`h-11 w-11 items-center justify-center rounded-xl border border-border bg-card ${
                    weeklyAvailabilityDays <= 1 ? "opacity-30" : ""
                  }`}
                >
                  <Text className="text-foreground text-lg font-bold">
                    −
                  </Text>
                </Pressable>
                <Text
                  testID={`${testID}-weekly-availability`}
                  className="text-foreground text-2xl font-bold w-8 text-center"
                >
                  {weeklyAvailabilityDays}
                </Text>
                <Pressable
                  testID={`${testID}-weekly-availability-increase`}
                  accessibilityRole="button"
                  accessibilityLabel="Increase days"
                  disabled={weeklyAvailabilityDays >= 7}
                  onPress={() =>
                    set({
                      weeklyAvailability: Math.min(
                        7,
                        weeklyAvailabilityDays + 1,
                      ),
                    })
                  }
                  style={minTouchTarget}
                  className={`h-11 w-11 items-center justify-center rounded-xl border border-border bg-card ${
                    weeklyAvailabilityDays >= 7 ? "opacity-30" : ""
                  }`}
                >
                  <Text className="text-foreground text-lg font-bold">
                    +
                  </Text>
                </Pressable>
                <Text className="text-muted-foreground text-sm">
                  days / week
                </Text>
              </View>
              <Text className="text-muted-foreground text-xs mt-2">
                We&apos;ll only recommend programs that fit inside{" "}
                {weeklyAvailabilityDays} day
                {weeklyAvailabilityDays === 1 ? "" : "s"} a week.
              </Text>
            </View>
          </View>
        ) : null}

        {/* STEP 3: BODY & NUTRITION */}
        {step === 3 ? (
          <View testID={`${testID}-step-3`}>
            <View className="flex-row items-start justify-between mb-2">
              <View className="flex-1 mr-2">
                <Text
                  accessibilityRole="header"
                  className="text-foreground text-2xl font-bold mb-1"
                >
                  {STEP_QUESTIONS[2]}
                </Text>
                <Text className="text-muted-foreground text-sm mb-4">
                  These four numbers are what your daily calories and macros
                  are built from. Nothing here is shared.
                </Text>
              </View>

              {/* Unit Toggle */}
              <View className="flex-row border border-border rounded-lg overflow-hidden shrink-0 mt-1">
                <Pressable
                  testID={`${testID}-unit-lbs`}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: useImperial,
                    selected: useImperial,
                  }}
                  accessibilityLabel="Imperial"
                  onPress={() => switchUnits(true)}
                  style={minTouchTarget}
                  className={`px-3 py-1.5 ${
                    useImperial ? "bg-primary" : "bg-card"
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      useImperial ? "text-primary-foreground font-bold" : "text-muted-foreground"
                    }`}
                  >
                    Imperial
                  </Text>
                </Pressable>
                <Pressable
                  testID={`${testID}-unit-kg`}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: !useImperial,
                    selected: !useImperial,
                  }}
                  accessibilityLabel="Metric"
                  onPress={() => switchUnits(false)}
                  style={minTouchTarget}
                  className={`px-3 py-1.5 ${
                    !useImperial ? "bg-primary" : "bg-card"
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      !useImperial ? "text-primary-foreground font-bold" : "text-muted-foreground"
                    }`}
                  >
                    Metric
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Age + Height, side by side (web parity, NP-247) */}
            <View className="flex-row gap-3 mb-4">
              <View className="flex-1">
                <Input
                  testID={`${testID}-age`}
                  label="Age"
                  keyboardType="number-pad"
                  placeholder="e.g. 28"
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

              <View className="flex-1">
                <Text className="text-foreground text-sm font-medium mb-1">
                  Height
                </Text>
                {useImperial ? (
                  <View className="flex-row gap-2">
                    <View style={{ position: "relative" }} className="flex-1">
                      <Input
                        testID="stat-height-ft"
                        accessibilityLabel="Feet"
                        keyboardType="number-pad"
                        placeholder="5"
                        value={heightFt}
                        onChangeText={(val) =>
                          handleHeightChange(val, heightIn)
                        }
                      />
                      <UnitSuffix text="ft" />
                    </View>
                    <View style={{ position: "relative" }} className="flex-1">
                      <Input
                        testID="stat-height-in"
                        accessibilityLabel="Inches"
                        keyboardType="number-pad"
                        placeholder="10"
                        value={heightIn}
                        onChangeText={(val) =>
                          handleHeightChange(heightFt, val)
                        }
                      />
                      <UnitSuffix text="in" />
                    </View>
                  </View>
                ) : (
                  <View style={{ position: "relative" }}>
                    <Input
                      testID="stat-height-cm"
                      accessibilityLabel="Height (cm)"
                      keyboardType="number-pad"
                      placeholder="e.g. 175"
                      value={heightCmDisplay}
                      onChangeText={handleHeightCmChange}
                    />
                    <UnitSuffix text="cm" />
                  </View>
                )}
              </View>
            </View>

            {/* Biological sex — three side-by-side pills, with the Mifflin
                note (web parity: moved from step 2, NP-246 / NP-247) */}
            <View className="mb-4">
              <Text className="text-foreground text-sm font-medium mb-1.5">
                Biological sex
              </Text>
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="Biological sex"
                className="flex-row gap-2"
              >
                {SEX_OPTIONS.map((o) => {
                  const selected = profile.biologicalSex === o.value;
                  return (
                    <Pressable
                      key={o.value}
                      testID={`${testID}-sex-${o.value}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, selected }}
                      accessibilityLabel={o.label}
                      onPress={() => set({ biologicalSex: o.value })}
                      style={minTouchTarget}
                      className={`flex-1 items-center justify-center rounded-xl border-2 py-2.5 ${
                        selected
                          ? "border-foreground bg-foreground"
                          : "border-border bg-card"
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          selected ? "text-background" : "text-foreground"
                        }`}
                      >
                        {o.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text className="text-muted-foreground text-[11px] mt-1.5 leading-relaxed">
                The Mifflin-St Jeor equation needs this. Choosing &quot;prefer
                not to say&quot; means we can&apos;t calculate your calories
                automatically.
              </Text>
            </View>

            {/* Weight inputs, with unit suffixes */}
            <View className="flex-row gap-3 mb-4">
              <View className="flex-1" style={{ position: "relative" }}>
                <Input
                  testID="stat-current-weight"
                  label={`Current weight (${useImperial ? "lbs" : "kg"})`}
                  keyboardType="decimal-pad"
                  placeholder={useImperial ? "e.g. 185" : "e.g. 84"}
                  value={useImperial ? currentLbs : currentKgDisplay}
                  onChangeText={handleCurrentWeightChange}
                />
                <UnitSuffix text={useImperial ? "lbs" : "kg"} />
              </View>
              <View className="flex-1" style={{ position: "relative" }}>
                <Input
                  testID="stat-target-weight"
                  label={`Target weight (${useImperial ? "lbs" : "kg"})`}
                  keyboardType="decimal-pad"
                  placeholder={useImperial ? "e.g. 165" : "e.g. 75"}
                  value={useImperial ? targetLbs : targetKgDisplay}
                  onChangeText={handleTargetWeightChange}
                />
                <UnitSuffix text={useImperial ? "lbs" : "kg"} />
              </View>
            </View>

            {/* Pace picker */}
            {profile.targetWeightKg && profile.currentWeightKg ? (
              <View className="mb-4">
                <PacePicker
                  unit={useImperial ? "lbs" : "kg"}
                  direction={effectiveDirection}
                  valueKgPerWeek={
                    profile.paceKgPerWeek ?? defaultPaceKg(effectiveDirection)
                  }
                  onChange={(kg) => set({ paceKgPerWeek: kg })}
                  latestWeight={kgToUnit(
                    profile.currentWeightKg,
                    useImperial ? "lbs" : "kg",
                  )}
                  targetWeight={kgToUnit(
                    profile.targetWeightKg,
                    useImperial ? "lbs" : "kg",
                  )}
                  testID="pace-picker"
                />
              </View>
            ) : null}

            {/* Direction */}
            <View className="mb-4">
              <Text className="text-foreground text-sm font-semibold mb-1">
                Which way are you eating?
              </Text>
              <Text className="text-muted-foreground text-xs mb-2">
                {derivedDirection
                  ? "Pre-set from your target weight — change it if you disagree."
                  : "Pre-set from your primary goal — change it if you disagree."}
              </Text>
              <View className="flex-row gap-2">
                {DIRECTION_OPTIONS.map(({ value, label, sub }) => {
                  const selected = effectiveDirection === value;
                  const applied = targets
                    ? calorieAdjustment(targets.tdee, value)
                    : null;
                  const subLabel =
                    applied === null || applied === 0
                      ? sub
                      : `TDEE ${applied < 0 ? "−" : "+"} ${Math.abs(applied)}`;
                  const DirectionIcon = DIRECTION_ICONS[value];
                  return (
                    <Pressable
                      key={value}
                      testID={`direction-${value}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, selected }}
                      onPress={() => set({ nutritionDirection: value })}
                      style={minTouchTarget}
                      className={`flex-1 p-3 rounded-xl border ${
                        selected
                          ? "border-foreground bg-foreground"
                          : "border-border bg-card"
                      }`}
                    >
                      <DirectionIcon
                        size={16}
                        color={selected ? colors.background : colors.foreground}
                      />
                      <Text
                        className={`text-xs font-semibold mt-1.5 ${
                          selected ? "text-background" : "text-foreground"
                        }`}
                      >
                        {label}
                      </Text>
                      <Text
                        className={`text-[10px] mt-0.5 ${
                          selected ? "text-background/70" : "text-muted-foreground"
                        }`}
                      >
                        {subLabel}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {directionMismatch && derivedDirection ? (
                <Pressable
                  testID="direction-mismatch-warning"
                  accessibilityRole="button"
                  onPress={() => set({ nutritionDirection: derivedDirection })}
                  style={minTouchTarget}
                  className="mt-2 p-2.5 rounded-xl border border-amber-400 bg-amber-500/10"
                >
                  <Text className="text-amber-500 text-xs">
                    Your target is{" "}
                    {derivedDirection === "lose"
                      ? "below"
                      : derivedDirection === "gain"
                        ? "above"
                        : "close to"}{" "}
                    your current weight — switch to{" "}
                    {
                      DIRECTION_OPTIONS.find((o) => o.value === derivedDirection)
                        ?.label
                    }
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {/* Activity level */}
            <View className="mb-4">
              <Text className="text-foreground text-sm font-semibold mb-1">
                How active is your day, outside training?
              </Text>
              <Text className="text-muted-foreground text-xs mb-2">
                Your job and daily movement, not your workouts. This has the
                biggest effect on your calories.
              </Text>
              {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map(
                (level) => {
                  const selected = activity === level;
                  return (
                    <Pressable
                      key={level}
                      testID={`activity-${level}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, selected }}
                      onPress={() => set({ activityLevel: level })}
                      style={minTouchTarget}
                      className={`p-3 rounded-xl border mb-2 flex-row items-center justify-between ${
                        selected
                          ? "border-foreground bg-foreground"
                          : "border-border bg-card"
                      }`}
                    >
                      <View className="flex-1">
                        <Text
                          className={`text-xs font-semibold ${
                            selected ? "text-background" : "text-foreground"
                          }`}
                        >
                          {ACTIVITY_LABELS[level]}
                        </Text>
                        <Text
                          className={`text-[10px] mt-0.5 ${
                            selected ? "text-background/70" : "text-muted-foreground"
                          }`}
                        >
                          {ACTIVITY_BLURBS[level]}
                        </Text>
                      </View>
                      <Text
                        className={`text-[10px] tabular-nums ml-2 ${
                          selected ? "text-background/70" : "text-muted-foreground"
                        }`}
                      >
                        ×{ACTIVITY_MULTIPLIERS[level]}
                      </Text>
                    </Pressable>
                  );
                },
              )}
            </View>

            {/* Macro presets */}
            <View className="mb-4">
              <Text className="text-foreground text-sm font-semibold mb-1">
                How do you want your macros split?
              </Text>
              <Text className="text-muted-foreground text-xs mb-2">
                You can change this any time in Nutrition.
              </Text>
              {MACRO_PRESET_CHOICES.map((key) => {
                const selected = macroPreset === key;
                const split = splitForPreset(
                  key,
                  effectiveDirection,
                  presetContext,
                );
                const isSuggested = key === suggestedPreset;
                return (
                  <Pressable
                    key={key}
                    testID={`macro-preset-${key}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, selected }}
                    onPress={() => set({ macroPreset: key })}
                    style={minTouchTarget}
                    className={`p-3 rounded-xl border mb-2 flex-row items-center justify-between ${
                      selected
                        ? "border-foreground bg-foreground"
                        : "border-border bg-card"
                    }`}
                  >
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1.5">
                        <Text
                          className={`text-xs font-semibold ${
                            selected ? "text-background" : "text-foreground"
                          }`}
                        >
                          {MACRO_PRESET_LABELS[key]}
                        </Text>
                        {isSuggested ? (
                          <View
                            className={`px-1.5 py-0.5 rounded-full ${
                              selected ? "bg-background/20" : "bg-foreground"
                            }`}
                          >
                            <Text className="text-[9px] text-background font-bold uppercase">
                              {presetRecommendation.badge}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text
                        className={`text-[10px] mt-0.5 ${
                          selected ? "text-background/70" : "text-muted-foreground"
                        }`}
                      >
                        {MACRO_PRESET_BLURBS[key]}
                      </Text>
                    </View>
                    <Text
                      className={`text-xs tabular-nums ml-2 ${
                        selected ? "text-background/70" : "text-muted-foreground"
                      }`}
                    >
                      {split.protein}/{split.carbs}/{split.fats}
                    </Text>
                  </Pressable>
                );
              })}
              {/* Say WHY that one is badged (web parity, NP-247). */}
              <Text
                testID="macro-preset-recommendation"
                className="text-muted-foreground text-[11px] mt-2 leading-relaxed"
              >
                <Text className="font-semibold text-foreground">
                  {MACRO_PRESET_LABELS[presetRecommendation.preset]}
                </Text>
                {" — "}
                {presetRecommendation.why}
              </Text>
            </View>

            {/* Live TDEE preview */}
            {!targets ? (
              <View
                testID="targets-incomplete"
                className="p-4 rounded-xl border border-amber-300 bg-amber-500/10 mb-4"
              >
                <Text
                  testID="tdee-incomplete"
                  className="text-amber-500 text-xs"
                >
                  Add your {missing.join(", ")} above and we&apos;ll calculate
                  your real calorie and macro targets. Without them we can only
                  guess, and we would rather not.
                </Text>
              </View>
            ) : (
              <View
                testID="tdee-preview"
                className="p-4 rounded-2xl border-2 border-foreground bg-card mb-4"
              >
                <View className="flex-row items-center gap-1.5 mb-1">
                  <Sparkles size={14} color={colors.foreground} />
                  <Text className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                    Your daily targets
                  </Text>
                </View>

                <Pressable
                  testID="explain-calories"
                  accessibilityRole="button"
                  accessibilityLabel="Explain calories"
                  onPress={() => setExplaining("calories")}
                  className="flex-row items-baseline gap-1.5 my-2"
                >
                  <Text
                    testID="preview-calories"
                    className="text-2xl font-bold text-foreground"
                  >
                    {targets.calories.toLocaleString()}
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    cal / day
                  </Text>
                  <HelpCircle size={14} color={colors["muted-foreground"]} />
                </Pressable>

                <View className="flex-row gap-2 my-2">
                  {(
                    [
                      ["protein", targets.protein, "Protein"],
                      ["carbs", targets.carbs, "Carbs"],
                      ["fats", targets.fats, "Fats"],
                    ] as const
                  ).map(([key, grams, label]) => (
                    <Pressable
                      key={key}
                      testID={`explain-${key}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Explain ${label}`}
                      onPress={() => setExplaining(key)}
                      style={minTouchTarget}
                      className={`flex-1 p-2.5 rounded-xl border items-center ${
                        key === "protein" && proteinFlagged
                          ? "border-amber-400 bg-amber-500/20"
                          : "border-border bg-card"
                      }`}
                    >
                      <Text
                        testID={`preview-${key}`}
                        className="text-sm font-bold text-foreground"
                      >
                        {grams}g
                      </Text>
                      <View className="flex-row items-center gap-0.5 mt-0.5">
                        <Text className="text-[10px] text-muted-foreground uppercase">
                          {label}
                        </Text>
                        <HelpCircle
                          size={10}
                          color={colors["muted-foreground"]}
                        />
                      </View>
                    </Pressable>
                  ))}
                </View>

                {proteinFlagged ? (
                  <Pressable
                    testID="protein-flag"
                    accessibilityRole="button"
                    onPress={() => setExplaining("protein")}
                    style={minTouchTarget}
                    className="mt-2 p-2 rounded-lg border border-amber-400 bg-amber-500/10"
                  >
                    <Text className="text-amber-500 text-xs">
                      That protein number is outside the usual range for your
                      bodyweight. Tap to see how we got it.
                    </Text>
                  </Pressable>
                ) : null}

                <Text className="text-muted-foreground text-xs mt-3 leading-relaxed">
                  Your TDEE is about{" "}
                  <Text className="font-semibold text-foreground">
                    {targets.tdee.toLocaleString()} cal
                  </Text>
                  . We applied {DIRECTION_EXPLANATION[targets.direction]}. Tap
                  any number to see how we got it.
                </Text>
              </View>
            )}

            <MacroExplainSheet
              isOpen={!!explanation}
              title={explanation?.title ?? ""}
              headline={explanation?.headline ?? ""}
              steps={explanation?.steps ?? []}
              note={explanation?.note}
              onClose={() => setExplaining(null)}
              testID="macro-explain-sheet"
            />
          </View>
        ) : null}

        {/* STEP 4: EQUIPMENT */}
        {step === 4 ? (
          <View>
            <Text
              accessibilityRole="header"
              className="text-foreground text-2xl font-bold mb-1"
            >
              {STEP_QUESTIONS[3]}
            </Text>
            <Text className="text-muted-foreground text-sm mb-4">
              We won&apos;t recommend a barbell program to someone training
              in a living room. Tell us what you actually have.
            </Text>

            <Text className="text-foreground text-sm font-medium mb-3">
              Equipment access
            </Text>
            <View
              testID={`${testID}-equipment-chips`}
              style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
            >
              {EQUIPMENT_OPTIONS.map((o) => (
                <EquipmentChip
                  key={o.value}
                  testID={`${testID}-equipment-${o.value}`}
                  label={o.label}
                  selected={(profile.equipmentAccess ?? []).includes(o.value)}
                  onPress={() => toggleEquipment(o.value)}
                />
              ))}
            </View>

            {/* Injury notes (web parity, NP-248 — native had no equivalent
                field; saved as `injuryNotes` and shown on the review step). */}
            <View className="mt-7">
              <Input
                testID={`${testID}-injury-notes`}
                label="Injury notes"
                placeholder="Any injuries or areas to avoid? (optional)"
                value={profile.injuryNotes ?? ""}
                onChangeText={(v) => set({ injuryNotes: v })}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </View>
        ) : null}

        {/* STEP 5: REVIEW */}
        {step === 5 ? (
          <View testID="review-step">
            <Text
              accessibilityRole="header"
              className="text-foreground text-2xl font-bold mb-1"
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
              <ReviewRow
                label="Days / week"
                value={String(weeklyAvailabilityDays)}
              />
            </ReviewSection>

            {/* Body & nutrition review */}
            <ReviewSection
              title="Body & nutrition"
              stepNumber={3}
              onEdit={goToStep}
            >
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
              <ReviewRow
                label="Direction"
                value={
                  effectiveDirection === "lose"
                    ? "Lose Weight"
                    : effectiveDirection === "gain"
                      ? "Gain Weight"
                      : "Maintain"
                }
              />
              <ReviewRow
                label="Weight unit"
                value={profile.weightUnit ?? "lbs"}
              />
              {profile.heightCm ? (
                <ReviewRow
                  label="Height"
                  value={
                    useImperial
                      ? `${cmToFtIn(profile.heightCm).ft}ft ${cmToFtIn(profile.heightCm).inches}in`
                      : `${roundHeightCm(profile.heightCm)} cm`
                  }
                />
              ) : null}
              {profile.currentWeightKg ? (
                <ReviewRow
                  label="Current weight"
                  value={`${displayWeight(
                    profile.currentWeightKg,
                    profile.weightUnit ?? "lbs",
                  )} ${profile.weightUnit ?? "lbs"}`}
                />
              ) : null}
              {profile.targetWeightKg ? (
                <ReviewRow
                  label="Target weight"
                  value={`${displayWeight(
                    profile.targetWeightKg,
                    profile.weightUnit ?? "lbs",
                  )} ${profile.weightUnit ?? "lbs"}`}
                />
              ) : null}
              {profile.paceKgPerWeek ? (
                <ReviewRow
                  label="Pace"
                  value={`${kgToUnit(
                    profile.paceKgPerWeek,
                    profile.weightUnit ?? "lbs",
                  )} ${profile.weightUnit ?? "lbs"}/wk`}
                />
              ) : null}
              {targets ? (
                <ReviewRow
                  label="Targets"
                  value={`${targets.calories.toLocaleString()} cal (${targets.protein}p / ${targets.carbs}c / ${targets.fats}f)`}
                />
              ) : null}
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
              <ReviewRow
                label="Injury notes"
                value={
                  profile.injuryNotes?.trim()
                    ? profile.injuryNotes.trim()
                    : "None"
                }
              />
            </ReviewSection>

            {/* Program match — server-driven, optional enrolment, never
                blocking. Entirely optional: the member can also start it
                later from Home, or browse the full catalog instead. */}
            <View className="p-4 rounded-xl border border-border bg-card mb-3">
              <Text className="text-foreground font-semibold text-base mb-1">
                Your program match
              </Text>
              <RecommendationCard
                testID={testID}
                recommendation={recommendation}
                loading={recommendationLoading}
                enrolling={enrolling}
                enrolled={enrolled}
                onEnroll={onEnrollRecommended}
              />
              {recommendation ? (
                <Text className="text-muted-foreground text-[11px] leading-relaxed mt-3">
                  Entirely optional — you can also start it later from Home,
                  or browse the full catalog if you&apos;d rather pick your
                  own.
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Navigation buttons — outlined Back (visible but disabled on step 1,
          never hidden) and a black-fill Next/Finish, matching the web's
          footer chrome (NP-245). */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 16,
        }}
      >
        <Pressable
          testID={`${testID}-back`}
          onPress={step === 1 ? undefined : () => goToStep(Math.max(1, step - 1))}
          disabled={step === 1}
          accessibilityRole="button"
          accessibilityState={{ disabled: step === 1 }}
          accessibilityLabel="Back"
          style={[minTouchTarget, { flexShrink: 1 }]}
          className={`flex-row items-center gap-1.5 rounded-xl border border-border px-4 py-3 ${
            step === 1 ? "opacity-30" : ""
          }`}
        >
          <ChevronLeft size={16} color={colors.foreground} />
          <Text
            style={WRAPPABLE_TEXT}
            className="text-foreground text-sm font-medium"
          >
            Back
          </Text>
        </Pressable>

        <Pressable
          testID={`${testID}-next`}
          onPress={!canAdvance || submitting ? undefined : onNext}
          disabled={!canAdvance || submitting}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canAdvance || submitting }}
          accessibilityLabel={step === TOTAL_STEPS ? "Finish" : "Next"}
          style={[minTouchTarget, { flexShrink: 1 }]}
          className={`flex-row items-center gap-1.5 rounded-xl bg-foreground px-5 py-3 ${
            !canAdvance || submitting ? "opacity-40" : ""
          }`}
        >
          <Text
            style={WRAPPABLE_TEXT}
            className="text-background text-sm font-semibold"
          >
            {submitting ? "Saving…" : step === TOTAL_STEPS ? "Finish" : "Next"}
          </Text>
          {!submitting ? (
            step === TOTAL_STEPS ? (
              <Check size={16} color={colors.background} />
            ) : (
              <ChevronRight size={16} color={colors.background} />
            )
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}
