import { totalForDay, totalsByMeal } from "@/lib/nutrition/daySelector";
import type { MealEntry } from "@/lib/nutrition/daySelector";

const entries: MealEntry[] = [
  {
    id: "a",
    date: "2026-05-27",
    mealType: "breakfast",
    foodName: "Oats",
    kcal: 300,
    protein: 10,
    carbs: 50,
    fat: 5,
  },
  {
    id: "b",
    date: "2026-05-27",
    mealType: "lunch",
    foodName: "Chicken",
    kcal: 500,
    protein: 50,
    carbs: 10,
    fat: 15,
  },
  {
    id: "c",
    date: "2026-05-27",
    mealType: "snack",
    foodName: "Apple",
    kcal: 80,
    protein: 0.4,
    carbs: 21,
    fat: 0.3,
  },
  {
    id: "d",
    date: "2026-05-26",
    mealType: "dinner",
    foodName: "Salmon",
    kcal: 400,
    protein: 40,
    carbs: 0,
    fat: 25,
  },
];

describe("totalForDay", () => {
  it("sums all entries on the requested date", () => {
    const t = totalForDay(entries, "2026-05-27");
    expect(t.kcal).toBe(880);
    expect(t.protein).toBeCloseTo(60.4, 4);
    expect(t.carbs).toBeCloseTo(81, 4);
    expect(t.fat).toBeCloseTo(20.3, 4);
  });

  it("ignores entries on other dates", () => {
    const t = totalForDay(entries, "2026-05-26");
    expect(t.kcal).toBe(400);
    expect(t.protein).toBe(40);
  });

  it("returns zeros for a day with no entries", () => {
    expect(totalForDay(entries, "2026-01-01")).toEqual({
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });
});

describe("totalsByMeal", () => {
  it("buckets per meal type for the requested date", () => {
    const t = totalsByMeal(entries, "2026-05-27");
    expect(t.breakfast.kcal).toBe(300);
    expect(t.lunch.kcal).toBe(500);
    expect(t.snack.kcal).toBe(80);
    expect(t.dinner.kcal).toBe(0);
  });

  it("returns the full meal-type record with zeros even with no entries", () => {
    const t = totalsByMeal([], "2026-05-27");
    expect(t).toEqual({
      breakfast: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      lunch: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      dinner: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      snack: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    });
  });
});
