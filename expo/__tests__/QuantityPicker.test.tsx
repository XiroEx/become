import { render, fireEvent, act } from "@testing-library/react-native";
import { QuantityPicker } from "@/components/nutrition/QuantityPicker";
import type { Food } from "@become/api-client";

const CHICKEN_BREAST: Food = {
  _id: "chicken-1",
  name: "Chicken Breast",
  brand: "Farmer John",
  servingSize: 100,
  servingUnit: "g",
  variants: [],
  alternateServings: [
    { label: "1 breast (172 g)", multiplier: 1.72 },
    { label: "1 oz", multiplier: 0.283495 },
  ],
  nutrition: { calories: 165, protein: 31, carbs: 0, fats: 3.6, sodium: 74 },
};

const WHEY_PROTEIN: Food = {
  _id: "whey-1",
  name: "Whey Protein Powder",
  brand: "Optimum",
  servingSize: 1,
  servingUnit: "scoop",
  alternateServings: [],
  nutrition: { calories: 120, protein: 24, carbs: 2, fats: 1.5 },
  variants: [
    {
      _id: "v-choco",
      name: "Chocolate",
      isDefault: true,
      servingSize: 1,
      servingUnit: "scoop",
      gramsPerServing: 32,
      alternateServings: [{ label: "1 rounded scoop", multiplier: 1.1 }],
      nutrition: { calories: 130, protein: 24, carbs: 3, fats: 2 },
    },
    {
      _id: "v-vanilla",
      name: "Vanilla",
      isDefault: false,
      servingSize: 1,
      servingUnit: "scoop",
      gramsPerServing: 30,
      alternateServings: [],
      nutrition: { calories: 120, protein: 24, carbs: 2, fats: 1.5 },
    },
  ],
};

describe("QuantityPicker Component", () => {
  it("renders food with serving choices and previews live macros", () => {
    const { getByTestId } = render(<QuantityPicker food={CHICKEN_BREAST} />);

    // Primary choice is 1 breast (172 g)
    // 1.72 × 165 = 283.8 -> 284 kcal
    expect(getByTestId("quantity-picker-preview-kcal").props.children).toEqual([
      284,
      " kcal",
    ]);
    expect(getByTestId("quantity-picker-preview-protein").props.children).toEqual([
      53.3,
      "g",
    ]);
  });

  it("stepper increments and decrements quantity according to servingQuantityStep", () => {
    const { getByTestId } = render(
      <QuantityPicker
        food={CHICKEN_BREAST}
        initialQuantity={100}
        initialUnit="g"
      />,
    );

    // Initial 100g of chicken = 165 kcal
    expect(getByTestId("quantity-picker-preview-kcal").props.children).toEqual([
      165,
      " kcal",
    ]);

    // Step for "g" is 1
    fireEvent.press(getByTestId("quantity-picker-stepper-increment"));
    expect(getByTestId("quantity-picker-quantity-input").props.value).toBe("101");

    fireEvent.press(getByTestId("quantity-picker-stepper-decrement"));
    expect(getByTestId("quantity-picker-quantity-input").props.value).toBe("100");
  });

  it("direct text input updates quantity and live macro preview", () => {
    const { getByTestId } = render(
      <QuantityPicker
        food={CHICKEN_BREAST}
        initialQuantity={100}
        initialUnit="g"
      />,
    );

    // Change to 200g -> 2 × 165 = 330 kcal, 2 × 31 = 62g protein
    fireEvent.changeText(getByTestId("quantity-picker-quantity-input"), "200");
    expect(getByTestId("quantity-picker-preview-kcal").props.children).toEqual([
      330,
      " kcal",
    ]);
    expect(getByTestId("quantity-picker-preview-protein").props.children).toEqual([
      62,
      "g",
    ]);
  });

  it("renders variant chips for multi-variant foods and switching variant recalculates macros", () => {
    const { getByTestId } = render(<QuantityPicker food={WHEY_PROTEIN} />);

    // Default variant is Chocolate with primary choice "1 rounded scoop" (1.1 × 130 = 143 kcal)
    expect(getByTestId("quantity-picker-variant-Chocolate")).toBeTruthy();
    expect(getByTestId("quantity-picker-variant-Vanilla")).toBeTruthy();

    expect(getByTestId("quantity-picker-preview-kcal").props.children).toEqual([
      143,
      " kcal",
    ]);

    // Switch to Vanilla variant (120 kcal per 30g scoop)
    fireEvent.press(getByTestId("quantity-picker-variant-Vanilla"));
    expect(getByTestId("quantity-picker-preview-kcal").props.children).toEqual([
      120,
      " kcal",
    ]);
  });

  it("opens serving choice bottom sheet and allows picking different units", () => {
    const { getByTestId } = render(<QuantityPicker food={CHICKEN_BREAST} />);

    fireEvent.press(getByTestId("quantity-picker-serving-button"));
    expect(getByTestId("quantity-picker-serving-sheet")).toBeTruthy();

    // Pick 1 oz (multiplier: 0.283495, 165 * 0.283495 = 46.8 -> 47 kcal)
    fireEvent.press(getByTestId("quantity-picker-choice-serving-alt-1"));
    expect(getByTestId("quantity-picker-preview-kcal").props.children).toEqual([
      47,
      " kcal",
    ]);
  });

  it("defaults to No time (untimed: true) and allows picking Now or Picked time", () => {
    const { getByTestId, queryByTestId } = render(
      <QuantityPicker food={CHICKEN_BREAST} />,
    );

    // Default is "No time"
    expect(getByTestId("quantity-picker-time-none").props.accessibilityState.selected).toBe(true);
    expect(queryByTestId("quantity-picker-custom-time-input")).toBeNull();

    // Tap "Picked time" -> shows custom time input
    fireEvent.press(getByTestId("quantity-picker-time-custom"));
    expect(getByTestId("quantity-picker-custom-time-input")).toBeTruthy();

    // Tap "Now" -> hides custom time input
    fireEvent.press(getByTestId("quantity-picker-time-now"));
    expect(queryByTestId("quantity-picker-custom-time-input")).toBeNull();
  });

  it("submits the web's entry shape through onSubmit prop", async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <QuantityPicker
        food={CHICKEN_BREAST}
        initialQuantity={200}
        initialUnit="g"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.press(getByTestId("quantity-picker-tag-lunch"));
    await act(async () => {
      fireEvent.press(getByTestId("quantity-picker-submit"));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Chicken Breast",
        brand: "Farmer John",
        servingSize: 100,
        servingUnit: "g",
        servings: 2,
        loggedQuantity: 200,
        loggedUnit: "g",
        nutrition: expect.objectContaining({
          calories: 165,
          protein: 31,
        }),
      }),
    );
  });
});
