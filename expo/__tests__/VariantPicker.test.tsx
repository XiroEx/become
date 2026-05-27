import { render, fireEvent } from "@testing-library/react-native";
import {
  VariantPicker,
  type FoodVariant,
} from "@/components/nutrition/VariantPicker";

const variants: FoodVariant[] = [
  { variantId: "v1", label: "Whole milk", kcalPer100g: 60 },
  { variantId: "v2", label: "Skim milk", kcalPer100g: 35, brand: "Generic" },
];

describe("VariantPicker", () => {
  it("renders canonical option + each variant", () => {
    const { getByTestId, getByText } = render(
      <VariantPicker variants={variants} onSubmit={() => {}} />,
    );
    expect(getByTestId("variant-picker-option-canonical")).toBeTruthy();
    expect(getByTestId("variant-picker-option-v1")).toBeTruthy();
    expect(getByTestId("variant-picker-option-v2")).toBeTruthy();
    expect(getByText("Whole milk")).toBeTruthy();
    expect(getByText("Skim milk")).toBeTruthy();
  });

  it("submits with null when canonical is selected (default)", () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <VariantPicker variants={variants} onSubmit={onSubmit} />,
    );
    fireEvent.press(getByTestId("variant-picker-submit"));
    expect(onSubmit).toHaveBeenCalledWith(null);
  });

  it("submits with the chosen variantId after a variant tap", () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <VariantPicker variants={variants} onSubmit={onSubmit} />,
    );
    fireEvent.press(getByTestId("variant-picker-option-v2"));
    fireEvent.press(getByTestId("variant-picker-submit"));
    expect(onSubmit).toHaveBeenCalledWith("v2");
  });
});
