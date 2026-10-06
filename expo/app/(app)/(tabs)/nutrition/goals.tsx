import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Calculator, Save, Scale } from "lucide-react-native";
import { z } from "zod";
import {
  apiFetch,
  GoalProgressResponseSchema,
  NutritionGoalsRequestSchema,
  NutritionGoalsResponseSchema,
  NutritionGoalsWriteResponseSchema,
  ProfileResponseSchema,
  ProgressApiResponseSchema,
  WeightPostRequestSchema,
  LogWeightResponseSchema,
  type GoalProgressResponse,
} from "@become/api-client";
import {
  ACTIVITY_LABELS,
  DIRECTION_ADJUSTMENT,
  DIRECTION_LABELS,
  DIRECTION_EXPLANATION,
  calcTdee,
  calorieAdjustment,
  computeNutritionTargets,
  deliveredSplit,
  gramsFromPercent,
  percentFromGrams,
  splitFromGrams,
  explainCalories,
  explainMacro,
  proteinNeedsFlag,
  MACRO_PRESET_LABELS,
  MACRO_LABELS,
  toKg,
  kgToLbs,
  roundWeight,
  ftInToCm,
  cmToFtIn,
  displayWeight,
  defaultPaceKg,
  type MacroPreset,
  type MacroSplit,
  type MacroKey,
  type ActivityLevel,
  type NutritionDirection,
  type WeightUnit,
} from "@become/core";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Text } from "@/components/Text";
import { ScreenState } from "@/components/ScreenState";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useLocalDay, withTz } from "@/lib/time/localDay";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { NutritionPlanCard } from "@/components/goals/NutritionPlanCard";
import { PacePicker } from "@/components/goals/PacePicker";
import { MacroExplainSheet } from "@/components/nutrition/MacroExplainSheet";
import { WeightLogSheet } from "@/components/dashboard/WeightLogSheet";
import { GoalsWeightChart } from "@/components/nutrition/GoalsWeightChart";

/**
 * Nutrition goals (NP-148) — the native port of
 * `webapp/app/dashboard/nutrition/goals/page.tsx`.
 *
 * NEVER re-derives a target natively: every calorie/macro number on this
 * screen comes out of `computeNutritionTargets()` / `calorieAdjustment()` /
 * `deliveredSplit()` from `@become/core` — the same module the onboarding
 * wizard reads — and the direction/preset labels come from the same module
 * too. Saving writes the identical POST /api/nutrition/goals body the web
 * writes, so the same inputs save identical targets on both clients.
 *
 * Tabs mirror the web's Goals/Weight segmented control. The Weight tab's
 * chart is `GoalsWeightChart` (NP-266) — a 1:1 port of the web's PLAIN
 * weight line (react-native-svg, theme tokens), not the dashboard's
 * multi-metric `ProgressChart`, which the web's goals screen never embeds.
 */

type GoalType = NutritionDirection;

interface NutritionGoalsForm {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  waterGoal: number;
  goalType: GoalType;
  activityLevel: ActivityLevel;
}

const MACRO_PRESET_KEYS: MacroPreset[] = [
  "recommended",
  "balanced",
  "high_protein",
  "low_carb",
  "custom",
];

const MACRO_KCAL_PER_G = { protein: 4, carbs: 4, fats: 9 } as const;

/** Same three values as the NutritionGoal schema enum. */
function asGoalType(v: unknown): GoalType {
  return v === "lose" || v === "gain" ? v : "maintain";
}

function asActivityLevel(v: unknown): ActivityLevel {
  return v === "sedentary" ||
    v === "light" ||
    v === "moderate" ||
    v === "active" ||
    v === "very_active"
    ? v
    : "moderate";
}

/**
 * The adjustment line under each direction card. Runs through
 * calorieAdjustment() with the member's own pace — never the flat
 * DIRECTION_ADJUSTMENT constant — so a 0.5 lb/week plan says −250 and a
 * 1.5 lb/week plan says −750 (subject to the same safety cap either way).
 */
function goalCardAdjustment(
  type: GoalType,
  tdee: number | null,
  paceLbPerWeek?: number,
): string {
  if (type === "maintain") return "TDEE";
  const applied =
    tdee != null
      ? calorieAdjustment(tdee, type, paceLbPerWeek)
      : DIRECTION_ADJUSTMENT[type];
  return `TDEE ${applied > 0 ? "+" : "−"} ${Math.abs(applied)} cal`;
}

/**
 * The percentages an option advertises are the percentages the Daily Targets
 * card below will show once it is picked — never a table lookup. The caller
 * passes the split those grams actually work out to (see presetSplits) and
 * this only formats it.
 */
function presetLabel(key: MacroPreset, split: MacroSplit | null): string {
  if (key === "custom") return MACRO_PRESET_LABELS.custom;
  const suffix = key === "recommended" ? " (from your stats)" : "";
  const name = `${MACRO_PRESET_LABELS[key]}${suffix}`;
  return split ? `${name} — ${split.protein}/${split.carbs}/${split.fats}` : name;
}

export default function NutritionGoalsRoute() {
  const router = useRouter();
  const { token } = useAuth();
  const { colors } = useThemeTokens();
  const { tzOffset } = useLocalDay();

  const [form, setForm] = useState<NutritionGoalsForm>({
    calories: 2000,
    protein: 150,
    carbs: 200,
    fats: 65,
    waterGoal: 96,
    goalType: "maintain",
    activityLevel: "moderate",
  });
  const [goalsAreDefault, setGoalsAreDefault] = useState(false);
  const [macroPreset, setMacroPreset] = useState<MacroPreset>("recommended");
  const [macroInputMode, setMacroInputMode] = useState<"g" | "%">("g");
  const [userWeight, setUserWeight] = useState<number | null>(null);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("lbs");
  const [profileWeightKg, setProfileWeightKg] = useState<number | null>(null);
  const [userHeightCm, setUserHeightCm] = useState<number | null>(null);
  const [userAge, setUserAge] = useState<number | null>(null);
  const [userSex, setUserSex] = useState<"male" | "female" | null>(null);
  const [userFitnessGoals, setUserFitnessGoals] = useState<string[]>([]);
  const [manualAge, setManualAge] = useState("");
  const [manualSex, setManualSex] = useState<"male" | "female" | "">("");
  const [manualHeightFt, setManualHeightFt] = useState("");
  const [manualHeightIn, setManualHeightIn] = useState("");
  const [activeTab, setActiveTab] = useState<"goals" | "weight">("goals");
  const [weightSheetOpen, setWeightSheetOpen] = useState(false);
  const [weightSeries, setWeightSeries] = useState<{ date: string; value: number }[]>([]);
  const [targetWeightKg, setTargetWeightKg] = useState<number | null>(null);
  const [planRefreshKey, setPlanRefreshKey] = useState(0);
  const [planPaceKgPerWeek, setPlanPaceKgPerWeek] = useState<number | null>(null);
  const [planPaceDirection, setPlanPaceDirection] = useState<GoalType | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [explaining, setExplaining] = useState<MacroKey | "calories" | null>(null);
  const [loggingWeight, setLoggingWeight] = useState(false);

  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    }),
    [token],
  );

  const goalsFetch = useFetch("/api/nutrition/goals", NutritionGoalsResponseSchema, fetchOpts);
  const progressFetch = useFetch(
    withTz("/api/progress", tzOffset),
    ProgressApiResponseSchema,
    fetchOpts,
  );
  const profileFetch = useFetch("/api/profile", ProfileResponseSchema, fetchOpts);
  const planFetch = useFetch(withTz("/api/goals", tzOffset), GoalProgressResponseSchema, {
    ...fetchOpts,
    skip: !token,
  });

  const loading =
    goalsFetch.loading || progressFetch.loading || profileFetch.loading || planFetch.loading;
  const loadError =
    !goalsFetch.data && !progressFetch.data && !profileFetch.data && !planFetch.data
      ? (goalsFetch.error ?? progressFetch.error ?? profileFetch.error ?? planFetch.error)
      : null;

  // Seed local state from the four reads, exactly the way the web page does.
  // Each effect syncs from something outside React (a network response).
  useEffect(() => {
    const goalsData = goalsFetch.data;
    if (goalsData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from network response
      setGoalsAreDefault(!!(goalsData as { _isDefault?: boolean })._isDefault);
      if (MACRO_PRESET_KEYS.includes(goalsData.macroPreset as MacroPreset)) {
        setMacroPreset(goalsData.macroPreset as MacroPreset);
      }
      setForm({
        calories: goalsData.calories || 2000,
        protein: goalsData.protein || 150,
        carbs: goalsData.carbs || 200,
        fats: goalsData.fats || 65,
        waterGoal: goalsData.waterGoal || 96,
        goalType: asGoalType(goalsData.goalType),
        activityLevel: asActivityLevel(goalsData.activityLevel),
      });
    }
  }, [goalsFetch.data]);

  useEffect(() => {
    const progressData = progressFetch.data;
    if (progressData) {
      if (progressData.weightData && progressData.weightData.length > 0) {
        const latest = progressData.weightData[progressData.weightData.length - 1];
        if (latest) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from network response
          setUserWeight(latest.value);
        }
      }
      setWeightSeries(progressData.weightData ?? []);
      if (progressData.goal?.targetWeightKg) {
        setTargetWeightKg(progressData.goal.targetWeightKg);
      }
    }
  }, [progressFetch.data]);

  useEffect(() => {
    const profileData = profileFetch.data;
    if (profileData) {
      const profile = (profileData.profile ?? {}) as Record<string, unknown>;
      if (typeof profile.age === "number") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from network response
        setUserAge(profile.age);
      }
      if (typeof profile.heightCm === "number") {
        setUserHeightCm(profile.heightCm);
      }
      if (profile.weightUnit === "kg" || profile.weightUnit === "lbs") {
        setWeightUnit(profile.weightUnit);
      }
      if (typeof profile.currentWeightKg === "number") {
        setProfileWeightKg(profile.currentWeightKg);
      }
      if (profile.biologicalSex === "male" || profile.biologicalSex === "female") {
        setUserSex(profile.biologicalSex);
      }
      const goalSet: string[] = Array.isArray(profile.fitnessGoals)
        ? (profile.fitnessGoals as string[])
        : typeof profile.fitnessGoal === "string"
          ? [profile.fitnessGoal as string]
          : [];
      setUserFitnessGoals(goalSet);
    }
  }, [profileFetch.data]);

  useEffect(() => {
    const plan: GoalProgressResponse | null = planFetch.data;
    if (plan) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from network response
      setPlanPaceKgPerWeek(plan.nutrition?.target?.paceKgPerWeek ?? null);
      setPlanPaceDirection((plan.nutrition?.direction as GoalType | null) ?? null);
    }
  }, [planFetch.data]);

  /** Profile values with the manual fallbacks folded in. */
  const effectiveStats = useMemo(() => {
    const age = userAge ?? (manualAge ? parseInt(manualAge, 10) : null);
    const sex = (userSex ?? (manualSex || null)) as "male" | "female" | null;
    const heightCm =
      userHeightCm ??
      (manualHeightFt ? ftInToCm(parseInt(manualHeightFt, 10), parseInt(manualHeightIn || "0", 10)) : null);
    return {
      age: age ?? undefined,
      biologicalSex: sex ?? undefined,
      heightCm: heightCm ?? undefined,
      // The profile's kg value is canonical. The logged weight is only a
      // fallback — and it MUST be read through the member's unit.
      currentWeightKg:
        profileWeightKg ?? (userWeight ? toKg(userWeight, weightUnit) : undefined),
    };
  }, [userAge, userSex, userHeightCm, userWeight, weightUnit, profileWeightKg, manualAge, manualSex, manualHeightFt, manualHeightIn]);

  /** Pace only applies to the direction it was chosen for. */
  const paceForDirection = useCallback(
    (goalType?: GoalType, override?: number): number | undefined => {
      if (override !== undefined) return override;
      return goalType && goalType === planPaceDirection
        ? (planPaceKgPerWeek ?? undefined)
        : undefined;
    },
    [planPaceDirection, planPaceKgPerWeek],
  );

  const applyGoalAdjustment = useCallback(
    (baseTdee: number, goalType: GoalType, paceKgPerWeekOverride?: number): number => {
      const paceKg = paceForDirection(goalType, paceKgPerWeekOverride);
      const paceLb = paceKg != null ? kgToLbs(paceKg) : undefined;
      return baseTdee + calorieAdjustment(baseTdee, goalType, paceLb);
    },
    [paceForDirection],
  );

  /**
   * Writes calories + macros for a preset. 'recommended' defers to the
   * shared computeNutritionTargets(); the percentage presets keep their
   * historical behaviour.
   */
  const applyMacroPreset = useCallback(
    (
      preset: MacroPreset,
      cals: number,
      goalType?: GoalType,
      activity?: ActivityLevel,
      statsOverride?: typeof effectiveStats,
      paceKgPerWeekOverride?: number,
    ) => {
      if (preset === "custom") return;
      const targets = computeNutritionTargets({
        ...(statsOverride ?? effectiveStats),
        goals: userFitnessGoals as ("lose_weight" | "gain_muscle" | "maintain" | "improve_performance" | "general_health")[],
        direction: goalType,
        activityLevel: activity,
        macroPreset: preset,
        paceKgPerWeek: paceForDirection(goalType, paceKgPerWeekOverride),
      });
      if (!targets) return;
      setForm((prev) => ({
        ...prev,
        calories: preset === "recommended" ? targets.calories : cals,
        protein: targets.protein,
        carbs: targets.carbs,
        fats: targets.fats,
      }));
    },
    [effectiveStats, userFitnessGoals, paceForDirection],
  );

  /**
   * What each option in the picker will actually deliver, as the percentages
   * the Daily Targets card renders — so whichever option is selected, its
   * label and the targets underneath it are the same numbers by
   * construction.
   */
  const presetSplits = useMemo(() => {
    const splits = {} as Record<MacroPreset, MacroSplit | null>;
    for (const key of MACRO_PRESET_KEYS) {
      splits[key] = deliveredSplit(key, {
        ...effectiveStats,
        goals: userFitnessGoals as ("lose_weight" | "gain_muscle" | "maintain" | "improve_performance" | "general_health")[],
        direction: form.goalType,
        activityLevel: form.activityLevel,
        paceKgPerWeek: paceForDirection(form.goalType),
      });
    }
    return splits;
  }, [effectiveStats, userFitnessGoals, form.goalType, form.activityLevel, paceForDirection]);

  // TDEE is derived during render from body stats + activity — never stored
  // in an effect — so it can never lag a weigh-in or a manual-stat edit.
  const tdee = calcTdee(effectiveStats, form.activityLevel);

  /**
   * Single path for "recompute calories + macros" so goal, activity and
   * preset changes can never diverge from each other.
   */
  const applyTargets = useCallback(
    (
      preset: MacroPreset,
      goalType: GoalType,
      activity: ActivityLevel,
      tdeeOverride?: number,
      statsOverride?: typeof effectiveStats,
      paceKgPerWeekOverride?: number,
    ) => {
      const effectiveTdee = tdeeOverride ?? tdee;
      if (!effectiveTdee) return;
      const adjustedCals = applyGoalAdjustment(effectiveTdee, goalType, paceKgPerWeekOverride);
      if (preset === "custom") {
        setForm((prev) => ({ ...prev, calories: adjustedCals }));
        return;
      }
      applyMacroPreset(preset, adjustedCals, goalType, activity, statsOverride, paceKgPerWeekOverride);
    },
    [tdee, applyGoalAdjustment, applyMacroPreset],
  );

  // Auto-apply TDEE on first load if the member has never saved goals.
  // Both state writes below sync from something outside React (the first
  // network load completing), which is the one case AGENTS.md allows the
  // suppression for — one directive covers the whole effect body.
  const [didAutoApply, setDidAutoApply] = useState(false);
  useEffect(() => {
    if (!tdee || loading || didAutoApply) return;
    if (goalsAreDefault) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from first network load completing
      applyTargets(macroPreset, form.goalType, form.activityLevel);
      setDidAutoApply(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tdee, loading]);

  const handleGoalTypeChange = (goalType: GoalType) => {
    setForm((prev) => ({ ...prev, goalType }));
    applyTargets(macroPreset, goalType, form.activityLevel);
  };

  const handleActivityChange = (activityLevel: ActivityLevel) => {
    setForm((prev) => ({ ...prev, activityLevel }));
  };

  const handleRecalculate = () => {
    applyTargets(macroPreset, form.goalType, form.activityLevel);
  };

  const handlePresetChange = (preset: MacroPreset) => {
    setMacroPreset(preset);
    if (preset !== "custom") {
      applyMacroPreset(preset, form.calories, form.goalType, form.activityLevel);
    }
  };

  /**
   * The Plan card's pace picker writes straight to the Goal — this is the
   * other half of the connection: recompute calories/macros for the new pace
   * right away, taking the pace explicitly (state hasn't landed yet).
   */
  const handlePlanPaceChange = useCallback(
    (paceKgPerWeek: number, direction: GoalType) => {
      setPlanPaceKgPerWeek(paceKgPerWeek);
      setPlanPaceDirection(direction);
      if (direction === form.goalType) {
        applyTargets(macroPreset, form.goalType, form.activityLevel, undefined, undefined, paceKgPerWeek);
      }
    },
    [form.goalType, form.activityLevel, macroPreset, applyTargets],
  );

  /**
   * Logging a weigh-in moves every number that reads off body weight: the
   * chart point, the TDEE estimate, and — since TDEE feeds calories/macros —
   * the daily targets too.
   */
  const handleWeightLogged = useCallback(
    (weight: number) => {
      const todayLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
      setWeightSeries((prev) => {
        const filtered = prev.filter((d) => d.date !== todayLabel);
        return [...filtered, { date: todayLabel, value: weight }];
      });
      const kg = toKg(weight, weightUnit);
      setUserWeight(weight);
      setProfileWeightKg(kg);
      setPlanRefreshKey((k) => k + 1);

      const nextStats = { ...effectiveStats, currentWeightKg: kg };
      const nextTdee = calcTdee(nextStats, form.activityLevel);
      applyTargets(macroPreset, form.goalType, form.activityLevel, nextTdee ?? undefined, nextStats);
    },
    [weightUnit, effectiveStats, form.activityLevel, form.goalType, macroPreset, applyTargets],
  );

  const submitWeightLog = useCallback(
    async (weight: number) => {
      if (!token || loggingWeight) return;
      setLoggingWeight(true);
      try {
        const body = WeightPostRequestSchema.parse({
          weight,
          tz: new Date().getTimezoneOffset(),
        });
        await apiFetch("/api/weight", LogWeightResponseSchema, {
          method: "POST",
          body,
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        });
        handleWeightLogged(weight);
      } finally {
        setLoggingWeight(false);
      }
    },
    [token, loggingWeight, handleWeightLogged],
  );

  const percentages = splitFromGrams(form.protein, form.carbs, form.fats);
  const isPercentMode = macroPreset === "custom" && macroInputMode === "%";

  const macroFieldValue = (key: keyof typeof MACRO_KCAL_PER_G) =>
    isPercentMode ? percentFromGrams(form.calories, form[key], MACRO_KCAL_PER_G[key]) : form[key];

  const handleMacroFieldChange = (key: keyof typeof MACRO_KCAL_PER_G, rawValue: number) => {
    const grams = isPercentMode
      ? gramsFromPercent(form.calories, rawValue, MACRO_KCAL_PER_G[key])
      : rawValue;
    setForm((prev) => ({ ...prev, [key]: grams }));
    setMacroPreset("custom");
  };

  const handleSave = async () => {
    if (!token || saving) return;
    setSaving(true);
    setSaveMessage("");
    try {
      // The identical body the web writes, so the same inputs save
      // identical targets on both clients.
      const body = NutritionGoalsRequestSchema.parse({ ...form, macroPreset });
      await apiFetch("/api/nutrition/goals", NutritionGoalsWriteResponseSchema, {
        method: "POST",
        body,
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
      });
      setSaveMessage("Goals saved successfully!");
    } catch {
      setSaveMessage("Failed to save goals");
    } finally {
      setSaving(false);
    }
  };

  const goalCards = useMemo(
    () =>
      (["lose", "maintain", "gain"] as GoalType[]).map((type) => ({
        type,
        label: DIRECTION_LABELS[type],
        description: DIRECTION_EXPLANATION[type],
        adjustment: goalCardAdjustment(
          type,
          tdee,
          type === planPaceDirection && planPaceKgPerWeek != null
            ? kgToLbs(planPaceKgPerWeek)
            : undefined,
        ),
      })),
    [tdee, planPaceDirection, planPaceKgPerWeek],
  );

  const targetWeightDisplay = targetWeightKg ? roundWeight(kgToLbs(targetWeightKg)) : null;

  /** The explain sheet's contents, rebuilt from the SAME targets the card shows. */
  const explanation = useMemo(() => {
    if (!explaining) return null;
    const targets = computeNutritionTargets({
      ...effectiveStats,
      goals: userFitnessGoals as ("lose_weight" | "gain_muscle" | "maintain" | "improve_performance" | "general_health")[],
      direction: form.goalType,
      activityLevel: form.activityLevel,
      macroPreset: macroPreset === "custom" ? undefined : macroPreset,
      paceKgPerWeek: paceForDirection(form.goalType),
    });
    const calories = macroPreset === "custom" ? form.calories : (targets?.calories ?? form.calories);
    if (explaining === "calories") {
      // explainCalories takes the pace in KG/week (it converts to lb/week
      // itself) — the same value computeNutritionTargets receives.
      const c = explainCalories(
        {
          currentWeightKg: effectiveStats.currentWeightKg,
          heightCm: effectiveStats.heightCm,
          age: effectiveStats.age,
          biologicalSex: effectiveStats.biologicalSex as "male" | "female" | "prefer_not_to_say" | undefined,
        },
        form.activityLevel,
        form.goalType,
        paceForDirection(form.goalType),
      );
      if (!c) return null;
      return {
        title: "Where your calories come from",
        headline: `${c.calories.toLocaleString()} cal / day`,
        steps: c.steps,
        note: undefined,
      };
    }
    const grams = form[explaining];
    const percent = splitFromGrams(form.protein, form.carbs, form.fats)[explaining];
    const m = explainMacro({
      macro: explaining,
      grams,
      calories,
      percent,
      weightKg: effectiveStats.currentWeightKg,
      direction: form.goalType,
      goals: userFitnessGoals as ("lose_weight" | "gain_muscle" | "maintain" | "improve_performance" | "general_health")[],
      presetLabel: MACRO_PRESET_LABELS[macroPreset],
    });
    return {
      title: `Where your ${MACRO_LABELS[explaining].toLowerCase()} comes from`,
      headline: `${m.grams} g${m.perLb ? ` · ${m.perLb} g per lb` : ""}`,
      steps: m.steps,
      note: m.note,
    };
  }, [explaining, effectiveStats, userFitnessGoals, form, macroPreset, paceForDirection]);

  const proteinFlagged =
    !!effectiveStats.currentWeightKg &&
    proteinNeedsFlag(
      form.protein,
      effectiveStats.currentWeightKg,
      form.goalType,
      userFitnessGoals as ("lose_weight" | "gain_muscle" | "maintain" | "improve_performance" | "general_health")[],
    );

  const refetchAll = () => {
    void goalsFetch.refetch();
    void progressFetch.refetch();
    void profileFetch.refetch();
    void planFetch.refetch();
  };

  const hasData = !!(goalsFetch.data || progressFetch.data || profileFetch.data || planFetch.data);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="nutrition-goals-route"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScreenState
          loading={loading}
          error={loadError}
          hasData={hasData}
          onRetry={refetchAll}
          testID="nutrition-goals-screen-state"
        >
          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            testID="nutrition-goals-scroll"
          >
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to nutrition"
                testID="nutrition-goals-back-button"
                onPress={() => router.back()}
                style={[
                  minTouchTarget,
                  {
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}
              >
                <ChevronLeft size={20} color={colors.foreground} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text className="text-foreground text-2xl font-bold">Nutrition Goals</Text>
                <Text className="text-muted-foreground text-sm">
                  Set your daily calorie and macro targets
                </Text>
              </View>
            </View>

            {/* Goals / Weight tabs */}
            <View
              testID="nutrition-goals-tabs"
              accessibilityRole="tablist"
              style={{ flexDirection: "row", gap: 8 }}
            >
              {(["goals", "weight"] as const).map((tab) => {
                const on = activeTab === tab;
                return (
                  <Pressable
                    key={tab}
                    testID={`nutrition-goals-tab-${tab}`}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    onPress={() => setActiveTab(tab)}
                    style={minTouchTarget}
                    className={`flex-1 items-center justify-center rounded-xl border py-2.5 ${
                      on ? "border-foreground bg-foreground" : "border-border bg-card"
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold capitalize ${
                        on ? "text-background" : "text-foreground"
                      }`}
                    >
                      {tab}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* The weight goal as a plan — the at-a-glance status on both tabs. */}
            <NutritionPlanCard
              key={planRefreshKey}
              refreshKey={planRefreshKey}
              onPaceChange={({ paceKgPerWeek, direction }) =>
                handlePlanPaceChange(paceKgPerWeek, direction)
              }
              testID="plan-card"
            />

            {activeTab === "weight" ? (
              <Card testID="nutrition-goals-weight-card">
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                    Body Weight
                  </Text>
                  {targetWeightDisplay ? (
                    <Text
                      testID="nutrition-goals-target-weight"
                      className="text-emerald-600 dark:text-emerald-400 text-xs font-medium"
                    >
                      Goal: {targetWeightDisplay} {weightUnit}
                    </Text>
                  ) : null}
                </View>
                {weightSeries.length > 0 ? (
                  <>
                    <GoalsWeightChart
                      data={weightSeries}
                      targetWeight={targetWeightDisplay}
                      testID="nutrition-goals-weight-chart"
                    />
                    <View style={{ marginTop: 8 }}>
                      <Button
                        testID="nutrition-goals-log-weight"
                        variant="inverted"
                        onPress={() => setWeightSheetOpen(true)}
                      >
                        <Scale size={16} color={colors.background} /> Log Weight
                      </Button>
                    </View>
                  </>
                ) : (
                  <View className="gap-3">
                    <Text className="text-muted-foreground text-sm">No weight logged yet</Text>
                    <Button
                      testID="nutrition-goals-log-weight"
                      variant="inverted"
                      onPress={() => setWeightSheetOpen(true)}
                    >
                      <Scale size={16} color={colors.background} /> Log Weight
                    </Button>
                  </View>
                )}
              </Card>
            ) : (
              <>
                <Card testID="nutrition-goals-stats-card">
                  <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide mb-3">
                    Your Stats
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 24 }}>
                    {(profileWeightKg || userWeight) && (
                      <View>
                        <Text testID="nutrition-goals-current-weight" className="text-foreground text-2xl font-bold">
                          {profileWeightKg ? displayWeight(profileWeightKg, weightUnit) : userWeight}
                          <Text className="text-muted-foreground text-sm font-normal"> {weightUnit}</Text>
                        </Text>
                        <Text className="text-muted-foreground text-xs">Current Weight</Text>
                      </View>
                    )}
                    {userHeightCm && (
                      <View>
                        <Text className="text-foreground text-2xl font-bold">
                          {cmToFtIn(userHeightCm).ft}&apos;{cmToFtIn(userHeightCm).inches}&quot;
                        </Text>
                        <Text className="text-muted-foreground text-xs">Height</Text>
                      </View>
                    )}
                    {tdee ? (
                      <View>
                        <Text testID="nutrition-goals-tdee" className="text-foreground text-2xl font-bold">
                          {tdee}
                          <Text className="text-muted-foreground text-sm font-normal"> cal</Text>
                        </Text>
                        <Text className="text-muted-foreground text-xs">Estimated TDEE</Text>
                      </View>
                    ) : null}
                  </View>
                  {(!userHeightCm || !userAge || !userSex) && (
                    <View className="mt-4 rounded-lg bg-muted p-2.5">
                      <Text className="text-muted-foreground text-xs font-medium mb-3">
                        Fill in missing info for TDEE calculation{" "}
                        <Text
                          testID="nutrition-goals-update-details-link"
                          accessibilityRole="link"
                          accessibilityLabel="Update your details"
                          onPress={() => router.push("/settings")}
                          style={minTouchTarget}
                          className="text-blue-600 dark:text-blue-400 underline"
                        >
                          or update your details
                        </Text>
                      </Text>
                      <View style={{ gap: 12 }}>
                        {!userAge && (
                          <Input
                            testID="nutrition-goals-manual-age"
                            label="Age"
                            keyboardType="number-pad"
                            value={manualAge}
                            onChangeText={setManualAge}
                            placeholder="25"
                          />
                        )}
                        {!userSex && (
                          <View>
                            <Text className="text-muted-foreground text-xs font-medium mb-1">
                              Sex
                            </Text>
                            <View style={{ flexDirection: "row", gap: 8 }}>
                              {(["male", "female"] as const).map((s) => (
                                <Pressable
                                  key={s}
                                  testID={`nutrition-goals-manual-sex-${s}`}
                                  accessibilityRole="radio"
                                  accessibilityState={{ selected: manualSex === s }}
                                  onPress={() => setManualSex(s)}
                                  style={minTouchTarget}
                                  className={`flex-1 items-center rounded-xl border py-2 ${
                                    manualSex === s ? "border-foreground bg-foreground" : "border-border bg-card"
                                  }`}
                                >
                                  <Text
                                    className={`text-sm font-medium capitalize ${
                                      manualSex === s ? "text-background" : "text-foreground"
                                    }`}
                                  >
                                    {s}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          </View>
                        )}
                        {!userHeightCm && (
                          <View style={{ flexDirection: "row", gap: 12 }}>
                            <View style={{ flex: 1 }}>
                              <Input
                                testID="nutrition-goals-manual-height-ft"
                                label="Height (ft)"
                                keyboardType="number-pad"
                                value={manualHeightFt}
                                onChangeText={setManualHeightFt}
                                placeholder="5"
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Input
                                testID="nutrition-goals-manual-height-in"
                                label="Height (in)"
                                keyboardType="number-pad"
                                value={manualHeightIn}
                                onChangeText={setManualHeightIn}
                                placeholder="10"
                              />
                            </View>
                          </View>
                        )}
                      </View>
                    </View>
                  )}
                </Card>

                {/* Goal Type */}
                <View testID="nutrition-goals-direction-group">
                  <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide mb-3">
                    Goal
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {goalCards.map((card) => {
                      const on = form.goalType === card.type;
                      return (
                        <Pressable
                          key={card.type}
                          testID={`nutrition-goals-direction-${card.type}`}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          onPress={() => handleGoalTypeChange(card.type)}
                          style={minTouchTarget}
                          className={`flex-1 rounded-xl border p-3 ${
                            on ? "border-foreground bg-foreground" : "border-border bg-card"
                          }`}
                        >
                          <Text
                            className={`text-sm font-semibold ${on ? "text-background" : "text-foreground"}`}
                          >
                            {card.label}
                          </Text>
                          <Text
                            className={`text-xs mt-0.5 ${on ? "text-background/70" : "text-muted-foreground"}`}
                          >
                            {card.adjustment}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text className="text-muted-foreground text-xs mt-2 leading-relaxed">
                    {goalCards.find((c) => c.type === form.goalType)?.description}
                  </Text>
                </View>

                {/* Pace — the chosen weekly rate the calorie delta scales with. */}
                {form.goalType !== "maintain" && (profileWeightKg || userWeight) && targetWeightKg ? (
                  <Card testID="nutrition-goals-pace-card">
                    <PacePicker
                      unit={weightUnit}
                      direction={form.goalType}
                      valueKgPerWeek={planPaceKgPerWeek ?? defaultPaceKg(form.goalType)}
                      onChange={(kg) => handlePlanPaceChange(kg, form.goalType)}
                      latestWeight={
                        profileWeightKg
                          ? displayWeight(profileWeightKg, weightUnit)
                          : (userWeight ?? null)
                      }
                      targetWeight={targetWeightDisplay}
                      testID="nutrition-goals-pace"
                    />
                  </Card>
                ) : null}

                {/* Activity Level */}
                <Card testID="nutrition-goals-activity-card">
                  <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide mb-3">
                    Activity Level
                  </Text>
                  <View style={{ gap: 8 }}>
                    {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((level) => {
                      const on = form.activityLevel === level;
                      return (
                        <Pressable
                          key={level}
                          testID={`nutrition-goals-activity-${level}`}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          onPress={() => handleActivityChange(level)}
                          style={minTouchTarget}
                          className={`rounded-xl border p-3 ${on ? "border-foreground bg-foreground/5" : "border-border bg-card"}`}
                        >
                          <Text className={`text-sm font-medium ${on ? "text-foreground font-semibold" : "text-foreground"}`}>
                            {ACTIVITY_LABELS[level]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {tdee ? (
                    <Button
                      testID="nutrition-goals-recalculate"
                      variant="secondary"
                      onPress={handleRecalculate}
                      accessibilityLabel={`Recalculate from TDEE, ${applyGoalAdjustment(tdee, form.goalType)} calories`}
                    >
                      <Calculator size={16} color={colors.foreground} /> Recalculate from TDEE (
                      {applyGoalAdjustment(tdee, form.goalType)} cal)
                    </Button>
                  ) : null}
                </Card>

                {/* Macro Split */}
                <Card testID="nutrition-goals-preset-card">
                  <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide mb-3">
                    Macro Split
                  </Text>
                  <View style={{ gap: 8 }}>
                    {MACRO_PRESET_KEYS.map((key) => {
                      const on = macroPreset === key;
                      return (
                        <Pressable
                          key={key}
                          testID={`nutrition-goals-preset-${key}`}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          onPress={() => handlePresetChange(key)}
                          style={minTouchTarget}
                          className={`rounded-xl border p-3 ${on ? "border-foreground bg-foreground/5" : "border-border bg-card"}`}
                        >
                          <Text className={`text-sm font-medium text-foreground ${on ? "font-semibold" : ""}`}>
                            {presetLabel(key, presetSplits[key])}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Card>

                {/* Daily Targets */}
                <Card testID="nutrition-goals-targets-card">
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 16,
                    }}
                  >
                    <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                      Daily Targets
                    </Text>
                    {macroPreset === "custom" && (
                      <View
                        testID="nutrition-goals-macro-mode-toggle"
                        style={{ flexDirection: "row", gap: 4 }}
                      >
                        {(["g", "%"] as const).map((mode) => {
                          const on = macroInputMode === mode;
                          return (
                            <Pressable
                              key={mode}
                              testID={`nutrition-goals-macro-mode-${mode}`}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: on }}
                              onPress={() => setMacroInputMode(mode)}
                              style={minTouchTarget}
                              className={`rounded-md px-3 py-1 ${on ? "bg-foreground" : ""}`}
                            >
                              <Text
                                className={`text-xs font-semibold ${on ? "text-background" : "text-muted-foreground"}`}
                              >
                                {mode === "g" ? "Grams" : "Percent"}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </View>

                  <Input
                    testID="nutrition-goals-calories"
                    label="Calories"
                    keyboardType="decimal-pad"
                    value={String(form.calories)}
                    onChangeText={(v) => {
                      setForm((prev) => ({ ...prev, calories: Number(v) || 0 }));
                      setMacroPreset("custom");
                    }}
                  />
                  <Pressable
                    testID="explain-calories"
                    accessibilityRole="button"
                    accessibilityLabel="Explain calories"
                    onPress={() => setExplaining("calories")}
                    style={minTouchTarget}
                    className="mt-1 mb-3 self-start"
                  >
                    <Text className="text-xs text-muted-foreground underline">
                      Where does {form.calories.toLocaleString()} come from?
                    </Text>
                  </Pressable>

                  {(
                    [
                      ["protein", "Protein"],
                      ["carbs", "Carbs"],
                      ["fats", "Fats"],
                    ] as const
                  ).map(([key, label]) => (
                    <View key={key} style={{ marginBottom: 12 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 4,
                        }}
                      >
                        <Text className="text-foreground text-sm font-medium">
                          {label} {isPercentMode ? "(%)" : "(g)"}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          {isPercentMode
                            ? `${form[key]}g`
                            : `${percentages[key]}%`}
                        </Text>
                      </View>
                      <Input
                        testID={`nutrition-goals-${key}`}
                        value={String(macroFieldValue(key))}
                        onChangeText={(v) => handleMacroFieldChange(key, Number(v) || 0)}
                        keyboardType="decimal-pad"
                        accessibilityLabel={`${label} in ${isPercentMode ? "percent" : "grams"}`}
                      />
                      <Pressable
                        testID={`explain-${key}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Explain ${label}`}
                        onPress={() => setExplaining(key)}
                        style={minTouchTarget}
                        className="mt-1 self-start"
                      >
                        <Text className="text-xs text-muted-foreground underline">
                          Where does {form[key]}g come from?
                        </Text>
                      </Pressable>
                    </View>
                  ))}

                  {proteinFlagged ? (
                    <Pressable
                      testID="protein-flag"
                      accessibilityRole="button"
                      onPress={() => setExplaining("protein")}
                      style={minTouchTarget}
                      className="mt-2 p-2.5 rounded-xl border border-amber-400 bg-amber-500/10"
                    >
                      <Text className="text-amber-500 text-xs">
                        That protein number is outside the usual range for your bodyweight. It is
                        not a mistake — tap to see how we got it.
                      </Text>
                    </Pressable>
                  ) : null}

                  {/* Macro bar — the web's blue/green/yellow protein/carbs/fats
                      shares (`bg-blue-600` / `bg-green-600` / `bg-yellow-400`),
                      not the brand red/amber/grey native drew before (NP-266). */}
                  <View
                    testID="nutrition-goals-macro-bar"
                    style={{ flexDirection: "row", height: 12, borderRadius: 999, overflow: "hidden", marginTop: 12 }}
                  >
                    <View className="bg-blue-600" style={{ width: `${percentages.protein}%` }} />
                    <View className="bg-green-600" style={{ width: `${percentages.carbs}%` }} />
                    <View className="bg-yellow-400" style={{ width: `${percentages.fats}%` }} />
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                    <Text
                      testID="nutrition-goals-macro-bar-label-protein"
                      className="text-blue-600 dark:text-blue-400 text-xs"
                    >
                      Protein {percentages.protein}%
                    </Text>
                    <Text
                      testID="nutrition-goals-macro-bar-label-carbs"
                      className="text-green-600 dark:text-green-400 text-xs"
                    >
                      Carbs {percentages.carbs}%
                    </Text>
                    <Text
                      testID="nutrition-goals-macro-bar-label-fats"
                      className="text-yellow-600 dark:text-yellow-400 text-xs"
                    >
                      Fats {percentages.fats}%
                    </Text>
                  </View>
                  <Text className="text-muted-foreground text-xs mt-3 leading-relaxed">
                    {tdee ? `Your TDEE is about ${tdee.toLocaleString()} cal. ` : ""}We applied{" "}
                    {DIRECTION_EXPLANATION[form.goalType]}. Tap any number to see how we got it.
                  </Text>
                </Card>

                {/* Water Goal */}
                <Card testID="nutrition-goals-water-card">
                  <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide mb-3">
                    Water Goal
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Input
                        testID="nutrition-goals-water"
                        value={String(form.waterGoal)}
                        onChangeText={(v) => setForm((prev) => ({ ...prev, waterGoal: Number(v) || 0 }))}
                        keyboardType="decimal-pad"
                        accessibilityLabel="Water goal in ounces"
                      />
                    </View>
                    <Text className="text-muted-foreground text-sm">oz</Text>
                  </View>
                </Card>

                <Button
                  testID="nutrition-goals-save"
                  variant="inverted"
                  onPress={handleSave}
                  disabled={saving}
                  loading={saving}
                  accessibilityLabel="Save Goals"
                >
                  <Save size={16} color={colors.background} /> {saving ? "Saving..." : "Save Goals"}
                </Button>
                {saveMessage ? (
                  <Text
                    testID="nutrition-goals-save-message"
                    className={`text-sm text-center ${
                      saveMessage.includes("success")
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {saveMessage}
                  </Text>
                ) : null}
              </>
            )}
          </ScrollView>
        </ScreenState>

        <MacroExplainSheet
          isOpen={!!explanation}
          title={explanation?.title ?? ""}
          headline={explanation?.headline ?? ""}
          steps={explanation?.steps ?? []}
          note={explanation?.note}
          onClose={() => setExplaining(null)}
          testID="macro-explain-sheet"
        />

        <WeightLogSheet
          visible={weightSheetOpen}
          onClose={() => setWeightSheetOpen(false)}
          onSubmit={submitWeightLog}
          lastWeight={
            weightSeries.length > 0 ? (weightSeries[weightSeries.length - 1]?.value ?? null) : null
          }
          targetWeight={targetWeightDisplay}
          weightUnit={weightUnit}
          testID="weight-log-sheet"
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Re-exported for the drift test: the route must keep reading the same
// shared maths the web page reads.
export { z };
