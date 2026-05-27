import { render, fireEvent } from "@testing-library/react-native";
import { ServingPicker } from "@/components/nutrition/ServingPicker";

const apple = {
  kcalPer100g: 52,
  proteinPer100g: 0.3,
  carbsPer100g: 14,
  fatPer100g: 0.2,
};

describe("ServingPicker", () => {
  it("defaults to 100g and previews 52 kcal for apple", () => {
    const { getByTestId } = render(
      <ServingPicker food={apple} onSubmit={() => {}} />,
    );
    expect(getByTestId("serving-picker-preview-kcal").props.children).toEqual([
      52,
      " kcal",
    ]);
    expect(getByTestId("serving-picker-preview-grams").props.children).toEqual([
      100,
      " g",
    ]);
  });

  it("switching unit to oz with amount=1 previews ~28g and ~15 kcal", () => {
    const { getByTestId } = render(
      <ServingPicker
        food={apple}
        onSubmit={() => {}}
        defaultUnit="oz"
        defaultAmount={1}
      />,
    );
    const kcal = getByTestId("serving-picker-preview-kcal").props.children;
    // Math.round(28.3495/100 * 52) = Math.round(14.74) = 15
    expect(kcal[0]).toBe(15);
  });

  it("submits { spec, grams } with the current selection", () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <ServingPicker food={apple} onSubmit={onSubmit} />,
    );
    fireEvent.changeText(getByTestId("serving-picker-amount"), "150");
    fireEvent.press(getByTestId("serving-picker-submit"));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        spec: expect.objectContaining({ unit: "g", amount: 150 }),
        grams: 150,
      }),
    );
  });

  it("custom unit picker offers labeled options and submits with the right gramsPerUnit", () => {
    const onSubmit = jest.fn();
    const customs = [
      { label: "1 medium", gramsPerUnit: 182 },
      { label: "1 large", gramsPerUnit: 223 },
    ];
    const { getByTestId } = render(
      <ServingPicker
        food={apple}
        onSubmit={onSubmit}
        defaultUnit="custom"
        defaultAmount={1}
        customUnits={customs}
      />,
    );
    fireEvent.press(getByTestId("serving-picker-custom-1-large"));
    fireEvent.press(getByTestId("serving-picker-submit"));
    expect(onSubmit).toHaveBeenCalled();
    const arg = (onSubmit.mock.calls[0] ?? [])[0];
    expect(arg.spec.unit).toBe("custom");
    expect(arg.spec.gramsPerUnit).toBe(223);
    expect(arg.grams).toBe(223);
  });

  it("disables submit when amount is non-positive", () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <ServingPicker food={apple} onSubmit={onSubmit} />,
    );
    fireEvent.changeText(getByTestId("serving-picker-amount"), "0");
    fireEvent.press(getByTestId("serving-picker-submit"));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
