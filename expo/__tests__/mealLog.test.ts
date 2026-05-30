import { toMealEntries } from "@/lib/nutrition/mealLog";

describe("toMealEntries", () => {
  const response = {
    date: "2026-06-01",
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

  it("narrows an unknown mealType to 'snack' and tolerates empty input", () => {
    const entries = toMealEntries(
      {
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
    expect(toMealEntries({ meals: [] }, "2026-06-01")).toEqual([]);
  });
});
