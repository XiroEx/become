import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { SaveAsMealButton } from "@/components/recipes/SaveAsMealButton";

describe("SaveAsMealButton", () => {
  it("renders the trigger button + opens the sheet on press", () => {
    const { getByTestId, queryByTestId } = render(
      <SaveAsMealButton onSave={() => {}} />,
    );
    expect(getByTestId("save-as-meal-open")).toBeTruthy();
    expect(queryByTestId("save-as-meal-option-breakfast")).toBeNull();
    fireEvent.press(getByTestId("save-as-meal-open"));
    expect(getByTestId("save-as-meal-option-breakfast")).toBeTruthy();
    expect(getByTestId("save-as-meal-option-lunch")).toBeTruthy();
    expect(getByTestId("save-as-meal-option-dinner")).toBeTruthy();
    expect(getByTestId("save-as-meal-option-snack")).toBeTruthy();
  });

  it("confirm is disabled until a meal type is chosen", () => {
    const onSave = jest.fn();
    const { getByTestId } = render(<SaveAsMealButton onSave={onSave} />);
    fireEvent.press(getByTestId("save-as-meal-open"));
    const confirm = getByTestId("save-as-meal-confirm");
    expect(confirm.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(confirm);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("invokes onSave with the selected meal type on confirm", async () => {
    const onSave = jest.fn(async () => undefined);
    const { getByTestId } = render(<SaveAsMealButton onSave={onSave} />);
    fireEvent.press(getByTestId("save-as-meal-open"));
    fireEvent.press(getByTestId("save-as-meal-option-lunch"));
    fireEvent.press(getByTestId("save-as-meal-confirm"));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("lunch");
    });
  });
});
