import { toMealEntries } from "@/lib/nutrition/mealLog";

describe("toMealEntries", () => {
  // The legacy day as GET /api/nutrition/log really answers it: `water`,
  // `quickAdds`, `dailyTotals` and `goals` beside the four meal buckets. The
  // side tables are what keep this route alive at all (NP-024 rule 4).
  const response = {
    date: "2026-06-01",
    quickAdds: [],
    meals: [
      {
        mealType: "breakfast",
        foods: [
          {
            id: "f1",
            name: "Oats",
            nutrition: { calories: 300, protein: 10, carbs: 50, fats: 5 },
          },
        ],
      },
      {
        mealType: "lunch",
        foods: [
          {
            name: "Chicken",
            nutrition: { calories: 400, protein: 40, carbs: 0, fats: 8 },
          },
        ],
      },
    ],
  };

  it("flattens meals → entries mapping fats→fat and keeping the date", () => {
    const entries = toMealEntries(response, "2026-06-01");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      id: "f1",
      date: "2026-06-01",
      mealType: "breakfast",
      foodName: "Oats",
      kcal: 300,
      protein: 10,
      carbs: 50,
      fat: 5,
    });
    // Missing id → synthesized; mealType preserved.
    expect(entries[1]!.id).toBe("lunch-0");
    expect(entries[1]!.fat).toBe(8);
  });

  it("multiplies the per-serving block by servings, as the server totals it", () => {
    const entries = toMealEntries(
      {
        quickAdds: [],
        meals: [
          {
            mealType: "snack",
            foods: [
              {
                id: "bar",
                name: "Protein Bar",
                // One bar's macros; two bars eaten.
                servings: 2,
                nutrition: { calories: 210, protein: 20, carbs: 24, fats: 7 },
              },
              {
                id: "bag",
                name: "Crisps",
                // Per-100g block, 38 g bag.
                servings: 0.38,
                nutrition: { calories: 530, protein: 6, carbs: 50, fats: 34 },
              },
            ],
          },
        ],
      },
      "2026-06-01",
    );
    expect(entries[0]!.kcal).toBe(420);
    expect(entries[0]!.protein).toBe(40);
    expect(entries[1]!.kcal).toBeCloseTo(201.4, 5);
  });

  it("narrows an unknown mealType to 'snack' and tolerates empty input", () => {
    const entries = toMealEntries(
      {
        quickAdds: [],
        meals: [
          {
            mealType: "brunch",
            foods: [
              { name: "X", nutrition: { calories: 1, protein: 1, carbs: 1, fats: 1 } },
            ],
          },
        ],
      },
      "2026-06-01",
    );
    expect(entries[0]!.mealType).toBe("snack");
    expect(toMealEntries(null, "2026-06-01")).toEqual([]);
    expect(toMealEntries({ meals: [], quickAdds: [] }, "2026-06-01")).toEqual([]);
  });
});
