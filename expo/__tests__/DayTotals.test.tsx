import { render } from "@testing-library/react-native";
import { DayTotals } from "@/components/nutrition/DayTotals";
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
];

describe("DayTotals", () => {
  it("renders the kcal sum and rounded macro totals", () => {
    const { getByTestId } = render(
      <DayTotals date="2026-05-27" entries={entries} />,
    );
    expect(getByTestId("day-totals-kcal").props.children).toEqual([
      800,
      expect.anything(),
    ]);
    expect(getByTestId("day-totals-protein").props.children).toEqual([
      60,
      "g P",
    ]);
    expect(getByTestId("day-totals-carbs").props.children).toEqual([
      60,
      "g C",
    ]);
    expect(getByTestId("day-totals-fat").props.children).toEqual([
      20,
      "g F",
    ]);
  });

  it("displays kcal target when provided", () => {
    const { getByTestId } = render(
      <DayTotals
        date="2026-05-27"
        entries={entries}
        kcalTarget={2400}
      />,
    );
    expect(getByTestId("day-totals-target").props.children).toEqual([
      "target ",
      2400,
      " kcal",
    ]);
  });

  it("buckets by meal type", () => {
    const { getByTestId } = render(
      <DayTotals date="2026-05-27" entries={entries} />,
    );
    expect(getByTestId("day-totals-meal-breakfast")).toBeTruthy();
    expect(getByTestId("day-totals-meal-lunch")).toBeTruthy();
    expect(getByTestId("day-totals-meal-dinner")).toBeTruthy();
    expect(getByTestId("day-totals-meal-snack")).toBeTruthy();
  });

  it("shows zeros for a day with no entries", () => {
    const { getByTestId } = render(
      <DayTotals date="2026-05-27" entries={[]} />,
    );
    expect(getByTestId("day-totals-kcal").props.children).toEqual([
      0,
      expect.anything(),
    ]);
  });
});
