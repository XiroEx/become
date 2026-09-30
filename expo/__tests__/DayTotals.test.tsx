import { render } from "@testing-library/react-native";
import { CalorieRing } from "@/components/nutrition/CalorieRing";

describe("CalorieRing", () => {
  it("renders the remaining kcal and rounded macro totals", () => {
    const { getByTestId, getByText } = render(
      <CalorieRing
        consumed={800}
        goal={2400}
        protein={{ current: 60, goal: 150 }}
        carbs={{ current: 60, goal: 200 }}
        fats={{ current: 20, goal: 65 }}
        fiber={15}
      />,
    );

    // Remaining calories = 2400 - 800 = 1600
    expect(getByTestId("day-totals-kcal").props.children).toBe(1600);
    expect(getByText("remaining")).toBeTruthy();

    expect(getByTestId("day-totals-protein").props.children).toEqual([
      60,
      "g / ",
      150,
      "g P",
    ]);
    expect(getByTestId("day-totals-carbs").props.children).toEqual([
      60,
      "g / ",
      200,
      "g C",
    ]);
    expect(getByTestId("day-totals-fat").props.children).toEqual([
      20,
      "g / ",
      65,
      "g F",
    ]);
    expect(getByTestId("day-totals-fiber").props.children).toEqual([
      15,
      "g",
    ]);
  });

  it("displays goal breakdown and goal line when provided", () => {
    const { getByTestId } = render(
      <CalorieRing
        consumed={800}
        goal={2400}
        protein={{ current: 60, goal: 150 }}
        carbs={{ current: 60, goal: 200 }}
        fats={{ current: 20, goal: 65 }}
        goalLine="2,400 cal/day, on track for 180 lbs"
      />,
    );

    expect(getByTestId("day-totals-target").props.children).toEqual([
      "Goal ",
      2400,
      " - Food ",
      800,
      " = ",
      1600,
      " ",
      "remaining",
    ]);
    expect(getByTestId("nutrition-goal-line").props.children).toBe(
      "2,400 cal/day, on track for 180 lbs",
    );
  });

  it("indicates over status when consumed exceeds goal", () => {
    const { getByTestId, getByText } = render(
      <CalorieRing
        consumed={2600}
        goal={2400}
        protein={{ current: 160, goal: 150 }}
        carbs={{ current: 250, goal: 200 }}
        fats={{ current: 80, goal: 65 }}
      />,
    );

    expect(getByTestId("day-totals-kcal").props.children).toBe(200);
    expect(getByText("over")).toBeTruthy();
  });

  it("shows remaining matching goal for a day with no entries", () => {
    const { getByTestId } = render(
      <CalorieRing
        consumed={0}
        goal={2000}
        protein={{ current: 0, goal: 150 }}
        carbs={{ current: 0, goal: 200 }}
        fats={{ current: 0, goal: 65 }}
      />,
    );

    expect(getByTestId("day-totals-kcal").props.children).toBe(2000);
  });
});
