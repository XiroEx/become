import { render, fireEvent } from "@testing-library/react-native";
import { Button } from "@/components/Button";

describe("Button", () => {
  it("renders the provided label text", () => {
    const { getByText } = render(<Button>Tap me</Button>);
    expect(getByText("Tap me")).toBeTruthy();
  });

  it("fires onPress when tapped", () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <Button testID="btn" onPress={onPress}>
        Go
      </Button>,
    );
    fireEvent.press(getByTestId("btn"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("exposes accessibilityRole=button and label", () => {
    const { getByTestId } = render(
      <Button testID="btn" accessibilityLabel="Save changes">
        Save
      </Button>,
    );
    const btn = getByTestId("btn");
    expect(btn.props.accessibilityRole).toBe("button");
    expect(btn.props.accessibilityLabel).toBe("Save changes");
  });

  it("disabled blocks press and surfaces accessibilityState.disabled", () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <Button testID="btn" disabled onPress={onPress}>
        Save
      </Button>,
    );
    const btn = getByTestId("btn");
    fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
    expect(btn.props.accessibilityState?.disabled).toBe(true);
  });

  it("loading shows a spinner instead of label and marks busy", () => {
    const onPress = jest.fn();
    const { getByTestId, queryByText } = render(
      <Button testID="btn" loading onPress={onPress}>
        Save
      </Button>,
    );
    expect(getByTestId("btn-spinner")).toBeTruthy();
    expect(queryByText("Save")).toBeNull();
    fireEvent.press(getByTestId("btn"));
    expect(onPress).not.toHaveBeenCalled();
    expect(getByTestId("btn").props.accessibilityState?.busy).toBe(true);
  });
});
