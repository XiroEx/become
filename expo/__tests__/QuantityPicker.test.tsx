import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { QuantityPicker } from "../components/nutrition/QuantityPicker";

describe("QuantityPicker", () => {
  const multiVariantFood = {
    _id: "food-whey-1",
    name: "Whey Protein",
    brand: "Optimum",
    variants: [
      {
        _id: "var-choco",
        name: "Chocolate",
        isDefault: true,
        servingSize: 1,
        servingUnit: "scoop",
        gramsPerServing: 32,
        nutrition: { calories: 130, protein: 24, carbs: 3, fats: 2 },
      },
      {
        _id: "var-vanilla",
        name: "Vanilla",
        isDefault: false,
        servingSize: 1,
        servingUnit: "scoop",
        gramsPerServing: 30,
        nutrition: { calories: 120, protein: 24, carbs: 2, fats: 1.5 },
      },
    ],
  };

  const bridgedFood = {
    _id: "food-bar-1",
    name: "Protein Bar",
    brand: "Brandy",
    servingSize: 1,
    servingUnit: "each",
    gramsPerServing: 60,
    nutrition: { calories: 210, protein: 20, carbs: 24, fats: 7 },
  };

  it("renders variant chips and switches variant on press", () => {
    const { getByTestId } = render(
      <QuantityPicker food={multiVariantFood} />,
    );

    expect(getByTestId("variant-chip-Chocolate")).toBeTruthy();
    expect(getByTestId("variant-chip-Vanilla")).toBeTruthy();

    // Default Chocolate: 130 kcal
    expect(getByTestId("macro-preview-calories").props.children).toEqual([130, " kcal"]);

    // Switch to Vanilla: 120 kcal
    fireEvent.press(getByTestId("variant-chip-Vanilla"));
    expect(getByTestId("macro-preview-calories").props.children).toEqual([120, " kcal"]);
  });

  it("stepper increments and decrements by servingQuantityStep", () => {
    const { getByTestId } = render(
      <QuantityPicker food={bridgedFood} initialQuantity={1} />,
    );

    const input = getByTestId("quantity-input");
    expect(input.props.value).toBe("1");

    // Stepper for count ('each' or 'serving') has step 0.5
    fireEvent.press(getByTestId("quantity-increment"));
    expect(getByTestId("quantity-input").props.value).toBe("1.5");

    fireEvent.press(getByTestId("quantity-decrement"));
    expect(getByTestId("quantity-input").props.value).toBe("1");
  });

  it("live macro preview scales with quantity", () => {
    const { getByTestId } = render(
      <QuantityPicker food={bridgedFood} initialQuantity={1} />,
    );

    // 1 bar = 210 kcal, 20g protein
    expect(getByTestId("macro-preview-calories").props.children).toEqual([210, " kcal"]);
    expect(getByTestId("macro-preview-protein").props.children).toEqual(["Protein: ", 20, "g"]);

    // Change quantity to 2
    fireEvent.changeText(getByTestId("quantity-input"), "2");
    expect(getByTestId("macro-preview-calories").props.children).toEqual([420, " kcal"]);
    expect(getByTestId("macro-preview-protein").props.children).toEqual(["Protein: ", 40, "g"]);
  });

  it("updates tag selection", () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <QuantityPicker food={bridgedFood} onSubmit={onSubmit} />,
    );

    fireEvent.press(getByTestId("tag-chip-dinner"));
    fireEvent.press(getByTestId("log-food-button"));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        tag: "dinner",
      }),
    );
  });

  it("handles time modes (now, picked, none)", () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <QuantityPicker food={bridgedFood} onSubmit={onSubmit} />,
    );

    // Pick 'No time'
    fireEvent.press(getByTestId("time-mode-none"));
    fireEvent.press(getByTestId("log-food-button"));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        timeMode: "none",
        pickedTime: null,
      }),
    );

    // Pick 'Pick time'
    fireEvent.press(getByTestId("time-mode-picked"));
    fireEvent.changeText(getByTestId("picked-time-input"), "15:45");
    fireEvent.press(getByTestId("log-food-button"));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        timeMode: "picked",
        pickedTime: "15:45",
      }),
    );
  });

  it("submits the full item payload including loggedQuantity, loggedUnit, loggedGramsPerServing", () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <QuantityPicker food={bridgedFood} initialQuantity={2} onSubmit={onSubmit} />,
    );

    fireEvent.press(getByTestId("log-food-button"));

    expect(onSubmit).toHaveBeenCalledWith({
      item: expect.objectContaining({
        foodId: "food-bar-1",
        name: "Protein Bar",
        brand: "Brandy",
        servingSize: 1,
        servingUnit: "each",
        servings: 2,
        loggedQuantity: 2,
        loggedGramsPerServing: 60,
      }),
      tag: "snack",
      date: expect.any(String),
      timeMode: "now",
      pickedTime: null,
    });
  });

  it("(NP-261) primaryActionLabel overrides the Log button text, and the secondary action fires its own handler with the same result", () => {
    const onSubmit = jest.fn();
    const onSecondaryAction = jest.fn();
    const { getByTestId } = render(
      <QuantityPicker
        food={bridgedFood}
        initialQuantity={2}
        onSubmit={onSubmit}
        primaryActionLabel="Add to Breakfast"
        secondaryActionLabel="Build a meal"
        onSecondaryAction={onSecondaryAction}
      />,
    );

    expect(getByTestId("log-food-button")).toHaveTextContent("Add to Breakfast");

    fireEvent.press(getByTestId("quantity-picker-secondary-action"));
    expect(onSecondaryAction).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({ loggedQuantity: 2 }),
      }),
    );
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.press(getByTestId("log-food-button"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("(NP-261) with no secondaryActionLabel/onSecondaryAction, there is no second button (every other consumer is unaffected)", () => {
    const { queryByTestId } = render(<QuantityPicker food={bridgedFood} />);
    expect(queryByTestId("quantity-picker-secondary-action")).toBeNull();
  });

  it("renders serving choices when available", () => {
    const { getByTestId } = render(
      <QuantityPicker food={bridgedFood} />,
    );

    // bridged food has grams choice as well
    const gramsChoice = getByTestId("serving-choice-weight-g");
    expect(gramsChoice).toBeTruthy();

    fireEvent.press(gramsChoice);
    // Choosing 1 g -> 210 / 60 = 3.5 kcal
    expect(getByTestId("quantity-input").props.value).toBe("1");
    expect(getByTestId("macro-preview-calories").props.children).toEqual([4, " kcal"]);
  });
});
