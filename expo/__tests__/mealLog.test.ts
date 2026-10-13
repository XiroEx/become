import { buildDayOccurrences } from "@/lib/nutrition/dayOrder";
import type { MealLog } from "@become/api-client";

describe("buildDayOccurrences - native nutrition day parity", () => {
  it("a custom-tag sitting appears natively under its own tag, not under Snack (e015c8b6)", () => {
    const logs: MealLog[] = [
      {
        _id: "log-1",
        loggedAt: "2026-06-01T15:00:00.000Z",
        tags: ["post-workout"],
        items: [
          {
            _id: "i1",
            name: "Whey Protein Shake",
            servings: 1,
            servingSize: "1",
            servingUnit: "scoop",
            nutrition: { calories: 120, protein: 24, carbs: 3, fats: 1 },
          },
        ],
        totalNutrition: { calories: 120, protein: 24, carbs: 3, fats: 1 },
      } as unknown as MealLog,
    ];

    const occurrences = buildDayOccurrences(logs, [], []);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]!.tag).toBe("post-workout");
    expect(occurrences[0]!.tag).not.toBe("snack");
    expect(occurrences[0]!.logs[0]!.items[0]!.name).toBe("Whey Protein Shake");
  });

  it("orders meal sittings in clock order", () => {
    const logs: MealLog[] = [
      {
        _id: "log-lunch",
        loggedAt: "2026-06-01T12:30:00.000Z",
        tags: ["lunch"],
        items: [
          {
            _id: "i2",
            name: "Chicken Bowl",
            servings: 1,
            nutrition: { calories: 600, protein: 45, carbs: 60, fats: 15 },
          },
        ],
      } as unknown as MealLog,
      {
        _id: "log-breakfast",
        loggedAt: "2026-06-01T08:00:00.000Z",
        tags: ["breakfast"],
        items: [
          {
            _id: "i1",
            name: "Oatmeal",
            servings: 1,
            nutrition: { calories: 300, protein: 10, carbs: 50, fats: 5 },
          },
        ],
      } as unknown as MealLog,
      {
        _id: "log-dinner",
        loggedAt: "2026-06-01T19:00:00.000Z",
        tags: ["dinner"],
        items: [
          {
            _id: "i3",
            name: "Salmon",
            servings: 1,
            nutrition: { calories: 500, protein: 40, carbs: 0, fats: 25 },
          },
        ],
      } as unknown as MealLog,
    ];

    const occurrences = buildDayOccurrences(logs, [], []);
    expect(occurrences.map((o) => o.tag)).toEqual([
      "breakfast",
      "lunch",
      "dinner",
    ]);
  });

  it("splits multiple sittings of the same tag when another tag occurs in between", () => {
    const logs: MealLog[] = [
      {
        _id: "log-snack-1",
        loggedAt: "2026-06-01T10:00:00.000Z",
        tags: ["snack"],
        items: [{ _id: "s1", name: "Apple", nutrition: { calories: 80, protein: 0, carbs: 20, fats: 0 } }],
      } as unknown as MealLog,
      {
        _id: "log-lunch",
        loggedAt: "2026-06-01T13:00:00.000Z",
        tags: ["lunch"],
        items: [{ _id: "l1", name: "Salad", nutrition: { calories: 400, protein: 20, carbs: 30, fats: 10 } }],
      } as unknown as MealLog,
      {
        _id: "log-snack-2",
        loggedAt: "2026-06-01T16:00:00.000Z",
        tags: ["snack"],
        items: [{ _id: "s2", name: "Almonds", nutrition: { calories: 160, protein: 6, carbs: 6, fats: 14 } }],
      } as unknown as MealLog,
    ];

    const occurrences = buildDayOccurrences(logs, [], []);
    expect(occurrences).toHaveLength(3);
    expect(occurrences[0]!.tag).toBe("snack");
    expect(occurrences[1]!.tag).toBe("lunch");
    expect(occurrences[2]!.tag).toBe("snack");
  });

  it("positions untimed entries by tag anchor time", () => {
    const windows = [
      { tag: "breakfast", startMinutes: 420, endMinutes: 600 },
      { tag: "lunch", startMinutes: 720, endMinutes: 840 },
    ];
    const logs: MealLog[] = [
      {
        _id: "log-lunch",
        loggedAt: "2026-06-01T12:00:00.000Z",
        tags: ["lunch"],
        items: [{ _id: "l1", name: "Wrap", nutrition: { calories: 400, protein: 20, carbs: 40, fats: 10 } }],
      } as unknown as MealLog,
      {
        _id: "log-breakfast-untimed",
        // Entered at 23:00 (late at night) but marked untimed:
        loggedAt: "2026-06-01T23:00:00.000Z",
        untimed: true,
        tags: ["breakfast"],
        items: [{ _id: "b1", name: "Toast", nutrition: { calories: 200, protein: 5, carbs: 30, fats: 3 } }],
      } as unknown as MealLog,
    ];

    const occurrences = buildDayOccurrences(logs, [], windows);
    // Breakfast untimed sorts before lunch because of its anchor time (420 min vs 12:00 = 720 min)
    expect(occurrences[0]!.tag).toBe("breakfast");
    expect(occurrences[1]!.tag).toBe("lunch");
  });
});
