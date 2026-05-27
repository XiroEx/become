import type { MacroBreakdown } from "./servingMath";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface MealEntry extends MacroBreakdown {
  id: string;
  date: string; // ISO YYYY-MM-DD
  mealType: MealType;
  foodName: string;
}

export function totalForDay(
  entries: MealEntry[],
  date: string,
): MacroBreakdown {
  const filtered = entries.filter((e) => e.date === date);
  return filtered.reduce<MacroBreakdown>(
    (acc, e) => ({
      kcal: acc.kcal + e.kcal,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function totalsByMeal(
  entries: MealEntry[],
  date: string,
): Record<MealType, MacroBreakdown> {
  const out: Record<MealType, MacroBreakdown> = {
    breakfast: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    lunch: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    dinner: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    snack: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  };
  for (const e of entries) {
    if (e.date !== date) continue;
    const bucket = out[e.mealType];
    bucket.kcal += e.kcal;
    bucket.protein += e.protein;
    bucket.carbs += e.carbs;
    bucket.fat += e.fat;
  }
  return out;
}
