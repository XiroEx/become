import {
  computeNutritionTargets,
  recommendPreset,
  calorieAdjustment,
  directionForGoal,
  directionFromWeights,
  defaultPaceKg,
  waterGoalOz,
  explainCalories,
  explainMacro,
  proteinNeedsFlag,
  type FitnessGoal,
  type BiologicalSex,
  type ActivityLevel,
  type MacroPreset,
  type NutritionDirection,
} from "@become/core";

// Also import webapp's module directly to prove 100% parity across modules
import * as webTdee from "../../webapp/lib/nutrition/tdee";
import * as webExplain from "../../webapp/lib/nutrition/macroExplain";

describe("Card NP-056 Acceptance Criteria", () => {
  describe("(id: e015c7dc) For the same inputs, native and web onboarding produce identical calorie and macro targets", () => {
    interface TestCase {
      name: string;
      age: number;
      sex: BiologicalSex;
      heightCm: number;
      currentWeightKg: number;
      targetWeightKg?: number;
      paceKgPerWeek?: number;
      goals: FitnessGoal[];
      activityLevel: ActivityLevel;
      macroPreset?: MacroPreset;
      weeklyAvailability?: number;
    }

    const testCases: TestCase[] = [
      {
        name: "Standard male fat loss",
        age: 30,
        sex: "male",
        heightCm: 180,
        currentWeightKg: 85,
        targetWeightKg: 78,
        paceKgPerWeek: 0.5,
        goals: ["lose_weight"],
        activityLevel: "moderate",
        macroPreset: "recommended",
        weeklyAvailability: 4,
      },
      {
        name: "Female muscle building high protein",
        age: 26,
        sex: "female",
        heightCm: 165,
        currentWeightKg: 58,
        targetWeightKg: 62,
        paceKgPerWeek: 0.25,
        goals: ["gain_muscle", "improve_performance"],
        activityLevel: "light",
        macroPreset: "high_protein",
        weeklyAvailability: 3,
      },
      {
        name: "Maintenance with balanced split",
        age: 38,
        sex: "male",
        heightCm: 175,
        currentWeightKg: 75,
        targetWeightKg: 75,
        goals: ["maintain"],
        activityLevel: "active",
        macroPreset: "balanced",
        weeklyAvailability: 5,
      },
      {
        name: "Prefer not to say biological sex with low carb",
        age: 32,
        sex: "prefer_not_to_say",
        heightCm: 170,
        currentWeightKg: 70,
        targetWeightKg: 65,
        goals: ["general_health"],
        activityLevel: "sedentary",
        macroPreset: "low_carb",
      },
      {
        name: "High availability athlete with surplus",
        age: 22,
        sex: "male",
        heightCm: 190,
        currentWeightKg: 90,
        targetWeightKg: 95,
        paceKgPerWeek: 0.5,
        goals: ["gain_muscle"],
        activityLevel: "very_active",
        macroPreset: "recommended",
        weeklyAvailability: 6,
      },
    ];

    for (const tc of testCases) {
      it(`produces identical targets and explanations for ${tc.name}`, () => {
        const derivedDir = directionFromWeights(tc.currentWeightKg, tc.targetWeightKg);
        const direction: NutritionDirection =
          derivedDir ?? (tc.goals[0] ? directionForGoal(tc.goals[0]) : "maintain");

        // Native targets (computed via @become/core)
        const nativeTargets = computeNutritionTargets({
          currentWeightKg: tc.currentWeightKg,
          heightCm: tc.heightCm,
          age: tc.age,
          biologicalSex: tc.sex,
          goals: tc.goals,
          direction,
          weeklyAvailability: tc.weeklyAvailability,
          activityLevel: tc.activityLevel,
          macroPreset: tc.macroPreset,
          paceKgPerWeek: tc.paceKgPerWeek ?? defaultPaceKg(direction),
        });

        // Web targets (computed via webapp module)
        const webTargets = webTdee.computeNutritionTargets({
          currentWeightKg: tc.currentWeightKg,
          heightCm: tc.heightCm,
          age: tc.age,
          biologicalSex: tc.sex,
          goals: tc.goals,
          direction,
          weeklyAvailability: tc.weeklyAvailability,
          activityLevel: tc.activityLevel,
          macroPreset: tc.macroPreset,
          paceKgPerWeek: tc.paceKgPerWeek ?? defaultPaceKg(direction),
        });

        expect(nativeTargets).not.toBeNull();
        expect(webTargets).not.toBeNull();

        // Parity assertions
        expect(nativeTargets!.calories).toBe(webTargets!.calories);
        expect(nativeTargets!.protein).toBe(webTargets!.protein);
        expect(nativeTargets!.carbs).toBe(webTargets!.carbs);
        expect(nativeTargets!.fats).toBe(webTargets!.fats);
        expect(nativeTargets!.tdee).toBe(webTargets!.tdee);
        expect(nativeTargets!.direction).toBe(webTargets!.direction);
        expect(nativeTargets!.activityLevel).toBe(webTargets!.activityLevel);
        expect(nativeTargets!.split).toEqual(webTargets!.split);

        // Water goal parity
        expect(waterGoalOz(tc.currentWeightKg)).toBe(webTdee.waterGoalOz(tc.currentWeightKg));

        // Preset recommendation parity
        const nativeRec = recommendPreset(direction, tc.goals);
        const webRec = webTdee.recommendPreset(direction, tc.goals);
        expect(nativeRec).toEqual(webRec);

        // Calorie adjustment parity
        expect(calorieAdjustment(nativeTargets!.tdee, direction, tc.paceKgPerWeek)).toBe(
          webTdee.calorieAdjustment(webTargets!.tdee, direction, tc.paceKgPerWeek),
        );

        // Calorie explanation parity
        const nativeCalExplain = explainCalories(
          {
            currentWeightKg: tc.currentWeightKg,
            heightCm: tc.heightCm,
            age: tc.age,
            biologicalSex: tc.sex,
          },
          tc.activityLevel,
          direction,
          tc.paceKgPerWeek ?? defaultPaceKg(direction),
        );
        const webCalExplain = webExplain.explainCalories(
          {
            currentWeightKg: tc.currentWeightKg,
            heightCm: tc.heightCm,
            age: tc.age,
            biologicalSex: tc.sex,
          },
          tc.activityLevel,
          direction,
          tc.paceKgPerWeek ?? defaultPaceKg(direction),
        );
        expect(nativeCalExplain).toEqual(webCalExplain);

        // Macro explanation parity for protein
        const nativeProteinExplain = explainMacro({
          macro: "protein",
          grams: nativeTargets!.protein,
          calories: nativeTargets!.calories,
          percent: nativeTargets!.split.protein,
          weightKg: tc.currentWeightKg,
          direction,
          goals: tc.goals,
        });
        const webProteinExplain = webExplain.explainMacro({
          macro: "protein",
          grams: webTargets!.protein,
          calories: webTargets!.calories,
          percent: webTargets!.split.protein,
          weightKg: tc.currentWeightKg,
          direction,
          goals: tc.goals,
        });
        expect(nativeProteinExplain).toEqual(webProteinExplain);

        // Protein flag parity
        expect(proteinNeedsFlag(nativeTargets!.protein, tc.currentWeightKg, direction, tc.goals)).toBe(
          webExplain.proteinNeedsFlag(webTargets!.protein, tc.currentWeightKg, direction, tc.goals),
        );
      });
    }
  });
});
